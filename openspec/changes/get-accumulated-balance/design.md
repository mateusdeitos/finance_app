## Context

The app already stores transactions with an `operation_type` column (`credit`/`debit`) and `amount` in cents (always positive). The existing `Search` endpoint retrieves full transaction rows; there is no aggregate query path today.

When a split expense is created, a `settlement` row is created for the **author** in the `settlements` table. Its `account_id` is the author's account as defined in the `user_connection` entity (`from_account_id` if the author is `from_user_id`, `to_account_id` if the author is `to_user_id`) — not necessarily the account used in the split transaction itself. `type = credit` for expense splits (counterpart owes the author), `type = debit` for income splits. `source_transaction_id` points to the author's transaction; `parent_transaction_id` points to the counterpart's linked transaction. Settlements have no `date` column — period filtering uses `source_transaction.date`.

The end-of-month acerto de contas is a plain manually-created transfer transaction (type=transfer); it is not tracked in the `settlements` table.

The existing `Search` filter has a `NOT EXISTS` subquery on `linked_transactions` that was added when splits created two linked_transaction rows (one per user). That is no longer the case — splits now create one linked_transaction row and a settlement for the author. The connected user's transaction has a different `user_id` and is naturally excluded by the `WHERE user_id = ?` filter. The balance query does not need to replicate the old exclusion logic.

## Goals / Non-Goals

**Goals:**
- Return a single net balance figure (credits − debits, in cents) for a given month/year period.
- Support optional filters: `account_id[]`, `category_id[]`, `tag_id[]`.
- Include settlement amounts (from `settlements` table) in the balance — always. Settlements represent real pending obligations (what the counterpart owes or is owed). `settlement.type` determines direction.
- Execute as two SQL aggregate queries summed in the service layer (transaction aggregate + settlement aggregate).
- Add a DB index to make the transaction aggregate query fast.

**Non-Goals:**
- Per-account or per-category breakdowns (single total only).
- Historical cumulative balance across multiple months.
- Real-time balance updates / websockets.

## Decisions

### Decision 1: SUM() aggregate in the repository layer, not application layer

**Chosen**: Add `GetBalance(ctx, BalanceFilter) (*BalanceResult, error)` to `TransactionRepository`. It runs a single `UNION ALL` raw SQL query that combines the transaction aggregate and the settlement aggregate in one DB round-trip.

**Alternatives considered**:
- **Reuse `Search` + sum in service**: Fetches full rows only to discard them. Wasteful for large datasets.
- **Materialized view**: Doesn't support dynamic per-request filters (account, category, tag). Would need refresh on every transaction write.
- **Running balance column**: Very complex to maintain correctly across inserts, updates, soft-deletes, and recurrence operations.

**Rationale**: A single aggregate SQL query per source is correct, efficient, and easy to maintain.

### Decision 2: UNION ALL in a single query (transactions leg + settlements leg)

**Chosen**: A single raw SQL query using `UNION ALL` combines both sources. The outer query sums the `amount` column from the combined result set.

**Alternatives considered**:
- **Two separate queries summed in service**: Extra DB round-trip, and the service would need to know about both repos.
- **LEFT JOIN on settlements**: Produces a multiplicative join that inflates amounts when a transaction has multiple settlements.

**Rationale**: One round-trip, clean separation of each leg's WHERE conditions, and the service stays simple (one repo call).

### Decision 3: Settlement period filtering via `source_transaction.date`

**Chosen**: `JOIN transactions t ON t.id = settlements.source_transaction_id WHERE t.date >= ? AND t.date <= ?`

**Alternatives considered**:
- **`settlements.created_at`**: Closest proxy for creation time but is a timestamp, not a business date, and not indexed.
- **`parent_transaction.date`**: Would use the counterpart's linked transaction date, which is the same date in practice but semantically less correct (the obligation belongs to the author's expense date).

**Rationale**: The settlement obligation is incurred when the original split expense is recorded, so the source transaction's date is the semantically correct anchor.

### Decision 4: Add composite index `(user_id, date) INCLUDE (operation_type, amount)`

**Chosen**: New migration adding `CREATE INDEX idx_transactions_balance ON transactions(user_id, date) INCLUDE (operation_type, amount) WHERE deleted_at IS NULL`.

**Rationale**: Enables index-only scans for the monthly aggregate. The partial index on `deleted_at IS NULL` reduces index size since soft-deleted rows are never summed. Existing `(user_id, account_id)` and `date` indexes are separate and require a less efficient bitmap AND scan for this query.

### Decision 5: `category_id[]` and `tag_id[]` filters apply to transactions only

**Chosen**: Settlements are not filtered by category or tag (they have no such columns). These filters only narrow the transaction portion of the balance.

**Rationale**: The `settlements` table has no category or tag associations. Filtering settlements by them would be meaningless.

### Decision 6: New `BalanceFilter` domain type

**Chosen**: `BalanceFilter { UserID int; Period Period; AccountIDs []int; CategoryIDs []int; TagIDs []int }`.

**Rationale**: `TransactionFilter` carries many fields irrelevant to balance (pagination, sort, IDs, etc.) that could accidentally break the aggregate query. A purpose-built filter is cleaner and safer.

### Decision 7: Extend `TransactionService` (not a new `BalanceService`)

**Chosen**: `GetBalance` added to `TransactionService` interface. The service orchestrates both repository calls.

**Rationale**: Balance is a derived view of transactions. A separate service would add indirection with no benefit.

## Risks / Trade-offs

- **Tag filter forces a JOIN on transactions**: When `tag_id[]` is specified, the transaction query must JOIN `transaction_tags`. This changes it from an index-only scan to a join, but `(user_id, date)` is still the primary filter. Acceptable.
- **SUM on NULL**: If no rows exist for the period, `SUM()` returns NULL. [Mitigation]: Use `COALESCE(SUM(...), 0)` in both queries.
- **Settlement query joins `source_transaction`**: Requires the `transactions` table to be readable in the settlement query. No cross-schema issues, but the settlement aggregate is slightly more expensive than a plain scan. [Mitigation]: An index on `settlements(user_id, source_transaction_id)` and the existing `idx_transactions_date` cover this join efficiently.

## Migration Plan

1. Deploy the new composite index migration (non-blocking in Postgres — `CREATE INDEX CONCURRENTLY` if needed in production).
2. Deploy application code with new endpoint.
3. Rollback: drop the index; remove the route (no data changes).
