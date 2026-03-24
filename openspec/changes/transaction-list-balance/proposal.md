## Why

Users lack visibility into their financial position when browsing the transactions list. Adding an opening-balance indicator and per-group running balances gives users immediate context for how each day's transactions affect their overall standing without leaving the list view.

## What Changes

- Display the period's initial balance (opening balance) in the top-right corner of the transactions list, with a toggle to switch between accumulated mode (all history before the current period) and period-only mode.
- Show a loading skeleton on the balance area while the balance is being fetched.
- For each date-group in the list, display the group's total amount and a running balance: `period_initial_balance + sum(previous_groups) + current_group_total`.

All data required is already available:
- **Period initial balance**: call `GET /api/transactions/balance?accumulated=true` using `month = current_month - 1` and the same `year` (adjusting year when month wraps). This discards the `start_date` lower bound, giving the cumulative balance through the end of the previous month.
- **Subgroup totals and running balances**: computed client-side from the flat transaction list already returned by `GET /api/transactions`.

No backend changes are required.

## Capabilities

### New Capabilities

- `transaction-list-balance`: Frontend capability — period opening balance display with accumulated toggle, loading skeleton, and per-group running balance in the transaction list.

### Modified Capabilities

<!-- No existing spec-level requirements are changing. -->

## Impact

- Frontend only; no backend code changes.
- Requires two API calls on the transactions screen: the existing search call plus a balance call for the previous period with `accumulated=true`.
- UX: balance area shows a skeleton while the balance request is in flight, independently of the transaction list load state.
