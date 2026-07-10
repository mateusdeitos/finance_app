package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/handler"
	"github.com/finance_app/backend/internal/middleware"
	"github.com/finance_app/backend/internal/repository"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg"
	"github.com/finance_app/backend/pkg/database"
	"github.com/finance_app/backend/pkg/oauth"
	"github.com/labstack/echo/v4"
	echomiddleware "github.com/labstack/echo/v4/middleware"
	"github.com/rs/zerolog"
)

// @title          Finance App API
// @version        1.0
// @description    Go backend for a couples' finance management app.
// @host           localhost:8080
// @BasePath       /
//
// @securityDefinitions.apikey  CookieAuth
// @in                          cookie
// @name                        auth_token
// @description                 JWT token in HttpOnly cookie set after OAuth login
//
// @securityDefinitions.apikey  BearerAuth
// @in                          header
// @name                        Authorization
// @description                 JWT token — prefix with "Bearer "
func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Fail fast when VAPID keys are absent — silently missing keys would cause
	// push delivery to fail in production (T-22-STARTUP mitigation).
	if cfg.VAPID.PublicKey == "" || cfg.VAPID.PrivateKey == "" || cfg.VAPID.Subject == "" {
		log.Fatalf("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT are required")
	}
	// Per RFC 8292 the VAPID JWT `sub` claim must be a "mailto:" or "https:" URI.
	// Chrome/FCM tolerates a malformed subject, but Apple Push rejects the request
	// with 400/403 — the classic "works on Android, silent on iPhone" failure.
	// Fail fast so the misconfiguration is caught at deploy time, not at send time.
	if !strings.HasPrefix(cfg.VAPID.Subject, "mailto:") && !strings.HasPrefix(cfg.VAPID.Subject, "https://") {
		log.Fatalf("VAPID_SUBJECT must be a \"mailto:\" or \"https://\" URI (RFC 8292), got %q", cfg.VAPID.Subject)
	}

	loc, err := time.LoadLocation("UTC")
	if err != nil {
		log.Fatalf("Failed to load UTC location: %v", err)
	}
	time.Local = loc

	// Connect to database
	db, err := database.NewPostgresDB(cfg.Database.DSN())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	globalLogger := initLogger(cfg)

	// Setup OAuth providers
	oauth.SetupProviders(cfg)

	// Initialize repositories
	repos := &repository.Repositories{
		User:                  repository.NewUserRepository(db),
		DBTransaction:         repository.NewDBTransaction(db),
		UserSocial:            repository.NewUserSocialRepository(db),
		Account:               repository.NewAccountRepository(db),
		UserConnection:        repository.NewUserConnectionRepository(db),
		Category:              repository.NewCategoryRepository(db),
		Tag:                   repository.NewTagRepository(db),
		Transaction:           repository.NewTransactionRepository(db),
		TransactionRecurrence: repository.NewTransactionRecurrenceRepository(db),
		Settlement:            repository.NewSettlementRepository(db),
		Charge:                repository.NewChargeRepository(db),
		UserSettings:          repository.NewUserSettingsRepository(db),
		PushSubscription:      repository.NewPushSubscriptionRepository(db),
		Notification:          repository.NewNotificationRepository(db),
		TransactionTemplate:   repository.NewTransactionTemplateRepository(db),
		Impersonation:         repository.NewImpersonationRepository(db),
	}

	// Initialize services
	services := &service.Services{
		Auth:       service.NewAuthService(repos, cfg),
		User:       service.NewUserService(repos),
		Category:   service.NewCategoryService(repos),
		Tag:        service.NewTagService(repos),
		Settlement: service.NewSettlementService(repos),
	}

	// Account delete tears down transactions via the transaction service, so it
	// needs the Services pointer (resolved lazily at call time).
	services.Account = service.NewAccountService(repos, services)
	services.UserConnection = service.NewUserConnectionService(repos, services)
	services.Transaction = service.NewTransactionService(repos, services)
	services.Charge = service.NewChargeService(repos, services)
	services.Onboarding = service.NewOnboardingService(repos)
	services.PushSubscription = service.NewPushSubscriptionService(repos, cfg)
	services.Notification = service.NewNotificationService(repos, cfg)
	services.TransactionTemplate = service.NewTransactionTemplateService(repos)
	services.Impersonation = service.NewImpersonationService(repos, cfg)

	// Initialize handlers
	authHandler := handler.NewAuthHandler(services, cfg)
	accountHandler := handler.NewAccountHandler(services)
	categoryHandler := handler.NewCategoryHandler(services)
	tagHandler := handler.NewTagHandler(services)
	transactionHandler := handler.NewTransactionHandler(services)
	userConnectionHandler := handler.NewUserConnectionHandler(services)
	chargeHandler := handler.NewChargeHandler(services)
	onboardingHandler := handler.NewOnboardingHandler(services)
	pushSubHandler := handler.NewPushSubscriptionHandler(services, cfg.VAPID.PublicKey)
	notifHandler := handler.NewNotificationHandler(services)
	templateHandler := handler.NewTransactionTemplateHandler(services)
	impersonationHandler := handler.NewImpersonationHandler(services, cfg)

	// Setup Echo
	e := echo.New()
	e.HTTPErrorHandler = middleware.ErrorHandler

	// Middleware
	e.Use(middleware.LoggingMiddleware(globalLogger))
	e.Use(echomiddleware.Recover())
	e.Use(echomiddleware.CORSWithConfig(echomiddleware.CORSConfig{
		AllowOriginFunc: func(origin string) (bool, error) {
			origins := append([]string{cfg.App.FrontendURL}, cfg.App.AllowedOrigins...)
			return pkg.IsAllowedOrigin(origins, origin), nil
		},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAuthorization},
		AllowCredentials: true,
	}))

	// Health check
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	// API docs (Swagger UI + OpenAPI spec)
	handler.RegisterDocsRoutes(e)

	// Auth routes (public)
	auth := e.Group("/auth")
	auth.GET("/:provider", authHandler.OAuthStart)
	auth.GET("/:provider/callback", authHandler.OAuthCallback)
	auth.POST("/logout", authHandler.Logout)
	if cfg.App.Env != "production" {
		auth.POST("/test-login", authHandler.TestLogin)
	}

	// Protected routes
	authMiddleware := middleware.NewAuthMiddleware(services)
	api := e.Group("/api")
	api.Use(authMiddleware.RequireAuth)
	registerAPIRoutes(api, services, authMiddleware, apiHandlers{
		auth:           authHandler,
		account:        accountHandler,
		category:       categoryHandler,
		tag:            tagHandler,
		transaction:    transactionHandler,
		userConnection: userConnectionHandler,
		charge:         chargeHandler,
		onboarding:     onboardingHandler,
		pushSub:        pushSubHandler,
		notification:   notifHandler,
		template:       templateHandler,
		impersonation:  impersonationHandler,
	})

	// Start server
	addr := fmt.Sprintf("%s:%s", cfg.Server.Host, cfg.Server.Port)
	go func() {
		if err := e.Start(addr); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	log.Printf("Server started on %s", addr)

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := e.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}

