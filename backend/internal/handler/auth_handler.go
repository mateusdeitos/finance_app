package handler

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
)

const AuthCookieName = "auth_token"

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

func (h *AuthHandler) OAuthStart(c echo.Context) error {
	provider := c.Param("provider")
	if provider == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "provider is required")
	}

	_, err := goth.GetProvider(provider)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "unsupported provider")
	}

	req := c.Request().WithContext(context.WithValue(c.Request().Context(), gothic.ProviderParamKey, provider))
	resp := c.Response()
	gothic.BeginAuthHandler(resp, req)
	return nil
}

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
		Secure:   h.cfg.App.Env == "production",
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(h.cfg.JWT.Expiration()),
	}
	c.SetCookie(cookie)

	return c.Redirect(http.StatusTemporaryRedirect, fmt.Sprintf("%s/auth/callback", h.cfg.App.FrontendURL))
}

func (h *AuthHandler) Me(c echo.Context) error {
	user := appcontext.GetUserFromContext(c.Request().Context())
	if user == nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "user not found")
	}

	return c.JSON(http.StatusOK, user)
}
