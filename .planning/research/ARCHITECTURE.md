# Architecture Research: Charges

**Project:** Couples Finance App — v1.1 Charges Milestone
**Researched:** 2026-04-14
**Confidence:** HIGH — based on direct codebase inspection

---

## New Domain Components

### `ChargeStatus` enum

```go
type ChargeStatus string

const (
    ChargeStatusPending  ChargeStatus = "pending"
    ChargeStatusAccepted ChargeStatus = "accepted"
    ChargeStatusRejected ChargeStatus = "rejected"
    ChargeStatusCanceled ChargeStatus = "canceled"
)
```

Mirrors the lifecycle of `UserConnectionStatusEnum` but adds `canceled` (only the creator can cancel a pending charge).

### `Charge` domain struct

```go
type Charge struct {
    ID               int          `json:"id"`
    ConnectionID     int          `json:"connection_id"`
    PayerUserID      int          `json:"payer_user_id"`      // user who owes / pays
    ChargerUserID    int          `json:"charger_user_id"`    // user who is owed / requests
    Amount           int64        `json:"amount"`              // cents
    Description      string       `json:"description"`
    Status           ChargeStatus `json:"status"`
    // Populated on Accept — links back to the two transfer transactions created
    DebitTransactionID  *int      `json:"debit_transaction_id,omitempty"`
    CreditTransactionID *int      `json:"credit_transaction_id,omitempty"`
    CreatedAt        *time.Time   `json:"created_at"`
    UpdatedAt        *time.Time   `json:"updated_at"`
}
```

**Key design decisions:**

- `PayerUserID` / `ChargerUserID` are explicit (not derived) so the intent is preserved regardless of which user queries the charge. This avoids the need to call `SwapIfNeeded` the way `UserConnection` does.
- `ConnectionID` (FK to `user_connections`) provides the account IDs needed to create transfers on acceptance without additional lookups. The connection also validates that the two users are actually connected and `accepted`.
- `DebitTransactionID` / `CreditTransactionID` are nullable FKs to `transactions`. They are null while `status = pending|rejected|canceled` and are set atomically when `status` transitions to `accepted`. This provides an auditable link between a charge and the transfers it created.
- Amount is in cents, consistent with `Transaction.Amount`.

### `ChargeFilter` struct

```go
type ChargeFilter struct {
    IDs          []int        `query:"id[]"`
    ConnectionID *int         `query:"connection_id,omitempty"`
    // Filter by either side of the charge without knowing direction
    UserID       *int         `query:"user_id,omitempty"` // matches payer_user_id OR charger_user_id
    Statuses     []ChargeStatus `query:"status[]"`
    SortBy       *SortBy      `query:"sort_by,omitempty"`
    Limit        *int         `query:"limit,omitempty"`
    Offset       *int         `query:"offset,omitempty"`
}
```

---

## DB Schema

### Migration: `charges` table

```sql
-- +goose Up
CREATE TYPE charge_status AS ENUM ('pending', 'accepted', 'rejected', 'canceled');

CREATE TABLE charges (
    id                      SERIAL PRIMARY KEY,
    connection_id           INT NOT NULL REFERENCES user_connections(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    payer_user_id           INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    charger_user_id         INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    amount                  BIGINT NOT NULL CHECK (amount > 0),
    description             TEXT NOT NULL,
    status                  charge_status NOT NULL DEFAULT 'pending',
    debit_transaction_id    INT REFERENCES transactions(id) ON DELETE SET NULL ON UPDATE CASCADE,
    credit_transaction_id   INT REFERENCES transactions(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at              TIMESTAMP,
    updated_at              TIMESTAMP,
    -- Exactly one user is payer, the other is charger; they must differ
    CHECK (payer_user_id != charger_user_id),
    -- Both transaction IDs are set together or not at all
    CHECK (
        (debit_transaction_id IS NULL AND credit_transaction_id IS NULL)
        OR
        (debit_transaction_id IS NOT NULL AND credit_transaction_id IS NOT NULL)
    )
);

CREATE INDEX idx_charges_connection_id    ON charges(connection_id);
CREATE INDEX idx_charges_payer_user_id    ON charges(payer_user_id);
CREATE INDEX idx_charges_charger_user_id  ON charges(charger_user_id);
CREATE INDEX idx_charges_status           ON charges(status);

-- +goose Down
DROP TABLE IF EXISTS charges;
DROP TYPE IF EXISTS charge_status;
```