// apiHandlers bundles the per-resource handlers so registerAPIRoutes can wire
// the protected /api route tree without an unwieldy parameter list.
type apiHandlers struct {
	auth           *handler.AuthHandler
	account        *handler.AccountHandler
	category       *handler.CategoryHandler
	tag            *handler.TagHandler
	transaction    *handler.TransactionHandler
	userConnection *handler.UserConnectionHandler
	charge         *handler.ChargeHandler
	onboarding     *handler.OnboardingHandler
	pushSub        *handler.PushSubscriptionHandler
	notification   *handler.NotificationHandler
	template       *handler.TransactionTemplateHandler
	impersonation  *handler.ImpersonationHandler
}

// registerAPIRoutes wires every authenticated route group under the /api group.
func registerAPIRoutes(api *echo.Group, services *service.Services, authMiddleware *middleware.AuthMiddleware, h apiHandlers) {
	// Auth
	api.GET("/auth/me", h.auth.Me)

	// Admin-only impersonation controls. The whole /admin subtree requires a real
	// admin (RequireAdmin also rejects impersonated requests, so no nesting).
	admin := api.Group("/admin")
	admin.Use(authMiddleware.RequireAdmin)
	admin.GET("/users", h.impersonation.SearchUsers)
	admin.POST("/impersonation", h.impersonation.Start)

	// Stop lives outside /admin: it is called *while* impersonating (the caller
	// is authenticated as the non-admin target), so it only requires auth plus a
	// live impersonator in context (enforced in the handler).
	api.POST("/impersonation/stop", h.impersonation.Stop)

	// Accounts
	accounts := api.Group("/accounts")
	accounts.GET("", h.account.Search)
	accounts.POST("", h.account.Create)
	accounts.PUT("/reorder", h.account.Reorder)
	accounts.PUT("/:id", h.account.Update)
	accounts.GET("/:id/deletion-info", h.account.GetDeletionInfo)
	accounts.DELETE("/:id", h.account.Delete)
	accounts.POST("/:id/activate", h.account.Activate)
	accounts.POST("/:id/deactivate", h.account.Deactivate)

	// User connections
	userConnections := api.Group("/user-connections")
	userConnections.POST("", h.userConnection.Create)
	userConnections.POST("/accept-invite", h.userConnection.AcceptInvite)
	userConnections.GET("/invite-info/:external_id", h.userConnection.GetInviteInfo)
	userConnections.PATCH("/:id/:status", h.userConnection.UpdateStatus)
	userConnections.PUT("/:id", h.userConnection.UpdateSettings)
	userConnections.DELETE("/:id", h.userConnection.Delete)
	userConnections.GET("", h.userConnection.Search)

	// Categories
	categories := api.Group("/categories")
	categories.GET("", h.category.Search)
	categories.POST("", h.category.Create)
	categories.PUT("/:id", h.category.Update)
	categories.DELETE("/:id", h.category.Delete)

	// Tags
	tags := api.Group("/tags")
	tags.GET("", h.tag.Search)
	tags.POST("", h.tag.Create)
	tags.PUT("/:id", h.tag.Update)
	tags.DELETE("/:id", h.tag.Delete)

	// Transactions
	registerTransactionRoutes(api, h.transaction)

	// Onboarding
	onboarding := api.Group("/onboarding")
	onboarding.GET("/status", h.onboarding.GetStatus)
	onboarding.POST("/complete", h.onboarding.Complete)

	// Charges
	charges := api.Group("/charges")
	charges.GET("/pending-count", h.charge.PendingCount)
	charges.POST("", h.charge.Create)
	charges.GET("", h.charge.List)
	charges.POST("/:id/cancel", h.charge.Cancel)
	charges.POST("/:id/reject", h.charge.Reject)
	charges.POST("/:id/accept", h.charge.Accept)
	charges.DELETE("/:id", h.charge.Delete)

	// Push subscriptions
	pushSubs := api.Group("/push-subscriptions")
	pushSubs.POST("", h.pushSub.Subscribe)
	pushSubs.DELETE("", h.pushSub.Unsubscribe)
	pushSubs.GET("/vapid-public-key", h.pushSub.VapidPublicKey)
	pushSubs.GET("", h.pushSub.Status)

	// Notifications
	notifications := api.Group("/notifications")
	notifications.GET("", h.notification.List)
	notifications.GET("/unread-count", h.notification.UnreadCount)
	notifications.POST("/test", h.notification.SendTest)
	notifications.POST("/read-all", h.notification.MarkAllRead)
	notifications.POST("/:id/read", h.notification.MarkRead)
	// Static "/read" MUST be registered before "/:id" so "read" is not captured as :id.
	notifications.DELETE("/read", h.notification.DeleteAllRead)
	notifications.DELETE("/:id", h.notification.Delete)

	// Settlements
	api.PATCH("/settlements/:id", handler.NewSettlementHandler(services).Update)

	// Transaction templates
	templates := api.Group("/transaction-templates")
	templates.GET("", h.template.List)
	templates.POST("", h.template.Create)
	templates.PUT("/:id", h.template.Update)
	templates.DELETE("/:id", h.template.Delete)
}

