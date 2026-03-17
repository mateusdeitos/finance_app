package handler

import (
	"net/http"
	"strconv"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
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

// Create godoc
// @Summary      Create tag
// @Tags         tags
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        tag  body      domain.Tag  true  "Tag data"
// @Success      201  {object}  domain.Tag
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/tags [post]
func (h *TagHandler) Create(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

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

// Search godoc
// @Summary      List tags
// @Tags         tags
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {array}   domain.Tag
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/tags [get]
func (h *TagHandler) Search(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	tags, err := h.tagService.Search(c.Request().Context(), domain.TagSearchOptions{
		UserIDs: []int{userID},
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, tags)
}

// Update godoc
// @Summary      Update tag
// @Tags         tags
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id   path  int         true  "Tag ID"
// @Param        tag  body  domain.Tag  true  "Tag data"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/tags/{id} [put]
func (h *TagHandler) Update(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

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

	return c.NoContent(http.StatusNoContent)
}

// Delete godoc
// @Summary      Delete tag
// @Tags         tags
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Tag ID"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/tags/{id} [delete]
func (h *TagHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid tag ID")
	}

	if err := h.tagService.Delete(c.Request().Context(), userID, id); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}
