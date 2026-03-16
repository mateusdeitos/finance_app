## Context

`Account` has no concept of a starting balance. `GetBalance` today computes a net figure for a single calendar period. Users who already had money in an account before they started using the app have no way to represent that, so the "accumulated" view would always show an incorrect total.

The `accumulated` flag on `GetBalance` is meaningless without a stored initial balance — both features must ship together.

Connection accounts are managed automatically (one per side of a user connection); they represent shared-expense offsets rather than real bank accounts, so initial balance doesn't apply to them.

## Goals / Non-Goals

**Goals:**
- Store `initial_balance` (int64 cents, default 0) on `accounts`.
- Allow `initial_balance` to be set via create/update account endpoints, blocked for connection accounts.
- Add `accumulated` bool to `BalanceFilter` / `GET /api/transactions/balance`.
- `accumulated=true` returns: SUM(initial_balance of relevant accounts) + SUM of all transactions+settlements up to and including the end of the requested period (no lower date bound).
- `accumulated=false` (default): existing single-period behaviour, unchanged.

**Non-Goals:**
- Per-period balance history or balance-over-time graph endpoint.
- Migrating historical initial balances from an external source.
- Changing the meaning of `BalanceResult` (still a single `balance int64`).

## Decisions

### D1 — Store initial_balance in cents on accounts

Same int64-cents convention as `transactions.amount`. Avoids float precision issues and keeps the type consistent across the codebase.

*Alternatives considered:* float64 — rejected (precision loss); separate `account_balance_adjustments` table — overengineered for a static initial value.

### D2 — Two-query approach for accumulated balance

When `accumulated=true` the service makes two calls to the repository:
1. `accountRepo.SumInitialBalance(ctx, userID, accountIDs)` — returns the sum of `initial_balance` across relevant accounts.
2. `transactionRepo.GetBalance(ctx, filter)` — existing UNION ALL query with the start-date constraint removed (only end date applied).

The two results are summed in the service layer.

*Alternatives considered:* Single SQL query with a subquery joining accounts — more complex, harder to test in isolation, and the initial-balance lookup is trivially fast.

### D3 — No lower date bound when accumulated=true

When `accumulated=true` the transaction/settlement query uses only `date <= period.EndDate()`. All recorded history is included, not just history from some "account opening date".

*Alternatives considered:* Store an "opened on" date per account and use it as the lower bound — adds schema complexity without clear user value; users can just zero out history before their tracking start by setting the initial balance.

### D4 — Validate in service, not DB constraint

Connection accounts are identified by the presence of a row in `user_connections` that references their `account_id` (`from_account_id` or `to_account_id`). The service rejects `initial_balance != 0` for such accounts at create/update time. The DB default of 0 is enforced by the migration.

*Alternatives considered:* DB trigger — too much logic in the database layer; not idiomatic for this codebase.

### D5 — account filter applies to initial_balance sum

If `AccountIDs` is specified in the filter, only those accounts contribute their `initial_balance` to the accumulated total. If no `AccountIDs` filter is given, all accounts owned by the user are summed.

This keeps the accumulated balance consistent with the per-account view: filtering by account1 shows accumulated balance for account1 only.

## Risks / Trade-offs

- **Risk**: Large transaction history for `accumulated=true` with no account filter could be slow.
  → Mitigation: existing index on `(user_id, date, deleted_at)` covers the query; the settlement join is bounded by `source_transaction_id`. Monitor query plans if needed.

- **Risk**: Connection accounts could accidentally get a non-zero `initial_balance` via a direct DB insert or a future code path.
  → Mitigation: Default 0 on the column plus service-layer validation. A DB check constraint `initial_balance >= 0` can be added as an extra guard.

## Migration Plan

1. Add migration: `ALTER TABLE accounts ADD COLUMN initial_balance bigint NOT NULL DEFAULT 0;`
2. No data backfill needed — all existing accounts default to 0.
3. Rollback: `ALTER TABLE accounts DROP COLUMN initial_balance;` — non-destructive, existing balances would be lost but that data doesn't exist yet.
