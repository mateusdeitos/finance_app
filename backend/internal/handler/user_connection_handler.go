package handler

import (
	"net/http"
	"strconv"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
)

type UserConnectionHandler struct {
	userConnectionService service.UserConnectionService
}

func NewUserConnectionHandler(services *service.Services) *UserConnectionHandler {
	return &UserConnectionHandler{
		userConnectionService: services.UserConnection,
	}
}

// Create godoc
// @Summary      Create user connection (invite partner)
// @Tags         user-connections
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        connection  body      domain.UserConnection  true  "Connection data"
// @Success      201         {object}  domain.UserConnection
// @Failure      400         {object}  middleware.ErrorResponse
// @Failure      401         {object}  middleware.ErrorResponse
// @Router       /api/user-connections [post]
func (h *UserConnectionHandler) Create(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var userConnection domain.UserConnection
	if err := c.Bind(&userConnection); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	created, err := h.userConnectionService.Create(c.Request().Context(), userID, userConnection.ToUserID, userConnection.FromDefaultSplitPercentage)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusCreated, created)
}

// UpdateStatus godoc
// @Summary      Update connection status (accept / reject)
// @Tags         user-connections
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id      path  int     true  "Connection ID"
// @Param        status  path  string  true  "New status"  Enums(pending, accepted, rejected)
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/user-connections/{id}/{status} [patch]
func (h *UserConnectionHandler) UpdateStatus(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid user connection ID")
	}

	status := c.Param("status")
	if !domain.UserConnectionStatusEnum(status).IsValid() {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid status")
	}

	if err := h.userConnectionService.UpdateStatus(c.Request().Context(), userID, id, domain.UserConnectionStatusEnum(status)); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

// Delete godoc
// @Summary      Delete user connection
// @Tags         user-connections
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Connection ID"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/user-connections/{id} [delete]
func (h *UserConnectionHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid user connection ID")
	}

	if err := h.userConnectionService.Delete(c.Request().Context(), userID, id); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

// Search godoc
// @Summary      List user connections
// @Tags         user-connections
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        limit              query  int     false  "Limit"
// @Param        offset             query  int     false  "Offset"
// @Param        connection_status  query  string  false  "Filter by status"  Enums(pending, accepted, rejected)
// @Success      200  {array}   domain.UserConnection
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/user-connections [get]
func (h *UserConnectionHandler) Search(c echo.Context) error {
	var options domain.UserConnectionSearchOptions
	if err := c.Bind(&options); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	userConnections, err := h.userConnectionService.Search(c.Request().Context(), options)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, userConnections)
}
