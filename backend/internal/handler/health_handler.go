package handler

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/finance_app/backend/pkg/applog"
	"github.com/labstack/echo/v4"
)

type databaseHealthChecker interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

type HealthHandler struct {
	db databaseHealthChecker
}

func NewHealthHandler(db databaseHealthChecker) *HealthHandler {
	return &HealthHandler{db: db}
}

func (h *HealthHandler) Check(c echo.Context) error {
	ctx := c.Request().Context()
	if _, err := h.db.ExecContext(ctx, "SELECT 1"); err != nil {
		applog.FromContext(ctx).With("database_error", err.Error())
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"status": "unhealthy"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