**ON DELETE RESTRICT on connection_id** prevents a connection from being deleted while a pending charge exists — this is intentional. Accepted/rejected/canceled charges are historical records; callers should cancel or reject pending charges before deleting a connection.

**ON DELETE SET NULL on transaction FKs** rather than CASCADE: if a transfer is manually deleted later the charge record should persist as a historical record (status remains `accepted`, transaction IDs become null).

---

## Service Layer Design

### Interface

```go
// in internal/service/interfaces.go

type ChargeService interface {
    Create(ctx context.Context, chargerUserID int, req *domain.ChargeCreateRequest) (*domain.Charge, error)
    Accept(ctx context.Context, payerUserID int, chargeID int) (*domain.Charge, error)
    Reject(ctx context.Context, payerUserID int, chargeID int) error
    Cancel(ctx context.Context, chargerUserID int, chargeID int) error
    List(ctx context.Context, userID int, filter domain.ChargeFilter) ([]*domain.Charge, error)
}
```

### `ChargeCreateRequest`

```go
type ChargeCreateRequest struct {
    ConnectionID int    `json:"connection_id"`
    PayerUserID  int    `json:"payer_user_id"`
    Amount       int64  `json:"amount"`
    Description  string `json:"description"`
}
```

The `ChargerUserID` is derived from the authenticated caller; it is never accepted from the request body.

### Method responsibilities

**Create:**
1. Validate: `Amount > 0`, `Description` not blank, `ConnectionID > 0`, `PayerUserID != chargerUserID`.
2. Load the `UserConnection` — confirm it is `accepted`, and that both `chargerUserID` and `payerUserID` are members of the connection.
3. Insert the `Charge` row with `status = pending`.
4. Return the created charge.
5. No DB transaction needed (single insert).

**Accept:**
1. Load charge; assert `status == pending` and `payerUserID == charge.PayerUserID`.
2. Load the `UserConnection` to get account IDs.
3. Begin DB transaction.
4. Create debit transfer for payer (see Atomic Transfer Creation below).
5. Create credit transfer for charger.
6. Update `charge.status = accepted`, set `debit_transaction_id`, `credit_transaction_id`.
7. Commit. Rollback on any error.

**Reject:**
1. Load charge; assert `status == pending` and `payerUserID == charge.PayerUserID`.
2. Update `status = rejected`. Single update, no transaction needed.

**Cancel:**
1. Load charge; assert `status == pending` and `chargerUserID == charge.ChargerUserID`.
2. Update `status = canceled`. Single update, no transaction needed.

**List:**
1. Apply `userID` filter (matches either side of charge) via `ChargeFilter.UserID`.
2. Delegate directly to `ChargeRepository.Search`.
3. No status defaulting — callers can filter by status explicitly; unfiltered returns all statuses.

### Service struct

```go
type chargeService struct {
    dbTransaction repository.DBTransaction
    chargeRepo    repository.ChargeRepository
    services      *Services
}

func NewChargeService(repos *repository.Repositories, services *Services) ChargeService {
    return &chargeService{
        dbTransaction: repos.DBTransaction,
        chargeRepo:    repos.Charge,
        services:      services,
    }
}
```

The service follows the same pattern as `transactionService` — it holds a reference to `*Services` for cross-service calls (specifically `UserConnection` and `Transaction`).

Because `ChargeService` depends on `Services`, it must be wired last in `main.go`, after `UserConnectionService` and `TransactionService` are assigned, matching the existing pattern for `UserConnection` and `Transaction`.

