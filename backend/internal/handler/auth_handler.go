package handler

import (
	"context"
	"net/http"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
)

type AuthHandler struct {
	authService service.AuthService
}

func NewAuthHandler(services *service.Services) *AuthHandler {
	return &AuthHandler{
		authService: services.Auth,
	}
}

type AuthResponse struct {
	User  *domain.User `json:"user"`
	Token string       `json:"token"`
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

	// Convert goth user to domain user
	domainUser := &domain.User{
		Name:  user.Name,
		Email: user.Email,
	}

	authUser, token, err := h.authService.OAuthCallback(c.Request().Context(), provider, domainUser, user.UserID)
	if err != nil {
		return HandleServiceError(err)
	}

	// In production, redirect to frontend with token
	// For now, return JSON
	return c.JSON(http.StatusOK, AuthResponse{
		User:  authUser,
		Token: token,
	})
}

func (h *AuthHandler) Me(c echo.Context) error {
	user := appcontext.GetUserFromContext(c.Request().Context())
	if user == nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "user not found")
	}

	return c.JSON(http.StatusOK, user)
}
