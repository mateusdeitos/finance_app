package handler

import (
	"net/http"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
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
