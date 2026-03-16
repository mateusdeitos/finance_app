## Why

Users need to know their net balance for a given month — the sum of all income minus all expenses — optionally filtered by account, category, or tag. Without this endpoint, clients must fetch all transactions and compute the balance client-side, which is wasteful and error-prone.

## What Changes

- Add `GET /api/transactions/balance` endpoint (authenticated) that returns the accumulated balance for a month/year period.
- Required query params: `month`, `year` (parsed same way as `Search`).
- Optional query params: `account_id[]`, `category_id[]`, `tag_id[]`.
- Settlement transfer transactions are excluded from the balance (they represent end-of-month accounting acertos, not real income/expenses).
- Add a new repository method `GetBalance` on `TransactionRepository` that executes a single aggregate SQL query using `SUM(CASE WHEN operation_type = 'credit' THEN amount ELSE -amount END)`, which is the correct approach given the existing `operation_type` column.
- Add a migration to create a composite index on `(user_id, date)` with `INCLUDE (operation_type, amount)` to make the aggregate query efficient.

## Capabilities

### New Capabilities
- `accumulated-balance`: Authenticated endpoint that queries net balance for a period with optional filters, excluding settlement transactions.

### Modified Capabilities

## Impact

- `backend/internal/domain/` — new `BalanceFilter` and `BalanceResult` types
- `backend/internal/repository/interfaces.go` — new `GetBalance` method on `TransactionRepository`
- `backend/internal/repository/transaction_repository.go` — implementation
- `backend/internal/service/interfaces.go` — new `GetBalance` method on `TransactionService`
- `backend/internal/service/transaction_*.go` — implementation
- `backend/internal/handler/transaction_handler.go` — new `GetBalance` handler method
- `backend/cmd/server/main.go` — register `GET /api/transactions/balance`
- `backend/mocks/` — regenerate mocks after interface changes
- New migration for composite index on `transactions(user_id, date) INCLUDE (operation_type, amount)`
