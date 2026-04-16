---
phase: 6
plan: "06-02"
subsystem: backend
tags: [charge, handler, routes, swagger, wiring]
dependency-graph:
  requires: [06-01]
  provides: [ChargeHandler, charge_routes, swagger_docs]
  affects: [internal/handler, cmd/server/main.go, docs]
tech-stack:
  added: []
  patterns: [Echo handler, route groups, Swagger annotations, HandleServiceError]
key-files:
  created:
    - backend/internal/handler/charge_handler.go
  modified:
    - backend/cmd/server/main.go
    - backend/docs/docs.go
    - backend/docs/swagger.json
    - backend/docs/swagger.yaml
decisions:
  - PendingCount route registered before /:id wildcard to prevent Echo route shadowing
  - ChargeService wired directly in services struct literal (no cross-service dependency in Phase 6)
  - IDOR gate enforced in handler: List always overwrites options.UserID with callerID
metrics:
  duration: ~8 minutes
  completed: 2026-04-14
  tasks-completed: 3
  files-created: 1
  files-modified: 4
---

# Phase 6 Plan 02: Charge Handlers + Routes + Wiring Summary

**One-liner:** Echo ChargeHandler with five endpoints wired into main.go under /api/charges, with Swagger docs regenerated including all charge routes.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | ChargeHandler with all five endpoint methods | ddf151f | handler/charge_handler.go |
| 2 | Wire repository, service, handler, routes in main.go | a750834 | cmd/server/main.go |
| 3 | Regenerate Swagger docs and final build verification | b5df2b1 | docs/docs.go, docs/swagger.json, docs/swagger.yaml |

## What Was Built

### ChargeHandler

New handler at `backend/internal/handler/charge_handler.go`:
- `Create` — binds `domain.CreateChargeRequest`, delegates to `chargeService.Create`, returns 201
- `List` — binds `domain.ChargeSearchOptions`, forces `options.UserID = callerID` (IDOR gate), returns `{"charges": [...]}` 
- `PendingCount` — returns `{"count": N}` from `chargeService.PendingCount`
- `Cancel` — parses `:id`, delegates to `chargeService.Cancel`, returns 204
- `Reject` — parses `:id`, delegates to `chargeService.Reject`, returns 204

All service errors are converted via `HandleServiceError(err)` (not `echo.NewHTTPError`) for consistent error responses using the pkg/errors system.

### main.go Wiring

Three additions:
1. `Charge: repository.NewChargeRepository(db)` in repos struct literal
2. `Charge: service.NewChargeService(repos)` in services struct literal (no cross-service deps)
3. `chargeHandler` initialization and route group:

```
GET  /api/charges/pending-count  → chargeHandler.PendingCount
POST /api/charges                → chargeHandler.Create
GET  /api/charges                → chargeHandler.List
POST /api/charges/:id/cancel     → chargeHandler.Cancel
POST /api/charges/:id/reject     → chargeHandler.Reject
```

`/pending-count` is registered before `/:id` wildcard routes to prevent Echo route shadowing.

### Swagger Docs

Regenerated `docs/docs.go`, `docs/swagger.json`, `docs/swagger.yaml` via `swag init`. All five charge endpoints appear in the spec with security, parameter, and response annotations.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all handlers delegate to fully-implemented service methods from 06-01.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-endpoints | backend/internal/handler/charge_handler.go | Five new authenticated HTTP endpoints under /api/charges |

All endpoints sit behind the `RequireAuth` middleware on the `api` group. IDOR protection is enforced: List forces `UserID = callerID`, and Cancel/Reject enforce role checks in the service layer (charger-only cancel, payer-only reject). No unauthenticated routes added.

## Self-Check: PASSED

- `backend/internal/handler/charge_handler.go` — FOUND
- `backend/cmd/server/main.go` (modified) — FOUND
- `backend/docs/swagger.json` contains "charges" — VERIFIED
- `go build ./...` — PASSES
- Commit ddf151f — FOUND
- Commit a750834 — FOUND
- Commit b5df2b1 — FOUND