---

## Atomic Transfer Creation

### The problem

When a charge is accepted, two transfer transactions must be created atomically:
1. A debit transfer on the payer's account (money leaves).
2. A credit transfer on the charger's account (money arrives).

These are the same two rows that a cross-user transfer creates via `injectLinkedTransactions`. The acceptance path must reach the same result without duplicating that logic.

### Recommended approach: call `TransactionService.Create` inside a shared DB transaction

The existing `repository.DBTransaction` infrastructure propagates a GORM transaction through the `context.Context`. Both `chargeRepo.Update` and two `transactionService.Create` calls can share the same `ctx` once `dbTransaction.Begin` is called:

```go
func (s *chargeService) Accept(ctx context.Context, payerUserID int, chargeID int) (*domain.Charge, error) {
    charge, err := s.chargeRepo.SearchOne(ctx, domain.ChargeFilter{IDs: []int{chargeID}})
    // ... validate ownership and status ...

    conn, err := s.services.UserConnection.SearchOne(ctx, domain.UserConnectionSearchOptions{
        IDs: []int{charge.ConnectionID},
    })
    // ... validate conn is accepted ...

    conn.SwapIfNeeded(payerUserID) // payer becomes FromUser, charger becomes ToUser

    ctx, err = s.dbTransaction.Begin(ctx)
    if err != nil { return nil, pkgErrors.Internal("begin tx", err) }
    defer s.dbTransaction.Rollback(ctx)

    // Create a single cross-user transfer from payer's account to charger's account.
    // TransactionService.Create will produce two linked transactions (debit + credit)
    // using the same conn-based logic used for normal cross-user transfers.
    transferReq := &domain.TransactionCreateRequest{
        TransactionType:      domain.TransactionTypeTransfer,
        AccountID:            conn.FromAccountID, // payer's account
        DestinationAccountID: &conn.ToAccountID,  // charger's account
        Amount:               charge.Amount,
        Date:                 time.Now().UTC(),
        Description:          charge.Description,
    }
    firstID, err := s.services.Transaction.Create(ctx, payerUserID, transferReq)
    if err != nil { return nil, err }

    // Resolve the two transaction IDs: firstID is the debit (payer-side).
    // The credit (charger-side) is its linked transaction.
    debitTx, err := s.services.Transaction.SearchOne(ctx, payerUserID, domain.TransactionFilter{IDs: []int{firstID}})
    if err != nil { return nil, err }
    creditTxID := debitTx.LinkedTransactions[0].ID

    charge.Status = domain.ChargeStatusAccepted
    charge.DebitTransactionID = &firstID
    charge.CreditTransactionID = &creditTxID
    if err := s.chargeRepo.Update(ctx, charge); err != nil { return nil, err }

    if err := s.dbTransaction.Commit(ctx); err != nil {
        return nil, pkgErrors.Internal("commit tx", err)
    }
    return charge, nil
}
```

**Why call `TransactionService.Create` rather than `TransactionRepository.Create` directly:**
`TransactionService.Create` already handles the cross-user transfer split (via `injectLinkedTransactions`), `linked_transactions` join-table insertion, account ownership validation, and DB transaction propagation through context. Replicating this at the repository level would duplicate non-trivial logic and diverge when the transfer path evolves.

**Note on nested DB transactions:** `transactionService.Create` calls `dbTransaction.Begin` internally. Calling `Begin` when a `tx` is already in context will create a new `*gorm.DB` transaction, which in PostgreSQL translates to a savepoint-like scope with GORM. This works correctly because GORM's `Begin` on an already-transacted connection creates a nested transaction (savepoint). The outer `chargeService` commit is what actually flushes to disk. Verify with a targeted integration test.

**Alternative if nested transactions cause issues:** Extract a `createTransferTransactions(ctx, ...)` helper from `transactionService` that does not call `Begin`/`Commit` itself, and call it from both `transactionService.Create` and `chargeService.Accept`. This is a clean refactor that avoids nesting entirely.

