---
phase: "07-accept-atomic-transfer"
plan: "02"
subsystem: "charge-accept-http"
tags: ["charge", "accept", "handler", "http", "swagger", "mock-tests"]
dependency_graph:
  requires:
    - "07-01 — chargeService.Accept (atomic dual-transfer)"
  provides:
    - "POST /api/charges/:id/accept HTTP endpoint"
    - "ChargeHandler.Accept handler method"
    - "Swagger docs updated with accept endpoint"
    - "5 mock-based handler tests covering success + error branches"
  affects:
    - "backend/internal/handler/charge_handler.go — Accept method added"
    - "backend/cmd/server/main.go — route registered"
    - "backend/docs/ — regenerated with new endpoint"
tech_stack:
  added: []
  patterns:
    - "Mock-based handler tests using mocks.MockChargeService + echo.NewContext directly"
    - "HandleServiceError(err) return convention: *echo.HTTPError for simple errors (no tags), *TaggedHTTPError for errors with tags"
key_files:
  created:
    - "backend/internal/handler/charge_handler_test.go — 5 handler tests for Accept"
  modified:
    - "backend/internal/handler/charge_handler.go — Accept method with Swagger annotations"
    - "backend/cmd/server/main.go — charges.POST(/:id/accept, chargeHandler.Accept) added"
    - "backend/docs/docs.go — regenerated"
    - "backend/docs/swagger.json — accept endpoint included"
    - "backend/docs/swagger.yaml — accept endpoint included"
decisions:
  - "Used mock-based (Path A) handler tests — no existing handler test files in repo; mock approach avoids Docker dependency"
  - "HandleServiceError returns *echo.HTTPError for errors without tags (Forbidden/AlreadyExists); tests assert on err.(*echo.HTTPError).Code"
  - "Added 5 tests (vs. plan's 4 minimum): Success, Forbidden, Conflict, BadID, BadJSON"
metrics:
  duration_minutes: 8
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 5
  completed_date: "2026-04-15"
---

# Phase 07 Plan 02: Accept HTTP Handler Summary

**One-liner:** POST /api/charges/:id/accept endpoint wired to chargeService.Accept with Swagger annotations and 5 mock-based handler tests covering 204/400/403/409 paths.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | ChargeHandler.Accept + route + Swagger docs | 72a4fac | Done |
| 2 | Handler integration tests — 5 mock-based cases | 41552d8 | Done |

## Handler Implementation

**Method added:** `func (h *ChargeHandler) Accept(c echo.Context) error` in `backend/internal/handler/charge_handler.go`

Pattern mirrors `Cancel`/`Reject` exactly:
1. Extract `userID` from appcontext (JWT-backed, never from body)
2. Parse `:id` path param with `strconv.Atoi` — invalid → 400
3. Bind JSON body to `domain.AcceptChargeRequest` — invalid → 400
4. Delegate to `h.chargeService.Accept(ctx, userID, id, &req)`
5. Map service error via `HandleServiceError(err)` → 403/404/409
6. Return 204 on success

**Route registered:** `charges.POST("/:id/accept", chargeHandler.Accept)` in `cmd/server/main.go`

## Swagger Docs

`just generate-docs` equivalent (`swag init`) ran cleanly. New endpoint at `/api/charges/{id}/accept` appears in `docs/swagger.json`, `docs/swagger.yaml`, and `docs/docs.go`. Annotations include 204/400/401/403/404/409 response codes with `domain.AcceptChargeRequest` body parameter.

## Test Results

**File:** `backend/internal/handler/charge_handler_test.go`

| Test | Scenario | Expected | Result |
|------|----------|----------|--------|
| TestChargeHandler_Accept_Success | Valid body, service returns nil | 204 No Content | PASS |
| TestChargeHandler_Accept_Forbidden | Service returns Forbidden | 403 | PASS |
| TestChargeHandler_Accept_Conflict | Service returns AlreadyExists | 409 | PASS |
| TestChargeHandler_Accept_BadID | Path param "abc" | 400 | PASS |
| TestChargeHandler_Accept_BadJSON | Malformed JSON body | 400, service NOT called | PASS |

`go test ./internal/handler/... -run TestChargeHandler_Accept -count=1` — all 5 pass in 0.009s.

## HandleServiceError Convention Discovery

`HandleServiceError` delegates to `pkgErrors.ToHTTPError(err)`. For `*ServiceError` errors with **no tags** (e.g., `Forbidden("charge")`, `AlreadyExists("charge")`), the function returns `echo.NewHTTPError(httpCode, message)` — a `*echo.HTTPError`. Tests correctly assert `err.(*echo.HTTPError).Code`.

For errors **with tags** (e.g., validation errors created via `NewWithTag`), `ToHTTPError` returns `*TaggedHTTPError` — a custom type handled by the global error handler middleware. Tests for those cases would need to check `rec.Code` after the error handler runs, but Accept only produces tag-less errors (Forbidden/AlreadyExists/NotFound).

## Deviations from Plan

### Minor: 5 tests instead of 4 minimum
Plan required ≥4 tests. Added a 5th `TestChargeHandler_Accept_BadJSON` test to cover the bad body branch explicitly, providing stronger guarantee that the service is never called when binding fails.

### Minor: swag binary not pre-installed
`swag` was not in PATH. Installed via `go install github.com/swaggo/swag/cmd/swag@latest` before running. Same pattern as `generate-mocks` deviation noted in 07-01.

## Threat Mitigations Verified

| Threat ID | Mitigation | Verified By |
|-----------|------------|-------------|
| T-07-11 | UserID from appcontext.GetUserIDFromContext (JWT-backed) — never from body | Handler code line 5 of Accept |
| T-07-12 | c.Bind(&req) rejects invalid JSON → 400 | TestChargeHandler_Accept_BadJSON |
| T-07-13 | strconv.Atoi path param with error → 400 | TestChargeHandler_Accept_BadID |
| T-07-14 | Route under /api group with RequireAuth middleware (not touched, already in place) | main.go charges group wiring |
| T-07-15 | HandleServiceError maps Forbidden→403, AlreadyExists→409 consistently | TestChargeHandler_Accept_Forbidden + TestChargeHandler_Accept_Conflict |

## Known Stubs

None — all behaviors implemented and wired.

## Self-Check: PASSED

All created/modified files verified present. Both task commits found in git history.
