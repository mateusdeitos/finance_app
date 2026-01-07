package middleware

import (
	"net/http"
	"strings"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	apperrors "github.com/finance_app/backend/pkg/errors"
	"github.com/labstack/echo/v4"
)

type AuthMiddleware struct {
	authService service.AuthService
}

func NewAuthMiddleware(services *service.Services) *AuthMiddleware {
	return &AuthMiddleware{
		authService: services.Auth,
	}
}

func (m *AuthMiddleware) RequireAuth(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		authHeader := c.Request().Header.Get("Authorization")
		if authHeader == "" {
			return echo.NewHTTPError(http.StatusUnauthorized, "missing authorization header")
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid authorization header format")
		}

		token := parts[1]
		user, err := m.authService.ValidateToken(c.Request().Context(), token)
		if err != nil {
			statusCode, message := apperrors.ToHTTPError(err)
			return echo.NewHTTPError(statusCode, message)
		}

		// Store user in context
		c.Set("user", user)
		c.Set("user_id", user.ID)

		return next(c)
	}
}

func GetUserFromContext(c echo.Context) *domain.User {
	user, ok := c.Get("user").(*domain.User)
	if !ok {
		return nil
	}
	return user
}

func GetUserIDFromContext(c echo.Context) int {
	userID, ok := c.Get("user_id").(int)
	if !ok {
		return 0
	}
	return userID
}
