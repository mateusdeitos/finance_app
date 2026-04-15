# Phase 6 Context: Charge Repository, Service & API (CRUD + Listing)

**Phase:** 6 — Charge Repository, Service & API (CRUD + Listing)
**Goal:** Users can create, reject, cancel, and list charges through a working API with IDOR protection.
**Requirements:** CHG-03, CHG-05, CHG-06, CHG-08, CHG-12, CHG-13, CHG-14
**Date:** 2026-04-14

---

## Decisions

### 1. Create Request Shape — Caller Declares Role

The create request includes a `role` field (`"charger"` or `"payer"`) to indicate whether the caller is the creditor or debtor:

```json
{
  "connection_id": 10,
  "role": "charger",
  "my_account_id": 5,
  "period_month": 3,
  "period_year": 2026,
  "description": "Acerto de março"
}
```

Service behavior:
- Looks up the connection by `connection_id`
- Validates the connection is `accepted`
- Validates the caller is one of `from_user_id` / `to_user_id`
- If `role == "charger"`: `ChargerUserID = callerID`, `PayerUserID = otherPartyID`, `ChargerAccountID = my_account_id`
- If `role == "payer"`: `PayerUserID = callerID`, `ChargerUserID = otherPartyID`, `PayerAccountID = my_account_id`
- `my_account_id` is **nullable** in the request (caller may not specify upfront)

**Supports both scenarios:**
- Scenario 1 (creditor-initiated): caller sends `role: "charger"`
- Scenario 2 (debtor-initiated voluntary): caller sends `role: "payer"`

### 2. List Endpoint — Single Endpoint with Filters

Single endpoint: `GET /api/charges`

Returns all charges where the authenticated user is either charger or payer.

**Query parameters:**
- `direction` — `"sent"` (user is charger/author) | `"received"` (user is payer) | omit for all
- `status` — `"pending"` | `"paid"` | `"rejected"` | `"cancelled"` | omit for all
- `connection_id` — filter by specific connection (integer)

**Response shape:**
```json
{
  "charges": [
    {
      "id": 1,
      "charger_user_id": 1,
      "payer_user_id": 2,
      "charger_account_id": 5,
      "payer_account_id": null,
      "connection_id": 10,
      "period_month": 3,
      "period_year": 2026,
      "description": "Acerto de março",
      "status": "pending",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

`ChargeSearchOptions` struct fields: `UserID` (for IDOR — all queries filter by user being charger or payer), `Direction`, `Status`, `ConnectionID`, `Limit`, `Offset`.

### 3. Pending-Count Endpoint

`GET /api/charges/pending-count`

Returns charges where the authenticated user is the **payer** (action required from them) and status is `pending`.

**Response:**
```json
{ "count": 3 }
```

Used by frontend sidebar badge. Returns `{"count": 0}` when no pending charges.

### 4. Lifecycle Route Design

Follow `POST /:id/action` pattern (not `PATCH /:id/status`):

```
POST /api/charges                    → Create
GET  /api/charges                    → List (with filters)
GET  /api/charges/pending-count      → Pending count badge
POST /api/charges/:id/cancel         → Cancel (charger only, pending only)
POST /api/charges/:id/reject         → Reject (payer only, pending only)
```

Note: `Accept` is Phase 7 — **not in this phase**.

### 5. IDOR & Authorization Pattern

All service methods receive `callerUserID int` from `appcontext.GetUserIDFromContext`.

Service validates:
- Charge exists → if not: `pkgErrors.NotFound("charge")`
- Caller is charger or payer → if not: `pkgErrors.Forbidden("charge")`
- For cancel: caller must be `ChargerUserID` → if not: `pkgErrors.Forbidden("only the charger can cancel")`
- For reject: caller must be `PayerUserID` → if not: `pkgErrors.Forbidden("only the payer can reject")`
- Status must be `pending` → validated via `domain.ValidateTransition` → returns domain error wrapped with `pkgErrors.BadRequest`

**Always return 403 for authorization failures** — never 404 (prevents information leak about charge existence to non-parties).

### 6. Dependency Injection (main.go Wiring)

`ChargeService` depends on `Repositories` struct. No cross-service dependency needed for Phase 6 (accept/transfer is Phase 7). Wire directly like `SettlementService`:

```go
services.Charge = service.NewChargeService(repos)
```

Add `Charge ChargeRepository` to `repository.Repositories` struct.
Add `Charge ChargeService` to `service.Services` struct.

Run `just generate-mocks` after adding interfaces.

---

## Patterns to Follow

- **Repository interface**: follow `UserConnectionRepository` in `repository/interfaces.go` — `Create`, `Search` with options struct, `Update`, `GetByID`
- **Repository impl**: follow `user_connection_repository.go` — `GetTxFromContext`, GORM query building
- **Service**: follow `settlement_service.go` — thin wrapper, `pkgErrors.Internal/NotFound/Forbidden/BadRequest`
- **Handler**: follow `user_connection_handler.go` — `NewXHandler(*service.Services)`, `appcontext.GetUserIDFromContext`, Echo JSON binding
- **Route group**: `/api/charges` under the protected `api` group in `main.go`

---

## Out of Scope for This Phase

- `Accept` operation and atomic transfer creation (Phase 7)
- `ChargeID` on transactions (Phase 7)
- Frontend (Phase 8)
- Connection balance calculation (Phase 7)

---

## Canonical Refs

- `backend/internal/repository/interfaces.go` — Repository interface patterns, `Repositories` struct
- `backend/internal/service/interfaces.go` — Service interface patterns, `Services` struct
- `backend/internal/repository/user_connection_repository.go` — Repository impl pattern
- `backend/internal/service/settlement_service.go` — Service impl pattern
- `backend/internal/handler/user_connection_handler.go` — Handler pattern
- `backend/cmd/server/main.go` — Wiring pattern for repos + services + handlers + routes
- `backend/internal/domain/charge.go` — Charge struct, ChargeStatus, ValidateTransition
- `backend/pkg/errors/errors.go` — Error codes and constructors
- `.planning/REQUIREMENTS.md` — CHG-03, CHG-05, CHG-06, CHG-08, CHG-12, CHG-13, CHG-14
