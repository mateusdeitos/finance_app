## Context

The frontend has a working auth flow, app shell with navigation, and a stub `/transactions` route showing "Em breve...". The root `/` renders a Hello World page with no navigation to the rest of the app. The backend already exposes all required endpoints — `GET /api/transactions` (with `month`, `year`, `account_id[]`, `category_id[]`, `tag_id[]`, `type[]`, `description.query`, `with_settlements` params), `GET /api/accounts`, `GET /api/categories`, `GET /api/tags` — so no backend changes are required.

The frontend follows these conventions:
- TanStack Router file-based routing under `src/routes/`
- Raw fetch API clients in `src/api/` using `credentials: 'include'` and `VITE_API_URL`
- Custom hooks in `src/hooks/` returning `{ query }` or `{ mutation }`
- Mantine v7 for UI (Popover, Drawer, ActionIcon, Checkbox already available)
- CSS Modules for component-specific styling

## Goals / Non-Goals

**Goals:**
- Redirect `/` to `/transactions` so the app opens on the transactions view
- Full transactions listing page at `/transactions`:
  - Period navigator (MM/YYYY) with prev/next month navigation
  - Filter bar: text search, tag filter, category filter, account filter, advanced type filter, grouping selector
  - Desktop: filter bar wraps on overflow (no horizontal scroll)
  - Mobile: period navigator pinned to top; filter bar inside a bottom Drawer toggled by a floating button
  - Transaction pseudo-table grouped by date (default), category, or account
  - Each row: date+description+tags, category, account, amount columns; icons for recurrence, cross-user linked transactions, and settlement indicators
  - All filter state persisted in URL search params (bookmarkable)

**Non-Goals:**
- Transaction create / edit / delete
- Pagination (full month fetched at once)
- Backend changes
- Offline caching or service workers

## Decisions

### Decision 1: Filter state in URL search params via TanStack Router

**Chosen**: All active filters (`month`, `year`, `query`, `tagIds[]`, `categoryIds[]`, `accountIds[]`, `types[]`, `groupBy`) stored as TanStack Router search params, validated and defaulted with Zod on the route's `validateSearch`.

**Alternatives considered:**
- **React state**: Resets on reload, not shareable.
- **URL params via native API**: Bypasses router type-safety.

**Rationale**: URL params are bookmarkable, survive reload, and allow sharing filtered views. TanStack Router's `validateSearch` provides typed defaults at zero cost.

### Decision 2: One API client file per resource

**Chosen**: `src/api/transactions.ts`, `src/api/accounts.ts`, `src/api/categories.ts`, `src/api/tags.ts` — each exporting a typed fetch function, following the pattern in `src/api/auth.ts`.

**Rationale**: Consistent with existing conventions. Each file is independently focused and easy to trace.

### Decision 3: Component decomposition

**Chosen:**
- `PeriodNavigator` — standalone prev/next + editable MM/YYYY display; reads/writes `month`/`year` search params
- `TextSearch`, `TagFilter`, `CategoryFilter`, `AccountFilter`, `AdvancedFilter`, `GroupBySelector` — each manages its own Popover/input state and reads/writes its search param(s)
- `TransactionFilters` — composes the above; desktop renders as a `flex-wrap` row, mobile renders as Drawer content
- `TransactionList` — calls `groupTransactions` utility, renders a list of `TransactionGroup`
- `TransactionGroup` — renders a group header + list of `TransactionRow`
- `TransactionRow` — single pseudo-table row with all columns and indicator icons

**Rationale**: Each filter component is self-contained (owns its Popover open state). The list components are independent from filter state, receiving only the already-filtered/fetched transactions.

### Decision 4: Account filter uses `user_connection` field from accounts endpoint

**Chosen**: `GET /api/accounts` returns all of the current user's accounts. Accounts without `user_connection` go into "Minhas contas"; accounts with `user_connection` go into "Contas compartilhadas". No second API call needed.

**Alternatives considered:**
- **`GET /api/user-connections` + merge**: Two requests and more complex matching to retrieve account names.

**Rationale**: The accounts response already embeds `user_connection` when relevant. The `account_id[]` filter on the transactions endpoint matches current-user account IDs, so this covers all filtering scenarios.

### Decision 5: Amount display utility

**Chosen**: A `formatCents(amount: number, operationType: 'credit' | 'debit'): string` utility converts cents to Brazilian Real format (`R$ 1.234,56`), prefixed `+` for credit and `-` for debit.

**Rationale**: Single reusable function keeps formatting consistent across rows and any future summary totals.

### Decision 6: Always fetch with `with_settlements=true`

**Chosen**: The transactions API call always includes `with_settlements=true`, populating `settlements_from_source` on each transaction so the settlement indicator can be shown without a second request.

**Rationale**: Minimal payload overhead for a complete UI. The indicator is informative — users should know which transactions generated settlement obligations.

### Decision 7: Client-side grouping

**Chosen**: A `groupTransactions(transactions, groupBy)` utility groups the already-fetched array client-side, returning `{ key: string; label: string; transactions: Transaction[] }[]`.

**Alternatives considered:**
- **Server-side grouping**: Backend does not support grouping query params, and adding it would require backend changes.

**Rationale**: The full month is already in memory. Client-side grouping adds negligible cost and keeps the backend change-free.

### Decision 8: Category tree via recursive Checkbox component

**Chosen**: The category filter renders a recursive `CategoryNode` component — each node is a Mantine `Checkbox` with its children indented below it. Checking a parent does not auto-select children (independent selection matching how `category_id[]` works on the backend).

**Rationale**: Mantine has no built-in tree-checkbox. A small recursive component is the simplest approach. Selecting a parent category already includes its children server-side (backend `category_id` filter includes the category and all descendants).

## Risks / Trade-offs

- **Large monthly datasets**: No pagination means potentially large payloads. Acceptable for a personal finance app with bounded monthly transaction counts.
- **Recursive category component**: Deep nesting is rare in practice; no depth limit enforced at this stage.
- **Mobile Drawer layout**: Mantine `Drawer` with `position="bottom"` provides adequate UX. No native bottom-sheet API required.
- **URL params for array filters**: TanStack Router serializes arrays as repeated query params (`tagIds=1&tagIds=2`). `validateSearch` handles deserialization correctly.

## Open Questions

<!-- none at this stage -->
