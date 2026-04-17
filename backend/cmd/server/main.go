package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/handler"
	"github.com/finance_app/backend/internal/middleware"
	"github.com/finance_app/backend/internal/repository"
	"github.com/finance_app/backend/internal/service"
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

	// Initialize zerolog global logger (per D-15, D-16)
	logLevel, parseErr := zerolog.ParseLevel(cfg.App.LogLevel)
	if parseErr != nil {
		log.Printf("WARNING: invalid LOG_LEVEL %q, defaulting to info: %v", cfg.App.LogLevel, parseErr)
		logLevel = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(logLevel)

	var globalLogger zerolog.Logger
	if cfg.App.Env == "development" {
		globalLogger = zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr}).
			With().Timestamp().Logger()
	} else {
		// Cloud Run: severity field maps to Cloud Logging severity
		zerolog.LevelFieldName = "severity"
		globalLogger = zerolog.New(os.Stdout).With().Timestamp().Logger()
	}

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
		// 	UserSettings:          repository.NewUserSettingsRepository(db),
	}

	// Initialize services
	services := &service.Services{
		Auth:       service.NewAuthService(repos, cfg),
		User:       service.NewUserService(repos),
		Account:    service.NewAccountService(repos),
		Category:   service.NewCategoryService(repos),
		Tag:        service.NewTagService(repos),
		Settlement: service.NewSettlementService(repos),
	}

	services.UserConnection = service.NewUserConnectionService(repos, services)
	services.Transaction = service.NewTransactionService(repos, services)
	services.Charge = service.NewChargeService(repos, services)

	// Initialize handlers
	authHandler := handler.NewAuthHandler(services, cfg)
	accountHandler := handler.NewAccountHandler(services)
	categoryHandler := handler.NewCategoryHandler(services)
	tagHandler := handler.NewTagHandler(services)
	transactionHandler := handler.NewTransactionHandler(services)
	userConnectionHandler := handler.NewUserConnectionHandler(services)
	chargeHandler := handler.NewChargeHandler(services)

	// Setup Echo
	e := echo.New()
	e.HTTPErrorHandler = middleware.ErrorHandler

	// Middleware
	e.Use(middleware.LoggingMiddleware(globalLogger))
	e.Use(echomiddleware.Recover())
	e.Use(echomiddleware.CORSWithConfig(echomiddleware.CORSConfig{
		AllowOrigins:     []string{cfg.App.FrontendURL},
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
	api := e.Group("/api")
	api.Use(middleware.NewAuthMiddleware(services).RequireAuth)

	// Auth
	api.GET("/auth/me", authHandler.Me)

	// Accounts
	accounts := api.Group("/accounts")
	accounts.GET("", accountHandler.Search)
	accounts.POST("", accountHandler.Create)
	accounts.PUT("/:id", accountHandler.Update)
	accounts.DELETE("/:id", accountHandler.Delete)
	accounts.POST("/:id/activate", accountHandler.Activate)

	// User connections
	userConnections := api.Group("/user-connections")
	userConnections.POST("", userConnectionHandler.Create)
	userConnections.POST("/accept-invite", userConnectionHandler.AcceptInvite)
	userConnections.GET("/invite-info/:external_id", userConnectionHandler.GetInviteInfo)
	userConnections.PATCH("/:id/:status", userConnectionHandler.UpdateStatus)
	userConnections.DELETE("/:id", userConnectionHandler.Delete)
	userConnections.GET("", userConnectionHandler.Search)

	// Categories
	categories := api.Group("/categories")
	categories.GET("", categoryHandler.Search)
	categories.POST("", categoryHandler.Create)
	categories.PUT("/:id", categoryHandler.Update)
	categories.DELETE("/:id", categoryHandler.Delete)

	// Tags
	tags := api.Group("/tags")
	tags.GET("", tagHandler.Search)
	tags.POST("", tagHandler.Create)
	tags.PUT("/:id", tagHandler.Update)
	tags.DELETE("/:id", tagHandler.Delete)

	// Transactions
	transactions := api.Group("/transactions")
	transactions.GET("", transactionHandler.Search)
	transactions.POST("", transactionHandler.Create)
	transactions.GET("/balance", transactionHandler.GetBalance)
	transactions.GET("/suggestions", transactionHandler.Suggestions)
	transactions.DELETE("/:id", transactionHandler.Delete)
	transactions.GET("/:id", transactionHandler.GetByID)
	transactions.PUT("/:id", transactionHandler.Update)
	// transactions.POST("/bulk-update", transactionHandler.BulkUpdate)
	transactions.POST("/import-csv", transactionHandler.ImportCSV)
	transactions.POST("/check-duplicate", transactionHandler.CheckDuplicate)
	// transactions.GET("/suggest-category", transactionHandler.SuggestCategory)
	// transactions.POST("/recurring", transactionHandler.CreateRecurring)

	// Charges
	charges := api.Group("/charges")
	charges.GET("/pending-count", chargeHandler.PendingCount)
	charges.POST("", chargeHandler.Create)
	charges.GET("", chargeHandler.List)
	charges.POST("/:id/cancel", chargeHandler.Cancel)
	charges.POST("/:id/reject", chargeHandler.Reject)
	charges.POST("/:id/accept", chargeHandler.Accept)

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
