# Phase 10: Request Logging & Observability - Research

**Researched:** 2026-04-17
**Domain:** Structured logging with zerolog, Echo middleware, context propagation
**Confidence:** HIGH

## Summary

This phase adds structured request logging to a Go/Echo backend using `github.com/rs/zerolog` v1.35.0. The pattern is Stripe's single-log-per-request: one JSON line per HTTP request emitted at completion, containing all accumulated context. Zerolog natively supports attaching a logger to `context.Context` via `logger.WithContext(ctx)` / `zerolog.Ctx(ctx)` — this maps cleanly onto the project's existing pattern of threading `ctx` through every layer.

The key design challenge is *mutable field accumulation*. Zerolog's `Logger` is value-typed; adding a field creates a new logger (via `logger.With().Str(...).Logger()`). For the single-log pattern the middleware needs to update the context-stored logger as fields accumulate. The cleanest approach is to store a `*zerolog.Logger` (pointer to logger) wrapped in a thin `applog.Logger` struct, so any layer can add fields and those fields appear in the final log line AND in intermediate logs.

The `hlog` sub-package ships with zerolog and provides ready-made HTTP middleware helpers (`hlog.RequestIDHandler`, `hlog.RemoteAddrHandler`, `hlog.AccessHandler`) designed for `net/http`. Since Echo wraps `net/http`, these work directly but require wrapping the `echo.HandlerFunc` to expose the `http.Handler` interface. The recommended approach for this project is a **custom Echo middleware** (parallel to the existing `auth.go` pattern) rather than using `hlog`, because it gives full control over the single-log-per-request emission point and avoids dependency on Alice/justinas chaining.

**Primary recommendation:** Build `pkg/applog` with a thin wrapper around `*zerolog.Logger`, custom Echo middleware in `internal/middleware/logger.go`, and modify `ErrorHandler` to append error details to the context logger before the final log line is emitted.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Chainable `.With("key", value)` methods following zerolog's native style
- **D-02:** Package location: `pkg/applog` — parallel to existing `pkg/appcontext`
- **D-03:** `applog.FromContext(ctx)` retrieves the request-scoped logger
- **D-04:** Intermediate logs (`.Warn().Msg(...)`, `.Debug().Msg(...)`) automatically carry all accumulated context fields
- **D-05:** Final request log emitted by middleware on request completion — not by application code
- **D-06:** `ErrorHandler` in `middleware/error_handler.go` auto-appends error details — `error_code`, `error_message`, `error_tags`
- **D-07:** Middleware reads the accumulated fields (including error details) and emits the final log line
- **D-08:** UUID v4 generated per request by logging middleware
- **D-09:** Stored in context and automatically included in every log line (final + intermediate)
- **D-10:** Returned in `X-Request-ID` response header for client-side debugging
- **D-11:** Blocklist approach — log all fields except explicitly blocked ones
- **D-12:** Blocked: `Authorization` header, `Cookie` header, request/response bodies
- **D-13:** Default logged HTTP fields: method, path, status, latency, IP, user_id, request_id
- **D-14:** Final request log level determined dynamically: 2xx→info, 4xx→warn, 5xx→error
- **D-15:** Configurable minimum level via `LOG_LEVEL` environment variable (e.g., `LOG_LEVEL=warn` suppresses info)
- **D-16:** Zerolog's level filtering — requests below threshold never emitted

