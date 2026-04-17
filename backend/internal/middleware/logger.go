package middleware

import (
	"net/http"
	"time"

	"github.com/finance_app/backend/pkg/applog"
	apperrors "github.com/finance_app/backend/pkg/errors"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog"
)

// LoggingMiddleware creates an Echo middleware that implements Stripe's
// single-log-per-request pattern. It generates a UUID v4 request_id,
// injects a zerolog logger into context via applog.WithLogger, and
// emits exactly one structured JSON log line on request completion.
// Per D-05: final log emitted by middleware, not application code.
// Per D-14: log level is dynamic based on response status code.
func LoggingMiddleware(globalLogger zerolog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Per D-08: UUID v4 generated per request
			requestID := uuid.New().String()
			// Per D-10: returned in X-Request-ID response header
			c.Response().Header().Set("X-Request-ID", requestID)

			start := time.Now()
			req := c.Request()

			// Per D-13: base fields — method, path, ip, request_id
			// Per D-09: request_id automatically included in every log line
			reqLogger := globalLogger.With().
				Str("request_id", requestID).
				Str("method", req.Method).
				Str("path", req.URL.Path).
				Str("ip", c.RealIP()).
				Logger()

			ctx := applog.WithLogger(req.Context(), &reqLogger)
			c.SetRequest(req.WithContext(ctx))

			// Execute handler chain (includes auth middleware, handlers, error handler)
			err := next(c)

			// Per D-07: middleware reads accumulated fields and emits final log
			// Per Pitfall 5: treat status 0 as 500.
			// Echo's HTTPErrorHandler runs inside next(c), but c.Response().Status may
			// still reflect the pre-error value (200) because the error handler calls
			// c.JSON which sets the status on the response writer, not on the returned
			// error. Derive status from the returned error for accurate level selection.
			status := c.Response().Status
			if err != nil {
				// Derive the HTTP status from the error type for accurate level selection.
				// Check TaggedHTTPError first — it's what application handlers return via ToHTTPError().
				if tagged, ok := err.(*apperrors.TaggedHTTPError); ok {
					status = tagged.Code
				} else if he, ok := err.(*echo.HTTPError); ok {
					status = he.Code
				} else {
					status = http.StatusInternalServerError
				}
			}
			if status == 0 {
				status = 500
			}
			latency := time.Since(start)

			// Read the logger AFTER handler chain — it now has all accumulated fields
			// (user_id from auth, error details from error handler, custom fields from handlers)
			finalLogger := applog.FromContext(c.Request().Context())

			// Per D-14: dynamic log level selection
			event := levelForStatus(finalLogger.Zerolog(), status)
			event.
				Int("status", status).
				Dur("latency_ms", latency).
				Msg("request")

			return err
		}
	}
}

// levelForStatus returns a zerolog event at the appropriate level.
// Per D-14: 2xx->info, 4xx->warn, 5xx->error.
func levelForStatus(l *zerolog.Logger, status int) *zerolog.Event {
	switch {
	case status >= 500:
		return l.Error()
	case status >= 400:
		return l.Warn()
	default:
		return l.Info()
	}
}
