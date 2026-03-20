## 0. Setup

- [x] 0.1 Create a new git worktree from `main` at a sibling directory for isolated development:
  `git worktree add ../finance_app_listagem -b feat/transaction-listing`

## 1. Routing & Query Keys

- [x] 1.1 Update `frontend/src/routes/index.tsx` to redirect to `/transactions` (replace Hello World render with `<Navigate to="/transactions" />` or a `beforeLoad` redirect)
- [x] 1.2 Extend `frontend/src/utils/queryKeys.ts` to add `Transactions`, `Accounts`, `Categories`, `Tags` keys

## 2. API Clients

- [x] 2.1 Create `frontend/src/api/transactions.ts` — `fetchTransactions(params: TransactionParams): Promise<Transaction[]>` using `GET /api/transactions` with `month`, `year`, `account_id[]`, `category_id[]`, `tag_id[]`, `type[]`, `description.query`, `with_settlements=true`
- [x] 2.2 Create `frontend/src/api/accounts.ts` — `fetchAccounts(): Promise<Account[]>` using `GET /api/accounts`
- [x] 2.3 Create `frontend/src/api/categories.ts` — `fetchCategories(): Promise<Category[]>` using `GET /api/categories`
- [x] 2.4 Create `frontend/src/api/tags.ts` — `fetchTags(): Promise<Tag[]>` using `GET /api/tags`
- [x] 2.5 Define TypeScript types for `Transaction`, `Account`, `Category`, `Tag`, `UserConnection`, `TransactionRecurrence`, `Settlement` in `frontend/src/types/transactions.ts` matching backend JSON responses

## 3. Query Hooks

- [x] 3.1 Create `frontend/src/hooks/useTransactions.ts` — `useQuery` hook wrapping `fetchTransactions`, keyed by `[QueryKeys.Transactions, params]`
- [x] 3.2 Create `frontend/src/hooks/useAccounts.ts` — `useQuery` hook wrapping `fetchAccounts`, keyed by `[QueryKeys.Accounts]`
- [x] 3.3 Create `frontend/src/hooks/useCategories.ts` — `useQuery` hook wrapping `fetchCategories`, keyed by `[QueryKeys.Categories]`
- [x] 3.4 Create `frontend/src/hooks/useTags.ts` — `useQuery` hook wrapping `fetchTags`, keyed by `[QueryKeys.Tags]`

## 4. Utility Functions

- [x] 4.1 Create `frontend/src/utils/formatCents.ts` — `formatCents(amount: number, operationType: 'credit' | 'debit'): string` converts cents to `R$ 1.234,56` with `+`/`-` prefix
- [x] 4.2 Create `frontend/src/utils/groupTransactions.ts` — `groupTransactions(transactions: Transaction[], groupBy: 'date' | 'category' | 'account'): { key: string; label: string; transactions: Transaction[] }[]`

## 5. Period Navigator

- [x] 5.1 Create `frontend/src/components/transactions/PeriodNavigator.tsx` — renders prev-month button, editable MM/YYYY display (clicking opens a month/year picker or inline inputs), next-month button; reads `month`/`year` from search params and writes on change via `router.navigate`
- [x] 5.2 Create `frontend/src/components/transactions/PeriodNavigator.module.css` — horizontal layout, centered, compact

## 6. Filter Components

- [x] 6.1 Create `frontend/src/components/transactions/filters/TextSearch.tsx` — debounced text input, reads/writes `query` search param (300ms debounce)
- [x] 6.2 Create `frontend/src/components/transactions/filters/TagFilter.tsx` — Mantine Popover with tag pills (each tag is a `Badge`-style toggle); multi-select; reads/writes `tagIds` search param; shows count badge on button when filters active
- [x] 6.3 Create `frontend/src/components/transactions/filters/CategoryFilter.tsx` — Mantine Popover with a recursive `CategoryNode` component rendering Mantine `Checkbox` per category, children indented; reads/writes `categoryIds` search param; shows count badge when active
- [x] 6.4 Create `frontend/src/components/transactions/filters/AccountFilter.tsx` — Mantine Popover with two labeled sections ("Minhas contas" / "Contas compartilhadas"); accounts without `user_connection` in first section, accounts with it in second; Mantine `Checkbox` per account; reads/writes `accountIds` search param
- [x] 6.5 Create `frontend/src/components/transactions/filters/AdvancedFilter.tsx` — Mantine Popover with three Mantine `Checkbox` items (Apenas despesas, Apenas receitas, Apenas transferências); maps to `types` search param (`expense`, `income`, `transfer`)
- [x] 6.6 Create `frontend/src/components/transactions/filters/GroupBySelector.tsx` — Mantine `SegmentedControl` or `Select` for grouping (Data / Categoria / Conta); reads/writes `groupBy` search param

