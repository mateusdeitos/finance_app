package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	apperrors "github.com/finance_app/backend/pkg/errors"
	"github.com/labstack/echo/v4"
)

type ImpersonationHandler struct {
	service service.ImpersonationService
}

func NewImpersonationHandler(services *service.Services) *ImpersonationHandler {
	return &ImpersonationHandler{
		service: services.Impersonation,
	}
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
// @Success      201      {object}  domain.StartImpersonationResult
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

	var req domain.StartImpersonationRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	adminUserID := appcontext.GetUserIDFromContext(ctx)
	result, err := h.service.Start(ctx, adminUserID, req.TargetUserID, req.Reason, c.RealIP(), c.Request().UserAgent())
	if err != nil {
		return HandleServiceError(err)
	}

	return c.JSON(http.StatusCreated, result)
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

	return c.JSON(http.StatusOK, map[string]string{"status": "ok", "stopped_at": time.Now().UTC().Format(time.RFC3339)})
}
