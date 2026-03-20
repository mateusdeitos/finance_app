## ADDED Requirements

### Requirement: Root redirects to transactions
The app root (`/`) SHALL redirect users to `/transactions` so they land on the transactions page directly.

#### Scenario: Unauthenticated root visit
- **WHEN** an unauthenticated user visits `/`
- **THEN** they are redirected to `/login` (auth guard runs first)

#### Scenario: Authenticated root visit
- **WHEN** an authenticated user visits `/`
- **THEN** they are redirected to `/transactions`

### Requirement: Transactions page fetches full month
The transactions page SHALL fetch all transactions for the selected period (month + year) in a single API request with `with_settlements=true`.

#### Scenario: Initial load
- **WHEN** the page mounts with no search params
- **THEN** it fetches the current month's transactions from `GET /api/transactions`

#### Scenario: Period change
- **WHEN** the user navigates to a different month
- **THEN** a new fetch is triggered for that month and the list updates

### Requirement: Transactions grouped by selected dimension
The transaction list SHALL group transactions client-side according to the active `groupBy` param (default: `date`).

#### Scenario: Group by date
- **WHEN** `groupBy` is `date`
- **THEN** transactions are grouped by their date (dd/MM/yyyy) in descending order

#### Scenario: Group by category
- **WHEN** `groupBy` is `category`
- **THEN** transactions are grouped by category name; uncategorized transactions form their own group

#### Scenario: Group by account
- **WHEN** `groupBy` is `account`
- **THEN** transactions are grouped by account name

### Requirement: Transaction row columns
Each transaction row SHALL display four logical columns: (1) date + description + tags, (2) category, (3) account, (4) amount.

#### Scenario: Tags overflow
- **WHEN** a transaction has more than 3 tags
- **THEN** the first 3 tags are shown as pills and a `(...)` label indicates more

#### Scenario: Amount formatting
- **WHEN** a transaction amount is displayed
- **THEN** it shows in Brazilian Real format (`R$ 1.234,56`) with `+` for credit and `-` for debit

#### Scenario: Column hidden when grouping matches
- **WHEN** `groupBy` is `date`
- **THEN** the date sub-label is hidden from individual rows (shown in group header only)
- **WHEN** `groupBy` is `category`
- **THEN** the category column is hidden from individual rows
- **WHEN** `groupBy` is `account`
- **THEN** the account column is hidden from individual rows

### Requirement: Transaction status indicators
Each row SHALL show indicator icons for special transaction states.

#### Scenario: Recurrence indicator
- **WHEN** `transaction_recurrence_id` is non-null
- **THEN** a repeat icon is shown on the row

#### Scenario: Cross-user linked transaction indicator
- **WHEN** `linked_transactions` is non-empty
- **THEN** a users icon is shown on the row

#### Scenario: Settlement indicator
- **WHEN** `settlements_from_source` is non-empty
- **THEN** a receipt/link icon is shown on the row

### Requirement: Empty state
The transaction list SHALL show an empty state message when there are no transactions for the selected period and filters.

#### Scenario: No transactions
- **WHEN** the API returns an empty array
- **THEN** a centered message is displayed (e.g., "Nenhuma transação encontrada")
