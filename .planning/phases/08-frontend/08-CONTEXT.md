# Phase 8: Frontend - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Charges management UI: listing page with tabs, create/accept/reject/cancel flows, and sidebar badge. Users can manage their charges entirely through the web interface with real-time visibility of pending actions.

</domain>

<decisions>
## Implementation Decisions

### Page Layout
- **D-01:** Tabs layout — two tabs: "Recebidas" (received) and "Enviadas" (sent) using Mantine `Tabs` component
- **D-02:** Period navigation — reuse existing `PeriodNavigator` component to filter charges by `period_month`/`period_year`, consistent with transactions page
- **D-03:** Rich cards — each charge displayed as a card showing: partner name, period, description, status badge, and action buttons
- **D-04:** No status filter — show all statuses mixed within each tab, sorted by date. Pending charges naturally appear at top (newest first)

### Create Charge Flow
- **D-05:** Drawer via `renderDrawer` pattern — consistent with `CreateTransactionDrawer`. Fields: connection picker, period (month/year), account selector, date, description
- **D-06:** Period defaults to page's current period — whatever month/year the user is viewing on the charges page pre-fills the drawer
- **D-07:** Auto-select single connection — if user has only one accepted connection, pre-fill it. Show picker only with multiple connections
- **D-08:** Show computed balance before submit — after selecting connection + period, fetch and display current balance. Shows inferred role ("Você deve" / "Devem a você") and amount

### Mutation UX (all charge actions)
- **D-09:** Error tag translation — extend `apiErrors.ts` pattern with charge-specific `CHARGE.*` tag mappings for Portuguese user-facing messages
- **D-10:** Loading state on submit — disable submit button during mutation, show loading indicator
- **D-11:** Success feedback — show Mantine notification/toast on successful create/accept/reject/cancel
- **D-12:** Apply D-09/D-10/D-11 consistently to ALL charge actions (create, accept, reject, cancel), not just create

### Accept Flow
- **D-13:** Claude's Discretion — accept drawer/modal design. Must collect: account_id (required), date (required), optional amount override. Should show computed balance as default amount.

### Reject & Cancel
- **D-14:** Claude's Discretion — confirmation approach for reject/cancel. Single-action confirmation (no complex forms needed for these)

### Sidebar Badge
- **D-15:** Claude's Discretion — nav item placement in `AppLayout.tsx` navLinks, badge count from `GET /api/charges/pending-count`, Portuguese label, badge disappears when count is 0
- **D-16:** Badge invalidation on every charge mutation — invalidate `QueryKeys.ChargesPendingCount` in all charge mutation `onSuccess` callbacks (FE-1 pitfall from STATE.md)

### Claude's Discretion
- Accept drawer/modal layout and fields presentation (D-13)
- Reject/cancel confirmation pattern (D-14)
- Sidebar nav item design, icon choice, badge styling (D-15)
- Empty state design for each tab
- Card layout exact spacing and visual hierarchy
- Loading skeleton while charges fetch

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend API (charge endpoints)
- `backend/internal/handler/charge_handler.go` — All charge endpoints, request/response shapes, Swagger annotations
- `backend/internal/domain/charge.go` — Charge domain struct, ChargeStatus enum, field definitions
- `backend/pkg/errors/errors.go` — ErrorCode/ErrorTag system that frontend must translate

### Frontend patterns
- `frontend/src/components/AppLayout.tsx` — NavLinks array (add charges entry + badge)
- `frontend/src/utils/queryKeys.ts` — QueryKeys object (add Charges + ChargesPendingCount)
- `frontend/src/utils/renderDrawer.tsx` — Drawer pattern to follow for create/accept drawers
- `frontend/src/utils/apiErrors.ts` — Error tag mapping pattern to extend for charge tags
- `frontend/src/api/transactions.ts` — API function pattern to follow
- `frontend/src/hooks/useTransactions.ts` — Hook pattern: `{ query, invalidate }`
- `frontend/src/hooks/useCreateTransaction.ts` — Mutation hook pattern: `{ mutation }`
- `frontend/src/components/transactions/PeriodNavigator.tsx` — Reuse for charge period navigation
- `frontend/src/api/userConnections.ts` — Connection types and fetch pattern
- `frontend/src/routes/_authenticated.transactions.tsx` — Route + page pattern to follow

### Prior phase context
- `.planning/phases/06-charge-repository-service-api-crud-listing/06-CONTEXT.md` — API design: list endpoint filters, pending-count endpoint, IDOR pattern
- `.planning/phases/07-accept-atomic-transfer/07-CONTEXT.md` — Accept request shape, role re-inference, transfer creation details

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PeriodNavigator` component: month/year navigation with arrows, reuse directly for charges page
- `renderDrawer` utility: promise-based drawer rendering in isolated React root
- `parseApiError` + `mapTagsToFieldErrors`: error handling pipeline, extend with charge tags
- `useMe` hook: get current user ID for distinguishing sent/received
- `useIsMobile` hook: responsive layout decisions

### Established Patterns
- TanStack Router file-based routes: `_authenticated.charges.tsx`
- TanStack Query: `useQuery` + `useMutation` wrapped in custom hooks
- QueryKeys: centralized const object, never magic strings
- Mantine components: `Tabs`, `Card`, `Badge`, `Button`, `NavLink`
- CSS Modules: colocated `.module.css` files
- Portuguese labels: "Transações", "Contas", "Categorias" — charges = "Cobranças"
- Non-optimistic mutations: no optimistic updates for financial state transitions

### Integration Points
- `AppLayout.tsx` navLinks array: add `{ label: "Cobranças", icon: IconX, to: "/charges" }` with badge
- `queryKeys.ts`: add `Charges: 'charges'` and `ChargesPendingCount: 'charges-pending-count'`
- Route file: `_authenticated.charges.tsx`
- API file: `src/api/charges.ts`
- Types file: `src/types/charges.ts`

</code_context>

<specifics>
## Specific Ideas

- Balance preview in create drawer shows role inference: "Você deve R$ 120,00" or "Devem a você R$ 120,00"
- Error messages in Portuguese matching existing app language
- All charge actions follow same mutation UX: loading button + success toast + error translation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-frontend*
*Context gathered: 2026-04-16*
