## ADDED Requirements

### Requirement: Filter state in URL search params
All active filter values SHALL be stored as TanStack Router search params so that filtered views are bookmarkable and survive page reload.

#### Scenario: Default params
- **WHEN** the page loads with no search params
- **THEN** defaults are applied: current month/year, empty query, empty tag/category/account/type arrays, `groupBy=date`

#### Scenario: Params survive reload
- **WHEN** a user reloads the page with filter params in the URL
- **THEN** the same filters are applied without user interaction

### Requirement: Period navigator
The filter bar SHALL include a period navigator displaying the current month and year (MM/YYYY) with controls to navigate to the previous or next month.

#### Scenario: Navigate to previous month
- **WHEN** the user clicks the previous-month button
- **THEN** the `month` and `year` search params update to the prior month and a new fetch is triggered

#### Scenario: Navigate to next month
- **WHEN** the user clicks the next-month button
- **THEN** the `month` and `year` search params update to the next month

#### Scenario: Direct period input
- **WHEN** the user directly edits the MM/YYYY display and enters a valid period
- **THEN** the `month` and `year` params update accordingly

### Requirement: Text search filter
The filter bar SHALL include a text input that filters transactions by description client-side (no additional API call).

#### Scenario: Text input filters rows
- **WHEN** the user types in the search input
- **THEN** only transactions whose description contains the input text (case-insensitive) are shown in the list

### Requirement: Tag filter
The filter bar SHALL include a tag filter button that opens a popover with available tags as selectable pills.

#### Scenario: Tag selection
- **WHEN** the user selects one or more tags in the popover
- **THEN** `tagIds` search params update and the transaction fetch includes those tag IDs

#### Scenario: Active indicator
- **WHEN** one or more tags are selected
- **THEN** the filter button shows a count badge

### Requirement: Category filter
The filter bar SHALL include a category filter button that opens a popover with a hierarchical list of categories, each with a checkbox.

#### Scenario: Category selection
- **WHEN** the user checks one or more categories
- **THEN** `categoryIds` search params update and the fetch includes those category IDs

#### Scenario: Active indicator
- **WHEN** one or more categories are selected
- **THEN** the filter button shows a count badge

### Requirement: Account filter
The filter bar SHALL include an account filter button that opens a popover with accounts listed in two sections: "Minhas contas" (accounts without `user_connection`) and "Contas compartilhadas" (accounts with `user_connection`).

#### Scenario: Account selection
- **WHEN** the user checks one or more accounts
- **THEN** `accountIds` search params update and the fetch includes those account IDs

#### Scenario: Active indicator
- **WHEN** one or more accounts are selected
- **THEN** the filter button shows a count badge

### Requirement: Advanced type filter
The filter bar SHALL include an advanced filters button that opens a popover with checkboxes for transaction types (Apenas despesas, Apenas receitas, Apenas transferências).

#### Scenario: Type selection
- **WHEN** the user checks one or more types
- **THEN** `types` search params update (`expense`, `income`, `transfer`) and the fetch is filtered accordingly

### Requirement: Grouping selector
The filter bar SHALL include a grouping selector (Data / Categoria / Conta) that controls how transactions are grouped in the list.

#### Scenario: Change grouping
- **WHEN** the user selects a grouping option
- **THEN** `groupBy` search param updates and the list re-groups client-side without a new fetch

### Requirement: Desktop filter bar layout
On desktop viewports the filter bar SHALL render all filter controls in a wrapping flex row with no horizontal scrollbar.

#### Scenario: Overflow wraps
- **WHEN** the viewport is wide enough for a desktop layout and there are many filter controls
- **THEN** controls wrap to a new line instead of overflowing horizontally

### Requirement: Mobile filter bar layout
On mobile viewports the period navigator SHALL be pinned to the top of the page and all other filter controls SHALL be accessible inside a bottom Drawer toggled by a floating button.

#### Scenario: Filter drawer toggle
- **WHEN** the user taps the floating filter button on mobile
- **THEN** a bottom Drawer opens containing all filter controls in a column layout

#### Scenario: Period navigator always visible on mobile
- **WHEN** the page renders on a mobile viewport
- **THEN** the period navigator is visible at the top of the page regardless of Drawer state
