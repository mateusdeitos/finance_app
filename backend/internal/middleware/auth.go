package middleware

import (
	"net/http"
	"strings"

	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
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
			return apperrors.ToHTTPError(err)
		}

		ctx := appcontext.WithUser(c.Request().Context(), user)
		ctx = appcontext.WithUserID(ctx, user.ID)

		c.SetRequest(c.Request().WithContext(ctx))
		return next(c)
	}
}
