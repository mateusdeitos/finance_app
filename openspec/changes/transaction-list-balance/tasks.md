## 1. Active Filters Hook

- [x] 1.1 Create a dedicated `useActiveFilters` hook that exposes the currently active transaction list filters (`account_id[]`, `category_id[]`, `tag_id[]`, etc.) as a single stable object
- [x] 1.2 Replace any direct filter prop-drilling or inline filter reads in the transaction list with `useActiveFilters`

## 2. Opening Balance Fetch

- [x] 2.1 Add a `useOpeningBalance` hook that consumes `useActiveFilters`, accepts the current period, derives the previous month/year, and calls `GET /api/transactions/balance` with `accumulated=true` (or `false` when toggle is on) and the active filters
- [x] 2.2 Handle January wrap-around: when `current_month = 1`, request `month=12, year=current_year-1`

## 3. Accumulated Toggle

- [x] 3.1 Add a toggle control below the opening balance display; default state is off (accumulated mode)
- [x] 3.2 Wire toggle state to `useOpeningBalance`: off → `accumulated=true`, on → `accumulated=false`
- [x] 3.3 Re-fetch the opening balance and recalculate all group running balances when the toggle changes

## 4. Loading Skeleton

- [x] 4.1 Render a skeleton placeholder in the opening balance area while the balance request is in flight
- [x] 4.2 Replace the skeleton with the formatted balance value on success
- [x] 4.3 Verify the transaction list renders independently and does not block on the balance request

## 5. Per-Group Totals and Running Balances

- [x] 5.1 For each date group in the existing transaction list, compute the group's net total (sum of credit amounts minus sum of debit amounts)
- [x] 5.2 Compute running balances: `running_balance[i] = opening_balance + sum(net_totals[0..i])`
- [x] 5.3 Display the group net total and running balance in each group header
- [x] 5.4 Recalculate running balances whenever the opening balance value changes (e.g., after toggle or filter change)
