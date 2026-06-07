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
	userService           service.UserService
}

func NewUserConnectionHandler(services *service.Services) *UserConnectionHandler {
	return &UserConnectionHandler{
		userConnectionService: services.UserConnection,
		userService:           services.User,
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

// UpdateSettings godoc
// @Summary      Update connection settings (account name + default split + linked tx day)
// @Tags         user-connections
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id       path  int                              true  "Connection ID"
// @Param        request  body  UpdateConnectionSettingsRequest  true  "Connection settings"
// @Success      200  {object}  domain.UserConnection
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      403  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/user-connections/{id} [put]
func (h *UserConnectionHandler) UpdateSettings(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid user connection ID")
	}

	var req UpdateConnectionSettingsRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	conn, err := h.userConnectionService.UpdateSettings(c.Request().Context(), userID, id, req.AccountName, req.DefaultSplitPercentage, req.LinkedTransactionDayOfMonth)
	if err != nil {
		return HandleServiceError(err)
	}

	return c.JSON(http.StatusOK, conn)
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

// GetInviteInfo godoc
// @Summary      Get user info by external ID (for invite preview)
// @Tags         user-connections
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        external_id  path  string  true  "User external ID"
// @Success      200  {object}  domain.User
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/user-connections/invite-info/{external_id} [get]
func (h *UserConnectionHandler) GetInviteInfo(c echo.Context) error {
	externalID := c.Param("external_id")
	if externalID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "external_id is required")
	}

	user, err := h.userService.GetByExternalID(c.Request().Context(), externalID)
	if err != nil {
		return HandleServiceError(err)
	}

	return c.JSON(http.StatusOK, user)
}

// AcceptInvite godoc
// @Summary      Accept an invite using the inviter's external ID
// @Tags         user-connections
// @Accept       json
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        request  body  AcceptInviteRequest  true  "Invite data"
// @Success      201  {object}  domain.UserConnection
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/user-connections/accept-invite [post]
func (h *UserConnectionHandler) AcceptInvite(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())

	var req AcceptInviteRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if req.ExternalID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "external_id is required")
	}

	conn, err := h.userConnectionService.AcceptInviteByExternalID(c.Request().Context(), userID, req.ExternalID, req.FromDefaultSplitPercentage)
	if err != nil {
		return HandleServiceError(err)
	}

	return c.JSON(http.StatusCreated, conn)
}

type AcceptInviteRequest struct {
	ExternalID                 string `json:"external_id"`
	FromDefaultSplitPercentage int    `json:"from_default_split_percentage"`
}

type UpdateConnectionSettingsRequest struct {
	AccountName            string `json:"account_name"`
	DefaultSplitPercentage int    `json:"default_split_percentage"`
	// Optional day-of-month (1–31) on which the caller's linked transactions are
	// created when the other participant splits a transaction with them. nil clears
	// the preference (the linked transaction inherits the source transaction date).
	LinkedTransactionDayOfMonth *int `json:"linked_transaction_day_of_month"`
}
