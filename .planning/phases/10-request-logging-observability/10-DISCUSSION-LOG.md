# Phase 10: Request Logging & Observability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 10-request-logging-observability
**Areas discussed:** Logger API surface, Error handler integration, Request ID & correlation, Sensitive data policy

---

## Logger API Surface

### API style

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit AddField calls | `logger.AddField("key", val)` — each field added individually | |
| Chainable With methods | `logger.With("key", val)` — follows zerolog's native style | ✓ |
| Structured fields map | `logger.AddFields(map[string]any{...})` — batch add | |

**User's choice:** Chainable With methods
**Notes:** Follows zerolog's native chainable style for consistency

### Package location

| Option | Description | Selected |
|--------|-------------|----------|
| pkg/applog | Parallel to pkg/appcontext — accessible from all layers | ✓ |
| internal/logger | Under internal/ — scoped to app but breaks symmetry | |

**User's choice:** pkg/applog (Recommended)
**Notes:** Consistent with existing pkg/ structure

---

## Error Handler Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-append in ErrorHandler | ErrorHandler calls logger.With() to add error details | ✓ |
| Middleware reads response | Logging middleware inspects response after handler returns | |
| Both layers contribute | Each layer adds what it knows best | |

**User's choice:** Auto-append in ErrorHandler (Recommended)
**Notes:** ErrorHandler enriches logger with error_code, error_message, error_tags. Middleware emits final log.

---

## Request ID & Correlation

| Option | Description | Selected |
|--------|-------------|----------|
| UUID v4 | Standard UUID — globally unique, X-Request-ID header | ✓ |
| Short ID (nanoid/ulid) | Shorter, more human-friendly | |
| No request ID yet | Keep simple for now | |

**User's choice:** UUID v4 (Recommended)
**Notes:** Included in X-Request-ID response header for client-side debugging

---

## Sensitive Data Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Headers + body excluded | Never log bodies or auth headers — only explicit fields | |
| Allowlist approach | Only log explicitly allowed fields | |
| Blocklist approach | Log everything except blocklisted fields | ✓ |

**User's choice:** Blocklist approach
**Notes:** Block Authorization header, Cookie header, request/response bodies. Everything else logged.

---

## Claude's Discretion

- Exact zerolog initialization and global logger configuration
- Whether to use zerolog's hlog package or custom middleware
- Internal accumulator implementation
- Log output format (pretty-print dev, JSON prod)
- Panic handling in logging middleware

## Deferred Ideas

None
