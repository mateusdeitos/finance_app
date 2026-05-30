package handler

import (
	"net/http"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
)

type PushSubscriptionHandler struct {
	pushSubService service.PushSubscriptionService
	vapidPublicKey string
}

func NewPushSubscriptionHandler(services *service.Services, vapidPublicKey string) *PushSubscriptionHandler {
	return &PushSubscriptionHandler{
		pushSubService: services.PushSubscription,
		vapidPublicKey: vapidPublicKey,
	}
}

// Subscribe godoc
// @Summary      Register a Web Push subscription
// @Description  Upserts a push subscription for the authenticated user's device
// @Tags         push-subscriptions
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        subscription  body  domain.SubscribePushRequest  true  "Push subscription"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/push-subscriptions [post]
func (h *PushSubscriptionHandler) Subscribe(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var req domain.SubscribePushRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if err := h.pushSubService.Subscribe(c.Request().Context(), userID, &req); err != nil {
		return HandleServiceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// Unsubscribe godoc
// @Summary      Remove a Web Push subscription
// @Description  Removes the authenticated user's push subscription for the given device endpoint
// @Tags         push-subscriptions
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        endpoint  query  string  true  "Endpoint URL (url-encoded)"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/push-subscriptions [delete]
func (h *PushSubscriptionHandler) Unsubscribe(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	endpoint := c.QueryParam("endpoint")
	if endpoint == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "endpoint is required")
	}
	if err := h.pushSubService.Unsubscribe(c.Request().Context(), userID, endpoint); err != nil {
		return HandleServiceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// VapidPublicKey godoc
// @Summary      Get the VAPID public key
// @Description  Returns the server's VAPID public key for client-side push subscription
// @Tags         push-subscriptions
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {object}  domain.VapidPublicKeyResponse
// @Router       /api/push-subscriptions/vapid-public-key [get]
func (h *PushSubscriptionHandler) VapidPublicKey(c echo.Context) error {
	return c.JSON(http.StatusOK, domain.VapidPublicKeyResponse{Key: h.vapidPublicKey})
}

// Status godoc
// @Summary      Check if device has an active push subscription
// @Description  Returns whether the authenticated user has an active push subscription for the given endpoint
// @Tags         push-subscriptions
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        endpoint  query  string  true  "Endpoint URL (url-encoded)"
// @Success      200  {object}  domain.PushSubscriptionStatusResponse
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/push-subscriptions [get]
func (h *PushSubscriptionHandler) Status(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	endpoint := c.QueryParam("endpoint")
	if endpoint == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "endpoint is required")
	}
	resp, err := h.pushSubService.Status(c.Request().Context(), userID, endpoint)
	if err != nil {
		return HandleServiceError(err)
	}
	return c.JSON(http.StatusOK, resp)
}
