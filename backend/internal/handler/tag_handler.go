package handler

import (
	"net/http"
	"strconv"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/middleware"
	"github.com/finance_app/backend/internal/service"
	"github.com/labstack/echo/v4"
)

type TagHandler struct {
	tagService service.TagService
}

func NewTagHandler(services *service.Services) *TagHandler {
	return &TagHandler{
		tagService: services.Tag,
	}
}

func (h *TagHandler) Create(c echo.Context) error {
	userID := middleware.GetUserIDFromContext(c)

	var tag domain.Tag
	if err := c.Bind(&tag); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	created, err := h.tagService.Create(c.Request().Context(), userID, &tag)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusCreated, created)
}

func (h *TagHandler) GetByID(c echo.Context) error {
	userID := middleware.GetUserIDFromContext(c)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid tag ID")
	}

	tag, err := h.tagService.GetByID(c.Request().Context(), userID, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, err.Error())
	}

	return c.JSON(http.StatusOK, tag)
}

func (h *TagHandler) List(c echo.Context) error {
	userID := middleware.GetUserIDFromContext(c)

	tags, err := h.tagService.List(c.Request().Context(), userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, tags)
}

func (h *TagHandler) Update(c echo.Context) error {
	userID := middleware.GetUserIDFromContext(c)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid tag ID")
	}

	var tag domain.Tag
	if err := c.Bind(&tag); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	tag.ID = id
	if err := h.tagService.Update(c.Request().Context(), userID, &tag); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "tag updated"})
}

func (h *TagHandler) Delete(c echo.Context) error {
	userID := middleware.GetUserIDFromContext(c)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid tag ID")
	}

	if err := h.tagService.Delete(c.Request().Context(), userID, id); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "tag deleted"})
}

