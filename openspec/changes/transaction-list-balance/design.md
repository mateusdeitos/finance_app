## Context

The transactions list screen currently shows a flat, date-grouped list of transactions for a given month. Users have no way to see their financial position at the start of the month or how each group of transactions moves that balance. The backend already exposes everything needed:

- `GET /api/transactions/balance?accumulated=true` returns the cumulative balance through the end of any given period.
- `GET /api/transactions` returns the full flat transaction list for a period.

This is a frontend-only change.

## Goals / Non-Goals

**Goals:**
- Show the period's opening balance (balance as of end of previous month) in the UI.
- Allow the user to toggle accumulated mode to include/exclude prior-period history in the opening balance.
- Show a loading skeleton while the opening balance is loading.
- Show per-group totals and running balances in each date group of the transaction list.

**Non-Goals:**
- No backend changes; no new API endpoints.
- No server-side grouping or aggregation; all subgroup math is client-side.
- No changes to how transactions are fetched or paginated.

## Decisions

### Decision: Derive period opening balance from existing balance endpoint
**Choice**: Call `GET /api/transactions/balance` with `month = current_month - 1` (adjusting year on January wrap) and `accumulated=true` to get the cumulative balance through the end of the previous month.
**Alternative considered**: Add a dedicated backend parameter for "period start balance". Rejected — unnecessary backend work; the existing endpoint already models this correctly.

### Decision: Compute subgroup balances client-side
**Choice**: Once the transaction list is loaded, group by date client-side (already done for display), then accumulate: `running_balance[i] = opening_balance + sum(totals[0..i])`.
**Alternative considered**: A new backend aggregation endpoint. Rejected — the full transaction list is already in memory; a round-trip would add latency with no benefit.

### Decision: Independent loading state for opening balance
**Choice**: The balance fetch and transaction list fetch are fired in parallel. The transaction list renders immediately when ready; the balance area shows a skeleton until its request resolves.
**Rationale**: Avoids blocking the list on the balance call. Users can browse transactions even if the balance is slow.

### Decision: Toggle stored in UI state (not persisted)
**Choice**: The accumulated/period-only toggle is ephemeral UI state, reset to default (non-accumulated) on each session.
**Alternative considered**: Persist toggle preference. Deferred — not requested in the issue.

## Risks / Trade-offs

- **Month boundary edge case** → When `current_month = 1`, previous month is `month=12, year=current_year-1`. Must be handled explicitly in the date arithmetic.
- **Balance divergence if filters differ** → If the transaction list is filtered (by account, category, etc.), the opening balance call must use the same filters to stay consistent. Care needed to pass identical filter params to both calls.
- **Accumulated toggle UX** → If the toggle switches mid-view, the running balances in each group will jump. Acceptable; add a brief re-fetch indicator.
