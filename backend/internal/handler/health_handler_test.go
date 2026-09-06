package handler

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeDatabaseHealthChecker struct {
	query string
	err   error
}

func (f *fakeDatabaseHealthChecker) ExecContext(_ context.Context, query string, _ ...any) (sql.Result, error) {
	f.query = query
	return driver.RowsAffected(1), f.err
}

func TestHealthHandlerCheck(t *testing.T) {
	db := &fakeDatabaseHealthChecker{}
	h := NewHealthHandler(db)
	e := echo.New()
	recorder := httptest.NewRecorder()
	c := e.NewContext(httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/health", nil), recorder)

	err := h.Check(c)

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{"status":"ok"}`, recorder.Body.String())
	assert.Equal(t, "SELECT 1", db.query)
}

func TestHealthHandlerCheckWhenDatabaseIsUnavailable(t *testing.T) {
	db := &fakeDatabaseHealthChecker{err: errors.New("database unavailable")}
	h := NewHealthHandler(db)
	e := echo.New()
	recorder := httptest.NewRecorder()
	c := e.NewContext(httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/health", nil), recorder)

	err := h.Check(c)

	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	assert.JSONEq(t, `{"status":"unhealthy"}`, recorder.Body.String())
}