### Claude's Discretion
- Exact zerolog initialization and global logger configuration
- Whether to use zerolog's `hlog` package or custom middleware
- Internal accumulator implementation (zerolog context vs custom struct)
- Log output format details (pretty-print in dev, JSON in prod)
- How to handle panics in the logging middleware itself

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Request log emission | HTTP Middleware | — | Middleware owns request lifecycle start/end; only it knows final status and latency |
| Field accumulation API | pkg/applog | — | Cross-cutting pkg, no HTTP dependency; service/repo layers use it via ctx |
| Request ID generation | HTTP Middleware | — | Must run before any handler code; sets response header |
| Dynamic log level selection | HTTP Middleware | — | Status code only known at response completion |
| Error field injection | middleware/error_handler.go | — | Error handler intercepts all errors; appends before middleware emits |
| Global logger init & level config | cmd/server/main.go | internal/config | Startup concern; reads LOG_LEVEL env var |
| Intermediate log emission | Any layer via ctx | — | Any layer calls `applog.FromContext(ctx).Warn()...` — no HTTP imports needed |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| github.com/rs/zerolog | v1.35.0 | Structured JSON logger | Zero-allocation, context-aware, fits Cloud Run stdout JSON → Cloud Logging; decided in CONTEXT.md |
| github.com/google/uuid | v1.6.0 (already in go.mod) | UUID v4 request IDs | Already an indirect dependency; promote to direct use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| github.com/rs/zerolog/hlog | (ships with zerolog) | HTTP middleware helpers (RequestID, RemoteAddr, Access) | Reference only — not used directly; custom middleware preferred |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Echo middleware | zerolog hlog + alice chaining | hlog is net/http-oriented; requires more adapter code with Echo; custom middleware is simpler and matches existing auth.go pattern |
| Custom accumulator struct | zerolog's native `logger.With()` chaining | Native chaining creates new logger values; pointer wrapper in applog avoids copying |
| JSON only output | crzerolog (Cloud-Run-specific) | crzerolog adds severity/trace fields for Cloud Logging; useful but adds dependency; same effect achievable by setting `zerolog.LevelFieldName = "severity"` |

**Installation:**
```bash
go get github.com/rs/zerolog@v1.35.0
```
`github.com/google/uuid` is already an indirect dependency — no new install needed.

**Version verification:** `github.com/rs/zerolog@v1.35.0` published 2026-03-27. [VERIFIED: go list -m -json github.com/rs/zerolog@latest]

## Architecture Patterns

### System Architecture Diagram

```
HTTP Request
     |
     v
[LoggingMiddleware]
  - generate request_id (UUID v4)
  - set X-Request-ID response header
  - create zerolog.Logger with base fields (request_id, method, path, ip)
  - store logger ptr in ctx via applog.WithLogger(ctx, &logger)
  - record start time
  - call next(c) ──────────────────────────────────────────────┐
                                                                |
                                                         [AuthMiddleware]
                                                           - adds user_id to applog logger
                                                           - call next(c) ──────────────┐
                                                                                         |
                                                                                   [Handler]
                                                                                    - may call applog.FromContext(ctx).With("tx_id", id)
                                                                                    - calls service(ctx)
                                                                                         |
                                                                                   [Service layer]
                                                                                    - applog.FromContext(ctx).Debug().Msg("...")
                                                                                         |
                                                                                   [Repository layer]
                                                                                    - applog.FromContext(ctx).With("rows", n)
                                                                                         |
                                                                                   (error bubbles up)
                                                                                         |
                                                                                 [ErrorHandler]
                                                                                   - applog.FromContext(ctx).With("error_code", ..., "error_message", ..., "error_tags", ...)
                                                                                   - writes JSON response
  <──────────────────────────────────────────────────────────────────────────────────────┘
  - next(c) returns
  - read status code from c.Response().Status
  - compute latency
  - determine log level: 2xx→Info, 4xx→Warn, 5xx→Error
  - emit final log line (all accumulated fields + status + latency)
     |
     v
  stdout (JSON) → Cloud Logging
```

### Recommended Project Structure
```
backend/
├── pkg/
│   └── applog/
│       └── applog.go        # Logger type, WithLogger, FromContext, With, AddField
├── internal/
│   └── middleware/
│       ├── auth.go          # (existing, unchanged)
│       ├── error_handler.go # (modified: appends error fields to applog logger)
│       └── logger.go        # NEW: LoggingMiddleware (Echo middleware)
├── internal/
│   └── config/
│       └── config.go        # (modified: add LogLevel to AppConfig)
└── cmd/server/
    └── main.go              # (modified: init zerolog global, register LoggingMiddleware, remove echomiddleware.Logger())
```