---

## Integration Points

### UserConnection

- `ChargeService.Create` loads the connection to assert it is `accepted` and that both users are members. This prevents charges between non-connected or pending users.
- `ChargeService.Accept` calls `conn.SwapIfNeeded(payerUserID)` to normalize account IDs before constructing the transfer request — the same pattern used in `transactionService.injectLinkedTransactions`.
- The `charges.connection_id` FK enforces referential integrity at the DB level.

### Transaction / Transfer

- Acceptance delegates to `TransactionService.Create` with `TransactionType = transfer` and `DestinationAccountID = conn.ToAccountID`. This re-uses all existing cross-user transfer logic.
- The created transfer pair is linked via `linked_transactions` exactly as regular transfers are.
- `charges.debit_transaction_id` and `charges.credit_transaction_id` point back to those two rows, enabling the UI to deep-link from a charge to its resulting transactions.

### Auth / Middleware

- All charge endpoints are under `/api/` and therefore behind `AuthMiddleware.RequireAuth`.
- `ChargerUserID` is always set to `appcontext.GetUserIDFromContext(ctx)` in the handler — never from the request body.
- Ownership checks (`payerUserID == charge.PayerUserID`, `chargerUserID == charge.ChargerUserID`) happen in the service layer, returning `ErrCodeForbidden` on mismatch. These follow the existing pattern where `transactionService` checks `UserID` ownership before mutating.

### Error handling

New `ErrorTag` constants should be added to `pkg/errors/errors.go`:

```go
ErrorTagChargeNotFound              ErrorTag = "CHARGE.NOT_FOUND"
ErrorTagChargeForbidden             ErrorTag = "CHARGE.FORBIDDEN"
ErrorTagChargeAlreadyActioned       ErrorTag = "CHARGE.ALREADY_ACTIONED"
ErrorTagChargeConnectionNotAccepted ErrorTag = "CHARGE.CONNECTION_NOT_ACCEPTED"
ErrorTagChargeAmountRequired        ErrorTag = "CHARGE.AMOUNT_REQUIRED"
ErrorTagChargeDescriptionRequired   ErrorTag = "CHARGE.DESCRIPTION_REQUIRED"
ErrorTagChargeInvalidConnection     ErrorTag = "CHARGE.INVALID_CONNECTION"
ErrorTagChargePayerNotInConnection  ErrorTag = "CHARGE.PAYER_NOT_IN_CONNECTION"
```

---

## New Files and Modified Files

### New files

| Path | Purpose |
|------|---------|
| `internal/domain/charge.go` | `Charge`, `ChargeStatus`, `ChargeCreateRequest`, `ChargeFilter` |
| `internal/entity/charge.go` | GORM entity with `ToDomain()` / `ChargeFromDomain()` |
| `internal/repository/charge_repository.go` | `chargeRepositoryImpl` implementing `ChargeRepository` |
| `internal/service/charge_service.go` | `chargeService` implementing `ChargeService` |
| `internal/handler/charge_handler.go` | Echo handlers: Create, Accept, Reject, Cancel, List |
| `migrations/20260414000000_create_charges_table.sql` | Goose migration for `charges` table |

### Modified files

| Path | Change |
|------|--------|
| `internal/repository/interfaces.go` | Add `ChargeRepository` interface; add `Charge ChargeRepository` to `Repositories` struct |
| `internal/service/interfaces.go` | Add `ChargeService` interface; add `Charge ChargeService` to `Services` struct |
| `cmd/server/main.go` | Instantiate `repository.NewChargeRepository(db)`, wire `service.NewChargeService(repos, services)`, register charge routes |
| `pkg/errors/errors.go` | Add charge-specific `ErrorTag` constants |
| `mocks/` | Regenerate after adding `ChargeRepository` and `ChargeService` interfaces |

