---
phase: 25-frontend-notification-inbox
plan: 01
subsystem: backend
tags: [api, charges, transactions, bulk, idor, swagger]
dependency_graph:
  requires: []
  provides:
    - "GET /api/charges?id[]=A&id[]=B (IDOR-scoped bulk charges)"
    - "GET /api/transactions/by-ids?id[]=A&id[]=B (cross-period bulk transactions)"
  affects:
    - "frontend amount resolver (Plan 03) depends on both endpoints"
tech_stack:
  added: []
  patterns:
    - "GORM WHERE id IN ? parameterized filter"
    - "Echo c.Bind on []int query param with id[] tag"
    - "Service reuse: ListByIDs reuses transactionService.Search(Period{0,0})"
    - "IDOR scope via filter.UserID=&userID at handler boundary"
key_files:
  created:
    - backend/internal/repository/charge_repository_test.go
  modified:
    - backend/internal/domain/charge.go
    - backend/internal/repository/charge_repository.go
    - backend/internal/handler/charge_handler.go
    - backend/internal/handler/charge_handler_test.go
    - backend/internal/handler/transaction_handler.go
    - backend/internal/handler/transaction_handler_test.go
    - backend/cmd/server/main.go
    - backend/docs/docs.go
    - backend/docs/swagger.json
    - backend/docs/swagger.yaml
decisions:
  - "ListByIDs reuses TransactionService.Search(Period{0,0}) — no new service method"
  - "Empty id[] on /by-ids → 200 [] (not 400) to simplify frontend batching"
  - "IDOR enforced at handler: filter.UserID=&userID set before service call"
  - "Route /by-ids registered before /:id in registerTransactionRoutes to prevent shadowing"
  - "Charge repo integration test authored but Docker-gated (testing.Short skip)"
metrics:
  duration: "~25 min"
  completed: "2026-05-30"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 10
  files_created: 1
---

# Phase 25 Plan 01: Backend Bulk Get-by-IDs Summary

Backend bulk get-by-IDs endpoints for notification inbox amount resolution — charges IDs filter on existing List handler + thin transactions by-IDs handler reusing Search service.

## Tasks

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Charges filter-by-IDs via existing List handler | 193dee4 | DONE |
| 2 | Transactions by-IDs thin handler + route | 0309cc5 | DONE |

## What Was Built

### Task 1 — Charges IDs filter

- Added `IDs []int` (`json:"-" query:"id[]"`) to `domain.ChargeSearchOptions`.
- Added `WHERE id IN ?` clause in `chargeRepository.Search()` after the IDOR owner-WHERE and before `Order("created_at DESC")`.
- Added `@Param id[] query []int false "Filter by charge IDs" collectionFormat(multi)` swagger annotation to `ChargeHandler.List` (no logic change — `c.Bind` already maps `id[]` and `options.UserID = userID` already runs).
- Added `TestChargeHandler_List_IDsFilter` asserting id[] binds correctly and UserID is forced.
- Added `TestChargeRepository_Search_IDsFilter` Docker-gated integration test (skipped under `-short`).
- Regenerated swagger docs.

### Task 2 — Transactions ListByIDs handler

- Added `ListByIDs(c echo.Context) error` to `TransactionHandler`:
  - `c.Bind(&filter)` binds `id[]` into `filter.IDs`
  - Empty `filter.IDs` → immediate `200 []` (no 400)
  - Sets `filter.UserID = &userID` (IDOR) and `filter.WithSettlements = true`
  - Calls `h.transactionService.Search(ctx, userID, domain.Period{Month:0, Year:0}, filter)`
- Registered `transactions.GET("/by-ids", h.ListByIDs)` BEFORE `transactions.GET("/:id", h.GetByID)` in `registerTransactionRoutes`.
- Added 3 handler tests:
  - `TestTransactionHandler_ListByIDs_Empty` — empty id[] → 200 [], no service call
  - `TestTransactionHandler_ListByIDs_IDsFilter` — IDOR + Period{0,0} + WithSettlements assertions
  - `TestTransactionHandler_ListByIDs_RouteResolution` — GET /by-ids reaches ListByIDs not GetByID
- Regenerated swagger docs (endpoint at `/api/transactions/by-ids`).

## Endpoint Contract (for Wave-2 frontend consumers)

### GET /api/charges?id[]=A&id[]=B

```
Request:  GET /api/charges?id[]=10&id[]=20
          Authorization: Bearer <token>

Response: 200 OK
{
  "charges": [
    {
      "id": 10,
      "charger_user_id": 42,
      "payer_user_id": 7,
      "charger_account_id": 3,
      "payer_account_id": null,
      "connection_id": 1,
      "period_month": 5,
      "period_year": 2026,
      "description": "...",
      "amount": 5000,          // int64 cents — key amount field; omitted (no key) if null
      "status": "pending",
      "date": "2026-05-01T00:00:00Z",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

**Amount field:** `amount` (int64 cents, `omitempty` — absent on soft-deleted/amount-less charges).
**IDOR:** Only the caller's charges are returned. IDs the caller does not own are silently absent.
**Shape:** top-level object with `"charges"` array key (not a bare array).

### GET /api/transactions/by-ids?id[]=A&id[]=B

```
Request:  GET /api/transactions/by-ids?id[]=5&id[]=9
          Authorization: Bearer <token>

Response: 200 OK
[
  {
    "id": 5,
    "user_id": 42,
    "original_user_id": null,
    "type": "expense",
    "account_id": 3,
    "category_id": 2,
    "amount": 10000,           // int64 cents — key amount field; always present
    "operation_type": "debit",
    "date": "2026-05-15T00:00:00Z",
    "description": "Mercado",
    "tags": [],
    "linked_transactions": [],
    "settlements_from_source": [],  // populated (WithSettlements=true)
    "created_at": "...",
    "updated_at": "..."
  }
]
```

**Amount field:** `amount` (int64 cents, always present on non-deleted transactions).
**Empty id[]:** Returns `200 []` (not 400).
**IDOR:** Only the caller's transactions returned. Unowned IDs silently absent.
**Shape:** bare JSON array (not wrapped in an object key).
**WithSettlements:** always `true` — `settlements_from_source` is populated.

## Final Gate Results

- `go build ./...` — PASS
- `go vet -tags=integration ./internal/...` — PASS
- `go test -short ./...` — PASS (all packages green)
- swagger regenerated — `/api/transactions/by-ids` and `id[]` on charges List reflected in `backend/docs/`
- `just generate-mocks` — NOT run (no interface change; ChargeService.List and TransactionService.Search signatures unchanged)

## Deviations from Plan

None — plan executed exactly as written. Task 1 changes were already partially present in the working tree (domain + repo + handler + handler test), so the executor staged and committed them along with the authored integration test and swagger regeneration. Task 2 was implemented fresh.

## Self-Check: PASSED

- `backend/internal/repository/charge_repository_test.go` — FOUND
- `backend/internal/handler/charge_handler_test.go` has `TestChargeHandler_List_IDsFilter` — FOUND
- `backend/internal/handler/transaction_handler.go` has `ListByIDs` — FOUND
- `backend/internal/handler/transaction_handler_test.go` has `TestTransactionHandler_ListByIDs_*` — FOUND
- `backend/cmd/server/main.go` has `/by-ids` before `/:id` — FOUND
- Commits 193dee4 and 0309cc5 — FOUND
- `backend/docs/swagger.yaml` line 1927: `/api/transactions/by-ids` — FOUND