## 7. Filter Bar

- [x] 7.1 Create `frontend/src/components/transactions/TransactionFilters.tsx` — composes `TextSearch`, `TagFilter`, `CategoryFilter`, `AccountFilter`, `AdvancedFilter`, `GroupBySelector`; receives accounts/categories/tags as props (fetched by the page); accepts an `orientation` prop (`row` | `column`) for desktop vs mobile Drawer layout
- [x] 7.2 Create `frontend/src/components/transactions/TransactionFilters.module.css` — `display: flex; flex-wrap: wrap; gap: ...` for row orientation; `flex-direction: column` for column; no `overflow-x: scroll`

## 8. Transaction List

- [x] 8.1 Create `frontend/src/components/transactions/TransactionRow.tsx` — pseudo-table row with four columns:
  - Col 1: date (dd/MM/yyyy, small text) + description (bold) + up-to-3 tag pills with "(...)" overflow label
  - Col 2: category name (hidden when `groupBy === 'category'`)
  - Col 3: account name (hidden when `groupBy === 'account'`)
  - Col 4: formatted amount (`formatCents`)
  - Indicator icons (right-aligned or inline): repeat icon when `transaction_recurrence !== null`, people icon when `linked_transactions.length > 0`, receipt icon when `settlements_from_source.length > 0`
  - Date column hidden when `groupBy === 'date'`
- [x] 8.2 Create `frontend/src/components/transactions/TransactionRow.module.css` — CSS grid with 4 column tracks; responsive adjustments for mobile (stack or compress columns)
- [x] 8.3 Create `frontend/src/components/transactions/TransactionGroup.tsx` — renders a group header (`Text` with date/category/account label) followed by a list of `TransactionRow`
- [x] 8.4 Create `frontend/src/components/transactions/TransactionList.tsx` — receives `transactions`, `groupBy`, `accounts`, `categories`; calls `groupTransactions`; renders list of `TransactionGroup`; shows empty state (`Text` centered) when no transactions

## 9. Page Assembly

- [x] 9.1 Replace `frontend/src/routes/_authenticated.transactions.tsx` with the full page:
  - Define `validateSearch` schema (Zod) with defaults: `month` = current month, `year` = current year, `query = ''`, `tagIds = []`, `categoryIds = []`, `accountIds = []`, `types = []`, `groupBy = 'date'`
  - Fetch data: `useTransactions` (with all active search params mapped to API params), `useAccounts`, `useCategories`, `useTags`
  - Desktop layout (`useMediaQuery` or Mantine breakpoint): `PeriodNavigator` + `TransactionFilters` (row orientation) stacked above `TransactionList`
  - Mobile layout: `PeriodNavigator` pinned at top, `TransactionList` below, `ActionIcon` fixed at bottom-right (absolute/fixed position, Tabler `IconFilter`) that opens a Mantine `Drawer` (position="bottom") containing `TransactionFilters` (column orientation)

## 10. Validation

- [x] 10.1 Run `npm run build` inside `frontend/` — confirm zero TypeScript errors
- [ ] 10.2 Smoke test: root `/` redirects to `/transactions`
- [ ] 10.3 Smoke test: period navigator prev/next changes URL params and triggers a new API call
- [ ] 10.4 Smoke test: each filter popover opens, selections update URL params, transaction list re-fetches and filters
- [ ] 10.5 Smoke test: desktop filter bar wraps to multiple lines when narrow without horizontal scroll
- [ ] 10.6 Smoke test: mobile layout shows period navigator at top, floating filter button at bottom, Drawer opens with column-layout filters
- [ ] 10.7 Smoke test: grouping by category hides category column in rows; by account hides account column; by date hides date column
