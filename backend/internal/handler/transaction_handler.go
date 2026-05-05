package handler

import (
	"io"
	"net/http"
	"slices"
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

// Create godoc
// @Summary      Create transaction
// @Description  Creates an expense, income, or transfer. For recurring transactions include recurrence_settings. For split transactions include split_settings.
// @Tags         transactions
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        transaction  body  domain.TransactionCreateRequest  true  "Transaction data"
// @Success      201
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/transactions [post]
func (h *TransactionHandler) Create(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var transaction domain.TransactionCreateRequest
	if err := c.Bind(&transaction); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	id, err := h.transactionService.Create(c.Request().Context(), userID, &transaction)
	if err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.JSON(http.StatusCreated, map[string]int{"id": id})
}

// Update godoc
// @Summary      Update transaction
// @Description  All fields are optional. Use propagation_settings to control how updates affect recurring installments.
// @Tags         transactions
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id           path  int                              true  "Transaction ID"
// @Param        transaction  body  domain.TransactionUpdateRequest  true  "Fields to update"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/transactions/{id} [put]
func (h *TransactionHandler) Update(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid transaction ID")
	}

	var transaction domain.TransactionUpdateRequest
	if err := c.Bind(&transaction); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	err = h.transactionService.Update(c.Request().Context(), id, userID, &transaction)
	if err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.NoContent(http.StatusNoContent)
}

// Search godoc
// @Summary      List transactions for a period
// @Tags         transactions
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        month              query  int       true   "Month (1-12)"
// @Param        year               query  int       true   "Year"
// @Param        account_id[]       query  []int     false  "Filter by account IDs"    collectionFormat(multi)
// @Param        category_id[]      query  []int     false  "Filter by category IDs"   collectionFormat(multi)
// @Param        tag_id[]           query  []int     false  "Filter by tag IDs"        collectionFormat(multi)
// @Param        type[]             query  []string  false  "Filter by type"           collectionFormat(multi) Enums(expense, income, transfer)
// @Param        description.query  query  string    false  "Search description text"
// @Param        description.exact  query  bool      false  "Exact description match"
// @Param        with_settlements   query  bool      false  "Include settlements"
// @Param        limit              query  int       false  "Limit"
// @Param        offset             query  int       false  "Offset"
// @Success      200  {array}   domain.Transaction
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/transactions [get]
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

// GetByID godoc
// @Summary      Get transaction by ID
// @Tags         transactions
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path      int  true  "Transaction ID"
// @Success      200  {object}  domain.Transaction
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/transactions/{id} [get]
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

// GetBalance godoc
// @Summary      Get balance for a period
// @Description  Returns net balance (income − expenses) for the given month/year. Set accumulated=true to include all prior periods.
// @Tags         transactions
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        month          query  int    true   "Month (1-12)"
// @Param        year           query  int    true   "Year"
// @Param        account_id[]   query  []int  false  "Filter by account IDs"   collectionFormat(multi)
// @Param        category_id[]  query  []int  false  "Filter by category IDs"  collectionFormat(multi)
// @Param        tag_id[]       query  []int  false  "Filter by tag IDs"       collectionFormat(multi)
// @Param        accumulated       query  bool   false  "Include all prior periods"
// @Param        hide_settlements  query  bool   false  "Exclude settlements from balance"
// @Success      200  {object}  domain.BalanceResult
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/transactions/balance [get]
func (h *TransactionHandler) GetBalance(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	month, err := strconv.Atoi(c.QueryParam("month"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid month")
	}

	year, err := strconv.Atoi(c.QueryParam("year"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid year")
	}

	period := domain.Period{Month: month, Year: year}
	if !period.IsValid() {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid period")
	}

	var filter domain.BalanceFilter
	if err := c.Bind(&filter); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	result, err := h.transactionService.GetBalance(c.Request().Context(), userID, period, filter)
	if err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.JSON(http.StatusOK, result)
}

// Suggestions godoc
// @Summary      Suggest transactions by description
// @Description  Returns up to `limit` transactions whose description matches the query string (PostgreSQL text search). Used for autocomplete when creating a new transaction.
// @Tags         transactions
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        q      query  string  true   "Description search query"
// @Param        limit  query  int     false  "Maximum results (default 10, max 50)"
// @Success      200  {array}   domain.Transaction
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/transactions/suggestions [get]
func (h *TransactionHandler) Suggestions(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	q := c.QueryParam("q")
	if q == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "q is required")
	}

	limit := 10
	if l := c.QueryParam("limit"); l != "" {
		parsed, err := strconv.Atoi(l)
		if err != nil || parsed < 1 {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid limit")
		}
		if parsed > 50 {
			parsed = 50
		}
		limit = parsed
	}

	filter := domain.TransactionFilter{
		Description: &domain.TextSearch{Query: q},
		Limit:       &limit,
	}

	results, err := h.transactionService.Suggestions(c.Request().Context(), userID, filter)
	if err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.JSON(http.StatusOK, results)
}

