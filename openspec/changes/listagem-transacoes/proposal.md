## Why

The transactions page currently shows only a placeholder ("Em breve...") and the app root (`/`) shows a "Hello World" page with no navigation. Users have no way to view, browse, or filter their financial transactions — the core value of the app — making the frontend functionally empty for real usage.

## What Changes

- Replace the `/` Hello World page with a redirect to `/transactions` so the app opens directly on the transactions view
- Implement a full transaction listing page at `/transactions` with:
  - Period navigator (MM/YYYY) pinned to top on mobile, inline on desktop
  - Filter bar with: text search, tag filter (popover with pills), category filter (popover with tree + checkboxes), account filter (popover split by own vs connected users), advanced filters (type: expense/transfer), grouping selector (by date/category/account)
  - Filter bar wraps on overflow on desktop; on mobile it lives inside a bottom Drawer toggled by a floating button
  - Transaction list rendered as a pseudo-table grouped by the selected dimension (date by default)
  - Each row shows: date+description+tags (up to 3), category, account, amount; indicators for recurrence, linked cross-user transactions, and settlements
  - All data fetched from existing backend endpoints; no backend changes required

## Capabilities

### New Capabilities

- `transaction-list`: Full transaction listing page with period-based data fetching, grouping, and display of transaction metadata (recurrence, linked transactions, settlements)
- `transaction-filters`: Filter bar UI for transactions — period, text search, tags, categories, accounts, advanced type filters, and grouping mode; responsive desktop/mobile layouts

### Modified Capabilities

- (none)

## Impact

- **Frontend routes**: `src/routes/index.tsx` redirected to `/transactions`; `src/routes/_authenticated.transactions.tsx` fully replaced
- **New frontend files**: API client (`src/api/transactions.ts`, `src/api/accounts.ts`, `src/api/categories.ts`, `src/api/tags.ts`), query hooks, filter components, transaction row and group components, CSS modules
- **Query keys**: `QueryKeys` extended with `Transactions`, `Accounts`, `Categories`, `Tags`
- **Backend**: No changes — all required endpoints already exist (`GET /api/transactions`, `GET /api/accounts`, `GET /api/categories`, `GET /api/tags`, `GET /api/user-connections`)
- **Dependencies**: Mantine Popover, Drawer, Checkbox, ActionIcon already available in Mantine v7; `@tabler/icons-react` already installed
