package handler

import (
	"net/http"
	"strconv"
	"time"

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

	var transaction domain.Transaction
	if err := c.Bind(&transaction); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	created, err := h.transactionService.Create(c.Request().Context(), userID, &transaction)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusCreated, created)
}

func (h *TransactionHandler) GetByID(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid transaction ID")
	}

	transaction, err := h.transactionService.GetByID(c.Request().Context(), userID, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, err.Error())
	}

	return c.JSON(http.StatusOK, transaction)
}

func (h *TransactionHandler) List(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	// Parse query parameters
	filter := domain.TransactionFilter{}

	if accountIDs := c.QueryParam("account_ids"); accountIDs != "" {
		// Parse comma-separated IDs
		ids := parseIntSlice(accountIDs)
		if len(ids) > 0 {
			filter.AccountIDs = ids
		}
	}

	if categoryIDs := c.QueryParam("category_ids"); categoryIDs != "" {
		ids := parseIntSlice(categoryIDs)
		if len(ids) > 0 {
			filter.CategoryIDs = ids
		}
	}

	if tagIDs := c.QueryParam("tag_ids"); tagIDs != "" {
		ids := parseIntSlice(tagIDs)
		if len(ids) > 0 {
			filter.TagIDs = ids
		}
	}

	if startDate := c.QueryParam("start_date"); startDate != "" {
		if date, err := parseDate(startDate); err == nil {
			filter.StartDate = date
		}
	}

	if endDate := c.QueryParam("end_date"); endDate != "" {
		if date, err := parseDate(endDate); err == nil {
			filter.EndDate = date
		}
	}

	if description := c.QueryParam("description"); description != "" {
		filter.Description = &description
	}

	orderBy := domain.OrderByDate
	if ob := c.QueryParam("order_by"); ob != "" {
		orderBy = domain.TransactionOrderBy(ob)
	}

	limit := 100
	if l := c.QueryParam("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	offset := 0
	if o := c.QueryParam("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	transactions, total, err := h.transactionService.List(c.Request().Context(), userID, filter, orderBy, limit, offset)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"transactions": transactions,
		"total":        total,
		"limit":        limit,
		"offset":       offset,
	})
}

func (h *TransactionHandler) Update(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid transaction ID")
	}

	var transaction domain.Transaction
	if err := c.Bind(&transaction); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	transaction.ID = id
	if err := h.transactionService.Update(c.Request().Context(), userID, &transaction); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "transaction updated"})
}

func (h *TransactionHandler) BulkUpdate(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var updates domain.BulkUpdateTransaction
	if err := c.Bind(&updates); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if err := h.transactionService.BulkUpdate(c.Request().Context(), userID, updates); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "transactions updated"})
}

func (h *TransactionHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid transaction ID")
	}

	if err := h.transactionService.Delete(c.Request().Context(), userID, id); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "transaction deleted"})
}

func (h *TransactionHandler) ImportCSV(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	file, err := c.FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file is required")
	}

	src, err := file.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "failed to open file")
	}
	defer src.Close()

	transactions, err := h.transactionService.ImportCSV(c.Request().Context(), userID, src)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"transactions": transactions,
		"count":        len(transactions),
	})
}

func (h *TransactionHandler) SuggestCategory(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	description := c.QueryParam("description")
	if description == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "description is required")
	}

	category, err := h.transactionService.SuggestCategory(c.Request().Context(), userID, description)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if category == nil {
		return c.JSON(http.StatusOK, nil)
	}

	return c.JSON(http.StatusOK, category)
}

func (h *TransactionHandler) CreateRecurring(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var req struct {
		Transaction domain.Transaction                 `json:"transaction"`
		Config      domain.TransactionRecurrenceConfig `json:"config"`
	}

	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	transactions, err := h.transactionService.CreateRecurring(c.Request().Context(), userID, &req.Transaction, req.Config)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"transactions": transactions,
		"count":        len(transactions),
	})
}

// Helper functions
func parseIntSlice(s string) []int {
	parts := splitString(s, ",")
	ids := make([]int, 0, len(parts))
	for _, part := range parts {
		if id, err := strconv.Atoi(part); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func splitString(s, sep string) []string {
	if s == "" {
		return []string{}
	}
	parts := make([]string, 0)
	current := ""
	for _, r := range s {
		if string(r) == sep {
			if current != "" {
				parts = append(parts, current)
				current = ""
			}
		} else {
			current += string(r)
		}
	}
	if current != "" {
		parts = append(parts, current)
	}
	return parts
}

func parseDate(s string) (*time.Time, error) {
	// Try different date formats
	formats := []string{"2006-01-02", "2006/01/02", "01/02/2006"}
	for _, format := range formats {
		if date, err := time.Parse(format, s); err == nil {
			return &date, nil
		}
	}
	return nil, echo.NewHTTPError(http.StatusBadRequest, "invalid date format")
}
