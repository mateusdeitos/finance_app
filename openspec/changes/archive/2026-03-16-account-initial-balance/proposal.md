## Why

Users need to track their real financial position from day one — not just transactions entered into the app. Without an initial balance, the balance shown in the app won't match reality for accounts that already had funds before the user started tracking. This is a baseline requirement before accumulated balance views become meaningful.

## What Changes

- Add `initial_balance` field (int64, cents) to the `accounts` table, defaulting to 0.
- Expose `initial_balance` on account create and update endpoints (only for manually created accounts, not connection accounts).
- Add `accumulated` boolean flag to the `GET /api/transactions/balance` request.
  - `accumulated = false` (default): returns balance for the given month/year period only (existing behavior).
  - `accumulated = true`: returns `initial_balance` of filtered accounts + sum of all transaction/settlement balances from the earliest recorded date up to and including the end of the requested period.

## Capabilities

### New Capabilities

- `account-initial-balance`: Setting and storing an initial balance on manually created accounts; validation that connection accounts cannot have an initial balance set.
- `accumulated-balance`: GetBalance with `accumulated=true` flag — computes running total from initial balance through all periods up to the requested one.

### Modified Capabilities

- (none)

## Impact

- `internal/domain/account.go`: add `InitialBalance int64` field.
- `internal/entity/account.go`: add `initial_balance` GORM column.
- `migrations/`: new SQL migration adding `initial_balance bigint NOT NULL DEFAULT 0` to `accounts`.
- `internal/repository/account_repository.go`: persist and return `initial_balance`.
- `internal/service/account_service.go`: validate that connection accounts cannot have `initial_balance != 0` set.
- `internal/domain/transaction.go`: add `Accumulated bool` to `BalanceFilter`.
- `internal/repository/transaction_repository.go`: extend `GetBalance` query — when `accumulated=true`, remove the period date filter and add initial-balance aggregation.
- `internal/service/transaction_balance.go`: pass `accumulated` flag through to repository; add initial balance lookup when `accumulated=true`.
- `internal/handler/transaction_handler.go`: parse `accumulated` query param.