### Pattern 1: applog Package — Logger Wrapper

**What:** A thin wrapper around `*zerolog.Logger` stored in `context.Context`. Provides `With(key, value)` that updates the stored pointer so all subsequent calls (including the final middleware emission) see accumulated fields.

**When to use:** Any layer that needs to add fields to the request log or emit intermediate logs.

```go
// Source: pkg/applog design — adapted from zerolog context pattern
// https://github.com/rs/zerolog/blob/master/README.md

package applog

import (
    "context"
    "github.com/rs/zerolog"
)

type contextKey struct{}

// Logger wraps a *zerolog.Logger stored by pointer so field accumulation
// mutates the single logger instance in the context.
type Logger struct {
    l *zerolog.Logger
}

func WithLogger(ctx context.Context, logger *zerolog.Logger) context.Context {
    return context.WithValue(ctx, contextKey{}, &Logger{l: logger})
}

// FromContext retrieves the request-scoped logger.
// Returns a no-op logger if none is set (safe for unit tests).
func FromContext(ctx context.Context) *Logger {
    if v, ok := ctx.Value(contextKey{}).(*Logger); ok {
        return v
    }
    nop := zerolog.Nop()
    return &Logger{l: &nop}
}

// With adds a string field to the accumulated logger.
// The new logger replaces the stored pointer so future calls see all fields.
func (lg *Logger) With(key string, value interface{}) *Logger {
    updated := lg.l.With().Interface(key, value).Logger()
    lg.l = &updated
    return lg
}

// Warn/Debug/Info/Error — delegate to zerolog.Logger for intermediate logs.
// These carry all fields accumulated so far.
func (lg *Logger) Debug() *zerolog.Event { return lg.l.Debug() }
func (lg *Logger) Info() *zerolog.Event  { return lg.l.Info() }
func (lg *Logger) Warn() *zerolog.Event  { return lg.l.Warn() }
func (lg *Logger) Error() *zerolog.Event { return lg.l.Error() }

// Zerolog returns the underlying *zerolog.Logger for the middleware to emit
// the final log line.
func (lg *Logger) Zerolog() *zerolog.Logger { return lg.l }
```

