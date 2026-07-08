package handler

import (
	"net/http"
	"strconv"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
)

type TransactionTemplateHandler struct {
	templateService service.TransactionTemplateService
}

func NewTransactionTemplateHandler(services *service.Services) *TransactionTemplateHandler {
	return &TransactionTemplateHandler{
		templateService: services.TransactionTemplate,
	}
}

// List godoc
// @Summary      List transaction templates
// @Description  Returns the authenticated user's saved transaction templates, oldest first (max 3)
// @Tags         transaction-templates
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {array}   domain.TransactionTemplate
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/transaction-templates [get]
func (h *TransactionTemplateHandler) List(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	templates, err := h.templateService.List(c.Request().Context(), userID)
	if err != nil {
		return HandleServiceError(err)
	}
	return c.JSON(http.StatusOK, templates)
}

// Create godoc
// @Summary      Create a transaction template
// @Description  Creates a new personal transaction template for the authenticated user, capped at 3 per user
// @Tags         transaction-templates
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        template  body  domain.TransactionTemplateCreateRequest  true  "Template data"
// @Success      201  {object}  domain.TransactionTemplate
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      409  {object}  middleware.ErrorResponse
// @Router       /api/transaction-templates [post]
func (h *TransactionTemplateHandler) Create(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var req domain.TransactionTemplateCreateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	created, err := h.templateService.Create(c.Request().Context(), userID, req.Name, req.Payload)
	if err != nil {
		return HandleServiceError(err)
	}
	return c.JSON(http.StatusCreated, created)
}

// Update godoc
// @Summary      Update a transaction template
// @Description  Full replace of a transaction template's name and payload (owner-scoped)
// @Tags         transaction-templates
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id        path  int                                       true  "Template ID"
// @Param        template  body  domain.TransactionTemplateUpdateRequest  true  "Template data"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Failure      409  {object}  middleware.ErrorResponse
// @Router       /api/transaction-templates/{id} [put]
func (h *TransactionTemplateHandler) Update(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid template id")
	}

	var req domain.TransactionTemplateUpdateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if err := h.templateService.Update(c.Request().Context(), userID, id, req.Name, req.Payload); err != nil {
		return HandleServiceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete godoc
// @Summary      Delete a transaction template
// @Description  Hard-deletes a transaction template owned by the authenticated user
// @Tags         transaction-templates
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Template ID"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/transaction-templates/{id} [delete]
func (h *TransactionTemplateHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid template id")
	}

	if err := h.templateService.Delete(c.Request().Context(), userID, id); err != nil {
		return HandleServiceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
