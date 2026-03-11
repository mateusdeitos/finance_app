## Why

Settlements are created during transaction create but are never updated when the underlying transaction changes. If the author edits the split amount, changes the transaction type, removes a split, or changes the account, the settlements become stale and the author's effective balance is wrong.

## What Changes

- After each transaction is persisted in the update loop, sync settlements to match the current state of `LinkedTransactions`
- **Upsert** settlements when splits exist or change (amount, type, account)
- **Delete** handled automatically via `ON DELETE CASCADE` on `parent_transaction_id` when linked transactions are removed
- Sync applies per-installment, respecting `PropagationSettings` (current / current_and_future / all)
- No settlement action needed when type changes to transfer (CASCADE handles it when linked transactions are deleted)

## Capabilities

### New Capabilities

- `settlement-sync-on-update`: Settlement upsert logic executed inside the transaction update loop, keeping settlements in sync with the current split state after every update operation

### Modified Capabilities

<!-- No existing spec-level requirements are changing -->

## Impact

- `internal/service/transaction_update.go` — add `syncSettlementsForTransaction` helper call after each `transactionRepo.Create` / `transactionRepo.Update` in the main loop
- `internal/service/transaction_update_test.go` — add/extend integration tests to assert settlement state after each update scenario
