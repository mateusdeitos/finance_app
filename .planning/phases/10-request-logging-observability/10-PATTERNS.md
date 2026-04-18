# Phase 10: Request Logging & Observability - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 6 new/modified files
**Analogs found:** 5 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/pkg/applog/applog.go` | utility/pkg | request-response | `backend/pkg/appcontext/appcontext.go` | exact |
| `backend/internal/middleware/logger.go` | middleware | request-response | `backend/internal/middleware/auth.go` | exact |
| `backend/internal/middleware/error_handler.go` | middleware | request-response | `backend/internal/middleware/error_handler.go` (self — modify) | self |
| `backend/internal/config/config.go` | config | — | `backend/internal/config/config.go` (self — modify) | self |
| `backend/cmd/server/main.go` | config/entrypoint | — | `backend/cmd/server/main.go` (self — modify) | self |
| `backend/pkg/applog/applog_test.go` | test | — | `backend/internal/domain/charge_test.go` | role-match |
| `backend/internal/middleware/logger_test.go` | test | request-response | `backend/internal/handler/charge_handler_test.go` | role-match |

---

## Pattern Assignments

### `backend/pkg/applog/applog.go` (utility, request-response)

**Analog:** `backend/pkg/appcontext/appcontext.go`

**Imports pattern** (`backend/pkg/appcontext/appcontext.go` lines 1–7):
```go
package appcontext

import (
    "context"

    "github.com/finance_app/backend/internal/domain"
)
```
For `applog`, the import will be:
```go
package applog

import (
    "context"

    "github.com/rs/zerolog"
)
```

**Context key pattern** (`backend/pkg/appcontext/appcontext.go` lines 9–14):
```go
type key string

const (
    UserKey   key = "user"
    UserIDKey key = "user_id"
)
```
For `applog`, use an unexported struct type (not a string) to prevent collision — same rationale as RESEARCH.md:
```go
type contextKey struct{}
```

**WithX / FromContext pattern** (`backend/pkg/appcontext/appcontext.go` lines 16–38):
```go
func WithUser(ctx context.Context, user *domain.User) context.Context {
    return context.WithValue(ctx, UserKey, user)
}

func GetUserFromContext(ctx context.Context) *domain.User {
    user, ok := ctx.Value(UserKey).(*domain.User)
    if !ok {
        return nil
    }
    return user
}
```
For `applog`:
- `WithLogger(ctx, *zerolog.Logger) context.Context` — same shape as `WithUser`
- `FromContext(ctx) *Logger` — same shape as `GetUserFromContext`, with nop fallback instead of nil

**Nop fallback pattern** (from RESEARCH.md Pattern 1):
```go
func FromContext(ctx context.Context) *Logger {
    if v, ok := ctx.Value(contextKey{}).(*Logger); ok {
        return v
    }
    nop := zerolog.Nop()
    return &Logger{l: &nop}
}
```

**Core Logger struct and With pattern** (from RESEARCH.md Pattern 1):
```go
type Logger struct {
    l *zerolog.Logger
}

// With adds a field and mutates the stored pointer — no new context needed.
func (lg *Logger) With(key string, value interface{}) *Logger {
    updated := lg.l.With().Interface(key, value).Logger()
    lg.l = &updated
    return lg
}

// Delegate methods for intermediate emission
func (lg *Logger) Debug() *zerolog.Event { return lg.l.Debug() }
func (lg *Logger) Info() *zerolog.Event  { return lg.l.Info() }
func (lg *Logger) Warn() *zerolog.Event  { return lg.l.Warn() }
func (lg *Logger) Error() *zerolog.Event { return lg.l.Error() }

// Zerolog exposes the underlying pointer so the middleware can emit the final line.
func (lg *Logger) Zerolog() *zerolog.Logger { return lg.l }
```

---

### `backend/internal/middleware/logger.go` (middleware, request-response)

**Analog:** `backend/internal/middleware/auth.go`

**Imports pattern** (`backend/internal/middleware/auth.go` lines 1–11):
```go
package middleware

import (
    "net/http"
    "strings"

    "github.com/finance_app/backend/internal/handler"
    "github.com/finance_app/backend/internal/service"
    "github.com/finance_app/backend/pkg/appcontext"
    apperrors "github.com/finance_app/backend/pkg/errors"
    "github.com/labstack/echo/v4"
)
```
For `logger.go`:
```go
package middleware

