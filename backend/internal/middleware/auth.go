package middleware

import (
	"net/http"
	"strings"

	"github.com/finance_app/backend/internal/handler"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/finance_app/backend/pkg/applog"
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

		user, impersonator, err := m.authService.ValidateToken(c.Request().Context(), token)
		if err != nil {
			return apperrors.ToHTTPError(err)
		}

		ctx := appcontext.WithUser(c.Request().Context(), user)
		ctx = appcontext.WithUserID(ctx, user.ID)
		if impersonator != nil {
			ctx = appcontext.WithImpersonator(ctx, impersonator)
		}

		c.SetRequest(c.Request().WithContext(ctx))

		// Inject user_id into request logger (per D-13). During impersonation the
		// acting admin is also attached so every log line is attributable to a
		// human, not just the impersonated account.
		logger := applog.FromContext(c.Request().Context()).With("user_id", user.ID)
		if impersonator != nil {
			logger.With("impersonator_id", impersonator.AdminUserID).
				With("impersonated_user_id", user.ID).
				With("impersonation_session_id", impersonator.SessionID)
		}

		return next(c)
	}
}

// RequireAdmin gates a route to real admins only. It must be applied after
// RequireAuth. An impersonation token authenticates as the (non-admin) target,
// so it is rejected here; a request is also rejected if it carries an
// impersonator, preventing an impersonation session from reaching admin routes.
func (m *AuthMiddleware) RequireAdmin(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()
		user := appcontext.GetUserFromContext(ctx)
		if user == nil || !user.IsAdmin || appcontext.GetImpersonatorFromContext(ctx) != nil {
			return apperrors.ToHTTPError(apperrors.ErrImpersonationForbidden)
		}
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
