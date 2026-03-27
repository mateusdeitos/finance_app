package handler

import (
	"context"
	"net/http"
	"net/url"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
)

const (
	AuthCookieName = "auth_token"
	envProduction  = "production"
)

type AuthHandler struct {
	authService service.AuthService
	cfg         *config.Config
}

func NewAuthHandler(services *service.Services, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		authService: services.Auth,
		cfg:         cfg,
	}
}

// OAuthStart godoc
// @Summary      Start OAuth flow
// @Description  Redirects the user to the OAuth provider's authorization page
// @Tags         auth
// @Param        provider  path  string  true  "OAuth provider" Enums(google)
// @Success      302
// @Failure      400  {object}  middleware.ErrorResponse
// @Router       /auth/{provider} [get]
func (h *AuthHandler) OAuthStart(c echo.Context) error {
	provider := c.Param("provider")
	if provider == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "provider is required")
	}

	_, err := goth.GetProvider(provider)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "unsupported provider")
	}

	if redirectTo := c.QueryParam("redirect"); redirectTo != "" {
		c.SetCookie(&http.Cookie{
			Name:     "oauth_redirect",
			Value:    redirectTo,
			Path:     "/",
			HttpOnly: true,
			Secure:   h.cfg.App.Env == envProduction,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   300,
		})
	}

	req := c.Request().WithContext(context.WithValue(c.Request().Context(), gothic.ProviderParamKey, provider))
	resp := c.Response()
	gothic.BeginAuthHandler(resp, req)
	return nil
}

// OAuthCallback godoc
// @Summary      OAuth callback
// @Description  Completes the OAuth flow, sets the auth_token HttpOnly cookie, and redirects to the frontend
// @Tags         auth
// @Param        provider  path   string  true   "OAuth provider" Enums(google)
// @Param        code      query  string  false  "Authorization code from provider"
// @Param        state     query  string  false  "State parameter"
// @Success      307
// @Failure      400  {object}  middleware.ErrorResponse
// @Router       /auth/{provider}/callback [get]
func (h *AuthHandler) OAuthCallback(c echo.Context) error {
	provider := c.Param("provider")
	if provider == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "provider is required")
	}

	user, err := gothic.CompleteUserAuth(c.Response(), c.Request())
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "failed to complete OAuth: "+err.Error())
	}

	domainUser := &domain.User{
		Name:  user.Name,
		Email: user.Email,
	}

	_, token, err := h.authService.OAuthCallback(c.Request().Context(), provider, domainUser, user.UserID)
	if err != nil {
		return HandleServiceError(err)
	}

	cookie := &http.Cookie{
		Name:     AuthCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.cfg.App.Env == envProduction,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(h.cfg.JWT.Expiration()),
	}
	c.SetCookie(cookie)

	callbackURL := h.cfg.App.FrontendURL + "/auth/callback"
	if oauthRedirect, err := c.Cookie("oauth_redirect"); err == nil && oauthRedirect.Value != "" {
		callbackURL += "?redirect=" + url.QueryEscape(oauthRedirect.Value)
		c.SetCookie(&http.Cookie{
			Name:     "oauth_redirect",
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   h.cfg.App.Env == envProduction,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})
	}

	return c.Redirect(http.StatusTemporaryRedirect, callbackURL)
}

func (h *AuthHandler) Logout(c echo.Context) error {
	c.SetCookie(&http.Cookie{
		Name:     AuthCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   h.cfg.App.Env == envProduction,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	return c.NoContent(http.StatusOK)
}

// Me godoc
// @Summary      Get current user
// @Tags         auth
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {object}  domain.User
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/auth/me [get]
func (h *AuthHandler) Me(c echo.Context) error {
	user := appcontext.GetUserFromContext(c.Request().Context())
	if user == nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "user not found")
	}

	return c.JSON(http.StatusOK, user)
}

// TestLogin godoc
// @Summary      Test login (non-production only)
// @Description  Issues a JWT auth cookie for the given email without OAuth. Only available when ENV != production.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      testLoginRequest  true  "Login request"
// @Success      200      {object}  map[string]string
// @Failure      400      {object}  middleware.ErrorResponse
// @Router       /auth/test-login [post]
func (h *AuthHandler) TestLogin(c echo.Context) error {
	var req testLoginRequest
	if err := c.Bind(&req); err != nil || req.Email == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email is required")
	}

	token, err := h.authService.TestLogin(c.Request().Context(), req.Email)
	if err != nil {
		return HandleServiceError(err)
	}

	c.SetCookie(&http.Cookie{
		Name:     AuthCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(h.cfg.JWT.Expiration()),
	})

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

type testLoginRequest struct {
	Email string `json:"email"`
}