import (
    "time"

    "github.com/google/uuid"
    "github.com/rs/zerolog"
    "github.com/finance_app/backend/pkg/applog"
    "github.com/labstack/echo/v4"
)
```

**Middleware function factory pattern** (`backend/internal/middleware/auth.go` lines 24–46):
```go
func (m *AuthMiddleware) RequireAuth(next echo.HandlerFunc) echo.HandlerFunc {
    return func(c echo.Context) error {
        // ...extract from request...
        ctx := appcontext.WithUser(c.Request().Context(), user)
        ctx = appcontext.WithUserID(ctx, user.ID)
        c.SetRequest(c.Request().WithContext(ctx))
        return next(c)
    }
}
```
For `LoggingMiddleware` — same shape, function-based factory (no struct needed since global logger is passed directly):
```go
func LoggingMiddleware(globalLogger zerolog.Logger) echo.MiddlewareFunc {
    return func(next echo.HandlerFunc) echo.HandlerFunc {
        return func(c echo.Context) error {
            // generate request_id, build per-request logger, inject into ctx
            c.SetRequest(c.Request().WithContext(ctx))
            err := next(c)
            // read status, compute latency, emit final log
            return err
        }
    }
}
```

**Context injection pattern** (`backend/internal/middleware/auth.go` lines 40–43):
```go
ctx := appcontext.WithUser(c.Request().Context(), user)
ctx = appcontext.WithUserID(ctx, user.ID)
c.SetRequest(c.Request().WithContext(ctx))
```
`LoggingMiddleware` uses the same `c.SetRequest(req.WithContext(ctx))` idiom.

**Dynamic level helper** (no existing analog — new helper function in logger.go):
```go
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

**Status zero guard** (from RESEARCH.md Pitfall 5):
```go
status := c.Response().Status
if status == 0 {
    status = 500
}
```

---

### `backend/internal/middleware/error_handler.go` (middleware, request-response — MODIFY)

**Analog:** Self — `backend/internal/middleware/error_handler.go`

**Current file** (lines 1–46) — full content already in context (read above).

**Lines to modify:**

Lines 31–33 currently:
```go
// Log error in production
if !c.Echo().Debug {
    c.Logger().Error(err)
}
```
Replace with applog field injection before the JSON response is written:
```go
if tagged, ok := err.(*apperrors.TaggedHTTPError); ok {
    // fields already extracted above; inject into request logger
    applog.FromContext(c.Request().Context()).
        With("error_code", string(tagged.ErrorCode)).
        With("error_message", tagged.Message)
    // tags require Strs — emit via zerolog directly on the accumulated logger
    if len(tagged.Tags) > 0 {
        applog.FromContext(c.Request().Context()).Zerolog().
            UpdateContext(func(ctx zerolog.Context) zerolog.Context {
                return ctx.Strs("error_tags", tagged.Tags)
            })
    }
} else {
    applog.FromContext(c.Request().Context()).
        With("error_message", message)
}
```

**Import addition needed** (add to existing import block at lines 1–8):
```go
"github.com/finance_app/backend/pkg/applog"
"github.com/rs/zerolog"
```

**Note on UpdateContext:** RESEARCH.md warns that `UpdateContext` is not concurrency-safe. For single-request sequential flow this is safe. For `[]string` tags, alternative is to use `applog.Logger.With("error_tags", tags)` and let `Interface()` serialize the slice — avoids `UpdateContext` entirely:
```go
applog.FromContext(c.Request().Context()).With("error_tags", tagged.Tags)
```

---

### `backend/internal/config/config.go` (config — MODIFY)

**Analog:** Self — `backend/internal/config/config.go`

**Current `AppConfig` struct** (lines 60–64):
```go
type AppConfig struct {
    URL         string
    FrontendURL string
    Env         string
}
```
Add `LogLevel` field:
```go
type AppConfig struct {
    URL         string
    FrontendURL string
    Env         string
    LogLevel    string // "debug", "info", "warn", "error" — default "info"
}
```

**`getEnv` pattern for new field** (lines 100–104 inside `Load()`):
```go
App: AppConfig{
    URL:         getEnv("APP_URL", "http://localhost:8080"),
    FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),
    Env:         getEnv("ENV", "development"),
    LogLevel:    getEnv("LOG_LEVEL", "info"), // NEW
},
```

---

### `backend/cmd/server/main.go` (entrypoint — MODIFY)

**Analog:** Self — `backend/cmd/server/main.go`

**Current middleware registration** (lines 103–111):
```go
// Middleware
e.Use(echomiddleware.Logger())
e.Use(echomiddleware.Recover())
e.Use(echomiddleware.CORSWithConfig(...))
```

**Import additions** (add to existing import block at lines 3–21):
```go
"os"

"github.com/rs/zerolog"
"github.com/finance_app/backend/internal/middleware"
```
Note: `middleware` import is already present at line 14 — no duplicate needed.

**Zerolog init block** (insert after `cfg` loaded, before `e := echo.New()`):
```go
// Initialize zerolog global logger
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
    zerolog.LevelFieldName = "severity" // Cloud Logging severity field
    globalLogger = zerolog.New(os.Stdout).With().Timestamp().Logger()
}
```

**Middleware registration change** (lines 103–105):
```go
// Replace:
e.Use(echomiddleware.Logger())
// With:
e.Use(middleware.LoggingMiddleware(globalLogger))
// Keep:
e.Use(echomiddleware.Recover())
```

**Remove unused `echomiddleware` import** if `Logger()` was the only `echomiddleware` function used from it — check: lines 106–111 still use `echomiddleware.CORSWithConfig`, so the import stays.

---

