## Context

Settlements are created at transaction-create time via `createSettlementsForSplit`. The update flow in `transaction_update.go` modifies `LinkedTransactions` (amount, type, account, adds/removes splits) but never touches the `settlements` table, leaving it stale.

The update loop iterates `data.transactions`, calling either `transactionRepo.Create` (new installments) or `transactionRepo.Update` (existing). After each persist, the domain struct's `LinkedTransactions` already reflects the new desired state — that's the source of truth for what the settlements should be.

Database-level `ON DELETE CASCADE` on `parent_transaction_id` handles the removal case: when a linked transaction is deleted (via `transactionRepo.Delete`), its settlements are automatically removed. No explicit settlement delete is needed.

## Goals / Non-Goals

**Goals:**
- After each transaction persist in the update loop, upsert settlements to match the current `LinkedTransactions`
- Handle: amount changes, type changes (expense↔income flips credit↔debit), account changes, added splits, new installments with splits

**Non-Goals:**
- Settlement deletion: handled automatically by `ON DELETE CASCADE` on `parent_transaction_id`
- Settlements for transfer transactions: no settlements for transfers (no splits allowed)
- Exposing settlements via HTTP: separate concern

## Decisions

### Where to hook in: after each persist in the Update loop

After `transactionRepo.Create` or `transactionRepo.Update`, the domain struct (`own`) has the correct ID and `own.LinkedTransactions` reflects the new state. Calling `syncSettlementsForTransaction` at this point gives us everything we need without a re-fetch.

**Alternative considered:** sync once at the end of the loop — rejected because it would require tracking which transactions were actually updated (vs. skipped by `shouldUpdateTransactionBasedOnPropagationSettings`).

### Upsert strategy: delete-then-insert per source transaction

For each updated transaction, delete all existing settlements with `SourceTransactionID == own.ID`, then insert fresh ones from `own.LinkedTransactions`.

**Alternative considered:** true upsert (UPDATE WHERE parent_transaction_id = X) — rejected because the set of linked transactions can change (splits added/removed/re-mapped to different users), making it hard to match old rows to new ones without a stable key. Delete-then-insert is simpler and correct inside a DB transaction.

### Type determination: derive from transaction type on the domain struct

`own.Type` reflects the new type after `rebuildTransactions` applies any type change. `SettlementTypeCredit` for expense, `SettlementTypeDebit` for income.

If `own.Type` is transfer or `own.LinkedTransactions` is empty, skip settlement sync for that transaction.

### Re-use `createSettlementsForSplit` vs. new helper

`createSettlementsForSplit` only inserts. We need delete-then-insert, so a new helper `syncSettlementsForTransaction` is added. It deletes by `SourceTransactionID` first, then delegates to the insert logic.

## Risks / Trade-offs

- **Delete-then-insert inside a DB transaction**: safe — the outer `dbTransaction` wraps the whole update. If anything fails, everything rolls back.
- **Skipped transactions**: `shouldUpdateTransactionBasedOnPropagationSettings` may skip some installments. Those installments' settlements are intentionally left unchanged — correct behavior since their transaction data didn't change.
- **Stale settlements for removed installments**: handled by CASCADE. When `transactionRepo.Delete` removes installments, the `parent_transaction_id` CASCADE deletes their settlements automatically.
- **`own.ID == 0` case**: new installments have `ID == 0` before `transactionRepo.Create`. After create, the ID is populated on the returned struct. Use the returned value from `transactionRepo.Create` — same pattern as `transaction_create.go`.

## Migration Plan

No schema changes required. The `settlements` table and cascade constraints already exist from the previous migration.

Deployment: drop the updated service binary. No migration steps.

## Open Questions

None.
