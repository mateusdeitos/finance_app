## 1. Domain Types

- [x] 1.1 Add `BalanceFilter` struct to `internal/domain/` with fields `UserID *int`, `AccountIDs []int`, `CategoryIDs []int`, `TagIDs []int`, and `Period domain.Period`
- [x] 1.2 Add `BalanceResult` struct to `internal/domain/` with field `Balance int64`

## 2. Database Migration

- [x] 2.1 Create Goose migration `20260311000000_add_balance_index.sql` that adds `CREATE INDEX idx_transactions_balance ON transactions(user_id, date) INCLUDE (operation_type, amount) WHERE deleted_at IS NULL`

## 3. Repository

- [x] 3.1 Add `GetBalance(ctx context.Context, filter domain.BalanceFilter) (*domain.BalanceResult, error)` to `TransactionRepository` interface in `internal/repository/interfaces.go`
- [x] 3.2 Implement `GetBalance` in `internal/repository/transaction_repository.go` using a raw SQL aggregate with `COALESCE(SUM(CASE WHEN operation_type = 'credit' THEN amount ELSE -amount END), 0)`, applying date range, user_id, account_id, category_id, tag_id filters (no linked-transaction exclusion needed — connected user's tx has a different user_id)
- [x] 3.3 Regenerate mocks with `just generate-mocks`

## 4. Service

- [x] 4.1 Add `GetBalance(ctx context.Context, userID int, period domain.Period, filter domain.BalanceFilter) (*domain.BalanceResult, error)` to `TransactionService` interface in `internal/service/interfaces.go`
- [x] 4.2 Implement `GetBalance` in the transaction service (new file `internal/service/transaction_balance.go`): validate period, set `filter.UserID`, delegate to repository

## 5. Handler & Route

- [x] 5.1 Add `GetBalance` method to `TransactionHandler` in `internal/handler/transaction_handler.go`: parse `month`/`year`, validate period, bind `account_id[]`/`category_id[]`/`tag_id[]` query params, call service, return JSON 200
- [x] 5.2 Register `transactions.GET("/balance", transactionHandler.GetBalance)` in `cmd/server/main.go` (before the `/:id` route to avoid path conflict)

## 6. Tests

- [x] 6.1 Write integration test for `GetBalance` repository method covering: no transactions returns 0, mixed credits/debits returns correct net, settlement amounts included (credit and debit types), account/category/tag filters applied, split counterpart not double-counted
- [x] 6.2 Write unit/integration test for `GetBalance` service method covering: invalid period returns error, valid period delegates correctly with user scoping
