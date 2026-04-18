# Phase 10: Request Logging & Observability - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Structured request logging using zerolog with Stripe's single-log-per-request pattern. Context-propagated logger accessible from all application layers (handler, service, repository). Dynamic log leveling based on response status. Configurable minimum log level via environment variable. Hybrid approach supporting both field accumulation and intermediate log emission.

</domain>

<decisions>
## Implementation Decisions

### Logger API Surface
- **D-01:** Chainable `.With("key", value)` methods following zerolog's native style
- **D-02:** Package location: `pkg/applog` — parallel to existing `pkg/appcontext`
- **D-03:** `applog.FromContext(ctx)` retrieves the request-scoped logger
- **D-04:** Intermediate logs (`.Warn().Msg(...)`, `.Debug().Msg(...)`) automatically carry all accumulated context fields
- **D-05:** Final request log emitted by middleware on request completion — not by application code

### Error Handler Integration
- **D-06:** `ErrorHandler` in `middleware/error_handler.go` auto-appends error details to the request logger — `error_code`, `error_message`, `error_tags`
- **D-07:** Middleware reads the accumulated fields (including error details) and emits the final log line

### Request ID & Correlation
- **D-08:** UUID v4 generated per request by logging middleware
- **D-09:** Stored in context and automatically included in every log line (final + intermediate)
- **D-10:** Returned in `X-Request-ID` response header for client-side debugging

### Sensitive Data Policy
- **D-11:** Blocklist approach — log all fields except explicitly blocked ones
- **D-12:** Blocked: `Authorization` header, `Cookie` header, request/response bodies
- **D-13:** Default logged HTTP fields: method, path, status, latency, IP, user_id, request_id

### Log Leveling
- **D-14:** Final request log level determined dynamically: 2xx→info, 4xx→warn, 5xx→error
- **D-15:** Configurable minimum level via `LOG_LEVEL` environment variable (e.g., `LOG_LEVEL=warn` suppresses info)
- **D-16:** Zerolog's level filtering — requests below threshold never emitted

### Claude's Discretion
- Exact zerolog initialization and global logger configuration
- Whether to use zerolog's `hlog` package or custom middleware
- Internal accumulator implementation (zerolog context vs custom struct)
- Log output format details (pretty-print in dev, JSON in prod)
- How to handle panics in the logging middleware itself

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing middleware & context patterns
- `backend/internal/middleware/auth.go` — Auth middleware pattern: extracts data from request, injects into context via `c.SetRequest(c.Request().WithContext(ctx))`
- `backend/internal/middleware/error_handler.go` — Error handler: extracts error details, returns JSON response. Will be modified to append error fields to logger
- `backend/pkg/appcontext/appcontext.go` — Context value pattern: `WithUser`/`GetUserFromContext` — logger will follow identical pattern

### Application entry point
- `backend/cmd/server/main.go` — Middleware registration order (Logger, Recover, CORS, Auth). New logging middleware replaces `echomiddleware.Logger()`

### Configuration
- `backend/internal/config/config.go` — Config struct; needs `LogLevel` field added to `AppConfig` or new `LogConfig`

### Design notes
- `.planning/notes/logging-design-decisions.md` — Explore session notes: Stripe pattern rationale, hybrid approach, data tiers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pkg/appcontext`: Context value injection pattern — exact template for `pkg/applog.WithLogger`/`FromContext`
- `middleware/auth.go`: Middleware structure — `RequireAuth` pattern shows how to wrap `echo.HandlerFunc` and modify context

### Established Patterns
- Context propagation via `c.SetRequest(c.Request().WithContext(ctx))` — all middleware uses this
- Error handling via `apperrors.ToHTTPError()` → `TaggedHTTPError` with code/message/tags
- Config loading from environment variables via `getEnv("KEY", "default")`

### Integration Points
- `main.go` line 104: `e.Use(echomiddleware.Logger())` — replace with new zerolog middleware
- `main.go` line 105: `e.Use(echomiddleware.Recover())` — recover middleware should integrate with logger
- `middleware/error_handler.go` line 32: `c.Logger().Error(err)` — replace with zerolog call via context
- All service/repository methods receiving `ctx context.Context` — can call `applog.FromContext(ctx).With(...)`

</code_context>

<specifics>
## Specific Ideas

- Stripe's single-log-per-request pattern: accumulate everything, emit once at the end
- Zerolog chosen for performance and structured JSON output — fits Cloud Run (stdout JSON → Cloud Logging)
- Hybrid approach: not purely single-log. Intermediate logs allowed for debug/warn scenarios (retries, slow queries) but they carry full accumulated context

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-request-logging-observability*
*Context gathered: 2026-04-17*
