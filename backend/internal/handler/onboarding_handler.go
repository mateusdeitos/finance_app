package handler

import (
	"net/http"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
)

type OnboardingHandler struct {
	onboardingService service.OnboardingService
}

func NewOnboardingHandler(services *service.Services) *OnboardingHandler {
	return &OnboardingHandler{onboardingService: services.Onboarding}
}

// GetStatus godoc
// @Summary      Get onboarding status
// @Tags         onboarding
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {object}  domain.OnboardingStatus
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/onboarding/status [get]
func (h *OnboardingHandler) GetStatus(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	status, err := h.onboardingService.GetStatus(c.Request().Context(), userID)
	if err != nil {
		return HandleServiceError(err)
	}
	return c.JSON(http.StatusOK, status)
}

// Complete godoc
// @Summary      Complete onboarding by creating starter accounts and categories
// @Tags         onboarding
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        request  body  domain.OnboardingSetupRequest  true  "Initial accounts and categories"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/onboarding/complete [post]
func (h *OnboardingHandler) Complete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	var req domain.OnboardingSetupRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if err := h.onboardingService.Complete(c.Request().Context(), userID, &req); err != nil {
		return HandleServiceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
