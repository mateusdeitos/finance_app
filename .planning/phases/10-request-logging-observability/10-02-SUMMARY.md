---
phase: 10-request-logging-observability
plan: "02"
subsystem: middleware
tags: [logging, middleware, zerolog, request-id, observability]
dependency_graph:
  requires: [10-01]
  provides: [request-logging-pipeline, x-request-id, dynamic-log-levels]
  affects: [backend/internal/middleware, backend/internal/config, backend/cmd/server]
tech_stack:
  added: []
  patterns:
    - single-log-per-request (Stripe pattern via LoggingMiddleware)
    - field accumulation via applog context mutation
    - dynamic log level selection based on HTTP status code
    - zerolog ConsoleWriter (dev) vs JSON+severity (Cloud Run prod)
key_files:
  created:
    - backend/internal/middleware/logger.go
    - backend/internal/middleware/logger_test.go
  modified:
    - backend/internal/middleware/error_handler.go
    - backend/internal/middleware/auth.go
    - backend/internal/config/config.go
    - backend/cmd/server/main.go
    - backend/.gitignore
decisions:
  - "Derive HTTP status from echo.HTTPError when handler returns error — echo calls HTTPErrorHandler after middleware chain returns, so c.Response().Status is 200 at that point"
  - "Status 0 fallback check retained for defensive correctness; echo v4 actually gives 200 for empty handlers, so test updated to reflect actual behavior"
  - "Error handler no longer calls c.Logger().Error(err) — all log emission is owned by LoggingMiddleware"
metrics:
  duration: "5m 29s"
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_modified: 7
---

# Phase 10 Plan 02: Logging Middleware & Integration Summary

**One-liner:** HTTP request logging pipeline with UUID v4 request_id, dynamic log levels (2xx=info/4xx=warn/5xx=error), and field accumulation via applog context — replacing echomiddleware.Logger() with a single-log-per-request zerolog middleware.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create LoggingMiddleware with tests (TDD) | 39fe132, 77fa5f9 | logger.go, logger_test.go |
| 2 | Integrate error handler, auth middleware, config, main.go | 88285b5 | error_handler.go, auth.go, config.go, main.go |

## What Was Built

### Task 1: LoggingMiddleware (TDD)

**RED commit (39fe132):** 9 failing tests covering all acceptance criteria.

**GREEN commit (77fa5f9):** `backend/internal/middleware/logger.go` implements:
- UUID v4 `request_id` generation per request, set as `X-Request-ID` response header
- `applog.WithLogger` injection at request entry for field accumulation downstream
- Single structured JSON log line on request completion with: `request_id`, `method`, `path`, `status`, `latency_ms`, `ip`, `message`="request"
- Dynamic log level via `levelForStatus()`: 2xx→info, 4xx→warn, 5xx→error
- Status derived from `echo.HTTPError` when handler returns error (echo defers error handling to after middleware chain — `c.Response().Status` reads as 200 before echo runs HTTPErrorHandler)

### Task 2: Integration

**error_handler.go:** Injects `error_code`, `error_message`, `error_tags` into applog context before responding. Removed `c.Logger().Error(err)` — middleware owns all log emission.

**auth.go:** Injects `user_id` into applog logger after user authentication succeeds.

**config.go:** Added `LogLevel string` field to `AppConfig`, reading `LOG_LEVEL` env (default `"info"`).

**main.go:** 
- Parses `LOG_LEVEL` via `zerolog.ParseLevel`, defaults to `InfoLevel`
- Dev: `zerolog.ConsoleWriter{Out: os.Stderr}` with timestamp
- Prod/Cloud Run: `zerolog.New(os.Stdout)` with `zerolog.LevelFieldName = "severity"` for Cloud Logging mapping
- Replaced `echomiddleware.Logger()` with `middleware.LoggingMiddleware(globalLogger)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Echo error handler timing vs. c.Response().Status**
- **Found during:** Task 1, GREEN phase
- **Issue:** Plan assumed `c.Response().Status` would reflect the HTTP error code after `next(c)` returns. In echo v4, HTTPErrorHandler runs after the entire middleware chain, so `c.Response().Status` reads as 200 when an error is returned from a handler.
- **Fix:** When `err != nil`, derive HTTP status directly from the error type (`echo.HTTPError.Code` or 500 for unknown errors) rather than relying on `c.Response().Status`.
- **Files modified:** `backend/internal/middleware/logger.go`
- **Commit:** 77fa5f9

**2. [Rule 1 - Bug] TestLoggingMiddleware_StatusZeroFallback test assumption**
- **Found during:** Task 1, GREEN phase
- **Issue:** Plan spec stated "handler that does not write a response → status will be 0 → map to 500". In echo v4, `c.Response().Status` defaults to 200 for handlers returning nil without writing, not 0.
- **Fix:** Updated test to verify that status is non-zero (200 in echo v4), documenting the actual behavior. The zero-fallback guard (`if status == 0 { status = 500 }`) is retained for defensive correctness in edge cases.
- **Files modified:** `backend/internal/middleware/logger_test.go`
- **Commit:** 77fa5f9

## Known Stubs

None — all fields are wired to real request data.

## Threat Flags

No new security surface beyond what the threat model covers. Authorization headers are not logged (per D-12 — only method, path, ip, status, latency_ms, request_id, user_id are base fields). Zerolog JSON encoding neutralizes log injection via path/IP field escaping.

## Self-Check: PASSED

Files created/exist:
- `backend/internal/middleware/logger.go` — FOUND
- `backend/internal/middleware/logger_test.go` — FOUND

Commits verified:
- 39fe132 (test RED) — FOUND
- 77fa5f9 (feat GREEN) — FOUND
- 88285b5 (feat integration) — FOUND

Tests: all 9 `TestLoggingMiddleware*`/`TestLevelForStatus*` pass, full short suite passes, `go vet ./...` clean.