### `backend/pkg/applog/applog_test.go` (test — NEW)

**Analog:** `backend/internal/domain/charge_test.go`

**Test file structure** (`backend/internal/domain/charge_test.go` lines 1–7):
```go
package domain

import (
    "testing"

    "github.com/stretchr/testify/assert"
)
```
For `applog_test.go`:
```go
package applog

import (
    "context"
    "testing"

    "github.com/stretchr/testify/assert"
)
```

**Table-driven test pattern** (`backend/internal/domain/charge_test.go` lines 9–28):
```go
func TestChargeStatusIsValid(t *testing.T) {
    tests := []struct {
        name     string
        // ...
    }{
        {"...", ...},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            assert.Equal(t, tc.expected, ...)
        })
    }
}
```
Tests to cover (SC-02, SC-03):
- `TestFromContext_NoLogger` — returns nop logger, no panic
- `TestFromContext_WithLogger` — returns stored logger
- `TestWith_AccumulatesFields` — added fields appear in subsequent events
- `TestWith_MutatesInPlace` — same pointer; context does not need to be re-stored

---

### `backend/internal/middleware/logger_test.go` (test — NEW)

**Analog:** `backend/internal/handler/charge_handler_test.go`

**Test setup pattern** (`backend/internal/handler/charge_handler_test.go` lines 22–34):
```go
func setupChargeHandlerTest(t *testing.T) (*echo.Echo, *mocks.MockChargeService, *ChargeHandler) {
    t.Helper()
    mockSvc := mocks.NewMockChargeService(t)
    services := &service.Services{Charge: mockSvc}
    h := NewChargeHandler(services)
    e := echo.New()
    return e, mockSvc, h
}
```
For logger middleware test:
```go
func setupLoggerMiddlewareTest(t *testing.T) (*echo.Echo, *bytes.Buffer) {
    t.Helper()
    buf := &bytes.Buffer{}
    globalLogger := zerolog.New(buf)
    e := echo.New()
    e.Use(LoggingMiddleware(globalLogger))
    return e, buf
}
```

**httptest request pattern** (`backend/internal/handler/charge_handler_test.go` lines 41–51):
```go
req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/charges/7/accept", bytes.NewBufferString(body)), 42)
req.Header.Set("Content-Type", "application/json")
rec := httptest.NewRecorder()
c := e.NewContext(req, rec)
```
For middleware tests, prefer `httptest.NewServer` or direct `e.ServeHTTP(rec, req)` to exercise the full middleware chain.

**Tests to cover** (SC-01, SC-04, SC-05):
- `TestLoggingMiddleware_EmitsOneLogLine` — 2xx handler emits exactly one JSON line
- `TestLoggingMiddleware_SetsRequestIDHeader` — `X-Request-ID` header present in response
- `TestLevelForStatus_2xx` — level field is "info"
- `TestLevelForStatus_4xx` — level field is "warn"
- `TestLevelForStatus_5xx` — level field is "error"
- `TestLoggingMiddleware_StatusZeroFallback` — status 0 logged as 500

---

## Shared Patterns

### Context Injection via `c.SetRequest`
**Source:** `backend/internal/middleware/auth.go` lines 40–43
**Apply to:** `logger.go` (inject logger into context), `auth.go` (inject user_id into applog logger after logger middleware has run)
```go
ctx := appcontext.WithUser(c.Request().Context(), user)
ctx = appcontext.WithUserID(ctx, user.ID)
c.SetRequest(c.Request().WithContext(ctx))
```

### `getEnv` Config Pattern
**Source:** `backend/internal/config/config.go` lines 110–115
**Apply to:** `config.go` modification (adding `LogLevel` field)
```go
func getEnv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}
```

### Unexported Context Key Type
**Source:** `backend/pkg/appcontext/appcontext.go` lines 9–14 (uses `type key string`)
**Apply to:** `backend/pkg/applog/applog.go` — use `type contextKey struct{}` (struct, not string, per RESEARCH.md Don't Hand-Roll table)
**Why struct preferred:** Struct-based key is more collision-safe than a named string type because it cannot be constructed outside the package even by value comparison.

### Import Alias Convention
**Source:** `backend/internal/middleware/auth.go` line 10
**Apply to:** All files importing `pkg/errors`
```go
apperrors "github.com/finance_app/backend/pkg/errors"
```

### Module Path
**Source:** `backend/go.mod` line 1
**Apply to:** All new file imports
```
module github.com/finance_app/backend
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All files have structural analogs in the codebase |

The `levelForStatus` helper in `logger.go` has no analog (no status-based branching logic exists in middleware), but it is a trivial private function — no analog needed.

---

## Metadata

**Analog search scope:** `backend/pkg/`, `backend/internal/middleware/`, `backend/internal/config/`, `backend/cmd/server/`, `backend/internal/handler/`, `backend/internal/domain/`
**Files scanned:** 8 (appcontext.go, auth.go, error_handler.go, config.go, main.go, charge_handler_test.go, charge_test.go, errors.go)
**Pattern extraction date:** 2026-04-17
