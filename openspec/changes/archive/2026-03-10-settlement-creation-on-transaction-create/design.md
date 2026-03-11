## Context

`transaction_create.go` already handles split transactions via `injectLinkedTransactions`, which populates `transaction.LinkedTransactions` before calling `transactionRepo.Create`. After `Create` returns, the persisted transaction (and its linked transactions) have database IDs. This is the natural point to create settlements.

`transactionService` holds `services *Services`, which now includes `services.Settlement` (wired in the previous change). The entire create flow runs inside a DB transaction, so settlement creation participates in the same atomic unit.

## Goals / Non-Goals

**Goals:**

- After each author transaction is persisted during a split, create one settlement per linked transaction
- Settlement type: `credit` for `expense` splits, `debit` for `income` splits
- Settlement fields: `UserID = authorID`, `AccountID = author transaction's account`, `SourceTransactionID = author transaction ID`, `ParentTransactionID = linked transaction ID`, `Amount = linked transaction amount`
- Add a `SettlementsFromSource []Settlement` has-many association to `domain.Transaction` (via `source_transaction_id`) and to `entity.Transaction` (GORM has-many)
- Add an optional `WithSettlements bool` flag to `TransactionFilter` so callers can opt into preloading settlements alongside transactions
- Wire `SettlementRepository` and `SettlementService` into the test suite's `SetupTest`
- Update `transaction_create_test.go` to assert settlements exist for split scenarios and are absent for non-split/transfer scenarios

**Non-Goals:**

- Settlement creation for transfers (blocked by existing validation)
- Settlement update/delete lifecycle (follow-on work)

## Decisions

### Settlement creation point: inside the `createTransactions` loop, after `transactionRepo.Create`

The linked transactions receive their IDs only after `transactionRepo.Create` (GORM populates the associations). This is the earliest point where `ParentTransactionID` is known. Creating settlements in the same loop iteration keeps the logic co-located and within the same DB transaction context.

**Alternatives considered:** A separate post-loop pass — rejected because it adds complexity without benefit.

### Guard condition: `req.TransactionType != TransactionTypeTransfer && len(req.SplitSettings) > 0`

The existing validator already blocks splits on transfers. Using the original request's `SplitSettings` length as the guard is simpler than inspecting the type of each linked transaction at runtime.

### Settlement type mapping

- Expense split → `SettlementTypeCredit`: the author paid the full amount and is owed back the split portion.
- Income split → `SettlementTypeDebit`: the author received the full amount but must account for the portion belonging to the other user.

### Transaction ↔ Settlement association via `source_transaction_id`

`entity.Settlement` already has a `SourceTransactionID int` FK column. Adding a GORM `has-many` on `entity.Transaction` (`gorm:"foreignKey:SourceTransactionID"`) lets the repository preload settlements with a single `Preload("Settlements")` call — no extra query logic needed.

The `domain.Transaction` struct gains a `Settlements []Settlement` field (omitempty, not serialised by default). The `ToDomain`/`TransactionFromDomain` conversions are extended to map this slice.

`TransactionFilter.WithSettlements bool` controls preloading: when `true`, `transactionRepository.Search` adds `Preload("Settlements")` to the query. This keeps the default path zero-cost and avoids breaking existing callers.

**Alternatives considered:** Fetching settlements separately in the service layer — rejected because it requires an extra round-trip and duplicates the filtering logic already available in the repository.

## Risks / Trade-offs

- [Risk] `SettlementService.Create` failures inside the loop will roll back the whole DB transaction, undoing already-created transactions — Mitigation: this is the desired behavior; partial state is worse than full rollback.
- [Risk] Test suite `SetupTest` not wiring `SettlementRepository` would cause nil panics — Mitigation: add `SettlementRepository` and `SettlementService` to `SetupTest` alongside the other repositories.
