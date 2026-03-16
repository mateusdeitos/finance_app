## 1. Database Migration

- [x] 1.1 Create migration file `migrations/20260312000000_add_initial_balance_to_accounts.sql` adding `initial_balance bigint NOT NULL DEFAULT 0` to `accounts` table

## 2. Domain & Entity Layer

- [x] 2.1 Add `InitialBalance int64` field to `domain.Account` struct in `internal/domain/account.go`
- [x] 2.2 Add `initial_balance` column field to `entity.Account` struct in `internal/entity/account.go`
- [x] 2.3 Update `entity.Account.ToDomain()` to map `InitialBalance`
- [x] 2.4 Update `entity.AccountFromDomain()` to map `InitialBalance`
- [x] 2.5 Add `Accumulated bool` field to `domain.BalanceFilter` in `internal/domain/balance.go`

## 3. Repository Layer

- [x] 3.1 Add `SumInitialBalance(ctx context.Context, userID int, accountIDs []int) (int64, error)` method to `AccountRepository` interface in `internal/repository/interfaces.go`
- [x] 3.2 Implement `SumInitialBalance` in `internal/repository/account_repository.go` — `SELECT COALESCE(SUM(initial_balance), 0) FROM accounts WHERE user_id = ?` with optional `AND id IN ?` when accountIDs is non-empty
- [x] 3.3 Update `GetBalance` in `internal/repository/transaction_repository.go` to skip the `date >= startDate` lower bound when `filter.Accumulated == true` (keep only `date <= endDate`)
- [x] 3.4 Regenerate mocks with `just generate-mocks` to pick up the new `SumInitialBalance` method

## 4. Service Layer

- [x] 4.1 Add `isConnectionAccount(ctx, account) bool` helper in `internal/service/account_service.go` that checks if the account is referenced as `from_account_id` or `to_account_id` in any `user_connection`
- [x] 4.2 Validate in `accountService.Create`: if `account.InitialBalance != 0`, reject with error if `isConnectionAccount` (connection accounts always have InitialBalance=0 on create; this guard applies if ever called via internal path)
- [x] 4.3 Validate in `accountService.Update`: if `account.InitialBalance != 0`, call `isConnectionAccount`; return validation error if true
- [x] 4.4 Update `GetBalance` in `internal/service/transaction_balance.go`: when `filter.Accumulated == true`, after calling `transactionRepo.GetBalance`, fetch `initialBalanceSum` via `accountRepo.SumInitialBalance(ctx, filter.UserID, filter.AccountIDs)` and add to result

## 5. Handler Layer

- [x] 5.1 Parse `accumulated` boolean query param in `internal/handler/transaction_handler.go` `GetBalance` method and set `filter.Accumulated`

## 6. Tests

- [x] 6.1 Add integration test `TestGetBalance_Accumulated_NoInitialBalance` — accumulated=true with no initial balance returns same result as summing all periods
- [x] 6.2 Add integration test `TestGetBalance_Accumulated_WithInitialBalance` — account has initial_balance=5000; accumulated=true returns 5000 + net of all transactions
- [x] 6.3 Add integration test `TestGetBalance_Accumulated_AccountFilter` — accumulated=true with account filter uses only that account's initial balance
- [x] 6.4 Add integration test `TestGetBalance_Accumulated_FalseIgnoresInitialBalance` — accumulated=false, account with initial_balance=99999 does not affect result
- [x] 6.5 Add integration test `TestGetBalance_Accumulated_SpansMultiplePeriods` — transactions in two different months; accumulated=true on the later month includes both months' transactions plus initial balance
- [x] 6.6 Add unit/integration test that `accountService.Update` rejects `initial_balance != 0` for a connection account
