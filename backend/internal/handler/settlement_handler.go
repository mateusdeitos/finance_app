package handler

import (
	"net/http"
	"strconv"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/labstack/echo/v4"
)

type SettlementHandler struct {
	settlementService  service.SettlementService
	transactionService service.TransactionService
}

func NewSettlementHandler(services *service.Services) *SettlementHandler {
	return &SettlementHandler{
		settlementService:  services.Settlement,
		transactionService: services.Transaction,
	}
}

// Update godoc
// @Summary      Update settlement
// @Description  Updates an existing settlement's date. The settlement must belong to the authenticated user.
// @Tags         settlements
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id       path  int                              true  "Settlement ID"
// @Param        request  body  domain.SettlementUpdateRequest   true  "Fields to update"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      403  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/settlements/{id} [patch]
func (h *SettlementHandler) Update(c echo.Context) error {
	ctx := c.Request().Context()
	userID := appcontext.GetUserIDFromContext(ctx)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return pkgErrors.BadRequest("invalid settlement ID").ToHTTPError()
	}

	var req domain.SettlementUpdateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if req.Date == nil {
		return pkgErrors.ErrSettlementDateIsRequired.ToHTTPError()
	}

	if err := h.settlementService.UpdateDate(ctx, userID, id, req.Date.Time); err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.NoContent(http.StatusNoContent)
}

// Delete godoc
// @Summary      Delete settlement (remove a shared division)
// @Description  Removes a settlement's division: deletes the partner's linked transaction and the settlement, keeping the author's source transaction. Only the settlement owner may do this. For a recurring split, propagation_settings controls how many installments are affected.
// @Tags         settlements
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id                    path   int     true   "Settlement ID"
// @Param        propagation_settings  query  string  false  "How to handle recurring installments"  Enums(all, current, current_and_future)
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      403  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/settlements/{id} [delete]
func (h *SettlementHandler) Delete(c echo.Context) error {
	ctx := c.Request().Context()
	userID := appcontext.GetUserIDFromContext(ctx)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return pkgErrors.BadRequest("invalid settlement ID").ToHTTPError()
	}

	propagation := domain.TransactionPropagationSettings(c.QueryParam("propagation_settings"))

	if err := h.transactionService.DeleteSettlement(ctx, userID, id, propagation); err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.NoContent(http.StatusNoContent)
}
