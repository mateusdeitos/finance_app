---
phase: 10-request-logging-observability
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - backend/cmd/server/main.go
  - backend/internal/config/config.go
  - backend/internal/middleware/auth.go
  - backend/internal/middleware/error_handler.go
  - backend/internal/middleware/logger.go
  - backend/internal/middleware/logger_test.go
  - backend/pkg/applog/applog.go
  - backend/pkg/applog/applog_test.go
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-04-17
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

The request logging implementation is well-structured and follows the stated design goals (single log per request, field accumulation, dynamic log level). The `applog` package correctly implements pointer-based mutation so `With()` calls from any layer propagate to the final log line.

One critical bug exists in `logger.go`: the status-derivation fallback only handles `*echo.HTTPError`, but almost all application errors are returned as `*apperrors.TaggedHTTPError`. This causes every handler-level 4xx error to be logged at `error` level instead of `warn`, making the dynamic log-level feature largely ineffective in practice.

Three additional warning-level issues were found: a misleading comment about Echo's error handler execution order, a missing production guard for insecure config defaults, and a silent log-level parse failure. Three informational items cover minor quality concerns.

---

## Critical Issues

### CR-01: Status derivation in LoggingMiddleware ignores `*apperrors.TaggedHTTPError`

**File:** `backend/internal/middleware/logger.go:53-58`

**Issue:** When deriving the HTTP status code for log-level selection, the middleware only checks for `*echo.HTTPError`. However, handlers throughout the application return errors via `apperrors.ToHTTPError()`, which produces `*apperrors.TaggedHTTPError` — a completely different type. Any request that fails with a `TaggedHTTPError` (e.g., 400 Bad Request, 404 Not Found, 422 Unprocessable Entity) falls into the `else` branch and is assigned `status = http.StatusInternalServerError`, causing:

1. The log line to be emitted at `error` level instead of `warn`.
2. `status` in the log to be `500` instead of the real response code.

This affects the vast majority of application errors, since virtually all handlers call `pkgErrors.ToHTTPError(err)` or `pkgErrors.BadRequest(...).ToHTTPError()`.

**Fix:**
```go
if err != nil {
    switch e := err.(type) {
    case *echo.HTTPError:
        status = e.Code
    case *apperrors.TaggedHTTPError:
        status = e.Code
    default:
        status = http.StatusInternalServerError
    }
}
```

Note: `apperrors` is already imported in `error_handler.go` in the same package; add the import to `logger.go` as well.

---

## Warnings

### WR-01: Misleading comment about Echo error handler execution order

**File:** `backend/internal/middleware/logger.go:47-50`

**Issue:** The comment states "the HTTPErrorHandler runs AFTER the entire middleware chain returns." This is incorrect. In Echo, when a handler returns an error, the framework calls `e.HTTPErrorHandler` synchronously — it runs while still inside the `next(c)` call, before `next(c)` returns to the logging middleware. The comment describing the problem (that `c.Response().Status` may be stale) is real and the code workaround is valid, but the explanation is wrong and could mislead future maintainers into removing the necessary fallback.

**Fix:** Replace the comment with an accurate description:
```go
// In Echo, when a handler returns an error, Echo's HTTPErrorHandler is called
// synchronously before next(c) returns; it writes the response body but the
// c.Response().Status seen here may not yet reflect the committed status if the
// response was never started. Derive the status from the error type directly to
// ensure accurate level selection regardless of whether the response was written.
```

### WR-02: Hardcoded insecure defaults for JWT and OAuth secrets with no production guard

**File:** `backend/internal/config/config.go:85,99`

**Issue:** Both `JWT_SECRET` and `OAUTH_SESSION_SECRET` default to the string `"change-me-in-production"`. If these environment variables are not set (e.g., misconfigured deployment), the application starts and silently accepts/issues JWTs signed with a publicly known secret, enabling token forgery.

**Fix:** Add a production-environment validation in `Load()` or in `main.go` after config is loaded:
```go
if cfg.App.Env == "production" {
    if cfg.JWT.Secret == "change-me-in-production" {
        return nil, fmt.Errorf("JWT_SECRET must be set in production")
    }
    if cfg.OAuth.SessionSecret == "change-me-in-production" {
        return nil, fmt.Errorf("OAUTH_SESSION_SECRET must be set in production")
    }
}
```

### WR-03: Silent fallback on invalid log level hides misconfiguration

**File:** `backend/cmd/server/main.go:59-62`

**Issue:** When `zerolog.ParseLevel(cfg.App.LogLevel)` fails (e.g., `LOG_LEVEL=debugg` typo), `parseErr` is discarded and the application silently falls back to `InfoLevel`. There is no log message or warning indicating the configured value was invalid, making the misconfiguration invisible in production.

**Fix:**
```go
logLevel, parseErr := zerolog.ParseLevel(cfg.App.LogLevel)
if parseErr != nil {
    logLevel = zerolog.InfoLevel
    log.Printf("WARNING: invalid LOG_LEVEL %q, defaulting to info", cfg.App.LogLevel)
}
```

---

## Info

### IN-01: `globalLogger` is unused after initialization (shadowed by context logger)

**File:** `backend/cmd/server/main.go:65-73`

**Issue:** `globalLogger` is declared and configured, then passed to `LoggingMiddleware`. Inside the middleware, it is used only to seed the per-request logger. The variable name and location are fine, but the `zerolog.LevelFieldName = "severity"` mutation (line 71) is a global side effect that affects all zerolog output, not just the `globalLogger` instance. This is correct behavior for Cloud Run, but it is not obvious from reading the code. A comment would help.

**Fix:** Add a clarifying comment:
```go
// zerolog.LevelFieldName is a global; setting it here affects all loggers.
// Cloud Logging maps the "severity" field to log severity automatically.
zerolog.LevelFieldName = "severity"
```

### IN-02: `user_id` field injection in auth middleware returns discarded value

**File:** `backend/internal/middleware/auth.go:47`

**Issue:** The call `applog.FromContext(c.Request().Context()).With("user_id", user.ID)` discards the returned `*Logger`. This works because `With()` mutates the inner pointer in-place, but it is inconsistent with how chaining is normally used and may confuse readers into thinking the field is lost. The same style inconsistency appears in `error_handler.go` lines 34-45 and in the test at `logger_test.go:176`.

**Fix:** Either document the mutation semantics clearly above each call, or adopt the consistent style of assigning to `_` explicitly to signal the discard is intentional:
```go
_ = applog.FromContext(c.Request().Context()).With("user_id", user.ID)
```

### IN-03: Test `TestLoggingMiddleware_AccumulatedFieldsAppear` does not assert `user_id` propagation from auth

**File:** `backend/internal/middleware/logger_test.go:173-188`

**Issue:** There is no test verifying that `user_id` injected by `AuthMiddleware` appears in the final log line. The `TestLoggingMiddleware_AccumulatedFieldsAppear` test validates field accumulation in general, but only for a field set directly in the handler — not from the auth middleware path. Given that CR-01 shows status derivation had a gap for `TaggedHTTPError`, a similar gap could exist for the `user_id` path without detection.

**Fix:** Add an integration-style middleware test that stacks `LoggingMiddleware` + `AuthMiddleware`, makes an authenticated request, and asserts `user_id` appears in the log output.

---

_Reviewed: 2026-04-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
