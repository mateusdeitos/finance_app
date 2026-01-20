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

type TransactionHandler struct {
	transactionService service.TransactionService
}

func NewTransactionHandler(services *service.Services) *TransactionHandler {
	return &TransactionHandler{
		transactionService: services.Transaction,
	}
}

func (h *TransactionHandler) Create(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var transaction domain.TransactionCreateRequest
	if err := c.Bind(&transaction); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	err := h.transactionService.Create(c.Request().Context(), userID, &transaction)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusCreated)
}

func (h *TransactionHandler) Search(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	month, err := strconv.Atoi(c.QueryParam("month"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid month")
	}

	year, err := strconv.Atoi(c.QueryParam("year"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid year")
	}

	period := domain.Period{
		Month: month,
		Year:  year,
	}

	if !period.IsValid() {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid period")
	}

	var filter domain.TransactionFilter
	if err := c.Bind(&filter); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	filter.UserID = &userID

	// Manually parse description query parameters
	descriptionQuery := c.QueryParam("description.query")
	if descriptionQuery != "" {
		exact, _ := strconv.ParseBool(c.QueryParam("description.exact"))

		filter.Description = &domain.TextSearch{
			Query: descriptionQuery,
			Exact: exact,
		}
	}

	transactions, err := h.transactionService.Search(c.Request().Context(), userID, period, filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, transactions)
}

func (h *TransactionHandler) GetByID(c echo.Context) error {
	ctx := c.Request().Context()
	userID := appcontext.GetUserIDFromContext(ctx)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return pkgErrors.BadRequest("invalid transaction ID").ToHTTPError()
	}

	t, err := h.transactionService.Search(ctx, userID, domain.Period{
		Month: 0,
		Year:  0,
	}, domain.TransactionFilter{
		IDs: []int{id},
	})
	if err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	if len(t) == 0 {
		return pkgErrors.NotFound("transaction").ToHTTPError()
	}

	return c.JSON(http.StatusOK, t[0])
}

func (h *TransactionHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid transaction ID")
	}

	propagationSettings := domain.TransactionPropagationSettings(c.QueryParam("propagation_settings"))

	if err := h.transactionService.Delete(c.Request().Context(), userID, id, propagationSettings); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}
