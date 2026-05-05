package handler

import (
	"net/http"
	"strconv"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
)

type CategoryHandler struct {
	categoryService service.CategoryService
}

func NewCategoryHandler(services *service.Services) *CategoryHandler {
	return &CategoryHandler{
		categoryService: services.Category,
	}
}

// Create godoc
// @Summary      Create category
// @Tags         categories
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        category  body      domain.Category  true  "Category data"
// @Success      201       {object}  domain.Category
// @Failure      400       {object}  middleware.ErrorResponse
// @Failure      401       {object}  middleware.ErrorResponse
// @Router       /api/categories [post]
func (h *CategoryHandler) Create(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var category domain.Category
	if err := c.Bind(&category); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	created, err := h.categoryService.Create(c.Request().Context(), userID, &category)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusCreated, created)
}

// Search godoc
// @Summary      List categories
// @Tags         categories
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {array}   domain.Category
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/categories [get]
func (h *CategoryHandler) Search(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	categories, err := h.categoryService.GetTree(c.Request().Context(), domain.CategorySearchOptions{
		UserIDs: []int{userID},
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, categories)
}

// Update godoc
// @Summary      Update category
// @Tags         categories
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id        path  int              true  "Category ID"
// @Param        category  body  domain.Category  true  "Category data"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/categories/{id} [put]
func (h *CategoryHandler) Update(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid category ID")
	}

	var category domain.Category
	if err := c.Bind(&category); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	category.ID = id
	if err := h.categoryService.Update(c.Request().Context(), userID, &category); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

// Delete godoc
// @Summary      Delete category
// @Tags         categories
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id   path  int                        true  "Category ID"
// @Param        request body  domain.DeleteCategoryRequest  false  "Optional replacement category"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/categories/{id} [delete]
func (h *CategoryHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid category ID")
	}

	var req domain.DeleteCategoryRequest
	// Body is optional; ignore bind error for empty body
	_ = c.Bind(&req)

	if err := h.categoryService.Delete(c.Request().Context(), userID, id, req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}
