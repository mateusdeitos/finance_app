package handler

import (
	"net/http"
	"strconv"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
)

type NotificationHandler struct {
	notifService service.NotificationService
}

func NewNotificationHandler(services *service.Services) *NotificationHandler {
	return &NotificationHandler{
		notifService: services.Notification,
	}
}

// List godoc
// @Summary      List notifications
// @Description  Returns paginated notifications for the authenticated user, newest first
// @Tags         notifications
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        cursor  query  string  false  "Pagination cursor"
// @Param        limit   query  int     false  "Page size (default 20)"
// @Success      200  {object}  domain.NotificationListResult
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/notifications [get]
func (h *NotificationHandler) List(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	cursor := c.QueryParam("cursor")
	limit := 20
	if limitStr := c.QueryParam("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	filter := domain.NotificationFilter{
		Cursor: cursor,
		Limit:  limit,
	}
	result, err := h.notifService.List(c.Request().Context(), userID, filter)
	if err != nil {
		return HandleServiceError(err)
	}
	return c.JSON(http.StatusOK, result)
}

// UnreadCount godoc
// @Summary      Get unread notification count
// @Tags         notifications
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {object}  domain.NotificationUnreadCountResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/notifications/unread-count [get]
func (h *NotificationHandler) UnreadCount(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	count, err := h.notifService.UnreadCount(c.Request().Context(), userID)
	if err != nil {
		return HandleServiceError(err)
	}
	return c.JSON(http.StatusOK, domain.NotificationUnreadCountResponse{Count: count})
}

// MarkRead godoc
// @Summary      Mark a notification as read
// @Tags         notifications
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Notification ID"
// @Success      204
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/notifications/{id}/read [post]
func (h *NotificationHandler) MarkRead(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid notification id")
	}
	if err := h.notifService.MarkRead(c.Request().Context(), userID, id); err != nil {
		return HandleServiceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// MarkAllRead godoc
// @Summary      Mark all notifications as read
// @Tags         notifications
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      204
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/notifications/read-all [post]
func (h *NotificationHandler) MarkAllRead(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	if err := h.notifService.MarkAllRead(c.Request().Context(), userID); err != nil {
		return HandleServiceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete godoc
// @Summary      Delete a notification
// @Description  Hard-deletes a single notification owned by the authenticated user
// @Tags         notifications
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Notification ID"
// @Success      204
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/notifications/{id} [delete]
func (h *NotificationHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid notification id")
	}
	if err := h.notifService.Delete(c.Request().Context(), userID, id); err != nil {
		return HandleServiceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// DeleteAllRead godoc
// @Summary      Delete all read notifications
// @Description  Hard-deletes every read notification owned by the authenticated user
// @Tags         notifications
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      204
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/notifications/read [delete]
func (h *NotificationHandler) DeleteAllRead(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	if err := h.notifService.DeleteAllRead(c.Request().Context(), userID); err != nil {
		return HandleServiceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