**IMPORTANT concurrency note:** `UpdateContext()` on zerolog is not concurrency-safe. [CITED: pkg.go.dev/github.com/rs/zerolog — "UpdateContext is not concurrency safe"] The pattern above uses `With()` to create a new logger value on each field addition. Since a single request is processed sequentially (no goroutine fan-out within a single request's logger accumulation), this is safe. If parallel goroutines within a request ever need to add fields, a mutex guard on `lg.l` would be required.

### Pattern 2: LoggingMiddleware

**What:** Echo middleware that wraps the entire request. Generates request_id, injects logger into context, defers final log emission.

**When to use:** Registered as the first middleware on the Echo instance.

```go
// Source: adapted from auth.go pattern in this codebase + zerolog docs
package middleware

import (
    "time"
    "github.com/google/uuid"
    "github.com/rs/zerolog"
    "github.com/finance_app/backend/pkg/applog"
    "github.com/labstack/echo/v4"
)

func LoggingMiddleware(globalLogger zerolog.Logger) echo.MiddlewareFunc {
    return func(next echo.HandlerFunc) echo.HandlerFunc {
        return func(c echo.Context) error {
            requestID := uuid.New().String()
            c.Response().Header().Set("X-Request-ID", requestID)

            start := time.Now()
            req := c.Request()

            // Create per-request logger with base fields
            reqLogger := globalLogger.With().
                Str("request_id", requestID).
                Str("method", req.Method).
                Str("path", req.URL.Path).
                Str("ip", c.RealIP()).
                Logger()

            ctx := applog.WithLogger(req.Context(), &reqLogger)
            c.SetRequest(req.WithContext(ctx))

            err := next(c)

            // Emit final log line after handler + error handler have run
            status := c.Response().Status
            latency := time.Since(start)
            finalLogger := applog.FromContext(c.Request().Context())

            event := levelForStatus(finalLogger.Zerolog(), status)
            event.
                Int("status", status).
                Dur("latency_ms", latency).
                Msg("request")

            return err
        }
    }
}

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
```

### Pattern 3: ErrorHandler Integration

**What:** Modify `ErrorHandler` to append error fields to the applog logger before writing the response. Middleware defers final emission, so the appended fields appear in the final log line.

**When to use:** Replace the `c.Logger().Error(err)` call in `middleware/error_handler.go`.

```go
// In ErrorHandler, after extracting code/message/tags:
applog.FromContext(c.Request().Context()).
    With("error_code", string(code)).
    With("error_message", message)
// tags as JSON array requires slightly different approach:
// applog.FromContext(ctx).Zerolog().UpdateContext(...) or store tags field separately

// Replace: c.Logger().Error(err)
// With:    applog.FromContext(c.Request().Context()).Error().Err(err).Msg("error")
```

**Note on tags field:** `tags` is a `[]string`. Zerolog has `Strs("error_tags", tags)` for string slices. [CITED: pkg.go.dev/github.com/rs/zerolog — Event.Strs method]

### Pattern 4: Global Logger Init in main.go

**What:** Initialize zerolog global logger once at startup. Use `ConsoleWriter` in dev, raw JSON in prod. Set global level from `LOG_LEVEL` env.

```go
// Source: zerolog README + config pattern in this codebase
// [CITED: https://github.com/rs/zerolog/blob/master/README.md]

// In config.go — add to AppConfig:
type AppConfig struct {
    URL         string
    FrontendURL string
    Env         string
    LogLevel    string // NEW: "debug", "info", "warn", "error" — default "info"
}

// In main.go:
level, err := zerolog.ParseLevel(cfg.App.LogLevel)
if err != nil {
    level = zerolog.InfoLevel
}
zerolog.SetGlobalLevel(level)

var globalLogger zerolog.Logger
if cfg.App.Env == "development" {
    globalLogger = zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr}).
        With().Timestamp().Logger()
} else {
    // Cloud Run: severity field maps to Cloud Logging severity
    zerolog.LevelFieldName = "severity"
    globalLogger = zerolog.New(os.Stdout).With().Timestamp().Logger()
}

// Pass globalLogger to LoggingMiddleware
e.Use(middleware.LoggingMiddleware(globalLogger))
// Remove: e.Use(echomiddleware.Logger())
```

### Pattern 5: Auth Middleware Field Injection

**What:** After `RequireAuth` validates the token, add `user_id` to the applog logger in context.

```go
// In auth.go RequireAuth, after setting appcontext:
applog.FromContext(ctx).With("user_id", user.ID)
// No return needed — With() mutates the stored pointer in-place
```

### Anti-Patterns to Avoid

- **Returning a new context from With():** The `applog.Logger.With()` method updates the pointer stored in the existing context value — it does NOT return a new context. Do not reassign ctx after calling With().
- **Calling applog.FromContext on background context:** In unit tests without middleware, FromContext returns a Nop logger — this is safe and requires no special handling.
- **Using echo's built-in `c.Logger()`:** After this phase, all logging goes through applog. Using `c.Logger()` would bypass accumulation and produce duplicate/inconsistent output.
- **Emitting the final log line inside ErrorHandler:** ErrorHandler runs before middleware's deferred emit. If ErrorHandler emits the log, the middleware would emit a second log line. Only middleware emits the final line.
- **zerolog.Logger value copies:** Zerolog `Logger` is a value type. Storing a copy before calling `With()` means the copy won't see new fields. Always work with `*zerolog.Logger` when mutation is needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID v4 generation | custom UUID generator | `github.com/google/uuid` (already in go.mod) | Already a dependency; RFC 4122 compliant |
| Log level parsing from string | manual switch/case | `zerolog.ParseLevel("warn")` | Built-in; handles all level names |
| Pretty console output | custom formatter | `zerolog.ConsoleWriter` | Built-in; colorized, human-readable in dev |
| Log level filtering | custom filter logic | `zerolog.SetGlobalLevel(level)` | Built-in; zero-cost disabled events |
| Context key collision | bare string keys | `type contextKey struct{}` private type | Same pattern as appcontext.go; prevents collision |

**Key insight:** Zerolog's zero-allocation design means there's no performance penalty for carrying per-request loggers — disabled log events cost ~4 ns/op with zero allocations. [CITED: pkg.go.dev/github.com/rs/zerolog benchmarks]

## Common Pitfalls

### Pitfall 1: Echo Error Handler Ordering vs Middleware Deferred Emit

**What goes wrong:** `ErrorHandler` is called synchronously during `next(c)`. If the middleware's deferred emit reads `c.Response().Status` before the error handler has set it, the status will be 0 (the default).

**Why it happens:** Echo sets the response status when `c.JSON(code, ...)` is called inside `ErrorHandler`. The middleware's `defer` runs after `next(c)` returns, which is after `ErrorHandler` has already set the status.

**How to avoid:** Do not use `defer` for the final emit. Instead, emit *after* the `err := next(c)` call (synchronous, not deferred). The flow is: `next(c)` → (ErrorHandler runs inside) → `next(c)` returns → read `c.Response().Status` → emit. [ASSUMED based on Echo's synchronous error handler design; verify with a test.]

**Warning signs:** Logs showing `"status": 0` or `"status": 200` for error responses.

### Pitfall 2: Field Accumulation After Context is Replaced

**What goes wrong:** `applog.Logger.With()` mutates the logger pointer stored in context. If a middleware or handler creates a new context (`context.WithValue(ctx, ...)`) and passes it downstream without carrying the applog logger forward, downstream With() calls update the new context's logger but the middleware's logger (from the original context) won't see them.

**Why it happens:** `context.WithValue` creates a new context node. If you build a new context that doesn't include the applog key, `applog.FromContext` on the new context returns a nop logger.

**How to avoid:** Always build derived contexts on top of the existing context that already has the applog logger. The pattern `c.Request().WithContext(ctx)` used throughout the codebase is correct — do not replace ctx wholesale.

**Warning signs:** Fields added by service/repo layers not appearing in the final log line.

### Pitfall 3: Concurrent Field Mutation

**What goes wrong:** If a handler spawns goroutines that all call `applog.FromContext(ctx).With(...)`, they race on the shared `*zerolog.Logger` pointer.

**Why it happens:** `applog.Logger` wraps a `*zerolog.Logger`. Multiple goroutines writing to the same pointer without synchronization is a data race.

**How to avoid:** For the current codebase this is not an issue — request handling is sequential (service calls are not parallelized per request). If that changes, add a `sync.Mutex` inside `applog.Logger`. [ASSUMED current request handling is sequential; verify with goroutine audit if needed.]

**Warning signs:** Race detector (`go test -race`) reports on applog.Logger fields.

### Pitfall 4: Cloud Logging Severity Field Name

**What goes wrong:** Cloud Run's Cloud Logging reads the `severity` field from JSON. Zerolog defaults to `"level"`. The log appears in Cloud Logging but severity shows as `DEFAULT` (not INFO/WARN/ERROR).

**Why it happens:** Cloud Logging only recognizes the `severity` key. [CITED: https://docs.cloud.google.com/logging/docs/structured-logging]

**How to avoid:** In production, set `zerolog.LevelFieldName = "severity"` before initializing the global logger. In development, leave as `"level"` for human readability.

**Warning signs:** All Cloud Logging entries show severity `DEFAULT` regardless of actual level.

### Pitfall 5: Zero Status When No Response Written

**What goes wrong:** For requests that panic or abort before writing a response, `c.Response().Status` is 0.

**Why it happens:** Echo's response writer initializes status to 0; it's only set when `WriteHeader` is called.

**How to avoid:** In the log emission code, treat status 0 as 500:
```go
status := c.Response().Status
if status == 0 {
    status = 500
}
```

**Warning signs:** Log lines showing `"status": 0`.

## Code Examples

### Zerolog context integration
```go
// Source: https://github.com/rs/zerolog/blob/master/README.md
func f() {
    logger := zerolog.New(os.Stdout)
    ctx := context.Background()
    ctx = logger.WithContext(ctx)    // native zerolog context storage
    someFunc(ctx)
}
func someFunc(ctx context.Context) {
    logger := zerolog.Ctx(ctx)       // retrieve from context
    logger.Info().Msg("Hello")
}
```

### Level filtering
```go
// Source: https://github.com/rs/zerolog/blob/master/README.md
zerolog.SetGlobalLevel(zerolog.InfoLevel)
log.Debug().Msg("filtered out")  // never written
log.Info().Msg("emitted")        // written
```

### ParseLevel for env var
```go
// Source: zerolog README / pkg.go.dev
level, err := zerolog.ParseLevel(os.Getenv("LOG_LEVEL"))
if err != nil {
    level = zerolog.InfoLevel
}
zerolog.SetGlobalLevel(level)
```

### Strs for []string tags field
```go
// Source: pkg.go.dev/github.com/rs/zerolog — Event.Strs
logger.Error().Strs("error_tags", tags).Str("error_code", code).Msg("request error")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `echomiddleware.Logger()` (fmt-based) | zerolog structured JSON | This phase | Structured, queryable logs in Cloud Logging |
| `c.Logger().Error(err)` | `applog.FromContext(ctx).Error().Err(err)` | This phase | Error context in request log line |

**Deprecated/outdated:**
- `echomiddleware.Logger()`: fmt-based, not structured. Will be removed and replaced by `LoggingMiddleware` in this phase.
- `c.Logger()` (Echo's built-in logger): Uses logrus under the hood in some versions; bypasses the request-scoped accumulator after this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Request handling within a single request is sequential (no goroutines spawned per request that write to applog) | Pitfall 3, Architecture | If wrong, concurrent writes to applog.Logger cause data race; need mutex |
| A2 | `c.Response().Status` is correctly set by Echo after ErrorHandler runs | Pitfall 1 | If wrong, final log shows wrong status; fix with error return inspection |
| A3 | Cloud Run deployment uses stdout for log ingestion (not a log agent sidecar) | Pattern 4 | If wrong, severity field mapping may differ; investigate crzerolog |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

1. **Auth middleware logger update timing**
   - What we know: `RequireAuth` runs after `LoggingMiddleware` injects the logger; user_id is available
   - What's unclear: Whether the auth middleware should update the applog logger's `user_id` field, or whether the `user_id` is only known at handler time
   - Recommendation: Add `applog.FromContext(ctx).With("user_id", user.ID)` inside `RequireAuth` — this matches the architecture diagram and ensures all logs (including 401 rejections) carry user_id when available

2. **Recover middleware integration**
   - What we know: `echomiddleware.Recover()` is registered after `Logger()` currently; panics should be logged
   - What's unclear: Whether to keep `echomiddleware.Recover()` or write a custom recover middleware that uses applog
   - Recommendation: Keep `echomiddleware.Recover()` for now — it handles panics by returning 500 which ErrorHandler then logs. If custom panic logging with full applog context is needed later, it can be added as a follow-up.

## Environment Availability

Step 2.6: SKIPPED — This phase is purely code changes. No new external services, databases, or CLI tools are required beyond Go toolchain (already verified operational).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Go toolchain | Building the package | Yes | go 1.24.4 | — |
| github.com/rs/zerolog | Core library | Not yet installed | v1.35.0 available | — |
| github.com/google/uuid | Request ID generation | Yes (indirect) | v1.6.0 | — |

**Missing dependencies with no fallback:**
- `github.com/rs/zerolog` — must be added via `go get github.com/rs/zerolog@v1.35.0`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Go testing + testify (existing) |
| Config file | none (go test flags) |
| Quick run command | `go test ./pkg/applog/... ./internal/middleware/... -short` |
| Full suite command | `go test ./... -short` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-01 | Every HTTP request emits exactly one JSON log line on completion | unit (middleware test with httptest) | `go test ./internal/middleware/... -run TestLoggingMiddleware -short` | Wave 0 |
| SC-02 | Service layer can add fields via ctx without importing HTTP packages | unit (applog package test) | `go test ./pkg/applog/... -short` | Wave 0 |
| SC-03 | Intermediate logs carry accumulated context | unit (applog package test) | `go test ./pkg/applog/... -run TestWith -short` | Wave 0 |
| SC-04 | Dynamic log level: 2xx→info, 4xx→warn, 5xx→error | unit (middleware test) | `go test ./internal/middleware/... -run TestLevelForStatus -short` | Wave 0 |
| SC-05 | LOG_LEVEL env var controls minimum level | unit (config + middleware test) | `go test ./internal/config/... ./internal/middleware/... -short` | Wave 0 |
| SC-06 | Existing error responses unaffected | unit (error_handler test) | `go test ./internal/middleware/... -run TestErrorHandler -short` | Wave 0 |

### Sampling Rate
- **Per task commit:** `go test ./pkg/applog/... ./internal/middleware/... -short`
- **Per wave merge:** `go test ./... -short`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/pkg/applog/applog_test.go` — covers SC-02, SC-03
- [ ] `backend/internal/middleware/logger_test.go` — covers SC-01, SC-04, SC-05
- [ ] `backend/internal/middleware/error_handler_test.go` — covers SC-06 (may already exist partially)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (data blocklist) | D-12: explicitly block Authorization, Cookie headers |
| V6 Cryptography | no | — |

### Known Threat Patterns for Logging Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential leakage via logs | Information Disclosure | D-12: blocklist Authorization/Cookie headers; never log request/response bodies |
| Log injection (newline injection in user-supplied fields) | Tampering | Zerolog JSON encoding escapes all values — no additional mitigation needed |
| PII in path parameters | Information Disclosure | Path is logged as-is (e.g., `/api/transactions/123`); IDs are non-PII in this domain |

**Key constraint enforced by D-11/D-12:** The blocklist approach means new headers added to the application are logged by default. Any new header carrying credentials MUST be added to the blocklist.

## Sources

### Primary (HIGH confidence)
- `/rs/zerolog` (Context7 library ID) — context propagation, level filtering, ConsoleWriter, ParseLevel, hooks, Strs method
- [pkg.go.dev/github.com/rs/zerolog](https://pkg.go.dev/github.com/rs/zerolog) — v1.35.0 confirmed, concurrency warning on UpdateContext
- [github.com/rs/zerolog README](https://github.com/rs/zerolog/blob/master/README.md) — hlog pattern, WithContext/Ctx API, level filtering

### Secondary (MEDIUM confidence)
- [docs.cloud.google.com/logging/docs/structured-logging](https://docs.cloud.google.com/logging/docs/structured-logging) — severity field name requirement for Cloud Run
- [github.com/yfuruyama/crzerolog](https://github.com/yfuruyama/crzerolog) — Cloud Run zerolog adapter reference (severity, trace fields)

### Tertiary (LOW confidence)
- Codebase pattern inference (auth.go, appcontext.go) for middleware and context key structure — HIGH confidence given direct code read

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zerolog v1.35.0 verified via go list; uuid already in go.mod
- Architecture: HIGH — patterns derived from zerolog docs + direct codebase read
- Pitfalls: MEDIUM — pitfalls 1, 4, 5 are verified against docs/behavior; pitfalls 2, 3 are inferred from Go concurrency model

**Research date:** 2026-04-17
**Valid until:** 2026-07-17 (zerolog is stable; API unlikely to change)
