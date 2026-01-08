package handler

import (
	"net/http"
	"strconv"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
)

type AccountHandler struct {
	accountService service.AccountService
}

func NewAccountHandler(services *service.Services) *AccountHandler {
	return &AccountHandler{
		accountService: services.Account,
	}
}

func (h *AccountHandler) Create(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var account domain.Account
	if err := c.Bind(&account); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	created, err := h.accountService.Create(c.Request().Context(), userID, &account)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusCreated, created)
}

func (h *AccountHandler) GetByID(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account ID")
	}

	account, err := h.accountService.GetByID(c.Request().Context(), userID, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, err.Error())
	}

	return c.JSON(http.StatusOK, account)
}

func (h *AccountHandler) List(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	accounts, err := h.accountService.List(c.Request().Context(), userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, accounts)
}

func (h *AccountHandler) Update(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account ID")
	}

	var account domain.Account
	if err := c.Bind(&account); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	account.ID = id
	if err := h.accountService.Update(c.Request().Context(), userID, &account); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *AccountHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account ID")
	}

	if err := h.accountService.Delete(c.Request().Context(), userID, id); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *AccountHandler) AcceptSharedAccount(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account ID")
	}

	if err := h.accountService.AcceptSharedAccount(c.Request().Context(), userID, id); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *AccountHandler) RejectSharedAccount(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account ID")
	}

	if err := h.accountService.RejectSharedAccount(c.Request().Context(), userID, id); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}
