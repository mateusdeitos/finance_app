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

func (h *CategoryHandler) Search(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	categories, err := h.categoryService.Search(c.Request().Context(), domain.CategorySearchOptions{
		UserIDs: []int{userID},
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, categories)
}

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

func (h *CategoryHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid category ID")
	}

	if err := h.categoryService.Delete(c.Request().Context(), userID, id); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}