func registerTransactionRoutes(api *echo.Group, h *handler.TransactionHandler) {
	transactions := api.Group("/transactions")
	transactions.GET("", h.Search)
	transactions.POST("", h.Create)
	transactions.GET("/balance", h.GetBalance)
	transactions.GET("/suggestions", h.Suggestions)
	transactions.GET("/by-ids", h.ListByIDs) // must be registered before /:id to avoid shadowing
	transactions.DELETE("/:id", h.Delete)
	transactions.GET("/:id", h.GetByID)
	transactions.PUT("/:id", h.Update)
	transactions.POST("/import-csv", h.ImportCSV)
	transactions.POST("/check-duplicates-bulk", h.CheckDuplicatesBulk)
}

func initLogger(cfg *config.Config) zerolog.Logger {
	logLevel, parseErr := zerolog.ParseLevel(cfg.App.LogLevel)
	if parseErr != nil {
		log.Printf("WARNING: invalid LOG_LEVEL %q, defaulting to info: %v", cfg.App.LogLevel, parseErr)
		logLevel = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(logLevel)

	if cfg.App.Env == "development" {
		return zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr}).
			With().Timestamp().Logger()
	}
	// Cloud Run: severity field maps to Cloud Logging severity
	zerolog.LevelFieldName = "severity"
	return zerolog.New(os.Stdout).With().Timestamp().Logger()
}
