package handler

import (
	"net/http"
	"strconv"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
)

type ChargeHandler struct {
	chargeService service.ChargeService
}

func NewChargeHandler(services *service.Services) *ChargeHandler {
	return &ChargeHandler{
		chargeService: services.Charge,
	}
}

// Create godoc
// @Summary      Create a charge
// @Tags         charges
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        charge  body      domain.CreateChargeRequest  true  "Charge data"
// @Success      201     {object}  domain.Charge
// @Failure      400     {object}  middleware.ErrorResponse
// @Failure      401     {object}  middleware.ErrorResponse
// @Failure      403     {object}  middleware.ErrorResponse
// @Router       /api/charges [post]
func (h *ChargeHandler) Create(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var req domain.CreateChargeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	charge, err := h.chargeService.Create(c.Request().Context(), userID, &req)
	if err != nil {
		return HandleServiceError(err)
	}

	return c.JSON(http.StatusCreated, charge)
}

// List godoc
// @Summary      List charges
// @Tags         charges
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        direction      query  string  false  "Filter direction"  Enums(sent, received)
// @Param        status         query  string  false  "Filter status"     Enums(pending, paid, rejected, cancelled)
// @Param        connection_id  query  int     false  "Filter by connection ID"
// @Param        limit          query  int     false  "Limit"
// @Param        offset         query  int     false  "Offset"
// @Success      200  {object}  map[string][]domain.Charge
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/charges [get]
func (h *ChargeHandler) List(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var options domain.ChargeSearchOptions
	if err := c.Bind(&options); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid query parameters")
	}
	// Force IDOR gate -- caller can only see their own charges
	options.UserID = userID

	charges, err := h.chargeService.List(c.Request().Context(), options)
	if err != nil {
		return HandleServiceError(err)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"charges": charges})
}

// PendingCount godoc
// @Summary      Count pending charges requiring caller's action
// @Tags         charges
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {object}  map[string]int64
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/charges/pending-count [get]
func (h *ChargeHandler) PendingCount(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	count, err := h.chargeService.PendingCount(c.Request().Context(), userID)
	if err != nil {
		return HandleServiceError(err)
	}

	return c.JSON(http.StatusOK, map[string]int64{"count": count})
}

// Cancel godoc
// @Summary      Cancel a charge (charger only)
// @Tags         charges
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Charge ID"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      403  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/charges/{id}/cancel [post]
func (h *ChargeHandler) Cancel(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid charge ID")
	}

	if err := h.chargeService.Cancel(c.Request().Context(), userID, id); err != nil {
		return HandleServiceError(err)
	}

	return c.NoContent(http.StatusNoContent)
}

// Reject godoc
// @Summary      Reject a charge (payer only)
// @Tags         charges
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Charge ID"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      403  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/charges/{id}/reject [post]
func (h *ChargeHandler) Reject(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid charge ID")
	}

	if err := h.chargeService.Reject(c.Request().Context(), userID, id); err != nil {
		return HandleServiceError(err)
	}

	return c.NoContent(http.StatusNoContent)
}

// Accept godoc
// @Summary      Accept a charge (non-initiating party only)
// @Description  Atomically settles a pending charge by creating two linked transfer transactions. Caller must be the non-initiating party (the one whose account field is nil on the charge).
// @Tags         charges
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id       path  int                         true  "Charge ID"
// @Param        request  body  domain.AcceptChargeRequest  true  "Accept request"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      403  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Failure      409  {object}  middleware.ErrorResponse  "Charge already accepted or not pending"
// @Router       /api/charges/{id}/accept [post]
func (h *ChargeHandler) Accept(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid charge ID")
	}

	var req domain.AcceptChargeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if err := h.chargeService.Accept(c.Request().Context(), userID, id, &req); err != nil {
		return HandleServiceError(err)
	}

	return c.NoContent(http.StatusNoContent)
}
