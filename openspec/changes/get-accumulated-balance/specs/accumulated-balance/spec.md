## ADDED Requirements

### Requirement: BalanceFilter and BalanceResult domain types
The system SHALL define a `BalanceFilter` struct in `internal/domain/` with fields: `AccountIDs []int`, `CategoryIDs []int`, `TagIDs []int`. The system SHALL define a `BalanceResult` struct with field: `Balance int64` (net balance in cents, positive = credit surplus, negative = debit surplus). `settlement.account_id` is the author's account from the `user_connection` entity (`from_account_id` or `to_account_id`), so filtering settlements by `account_id[]` correctly scopes them to connection accounts.

#### Scenario: BalanceFilter is constructable
- **WHEN** a `BalanceFilter` is instantiated with account, category, and tag IDs
- **THEN** all fields are set correctly

#### Scenario: BalanceResult holds a signed integer
- **WHEN** a `BalanceResult` is populated with a negative balance
- **THEN** the `Balance` field is a negative int64 representing the debit surplus

---

### Requirement: TransactionRepository GetBalance method
The system SHALL add a `GetBalance(ctx context.Context, filter domain.BalanceFilter) (*domain.BalanceResult, error)` method to the `TransactionRepository` interface and its implementation. The implementation SHALL execute a single SQL aggregate: `SELECT COALESCE(SUM(CASE WHEN operation_type = 'credit' THEN amount ELSE -amount END), 0) FROM transactions WHERE deleted_at IS NULL AND ...`. It SHALL apply `user_id`, date range (start/end of period), `account_id IN`, `category_id IN`, and `tag_id IN` filters when provided. No linked-transaction exclusion subquery is required: connected users' split transactions have a different `user_id` and are already excluded by the `user_id` filter.

#### Scenario: Balance with no transactions returns zero
- **WHEN** `GetBalance` is called for a period with no matching transactions
- **THEN** `BalanceResult.Balance` is `0`

#### Scenario: Balance sums credits and debits correctly
- **WHEN** there are income transactions totaling 10000 cents and expense transactions totaling 6000 cents in the period
- **THEN** `BalanceResult.Balance` is `4000`

#### Scenario: Settlement transactions are excluded
- **WHEN** a transfer transaction exists whose ID is referenced as `parent_transaction_id` in the settlements table
- **THEN** that transaction's amount does NOT contribute to the balance

#### Scenario: Split counterpart transaction is not double-counted
- **WHEN** User1 splits an expense with User2 (User2's linked transaction has user_id=User2)
- **THEN** only User1's transaction contributes to User1's balance (User2's linked transaction is excluded by the user_id filter)

#### Scenario: AccountIDs filter restricts results
- **WHEN** `BalanceFilter.AccountIDs` is `[1, 2]`
- **THEN** only transactions with `account_id IN (1, 2)` are summed

#### Scenario: CategoryIDs filter restricts results
- **WHEN** `BalanceFilter.CategoryIDs` is `[5]`
- **THEN** only transactions with `category_id = 5` are summed

#### Scenario: TagIDs filter restricts results
- **WHEN** `BalanceFilter.TagIDs` is `[3]`
- **THEN** only transactions tagged with tag_id 3 are summed

---

### Requirement: DB index for balance query performance
The system SHALL add a Goose SQL migration that creates a partial composite index: `CREATE INDEX idx_transactions_balance ON transactions(user_id, date) INCLUDE (operation_type, amount) WHERE deleted_at IS NULL`. This index enables efficient aggregate queries for monthly balance lookups by user.

#### Scenario: Migration applies cleanly
- **WHEN** the migration is run against the database
- **THEN** the index `idx_transactions_balance` exists on the transactions table

---

### Requirement: TransactionService GetBalance method
The system SHALL add a `GetBalance(ctx context.Context, userID int, period domain.Period, filter domain.BalanceFilter) (*domain.BalanceResult, error)` method to the `TransactionService` interface and its implementation. The service SHALL set `filter.UserID` from `userID` before delegating to the repository.

#### Scenario: Service delegates to repository with correct user scoping
- **WHEN** `GetBalance` is called with `userID = 42` and a valid period
- **THEN** the repository `GetBalance` is called with filters scoped to user 42

#### Scenario: Service returns error if period is invalid
- **WHEN** `GetBalance` is called with an invalid `Period` (month = 0)
- **THEN** an error is returned and no repository call is made

---

### Requirement: GET /api/transactions/balance endpoint
The system SHALL register a `GET /api/transactions/balance` route behind the existing JWT authentication middleware. The handler SHALL extract `user_id` from the request context (same as other handlers). It SHALL parse `month` and `year` as integers from query params (returning 400 on invalid values), construct a `domain.Period`, and validate it with `period.IsValid()`. It SHALL bind optional `account_id[]`, `category_id[]`, `tag_id[]` query params into a `BalanceFilter`. It SHALL call `transactionService.GetBalance` and return the result as JSON with HTTP 200.

#### Scenario: Valid request returns balance JSON
- **WHEN** `GET /api/transactions/balance?month=3&year=2026` is called by an authenticated user
- **THEN** HTTP 200 is returned with body `{"balance": <int64>}`

#### Scenario: Missing month returns 400
- **WHEN** `GET /api/transactions/balance?year=2026` is called (no month param)
- **THEN** HTTP 400 is returned

#### Scenario: Invalid month returns 400
- **WHEN** `GET /api/transactions/balance?month=13&year=2026` is called
- **THEN** HTTP 400 is returned

#### Scenario: Optional filters are applied when provided
- **WHEN** `GET /api/transactions/balance?month=3&year=2026&account_id[]=1&tag_id[]=2` is called
- **THEN** the balance only includes transactions matching account 1 and tag 2

#### Scenario: Unauthenticated request returns 401
- **WHEN** `GET /api/transactions/balance` is called without a valid JWT
- **THEN** HTTP 401 is returned
