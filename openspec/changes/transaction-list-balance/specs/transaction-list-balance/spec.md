## ADDED Requirements

### Requirement: Period opening balance is displayed
The transactions list screen SHALL display the period's opening balance (accumulated balance through the end of the previous month) in the top-right corner. The opening balance SHALL be fetched by calling `GET /api/transactions/balance` with the previous month's period and `accumulated=true`, applying the same account/category/tag filters as the active transaction list.

#### Scenario: Opening balance loads for current month
- **WHEN** the user navigates to the transactions list for a given month
- **THEN** the screen fires a balance request for the previous month with `accumulated=true` and the same active filters
- **AND** the result is displayed as the opening balance in the top-right corner

#### Scenario: Opening balance handles January wrap-around
- **WHEN** the current period is January of year Y
- **THEN** the opening balance request uses `month=12` and `year=Y-1`

#### Scenario: Opening balance respects active filters
- **WHEN** the user has filtered the transaction list by account IDs
- **THEN** the opening balance request passes the same `account_id[]` filter

### Requirement: Accumulated toggle controls opening balance mode
The transactions list SHALL include a toggle below the opening balance that switches between accumulated mode and period-only mode. When the toggle is **off** (default), the opening balance is derived from `accumulated=true` for the previous month. When the toggle is **on**, the opening balance is derived from `accumulated=false` for the previous month (transactions in the previous month only, no prior history).

#### Scenario: Toggle defaults to off (accumulated mode)
- **WHEN** the user opens the transactions list
- **THEN** the toggle is in the off position and the opening balance reflects the full accumulated history through the end of the previous month

#### Scenario: Toggle switched to on shows period-only prior balance
- **WHEN** the user switches the toggle to on
- **THEN** a new balance request is made for the previous month with `accumulated=false`
- **AND** the opening balance updates to reflect only the previous month's net balance

#### Scenario: Toggle switched back to off restores accumulated balance
- **WHEN** the user switches the toggle back to off
- **THEN** the opening balance returns to the accumulated value

### Requirement: Loading skeleton shown while opening balance is fetching
The balance area in the top-right corner SHALL display a loading skeleton component while the opening balance request is in flight, independently of the transaction list load state.

#### Scenario: Skeleton shown during balance fetch
- **WHEN** the opening balance request has been fired but not yet resolved
- **THEN** a skeleton placeholder is shown in place of the balance value

#### Scenario: Skeleton replaced on success
- **WHEN** the opening balance request resolves successfully
- **THEN** the skeleton is replaced with the formatted balance value

#### Scenario: Transaction list visible while balance loads
- **WHEN** the transaction list has loaded but the balance request is still in flight
- **THEN** the transaction list is visible and the balance area shows the skeleton (the list does not block on the balance)

### Requirement: Per-group total and running balance displayed
Each date group in the transaction list SHALL display the group's net total and a running balance. The running balance for group `i` SHALL be: `opening_balance + sum(net_totals of groups 0 through i)`. All calculations are performed client-side from the already-loaded transaction list.

#### Scenario: Running balance starts from opening balance
- **WHEN** the opening balance is 10000 cents and the first group has a net total of -2000 cents
- **THEN** the first group's running balance is 8000 cents

#### Scenario: Running balance accumulates across groups
- **WHEN** group 1 running balance is 8000 cents and group 2 has a net total of +5000 cents
- **THEN** group 2's running balance is 13000 cents

#### Scenario: Running balance updates when toggle changes
- **WHEN** the user switches the accumulated toggle
- **THEN** all group running balances are recalculated using the new opening balance