### `ChargeRepository` interface

```go
type ChargeRepository interface {
    Create(ctx context.Context, charge *domain.Charge) (*domain.Charge, error)
    Update(ctx context.Context, charge *domain.Charge) error
    SearchOne(ctx context.Context, filter domain.ChargeFilter) (*domain.Charge, error)
    Search(ctx context.Context, filter domain.ChargeFilter) ([]*domain.Charge, error)
}
```

No `Delete` — charges are never hard-deleted; status transitions to `canceled` or `rejected` are the terminal states.

---

## Suggested Build Order

### Phase 1: Domain + DB

1. Write `internal/domain/charge.go` — all types, no logic.
2. Write migration `create_charges_table.sql`.
3. Run `just migrate-up` to verify schema.
4. Write `internal/entity/charge.go` — GORM struct, `ToDomain()`, `ChargeFromDomain()`.

No dependencies on other new components. Can be reviewed and merged independently.

### Phase 2: Repository

1. Add `ChargeRepository` interface to `internal/repository/interfaces.go` and add `Charge ChargeRepository` field to `Repositories`.
2. Write `internal/repository/charge_repository.go`.
3. Run `just generate-mocks` to produce `mocks/MockChargeRepository`.
4. Write unit tests for repository search (filter by userID, status).

Dependency: Phase 1 (entity + domain types must exist).

### Phase 3: Service — Create, Reject, Cancel, List

Implement the four operations that do not involve transfer creation. These have no dependency on the nested-transaction question.

1. Add `ChargeService` interface to `internal/service/interfaces.go` and add `Charge ChargeService` to `Services`.
2. Write `internal/service/charge_service.go` with `Create`, `Reject`, `Cancel`, `List`.
3. Add charge error tags to `pkg/errors/errors.go`.
4. Wire in `main.go` (repository + service construction, not routes yet).
5. Write integration tests using `ServiceTestWithDBSuite` for the four operations.

Dependency: Phase 2.

### Phase 4: Service — Accept (atomic transfer creation)

Implement `Accept` separately due to its atomicity complexity and dependency on `TransactionService`.

1. Implement `chargeService.Accept` with nested-transaction approach.
2. Write integration test covering the full acceptance path: verify charge status, debit/credit transaction IDs, linked_transactions row, and both transaction balances.
3. If nested-transaction issues arise, refactor `transactionService` to expose an internal `createTransfer(ctx, ...)` helper that skips its own `Begin`/`Commit`.

Dependency: Phase 3. The integration test for Accept is the most complex test in the milestone — budget time for it.

### Phase 5: Handler + Routes

1. Write `internal/handler/charge_handler.go` with Swagger annotations.
2. Register routes in `main.go`:
   ```
   POST   /api/charges              → Create
   GET    /api/charges              → List (query params from ChargeFilter)
   POST   /api/charges/:id/accept   → Accept
   POST   /api/charges/:id/reject   → Reject
   POST   /api/charges/:id/cancel   → Cancel
   ```
3. Run `just generate-docs`.

Dependency: Phase 3 + 4 (service must be complete before wiring handlers).

### Phase 6: Frontend (out of scope for this research, listed for completeness)

Charges listing page, create/accept/reject/cancel forms, sidebar badge for pending charges.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Domain model | HIGH | Direct inspection of existing domain patterns |
| DB schema | HIGH | Follows existing migration conventions; constraints verified against settlement and linked_transaction precedents |
| Repository layer | HIGH | Mirrors SettlementRepository pattern exactly |
| Service — Create/Reject/Cancel/List | HIGH | Straightforward; matches UserConnectionService patterns |
| Service — Accept atomicity | MEDIUM | Nested GORM transaction behavior needs integration test to confirm; alternative refactor path documented |
| Handler layer | HIGH | Follows TransactionHandler and UserConnectionHandler patterns exactly |
| Wiring in main.go | HIGH | Pattern already established for services with cross-service deps |
