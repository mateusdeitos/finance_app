## Why

Shared expenses and incomes between connected users need a mechanism to track balance adjustments for the transaction author. Currently, when User1 splits an expense with User2, there is no record that offsets User1's balance to reflect that part of the cost is covered by User2.

## What Changes

- Introduce a `settlements` table and domain entity to track per-user balance adjustments arising from shared transactions
- A settlement is created for the transaction author whenever an expense or income is split with another user
- Settlements have a `type` (credit/debit), `amount`, `account_id`, `user_id`, and `parent_transaction_id` pointing to the counterpart's transaction
- Settlements are updated (type and amount) when the split configuration changes
- Settlements are deleted when the shared transaction is removed
- The transaction search response can optionally include settlements linked to the user's transactions

## Capabilities

### New Capabilities

- `settlements`: Full CRUD lifecycle for the settlement entity — domain model, GORM entity, repository (Search, Create, Update, Delete), and service (Search, SearchOne, Create, Update, Delete)

### Modified Capabilities

<!-- No existing spec-level requirements are changing -->

## Impact

- New database migration: `settlements` table with FK constraints to `users`, `accounts`, and `transactions`
- New files: `internal/domain/settlement.go`, `internal/entity/settlement.go`, `internal/repository/settlement_repository.go`, `internal/service/settlement_service.go`
- `internal/repository/interfaces.go` — add `SettlementRepository` interface
- `internal/service/interfaces.go` — add `SettlementService` interface
- `mocks/` — regenerate after adding new interfaces
- `cmd/server/main.go` — wire up settlement repository and service
