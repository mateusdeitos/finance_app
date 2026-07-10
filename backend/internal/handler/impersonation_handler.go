package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	apperrors "github.com/finance_app/backend/pkg/errors"
	"github.com/labstack/echo/v4"
)

// ImpersonatorCookieName holds the admin's own auth token while they impersonate
// a user. On start we move the admin's auth_token here and overwrite auth_token
// with the impersonation token; on stop we move it back. Both cookies are
// HttpOnly, so the impersonation token is never exposed to JavaScript.
const ImpersonatorCookieName = "impersonator_token"

type ImpersonationHandler struct {
	service service.ImpersonationService
	cfg     *config.Config
}

func NewImpersonationHandler(services *service.Services, cfg *config.Config) *ImpersonationHandler {
	return &ImpersonationHandler{
		service: services.Impersonation,
		cfg:     cfg,
	}
}

// startImpersonationResponse is what the admin receives on start. It never
// includes the token — that is delivered as an HttpOnly cookie.
type startImpersonationResponse struct {
	TargetUser *domain.User `json:"target_user"`
	ExpiresAt  time.Time    `json:"expires_at"`
}

// adminUserView is the trimmed user shape returned by the admin picker — no
// password, no timestamps, just enough to identify and choose a user.
type adminUserView struct {
	ID        int     `json:"id"`
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	AvatarURL *string `json:"avatar_url,omitempty"`
	IsAdmin   bool    `json:"is_admin"`
}

func toAdminUserViews(users []*domain.User) []adminUserView {
	out := make([]adminUserView, 0, len(users))
	for _, u := range users {
		out = append(out, adminUserView{
			ID:        u.ID,
			Name:      u.Name,
			Email:     u.Email,
			AvatarURL: u.AvatarURL,
			IsAdmin:   u.IsAdmin,
		})
	}
	return out
}

// SearchUsers godoc
// @Summary      Search users (admin)
// @Description  Returns users matching a name/email query for the impersonation picker. Admin only.
// @Tags         admin
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        q      query     string  false  "Search query (name or email)"
// @Param        limit  query     int     false  "Max results (default 20)"
// @Success      200    {array}   handler.adminUserView
// @Failure      401    {object}  middleware.ErrorResponse
// @Failure      403    {object}  middleware.ErrorResponse
// @Router       /api/admin/users [get]
func (h *ImpersonationHandler) SearchUsers(c echo.Context) error {
	limit := 20
	if raw := c.QueryParam("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	users, err := h.service.SearchUsers(c.Request().Context(), c.QueryParam("q"), limit)
	if err != nil {
		return HandleServiceError(err)
	}

	return c.JSON(http.StatusOK, toAdminUserViews(users))
}

// Start godoc
// @Summary      Start impersonation (admin)
// @Description  Issues a short-lived token to act as the target user. Admin only. The token must be sent as `Authorization: Bearer` on subsequent requests; the admin's own session cookie stays intact.
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        request  body      domain.StartImpersonationRequest  true  "Impersonation target and reason"
// @Success      201      {object}  handler.startImpersonationResponse
// @Failure      400      {object}  middleware.ErrorResponse
// @Failure      401      {object}  middleware.ErrorResponse
// @Failure      403      {object}  middleware.ErrorResponse
// @Router       /api/admin/impersonation [post]
func (h *ImpersonationHandler) Start(c echo.Context) error {
	ctx := c.Request().Context()

	// Belt-and-suspenders: RequireAdmin already blocks impersonated requests,
	// but reject nested impersonation explicitly for a clear error.
	if appcontext.GetImpersonatorFromContext(ctx) != nil {
		return HandleServiceError(apperrors.ErrImpersonationNesting)
	}

	// The admin must be authenticated via the auth_token cookie so we can stash
	// their session and restore it on stop. (Bearer-only callers can't be swapped
	// back, so we require the cookie here.)
	adminCookie, err := c.Cookie(AuthCookieName)
	if err != nil || adminCookie.Value == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "impersonation requires a cookie session")
	}

	var req domain.StartImpersonationRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	adminUserID := appcontext.GetUserIDFromContext(ctx)
	result, err := h.service.Start(ctx, adminUserID, req.TargetUserID, req.Reason, c.RealIP(), c.Request().UserAgent())
	if err != nil {
		return HandleServiceError(err)
	}

	secure := h.cfg.App.Env == envProduction
	// Stash the admin's own session so Stop can restore it.
	c.SetCookie(&http.Cookie{
		Name:     ImpersonatorCookieName,
		Value:    adminCookie.Value,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(h.cfg.JWT.Expiration()),
	})
	// Swap auth_token to the impersonation token. Expires with the session so a
	// leaked cookie stops working on its own.
	c.SetCookie(&http.Cookie{
		Name:     AuthCookieName,
		Value:    result.Token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  result.ExpiresAt,
	})

	return c.JSON(http.StatusCreated, startImpersonationResponse{
		TargetUser: result.TargetUser,
		ExpiresAt:  result.ExpiresAt,
	})
}

// Stop godoc
// @Summary      Stop impersonation
// @Description  Revokes the current impersonation session server-side. Must be called with the impersonation token active.
// @Tags         admin
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/impersonation/stop [post]
func (h *ImpersonationHandler) Stop(c echo.Context) error {
	ctx := c.Request().Context()

	impersonator := appcontext.GetImpersonatorFromContext(ctx)
	if impersonator == nil {
		return HandleServiceError(apperrors.ErrImpersonationNotActive)
	}

	if err := h.service.Stop(ctx, impersonator.SessionID, impersonator.AdminUserID); err != nil {
		return HandleServiceError(err)
	}

	secure := h.cfg.App.Env == envProduction
	// Restore the admin's own session from the stashed cookie. If it's missing
	// (e.g. it expired), clear auth_token so the admin re-authenticates rather
	// than staying stuck as the impersonated user.
	if impCookie, err := c.Cookie(ImpersonatorCookieName); err == nil && impCookie.Value != "" {
		c.SetCookie(&http.Cookie{
			Name:     AuthCookieName,
			Value:    impCookie.Value,
			Path:     "/",
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteLaxMode,
			Expires:  time.Now().Add(h.cfg.JWT.Expiration()),
		})
	} else {
		c.SetCookie(&http.Cookie{
			Name:     AuthCookieName,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})
	}
	// Always clear the stash cookie.
	c.SetCookie(&http.Cookie{
		Name:     ImpersonatorCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