// Delete godoc
// @Summary      Delete transaction
// @Tags         transactions
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id                    path   int     true   "Transaction ID"
// @Param        propagation_settings  query  string  false  "How to handle recurring installments"  Enums(all, current, current_and_future)
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/transactions/{id} [delete]
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

// CheckDuplicate godoc
// @Summary      Check if a transaction is a duplicate
// @Description  Returns whether a transaction with the given date, description and amount already exists for the authenticated user.
// @Tags         transactions
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        request  body  domain.CheckDuplicateRequest  true  "Duplicate check params"
// @Success      200  {object}  map[string]bool
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/transactions/check-duplicate [post]
func (h *TransactionHandler) CheckDuplicate(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var req domain.CheckDuplicateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	isDup, err := h.transactionService.CheckDuplicateTransaction(c.Request().Context(), userID, req.Date, req.Amount, req.AccountID)
	if err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.JSON(http.StatusOK, map[string]bool{"is_duplicate": isDup})
}

// ImportCSV godoc
// @Summary      Parse and enrich a CSV file for import
// @Description  Accepts a multipart CSV file and an account_id. Returns parsed rows enriched with inferred categories and duplicate flags. No transactions are created; use the standard POST /transactions endpoint to create each confirmed row.
// @Tags         transactions
// @Accept       multipart/form-data
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        account_id  formData  int   true  "Destination account ID"
// @Param        file        formData  file  true  "CSV file"
// @Success      200  {object}  domain.ImportCSVResponse
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/transactions/import-csv [post]
func (h *TransactionHandler) ImportCSV(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	accountIDStr := c.FormValue("account_id")
	accountID, err := strconv.Atoi(accountIDStr)
	if err != nil || accountID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file is required")
	}

	src, err := fileHeader.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "failed to open file")
	}
	defer func() { _ = src.Close() }()

	// Limit file to 1 MB
	data, err := io.ReadAll(io.LimitReader(src, 1<<20))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "failed to read file")
	}

	decimalSeparator := service.ImportDecimalSeparatorValue(c.FormValue("decimal_separator"))
	if !slices.Contains([]service.ImportDecimalSeparatorValue{service.DecimalSeparatorComma, service.DecimalSeparatorDot}, decimalSeparator) {
		decimalSeparator = service.DecimalSeparatorComma
	}

	typeDefinitionRule := service.ImportTypeDefinitionRule(c.FormValue("type_definition_rule"))
	if !slices.Contains([]service.ImportTypeDefinitionRule{service.TypeDefinitionPositiveAsExpense, service.TypeDefinitionPositiveAsIncome}, typeDefinitionRule) {
		typeDefinitionRule = service.TypeDefinitionPositiveAsIncome
	}

	ctx := c.Request().Context()
	result, err := h.transactionService.ParseImportCSV(ctx, userID, accountID, decimalSeparator, typeDefinitionRule, data)
	if err != nil {
		return pkgErrors.ToHTTPError(err)
	}

	return c.JSON(http.StatusOK, result)
}
