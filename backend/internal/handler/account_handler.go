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

type AccountHandler struct {
	accountService service.AccountService
}

func NewAccountHandler(services *service.Services) *AccountHandler {
	return &AccountHandler{
		accountService: services.Account,
	}
}

// Create godoc
// @Summary      Create account
// @Tags         accounts
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        account  body      domain.Account  true  "Account data"
// @Success      201      {object}  domain.Account
// @Failure      400      {object}  middleware.ErrorResponse
// @Failure      401      {object}  middleware.ErrorResponse
// @Router       /api/accounts [post]
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

// Search godoc
// @Summary      List accounts
// @Tags         accounts
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        limit   query  int    false  "Limit"
// @Param        offset  query  int    false  "Offset"
// @Success      200  {array}   domain.Account
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/accounts [get]
func (h *AccountHandler) Search(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var options domain.AccountSearchOptions
	if err := c.Bind(&options); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	options.UserIDs = []int{userID}

	accounts, err := h.accountService.Search(c.Request().Context(), options)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, accounts)
}

// Update godoc
// @Summary      Update account
// @Tags         accounts
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id       path  int             true  "Account ID"
// @Param        account  body  domain.Account  true  "Account data"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/accounts/{id} [put]
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

// Activate godoc
// @Summary      Activate account
// @Tags         accounts
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Account ID"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/accounts/{id}/activate [post]
func (h *AccountHandler) Activate(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account ID")
	}

	if err := h.accountService.Activate(c.Request().Context(), userID, id); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

// Deactivate godoc
// @Summary      Deactivate account
// @Description  Soft-disables an account without removing its data.
// @Tags         accounts
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Account ID"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/accounts/{id}/deactivate [post]
func (h *AccountHandler) Deactivate(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account ID")
	}

	if err := h.accountService.Deactivate(c.Request().Context(), userID, id); err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.NoContent(http.StatusNoContent)
}

// GetDeletionInfo godoc
// @Summary      Get account deletion impact
// @Description  Returns the number of transactions linked to the account so the client can prompt before a destructive delete.
// @Tags         accounts
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Account ID"
// @Success      200  {object}  domain.AccountDeletionInfo
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/accounts/{id}/deletion-info [get]
func (h *AccountHandler) GetDeletionInfo(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account ID")
	}

	info, err := h.accountService.GetDeletionInfo(c.Request().Context(), userID, id)
	if err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.JSON(http.StatusOK, info)
}

// Delete godoc
// @Summary      Delete account
// @Description  Permanently deletes an account. When the account has transactions, pass `strategy=delete_transactions` or `strategy=migrate` (with `target_account_id`). Connection accounts cannot be deleted.
// @Tags         accounts
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id                 path   int     true   "Account ID"
// @Param        strategy           query  string  false  "Deletion strategy: delete_transactions | migrate"
// @Param        target_account_id  query  int     false  "Target account when strategy=migrate"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/accounts/{id} [delete]
func (h *AccountHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account ID")
	}

	strategy := domain.AccountDeletionStrategy(c.QueryParam("strategy"))

	var targetAccountID *int
	if raw := c.QueryParam("target_account_id"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid target account ID")
		}
		targetAccountID = &parsed
	}

	if err := h.accountService.Delete(c.Request().Context(), userID, id, strategy, targetAccountID); err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.NoContent(http.StatusNoContent)
}

// ReorderRequest is the payload for reordering a user's accounts.
type ReorderRequest struct {
	AccountIDs []int `json:"account_ids"`
}

// Reorder godoc
// @Summary      Reorder accounts
// @Description  Persists the display order of the user's accounts.
// @Tags         accounts
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        request  body  handler.ReorderRequest  true  "Ordered account IDs"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/accounts/reorder [put]
func (h *AccountHandler) Reorder(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var req ReorderRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if err := h.accountService.Reorder(c.Request().Context(), userID, req.AccountIDs); err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.NoContent(http.StatusNoContent)
}
