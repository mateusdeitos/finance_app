---
title: Logging Design Decisions
date: 2026-04-17
context: Explore session — request logging & observability
---

## Pattern: Stripe Single-Log-Per-Request

Accumulate all request context throughout the lifecycle, emit one structured log line when request completes. Avoids log spam while preserving full context.

## Library: zerolog

Chosen for performance and structured JSON output. Fits well with Cloud Run logging (stdout JSON → Cloud Logging).

## Hybrid Approach

Not purely single-log. Two modes supported:

1. **Accumulate fields** — appended to the final log line (transaction_id, account_id, etc.)
2. **Intermediate logs** — emitted mid-request for debug/warn scenarios (retries, slow queries). These carry all accumulated context so far, so they're never orphaned.

## Dynamic Log Leveling

Final request log level determined by response status:
- 2xx → `info`
- 4xx → `warn`
- 5xx → `error`

## Configurable Minimum Level

Environment-driven (`LOG_LEVEL=warn`). In prod, can suppress info-level request logs entirely. Only problematic requests surface.

## Context Propagation

Logger/accumulator stored in `context.Context`. All service and repository methods already accept `ctx` as first parameter — no refactoring needed.

Rough API surface:
```go
logger := applog.FromContext(ctx)
logger.AddField("transaction_id", id)      // accumulates for final log
logger.Warn().Msg("slow query detected")   // intermediate, carries context
```

## Data Tiers

1. **HTTP metadata** (auto-collected by middleware): method, path, status, latency, IP
2. **Auth context** (post-auth middleware): user_id
3. **Arbitrary fields** (any layer via ctx): business-level context added by services/repos
