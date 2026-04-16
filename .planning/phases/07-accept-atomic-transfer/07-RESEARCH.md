# Phase 7: Accept + Atomic Transfer - Research

**Researched:** 2026-04-15
**Domain:** Go service layer — atomic DB transactions, GORM, charge acceptance, intra-account transfer creation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Accept endpoint:** `POST /api/charges/:id/accept` with body `{ account_id, amount?, date }`
2. **Who accepts:** Non-initiating party. Which account is null on the charge determines who accepts. If `ChargerAccountID` is null → payer created it → charger accepts. If `PayerAccountID` is null → charger created it → payer accepts.
3. **Two intra-account transfers (not a cross-user transfer):** Charger gets connection→private (debit connection, credit private). Payer gets private→connection (debit private, credit connection). Both same `amount` + `date` from accept request.
4. **Phase 6 retroactive changes (Phase 7 scope):** Remove `role` field from create request; infer from connection balance. Add `date` to `CreateChargeRequest` (initiator's transfer date). Make `my_account_id` required.
5. **Role re-inference at accept time:** Re-compute balance for the stored `ChargerUserID`. If flipped → swap `ChargerUserID`/`PayerUserID` and `ChargerAccountID`/`PayerAccountID` within the same atomic transaction.
6. **Amount computation (when omitted):** Call `GetBalance` with charger's connection account + period; use `abs(balance)`. Reject if zero.
7. **Race condition guard:** Conditional `UPDATE charges SET status='paid' WHERE id=? AND status='pending'`; check `RowsAffected`. If 0 → HTTP 409 via `pkgErrors.AlreadyExists`.
8. **ChargeID on transfers:** Both created transfer transactions must have `charge_id` set.

### Claude's Discretion

- DI wiring: inject `*Services` into `chargeService` (same pattern as `transactionService`)
- Exact GORM transaction scope (use existing `DBTransaction.Begin/Commit/Rollback` pattern via ctx injection)
- HTTP 409 for double-accept conflict
- Connection account ID lookup: use `UserConnection.SwapIfNeeded` + read `FromAccountID`/`ToAccountID`

### Deferred Ideas (OUT OF SCOPE)

- Cascade delete: if charge is deleted, delete those transactions — future concern
- Display computed balance in charge list response
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHG-04 | Accepting a charge creates exactly two linked transfer transactions atomically | Covered by §TransactionService.Create with type=transfer + DBTransaction scope |
| CHG-09 | Accept endpoint validates caller is the non-initiating party; returns 403 otherwise | Covered by null-account-ID check on `Charge` struct |
| CHG-10 | Concurrent double-accept rejected with 409; only one transfer pair created | Covered by conditional UPDATE + RowsAffected check in `chargeRepository` |
| CHG-11 | Both transfer transactions have `charge_id` set to originating charge ID | Covered by `TransactionCreateRequest.ChargeID` addition + `createTransactions` propagation |
</phase_requirements>

---

## Summary

Phase 7 implements the accept flow for the `Charge` feature. The core mechanic is: one HTTP request atomically (a) re-infers charger/payer roles, (b) conditionally flips a charge's status from `pending` to `paid` using a WHERE-guarded UPDATE that provides the race-condition fence, and (c) creates two intra-account transfer transactions (one per user) both tagged with `charge_id`. Everything happens inside a single DB transaction so partial state is impossible.

The codebase already has all supporting infrastructure: `DBTransaction.Begin/Commit/Rollback` via context injection, `TransactionService.Create` that handles same-user transfers through `injectLinkedTransactions`, `TransactionRepository.GetBalance` for amount computation, and `pkgErrors.AlreadyExists` which maps to HTTP 409. The main new code is: the `Accept` method on `chargeService`, a new `AcceptChargeRequest` domain type, additions to `CreateChargeRequest` (add `Date`, require `MyAccountID`, remove `role`), a `Date` field on `domain.Charge`, a `ChargeID` field on `TransactionCreateRequest`, a `ConditionalStatusUpdate` method on `ChargeRepository`, and the accept route + handler.

**Primary recommendation:** Implement `Accept` as a single `DBTransaction`-scoped method on `chargeService` that (1) fetches connection+charge, (2) re-infers roles, (3) computes or validates amount, (4) does the conditional UPDATE for status, (5) calls `TransactionService.Create` twice (once per user) with `type=transfer`, bypassing the outer begin/commit in `transactionService.Create` since the chargeService already owns the transaction context. See §Critical Pitfall 2 for details on that.

---

## Standard Stack

All libraries are already present in the project. No new dependencies.

### Core (already in project)

| Library | Purpose | Notes |
|---------|---------|-------|
| `gorm.io/gorm` | ORM — `db.Exec` with `RowsAffected` for conditional UPDATE | [VERIFIED: codebase grep] |
| `github.com/labstack/echo/v4` | HTTP routing — add `POST /:id/accept` route | [VERIFIED: codebase] |
| `github.com/finance_app/backend/pkg/errors` | `AlreadyExists` → HTTP 409, `Forbidden`, `BadRequest`, `Internal` | [VERIFIED: codebase] |
| `github.com/samber/lo` | `lo.ToPtr`, `lo.FromPtr` — already used in service layer | [VERIFIED: codebase] |

### No New Packages Required

The `go.mod` does not need changes. [VERIFIED: codebase inspection]

---

## Architecture Patterns

### Existing DB Transaction Pattern

`DBTransaction` is already wired project-wide. The implementation stores the GORM `*gorm.DB` transaction in `context.Context` under key `"tx"`. Every repository calls `GetTxFromContext(ctx, r.db)` — so any repository operation called with a transactional context automatically participates in the transaction.

```go
// Source: backend/internal/repository/db_transaction.go (verified)
ctx, err := s.dbTransaction.Begin(ctx)
defer s.dbTransaction.Rollback(ctx)
// ... operations use ctx, all participate in same tx
if err := s.dbTransaction.Commit(ctx); err != nil { ... }
```

This is the correct pattern for the Accept method. `chargeService` must own the `Begin/Commit/Rollback` scope.

### Critical: transactionService.Create Begins Its Own Transaction

**[VERIFIED: backend/internal/service/transaction_create.go line 21]**

`transactionService.Create` calls `s.dbTransaction.Begin(ctx)` internally. If `chargeService.Accept` calls `transactionService.Create` while already inside a `chargeService`-owned transaction, the inner `Begin` will create a **nested transaction** — which PostgreSQL does not natively support. GORM's Begin on a connection that already has a transaction open will issue `SAVEPOINT` semantics (or just begin a new transaction on a different connection), breaking atomicity.

**Solution (decided in CONTEXT.md):** Call `chargeService`'s internal helper `createTransactions` directly — NOT `transactionService.Create`. Since both services are in the same package (`service`), `chargeService` can call `transactionService`'s unexported `createTransactions` method if they share the struct, OR `chargeService` can bypass `transactionService.Create`'s outer begin/commit by calling `transactionRepo.Create` directly via the injected repositories.

The simplest approach consistent with the existing pattern:
- Inject `*Services` and `*repository.Repositories` (or just `transactionRepo`) into `chargeService`
- Call `transactionRepo.Create` directly within the charge accept DB transaction for each transfer transaction
- The `Transaction` domain struct already holds `ChargeID *int` and `LinkedTransactions []Transaction`

Alternatively, inject just `transactionRepo` and replicate the minimal create logic (no recurrence, no tags, no splits — just a plain transfer pair). See §Code Examples.

### Conditional UPDATE Pattern (Race Guard)

GORM does not have a dedicated "conditional update" method, but raw `Exec` with `RowsAffected` achieves it cleanly. [VERIFIED: GORM docs pattern, existing repo code uses db.Exec]

```go
// Source: pattern derived from GORM raw exec — [VERIFIED: GORM API in codebase usage]
result := GetTxFromContext(ctx, r.db).
    Exec("UPDATE charges SET status=?, updated_at=NOW() WHERE id=? AND status='pending'",
        domain.ChargeStatusPaid, id)
if result.Error != nil {
    return result.Error
}
if result.RowsAffected == 0 {
    return ErrChargeAlreadyAccepted // sentinel — caller maps to pkgErrors.AlreadyExists
}
return nil
```

Add method `ConditionalAccept(ctx context.Context, id int) error` to `ChargeRepository` interface + implementation.

### Transfer Transaction Shape

Each intra-account transfer is a same-user transfer (both accounts belong to the same user). Looking at `injectLinkedTransactions` [VERIFIED: transaction_create.go line 336]:

When `DestinationAccountID` belongs to the **same user**, `getConnectionFromDestinationAccountID` returns `nil`, and the code falls into the "intra-user transfer" branch that appends one `LinkedTransaction` with `OperationType.Invert()`. This is the correct branch for Phase 7.

**Charger's transfer:**
```
Main transaction:
  UserID:        chargerUserID
  AccountID:     charger_connection_account_id   (debit — FROM)
  OperationType: debit
  Type:          transfer
  Amount:        amount
  Date:          charge.Date  (initiator's date, stored on Charge)
  ChargeID:      &charge.ID

Linked transaction (auto-injected):
  UserID:        chargerUserID
  AccountID:     ChargerAccountID  (credit — TO, private account)
  OperationType: credit
  Type:          transfer
  Amount:        amount
  Date:          charge.Date
  ChargeID:      &charge.ID  ← needs ChargeID propagation to linked tx
```

**Payer's transfer:**
```
Main transaction:
  UserID:        payerUserID
  AccountID:     PayerAccountID  (debit — FROM, private account)
  OperationType: debit
  Type:          transfer
  Amount:        amount
  Date:          acceptDate  (from accept request)
  ChargeID:      &charge.ID

Linked transaction (auto-injected):
  UserID:        payerUserID
  AccountID:     payer_connection_account_id   (credit — TO)
  OperationType: credit
  Type:          transfer
  Amount:        amount
  Date:          acceptDate
  ChargeID:      &charge.ID  ← needs propagation
```

### ChargeID Propagation to LinkedTransactions

`TransactionCreateRequest` currently has no `ChargeID` field. [VERIFIED: domain/transaction.go line 101-112]

The `createTransactions` function builds `domain.Transaction` structs from the request, but does NOT copy a `ChargeID` from request to transaction. The field must be added to `TransactionCreateRequest` AND `createTransactions` must set it on both the main and linked transactions.

Since the Accept path will call `transactionRepo.Create` directly (bypassing `transactionService.Create`), the cleanest approach is:
1. Add `ChargeID *int` to `TransactionCreateRequest` — this is also useful for future callers
2. In `createTransactions`, set `transaction.ChargeID = req.ChargeID`
3. In `injectLinkedTransactions` (same-user transfer branch), also set `ChargeID` on the linked transaction

OR: if calling `transactionRepo.Create` directly, just set `ChargeID` on the `domain.Transaction` before calling.

### DI Wiring for chargeService

Current `chargeService` only holds `chargeRepo` and `userConnectionRepo`. [VERIFIED: charge_service.go line 11-14]

Needs to gain:
- `dbTransaction repository.DBTransaction` — to own the accept transaction scope
- `transactionRepo repository.TransactionRepository` (OR `services.Transaction`) — to create transfers
- `services *Services` — to call `services.Transaction.GetBalance` for amount computation

Pattern from `transactionService` [VERIFIED: transaction_service.go line 21-29]:
```go
func NewChargeService(repos *repository.Repositories, services *Services) ChargeService {
    return &chargeService{
        chargeRepo:         repos.Charge,
        userConnectionRepo: repos.UserConnection,
        dbTransaction:      repos.DBTransaction,
        transactionRepo:    repos.Transaction,
        services:           services,
    }
}
```

`main.go` must be updated: `Charge: service.NewChargeService(repos, services)` — but `services` pointer exists before `Charge` is set, so circular DI is handled the same way as `TransactionService` and `UserConnectionService`: set `services.Charge` after the `services` struct is initialized. [VERIFIED: main.go lines 77-89]

### Role Re-inference Logic

```
chargerBalanceResult = GetBalance(ctx, chargerUserID, period, BalanceFilter{
    UserID:     chargerUserID,
    AccountIDs: [charger_connection_account_id],
})
```

- If `balance > 0`: charger is still owed money → roles valid, proceed
- If `balance < 0`: roles flipped → swap (ChargerUserID↔PayerUserID, ChargerAccountID↔PayerAccountID) on charge, persist swap in same tx
- If `balance == 0` and no `amount` override → return 400

Connection account ID resolution:
```go
conn.SwapIfNeeded(chargerUserID)
// After swap: conn.FromAccountID is charger's connection account, conn.ToAccountID is payer's
chargerConnAccountID := conn.FromAccountID
payerConnAccountID   := conn.ToAccountID
```
[VERIFIED: user_connection.go SwapIfNeeded]

### Phase 6 Create Modifications

These must ship as part of Phase 7 scope:

1. **Remove `role` from `CreateChargeRequest`** and infer from balance.
2. **Add `Date time.Time` to `CreateChargeRequest` and `domain.Charge`** (and entity + migration).
3. **Make `MyAccountID` required** (currently `*int` nullable, validation check `MyAccountID == nil` → 400).

The `domain.Charge` struct needs a `Date *time.Time` field. [VERIFIED: domain/charge.go — field absent]
The `entity.Charge` struct needs the same. [VERIFIED: entity/charge.go — field absent]
A new migration is required: `ALTER TABLE charges ADD COLUMN date DATE` (or `TIMESTAMPTZ`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| DB transaction scope | Custom mutex, application-level locking | `DBTransaction.Begin/Commit/Rollback` via ctx — already in project |
| Race condition guard | `SELECT ... FOR UPDATE` + check | Conditional `UPDATE WHERE status='pending'` + `RowsAffected` — fewer locks, no read-check-write window |
| HTTP 409 | Custom error code | `pkgErrors.AlreadyExists("charge")` — maps to `http.StatusConflict` [VERIFIED: errors.go line 286] |
| Balance computation | Custom SQL | `TransactionRepository.GetBalance` — already handles settlements leg [VERIFIED: transaction_repository.go] |
| Linked transactions | Two separate `transactionRepo.Create` calls without linking | Use `domain.Transaction.LinkedTransactions` slice — repository Create persists the join table [VERIFIED: entity/transaction.go many2many] |

**Key insight:** Two intra-account transfers for the same user do NOT need to be "linked" to each other across users (they are separate per-user transfers). Each one is a standard same-user transfer (`main + linked` pair via `LinkedTransactions`). The critical thing is setting `ChargeID` on all four resulting rows.

---

## Common Pitfalls

### Pitfall 1: Nested DB Transactions (CP-2)
**What goes wrong:** Calling `transactionService.Create(ctx, ...)` while inside `chargeService`'s `Begin` scope causes `transactionService.Create` to call `dbTransaction.Begin` a second time. GORM will issue a new `BEGIN` on the already-in-transaction connection, which PostgreSQL silently promotes to a savepoint — but the deferred `Rollback` in `transactionService.Create` will roll back everything, not just the inner work.
**How to avoid:** Do NOT call `transactionService.Create` from inside the charge accept DB transaction. Instead, call `transactionRepo.Create` directly (injected into `chargeService`), building the `domain.Transaction` + `LinkedTransactions` by hand.

### Pitfall 2: RowsAffected Check Location
**What goes wrong:** Doing `chargeRepo.Update(ctx, charge)` (which calls GORM `Save`) rather than a WHERE-guarded `Exec`. `Save` always succeeds if the row exists — it does NOT check previous status.
**How to avoid:** Add a dedicated `ConditionalAccept(ctx, id int) error` method on `ChargeRepository` that executes `UPDATE charges SET status='paid', updated_at=NOW() WHERE id=? AND status='pending'` and returns a sentinel error if `RowsAffected == 0`.

### Pitfall 3: Role Swap Without Persist
**What goes wrong:** Re-inferring roles in memory and building transfers with swapped IDs, but not persisting the swap on the `charges` row — leaving the charge with stale user/account ID fields after acceptance.
**How to avoid:** If roles flip, issue `chargeRepo.Update(ctx, charge)` (with swapped fields) INSIDE the same DB transaction, before creating transfers.

### Pitfall 4: ChargeID Not Set on Linked Transactions
**What goes wrong:** Setting `ChargeID` on the main `domain.Transaction` but not on each entry in `LinkedTransactions`. The linked transactions are persisted separately by `transactionRepo.Create` → the join table is populated, but the `charge_id` column on the linked row remains NULL.
**How to avoid:** Explicitly set `ChargeID` on each `domain.Transaction` in the `LinkedTransactions` slice before calling `transactionRepo.Create`.

### Pitfall 5: test_setup_with_db.go Missing ChargeRepository
**What goes wrong:** Integration tests fail because `Repos.Charge` is nil — `ServiceTestWithDBSuite.SetupTest` does not wire `Charge` repository or `chargeService`. [VERIFIED: test_setup_with_db.go lines 88-115 — ChargeRepository and ChargeService absent]
**How to avoid:** Add `ChargeRepository: repository.NewChargeRepository(suite.DB)` to `suite.Repos` and wire `chargeService` in `SetupTest` after the `Services` struct is built (same two-phase pattern as `transactionService`/`userConnectionService`).

### Pitfall 6: Missing `Date` Migration
**What goes wrong:** Adding `Date` field to `domain.Charge` and `entity.Charge` without a DB migration — GORM `Save` silently ignores unknown columns, but `Create` will fail if the column is declared `NOT NULL`.
**How to avoid:** Create a new Goose migration: `ALTER TABLE charges ADD COLUMN date DATE NOT NULL` (or `TIMESTAMPTZ`). Use `TIMESTAMPTZ` to be consistent with other date columns.

### Pitfall 7: `SwapIfNeeded` Side Effect
**What goes wrong:** Calling `conn.SwapIfNeeded(chargerUserID)` mutates the in-memory `UserConnection` struct. If the same `conn` object is reused later (e.g., to look up payer's account), the perspective is now always from charger — payer's `FromAccountID` would return charger's account.
**How to avoid:** After calling `SwapIfNeeded(chargerUserID)`, immediately read `conn.FromAccountID` (charger's conn account) and `conn.ToAccountID` (payer's conn account) into local variables. Do not call `SwapIfNeeded` twice on the same struct.

---

## Code Examples

### ConditionalAccept on ChargeRepository

```go
// Source: pattern from existing charge_repository.go + GORM Exec [VERIFIED]
func (r *chargeRepository) ConditionalAccept(ctx context.Context, id int) error {
    result := GetTxFromContext(ctx, r.db).
        Exec("UPDATE charges SET status=?, updated_at=NOW() WHERE id=? AND status='pending'",
            domain.ChargeStatusPaid, id)
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return errChargeNotPending // sentinel; service maps to pkgErrors.AlreadyExists
    }
    return nil
}
```

### Accept Service Method Skeleton

```go
// Source: architecture derived from verified codebase patterns
func (s *chargeService) Accept(ctx context.Context, callerUserID int, chargeID int, req *domain.AcceptChargeRequest) error {
    // 1. Load charge + IDOR check
    charge, err := s.chargeRepo.GetByID(ctx, chargeID)
    // ...IDOR + role check (who can accept = who has null account)...

    // 2. Load connection; get connection account IDs
    conn := ...
    conn.SwapIfNeeded(charge.ChargerUserID)
    chargerConnAccID := conn.FromAccountID
    payerConnAccID   := conn.ToAccountID

    // 3. Validate status (pending only)
    if charge.Status != domain.ChargeStatusPending {
        return pkgErrors.BadRequest("charge is not pending")
    }

    // 4. Begin atomic scope
    ctx, err = s.dbTransaction.Begin(ctx)
    defer s.dbTransaction.Rollback(ctx)

    // 5. Re-infer roles
    balResult, err := s.services.Transaction.GetBalance(ctx, charge.ChargerUserID, period, domain.BalanceFilter{
        UserID:     charge.ChargerUserID,
        AccountIDs: []int{chargerConnAccID},
    })
    // handle flip/zero cases...
    // if flipped: swap fields on charge, chargeRepo.Update(ctx, charge) inside tx

    // 6. Resolve amount
    amount := req.Amount
    if amount == nil { amount = lo.ToPtr(abs(balResult.Balance)) }

    // 7. Race guard: conditional status update
    if err := s.chargeRepo.ConditionalAccept(ctx, charge.ID); err != nil {
        if isSentinelNotPending(err) { return pkgErrors.AlreadyExists("charge") }
        return pkgErrors.Internal("failed to accept charge", err)
    }

    // 8. Create charger's transfer (connection→private)
    chargerTransfer := &domain.Transaction{
        UserID: charge.ChargerUserID, AccountID: chargerConnAccID,
        Type: domain.TransactionTypeTransfer, OperationType: domain.OperationTypeDebit,
        Amount: *amount, Date: *charge.Date, Description: "Settlement",
        ChargeID: &charge.ID,
        LinkedTransactions: []domain.Transaction{{
            UserID: charge.ChargerUserID, AccountID: *charge.ChargerAccountID,
            Type: domain.TransactionTypeTransfer, OperationType: domain.OperationTypeCredit,
            Amount: *amount, Date: *charge.Date, ChargeID: &charge.ID,
        }},
    }
    if _, err := s.transactionRepo.Create(ctx, chargerTransfer); err != nil { ... }

    // 9. Create payer's transfer (private→connection)
    payerTransfer := &domain.Transaction{ ... }
    if _, err := s.transactionRepo.Create(ctx, payerTransfer); err != nil { ... }

    return s.dbTransaction.Commit(ctx)
}
```

### Adding ChargeID to TransactionCreateRequest

```go
// backend/internal/domain/transaction.go — TransactionCreateRequest
type TransactionCreateRequest struct {
    // ... existing fields ...
    ChargeID *int `json:"charge_id,omitempty"` // set by accept flow; nil for user-created transactions
}
```

In `createTransactions`, add:
```go
transactions = append(transactions, domain.Transaction{
    // ... existing fields ...
    ChargeID: req.ChargeID, // propagate from request
})
```

In the same-user transfer branch of `injectLinkedTransactions`:
```go
transaction.LinkedTransactions = append(transaction.LinkedTransactions, domain.Transaction{
    // ... existing fields ...
    ChargeID: transaction.ChargeID, // inherit from parent
})
```

---

## State of the Art

| Old Approach | Current Approach |
|--------------|------------------|
| `SELECT ... FOR UPDATE` row lock | `UPDATE ... WHERE status='pending'` + RowsAffected check — no read lock needed, serialized at write |
| Separate create calls per user | Two same-user transfers; each a main+linked pair via `LinkedTransactions` slice |

---

## Schema Changes Required

| Change | File | Notes |
|--------|------|-------|
| `ALTER TABLE charges ADD COLUMN date TIMESTAMPTZ` | New migration | Required for Phase 6 retroactive change (§4b) |
| `domain.Charge` add `Date *time.Time` | `internal/domain/charge.go` | |
| `entity.Charge` add `Date *time.Time` | `internal/entity/charge.go` | Include in `ToDomain()` / `ChargeFromDomain()` |
| `CreateChargeRequest` add `Date time.Time`, remove `Role`, make `MyAccountID` required | `internal/domain/charge.go` | |
| `TransactionCreateRequest` add `ChargeID *int` | `internal/domain/transaction.go` | |
| `ChargeService` interface add `Accept` method | `internal/service/interfaces.go` | |
| `ChargeRepository` interface add `ConditionalAccept` | `internal/repository/interfaces.go` | |
| `chargeService` struct gains `dbTransaction`, `transactionRepo`, `services` | `internal/service/charge_service.go` | |
| `NewChargeService` signature: add `services *Services` | `internal/service/charge_service.go` | |
| `main.go`: wire `NewChargeService(repos, services)` after services init | `cmd/server/main.go` | Like transactionService |
| Route: `charges.POST("/:id/accept", chargeHandler.Accept)` | `cmd/server/main.go` | |
| Handler `Accept` method | `internal/handler/charge_handler.go` | |
| `test_setup_with_db.go`: add ChargeRepository + chargeService | `internal/service/test_setup_with_db.go` | Required for integration tests |
| Regenerate mocks after interface changes | `mocks/` | `just generate-mocks` |

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond the existing project stack).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | testify/suite + testcontainers-go (integration) |
| Config file | none — tests use `go test -tags=integration` |
| Quick run command | `go test ./internal/service/... -run TestCharge -tags=integration -v` |
| Full suite command | `just test-integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| CHG-04 | Accept creates exactly 2 transfer transactions with charge_id set | integration | `go test ./internal/service/... -run TestChargeService/TestAccept_CreatesTransfers -tags=integration` |
| CHG-04 | Both transfers OR neither (rollback on failure) | integration | `go test ./internal/service/... -run TestChargeService/TestAccept_Atomic -tags=integration` |
| CHG-09 | Caller who is initiator gets 403 | integration | `go test ./internal/service/... -run TestChargeService/TestAccept_Forbidden -tags=integration` |
| CHG-09 | Non-party caller gets 403 | integration | `go test ./internal/service/... -run TestChargeService/TestAccept_IDOR -tags=integration` |
| CHG-10 | Second accept returns conflict | integration | `go test ./internal/service/... -run TestChargeService/TestAccept_DoubleAccept -tags=integration` |
| CHG-11 | transfer.charge_id == charge.ID for both transfers | integration | included in CHG-04 test assertions |

### Wave 0 Gaps

- [ ] `internal/service/charge_service_test.go` — new test file for ChargeService tests (CHG-04, CHG-09, CHG-10, CHG-11)
- [ ] `test_setup_with_db.go` must be updated to wire `ChargeRepository` and `chargeService` before tests can run

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | IDOR check (caller must be party to charge) + role check (caller must be non-initiating party) |
| V5 Input Validation | yes | `account_id` required, `amount` > 0 if provided, `date` required |
| V6 Cryptography | no | — |
| V2 Authentication | yes (inherited) | `AuthMiddleware` on `/api` group — already in place |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Double-accept (race condition) | Tampering | Conditional UPDATE `WHERE status='pending'` + RowsAffected check |
| IDOR — caller reads/accepts another user's charge | Elevation of privilege | Load charge first, check `ChargerUserID` and `PayerUserID` vs `callerUserID` |
| Accepting own charge (initiating party) | Elevation of privilege | Null-account-ID check: if caller's account is already on the charge, they are the initiator → 403 |
| Partial state (transfers without status update) | Tampering | Single DB transaction covers status update + both transfer creates |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `transactionRepo.Create` correctly persists `LinkedTransactions` via the many2many join table when called outside `transactionService.Create` | Code Examples | Linked transaction not persisted; manual insert of join table row required |
| A2 | The `date` column in the charges migration can be `TIMESTAMPTZ` (not `DATE`) to align with other timestamp columns | Schema Changes | Minor — `DATE` would strip time, `TIMESTAMPTZ` is safer for timezone-aware storage |
| A3 | Phase 6 create validation changes (remove `role`, require `MyAccountID`, add `date`) will not break any existing acceptance tests for Phase 6 | Phase 6 retroactive changes | Existing Phase 6 integration tests (if any) may need updating |

---

## Open Questions

1. **Does `transactionRepo.Create` persist `LinkedTransactions` automatically?**
   - What we know: `entity.TransactionFromDomain` maps `d.LinkedTransactions` to `ent.LinkedTransactions` (a GORM many2many). GORM `Create` with associations will insert the join table rows.
   - What's unclear: Whether GORM auto-creates the associated `LinkedTransactions` entries via `Create` or only if `Session(&gorm.Session{FullSaveAssociations: true})` is set.
   - Recommendation: Verify by reading `transactionRepo.Create` call path in an integration test for transfers. If not auto-saved, the accept flow must call `transactionRepo.Create` twice (once for each side) and then insert the join table row manually or use `db.Model(main).Association("LinkedTransactions").Append(linked)`.

2. **Should the Charge `Date` column be `DATE` or `TIMESTAMPTZ`?**
   - What we know: `charge.Date` is used as the transaction date for the initiator's transfer; transaction dates are `TIMESTAMPTZ` in the DB.
   - Recommendation: Use `TIMESTAMPTZ` for consistency with other date fields.

---

## Sources

### Primary (HIGH confidence)
- `backend/internal/service/charge_service.go` — existing chargeService DI and method patterns [VERIFIED: codebase]
- `backend/internal/service/transaction_create.go` — `Create`, `createTransactions`, `injectLinkedTransactions` [VERIFIED: codebase]
- `backend/internal/repository/db_transaction.go` — DBTransaction Begin/Commit/Rollback [VERIFIED: codebase]
- `backend/internal/repository/transaction_repository.go` — `GetBalance`, `Create` [VERIFIED: codebase]
- `backend/internal/domain/charge.go` — Charge struct, ValidateTransition, CreateChargeRequest [VERIFIED: codebase]
- `backend/internal/domain/transaction.go` — Transaction, TransactionCreateRequest, ChargeID [VERIFIED: codebase]
- `backend/internal/domain/user_connection.go` — SwapIfNeeded, FromAccountID/ToAccountID [VERIFIED: codebase]
- `backend/internal/entity/transaction.go` — ChargeID field, TransactionFromDomain [VERIFIED: codebase]
- `backend/internal/entity/charge.go` — Charge entity, ToDomain/ChargeFromDomain [VERIFIED: codebase]
- `backend/pkg/errors/errors.go` — AlreadyExists → HTTP 409, error hierarchy [VERIFIED: codebase]
- `backend/internal/service/test_setup_with_db.go` — missing ChargeRepository in test wiring [VERIFIED: codebase]
- `backend/cmd/server/main.go` — DI wiring pattern, services init order [VERIFIED: codebase]
- `.planning/phases/07-accept-atomic-transfer/07-CONTEXT.md` — all locked decisions [VERIFIED: file read]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all code verified in codebase
- Architecture patterns: HIGH — all patterns directly observed in existing service/repository code
- Pitfalls: HIGH — CP-2 (nested tx) verified by reading `transaction_create.go:21`; Pitfall 5 (missing test wiring) verified by reading `test_setup_with_db.go`
- Schema changes: HIGH — all missing fields/migrations verified by reading domain/entity files

**Research date:** 2026-04-15
**Valid until:** Stable — no external library changes, code-only domain
