package middleware

import (
	"net/http"
	"strings"

	"github.com/finance_app/backend/internal/handler"
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
		token := tokenFromHeader(c.Request())
		if token == "" {
			token = tokenFromCookie(c)
		}

		if token == "" {
			return echo.NewHTTPError(http.StatusUnauthorized, "missing authentication")
		}

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

func tokenFromHeader(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return ""
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return ""
	}

	return parts[1]
}

func tokenFromCookie(c echo.Context) string {
	cookie, err := c.Cookie(handler.AuthCookieName)
	if err != nil {
		return ""
	}

	return cookie.Value
}
