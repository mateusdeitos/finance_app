## Why

The `Settlement` entity was introduced to track balance adjustments for the author of a shared transaction. However, settlements are not yet created anywhere — the transaction create flow needs to produce them automatically when a split generates linked transactions for another user.

## What Changes

- After persisting each transaction that has split-based linked transactions, create one `Settlement` per linked transaction for the transaction author
- Settlement type is `credit` for expense splits (the author overpaid and is owed back) and `debit` for income splits (the author received less than the gross amount)
- Settlements are NOT created for transfers (same-user or cross-user)
- `TransactionService` gains access to `SettlementService` via the `Services` struct (already wired)
- Existing integration tests in `transaction_create_test.go` are updated to assert settlements are created (or not) for each scenario

## Capabilities

### New Capabilities

- `settlement-creation-on-split`: Settlement rows are automatically created during transaction create when split settings produce linked transactions for another user

### Modified Capabilities

<!-- No existing spec-level requirements are changing -->

## Impact

- `internal/service/transaction_create.go` — add settlement creation step inside `createTransactions` after each transaction is persisted
- `internal/service/structs.go` — ensure `transactionService` references `services.Settlement`
- `internal/service/test_setup_with_db.go` — wire `SettlementRepository` and `SettlementService` into the test suite
- `internal/service/transaction_create_test.go` — add settlement assertions to split tests; assert no settlement for non-split tests
