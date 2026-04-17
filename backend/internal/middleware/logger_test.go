package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/finance_app/backend/pkg/applog"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupLoggerMiddlewareTest(t *testing.T) (*echo.Echo, *bytes.Buffer) {
	t.Helper()
	buf := &bytes.Buffer{}
	globalLogger := zerolog.New(buf) // no timestamp for deterministic test output
	e := echo.New()
	e.HTTPErrorHandler = ErrorHandler
	e.Use(LoggingMiddleware(globalLogger))
	return e, buf
}

func TestLoggingMiddleware_EmitsOneLogLine(t *testing.T) {
	e, buf := setupLoggerMiddlewareTest(t)
	e.GET("/test", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	output := strings.TrimSpace(buf.String())
	lines := strings.Split(output, "\n")
	assert.Equal(t, 1, len(lines), "expected exactly 1 log line, got: %s", output)
}

func TestLoggingMiddleware_ContainsRequiredFields(t *testing.T) {
	e, buf := setupLoggerMiddlewareTest(t)
	e.GET("/test", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	var logEntry map[string]interface{}
	require.NoError(t, json.Unmarshal(buf.Bytes(), &logEntry))

	requiredFields := []string{"request_id", "method", "path", "status", "latency_ms", "ip", "message"}
	for _, field := range requiredFields {
		assert.Contains(t, logEntry, field, "expected field %q in log", field)
	}
	assert.Equal(t, "request", logEntry["message"])
}

func TestLoggingMiddleware_SetsRequestIDHeader(t *testing.T) {
	e, _ := setupLoggerMiddlewareTest(t)
	e.GET("/test", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	requestID := rec.Header().Get("X-Request-ID")
	assert.NotEmpty(t, requestID, "X-Request-ID header should be set")

	uuidRegex := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	assert.True(t, uuidRegex.MatchString(requestID), "X-Request-ID should be a valid UUID v4, got: %s", requestID)
}

func TestLoggingMiddleware_RequestIDInLog(t *testing.T) {
	e, buf := setupLoggerMiddlewareTest(t)
	e.GET("/test", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	requestID := rec.Header().Get("X-Request-ID")
	assert.NotEmpty(t, requestID)

	var logEntry map[string]interface{}
	require.NoError(t, json.Unmarshal(buf.Bytes(), &logEntry))

	assert.Equal(t, requestID, logEntry["request_id"], "request_id in log should match X-Request-ID header")
}

func TestLevelForStatus_2xx(t *testing.T) {
	e, buf := setupLoggerMiddlewareTest(t)
	e.GET("/test", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	var logEntry map[string]interface{}
	require.NoError(t, json.Unmarshal(buf.Bytes(), &logEntry))

	assert.Equal(t, "info", logEntry["level"], "2xx status should log at info level")
}

func TestLevelForStatus_4xx(t *testing.T) {
	e, buf := setupLoggerMiddlewareTest(t)
	e.GET("/test", func(c echo.Context) error {
		return echo.NewHTTPError(http.StatusNotFound, "not found")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	var logEntry map[string]interface{}
	require.NoError(t, json.Unmarshal(buf.Bytes(), &logEntry))

	assert.Equal(t, "warn", logEntry["level"], "4xx status should log at warn level")
}

func TestLevelForStatus_5xx(t *testing.T) {
	e, buf := setupLoggerMiddlewareTest(t)
	e.GET("/test", func(c echo.Context) error {
		return echo.NewHTTPError(http.StatusInternalServerError, "internal error")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	var logEntry map[string]interface{}
	require.NoError(t, json.Unmarshal(buf.Bytes(), &logEntry))

	assert.Equal(t, "error", logEntry["level"], "5xx status should log at error level")
}

func TestLoggingMiddleware_StatusZeroFallback(t *testing.T) {
	e, buf := setupLoggerMiddlewareTest(t)
	e.GET("/test", func(c echo.Context) error {
		// Return nil without writing a response.
		// In echo v4, c.Response().Status defaults to 200 for empty responses.
		// The middleware must log a non-zero status (200 in this case).
		return nil
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	var logEntry map[string]interface{}
	require.NoError(t, json.Unmarshal(buf.Bytes(), &logEntry))

	statusVal, ok := logEntry["status"]
	require.True(t, ok, "status field should be present in log")
	// JSON numbers decode as float64
	// In echo v4, empty handler returning nil has Status=200; the zero-fallback
	// guard ensures we never log status=0 — in this case 200 is logged as-is.
	assert.NotEqual(t, float64(0), statusVal, "status should not be 0 in log")
	assert.Equal(t, float64(200), statusVal, "empty handler returning nil should log status 200 in echo v4")
}

func TestLoggingMiddleware_AccumulatedFieldsAppear(t *testing.T) {
	e, buf := setupLoggerMiddlewareTest(t)
	e.GET("/test", func(c echo.Context) error {
		applog.FromContext(c.Request().Context()).With("custom_field", "custom_value")
		return c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	var logEntry map[string]interface{}
	require.NoError(t, json.Unmarshal(buf.Bytes(), &logEntry))

	assert.Equal(t, "custom_value", logEntry["custom_field"], "custom_field should appear in final log")
}
