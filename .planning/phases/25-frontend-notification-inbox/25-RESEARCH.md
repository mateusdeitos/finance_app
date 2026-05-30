# Phase 25: Frontend Notification Inbox - Research

**Researched:** 2026-05-30
**Domain:** React 19 + TanStack Query v5 frontend data-wiring on a shipped Go/Echo inbox API; small backend bulk-by-IDs addition
**Confidence:** HIGH (all claims verified against live code in this repo)

## Summary

Phase 25 wires a notification inbox UI (already designed and locked in 25-UI-SPEC) onto the Phase 23 inbox API, plus a small backend addition for **bulk amount resolution** mandated by locked decision D-25-1. The inbox payload carries only `{id, user_id, type, entity_type, entity_id, read, created_at}` — no amount, no description, no partner name — so the frontend must resolve each notification's amount from its referenced entity (`charge` or `transaction`). D-25-1 locks this as **batched by-IDs queries (≤2 requests per page)**, not N+1 per-row fetches.

The backend work is two small, independent additions: (1) add an `IDs []int` field to `domain.ChargeSearchOptions` + a `WHERE id IN (?)` clause in `charge_repository.go` — exposed through the **existing** `GET /api/charges` List handler, which already binds `ChargeSearchOptions` and force-sets the `UserID` IDOR gate; and (2) a **dedicated** `GET /api/transactions/by-ids` handler that calls `transactionService.Search(ctx, userID, Period{0,0}, TransactionFilter{IDs, WithSettlements:true})` — necessary because the existing `Search` HTTP handler hard-requires valid `month`+`year` (400 otherwise) and cannot do a cross-period bulk fetch. These two backend tasks must land first; the frontend resolver depends on them.

The frontend adds zero runtime dependencies — TanStack Query v5.71, Mantine v9, and existing utils (`formatBalance`, `renderDrawer`, `deriveDeepLink`) cover everything. The work is: a new `src/api/notifications.ts`, charge/transaction by-IDs api functions, a `useResolveNotificationAmounts` batch resolver hook, inbox query/mutation hooks (cursor list, unread-count with 60s poll, mark-read, mark-all-read with optimistic updates), the drawer/page/route surfaces, and nav-badge plumbing on the three existing nav components.

**Primary recommendation:** Ship the two backend by-IDs tasks first (Wave 0), then the frontend api layer + resolver hook, then the surfaces. Follow CONTEXT D-25-1 for batched resolution — **do NOT follow the contradictory per-id "Data Fetching Strategy" prose in 25-UI-SPEC lines 336-405** (see Conflict Resolution below).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-25-1 — Entity amount resolution = BULK get-by-IDs (avoid N+1).** Resolve amounts in batched, by-IDs queries — at most **2 requests per page** (one for distinct charge IDs, one for distinct transaction IDs), NOT one request per row.

Backend facts (verified):
- **Transactions** — needs a dedicated batch path. `domain.TransactionFilter` already has `IDs []int` (`query:"id[]"`) and `TransactionService.Search` honors it (that is how `GET /api/transactions/:id` works internally). BUT the HTTP list handler `TransactionHandler.Search` requires valid `month`+`year` (400 otherwise) via `period.IsValid()`, so it cannot do a cross-period bulk fetch. **Decision:** add a guarded batch path hitting the service with `Period{0,0}` + `TransactionFilter{IDs, WithSettlements:true}` + UserID scoping — e.g. `GET /api/transactions/by-ids?id[]=<a>&id[]=<b>` (mirror `filter.UserID = &userID`). Reuse `TransactionService.Search` (no new service method). GET with repeated `id[]` for ≤20; document the cap.
- **Charges** — small backend addition. `domain.ChargeSearchOptions` has NO `IDs` field; `charge_repository.go` filters only by user/status/connection. Add: (1) `IDs []int` (`query:"id[]"`) to `ChargeSearchOptions`; (2) a `WHERE id IN (?)` clause when `len(options.IDs) > 0`; (3) expose via the EXISTING `GET /api/charges` List handler (already binds `ChargeSearchOptions`, force-sets `options.UserID = userID`); (4) `just generate-docs` after the annotation touch. No new route, no service-interface change beyond the filter field → no `just generate-mocks` needed (only a struct field + repo WHERE).

Frontend resolution strategy:
- New `src/api/notifications.ts` (inbox list, unread-count, mark-read, mark-all).
- A resolver hook (`useResolveNotificationAmounts`) that: collects distinct `entity_id`s on the current page split by `entity_type`; fires ≤1 batched charges query + ≤1 batched transactions query; is cache-first (TanStack Query dedupes); exposes `{ amount, amountState }` per notification where `amountState ∈ 'known' | 'loading' | 'missing'` (missing = 404/soft-deleted → render `—`), feeding `describeNotification()`.
- BRL via existing `formatBalance` (cents → `R$ x.xxx,xx`).

Why not `/:id` singular: ~20 round-trips per page (N+1). Batched `id[]` bounds it to 2 requests/page and reuses existing transaction list-filter machinery.

Carried-forward (locked in 25-UI-SPEC "Design Reference (LOCKED)"):
- Mobile = bottom-sheet drawer; desktop = full `/notifications` page.
- OD-4: mobile entry = unread **dot on the "Mais" tab** (no new tab) + a `MoreDrawer` "Notificações" item; desktop = sidebar nav link with a **blue** unread count badge (distinct from the red Cobranças badge).
- Per-type ThemeIcon tints, 8px unread dot, `blue.0` unread row tint (dark mode `dark-5`), 2-line clamp description, relative timestamp.
- Amount-inclusive pt-BR copy mirroring Phase 23 D-07 push templates.
- Explicit mark-read only; cursor "Carregar mais"; "Você está em dia" end state.
- INBOX-01..04 → the four success criteria.

### Claude's Discretion

Within the locked decisions, the planner/executor choose: the exact hook signatures, whether the cursor list uses `useInfiniteQuery` vs a manual cursor reducer (recommendation below: `useInfiniteQuery`), the precise optimistic-update cache-mutation shape, and the testId factory internals (already enumerated in 25-UI-SPEC).

### Deferred Ideas (OUT OF SCOPE)

- Deep-linking to a specific charge/transaction entity (Phase 25 navigates to the **list** page only — `entity_id` retained for future use). Consistent with Phase 24.
- Infinite scroll (explicitly rejected in favor of "Carregar mais").
- A `POST .../by-ids` body variant (GET with repeated `id[]` is sufficient for ≤20 ids).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INBOX-01 | Open in-app inbox listing notifications newest-first | `GET /api/notifications` (verified newest-first, cursor-paginated, IDOR-scoped) → `useNotificationInbox` (useInfiniteQuery) → `NotificationInboxContent` shared list. |
| INBOX-02 | Unread count indicator + visually distinguish unread from read | `GET /api/notifications/unread-count` (field `count`, int64) → `useNotificationUnreadCount` (60s poll) → blue badge on `DesktopSidebar` + dot on `MobileTabBar` "Mais" tab. Unread row tint + 8px dot per row. |
| INBOX-03 | Select a notification → navigate to its related charge/transaction | `deriveDeepLink({type, entity_type})` (existing helper, reuse) → `router.navigate({to})` → list page. |
| INBOX-04 | Mark read individually and all-at-once; opening marks read | `POST /api/notifications/:id/read` + `POST /api/notifications/read-all` (verified) → optimistic mutations updating inbox cache + unread-count cache. |
</phase_requirements>

---

## Conflict Resolution: CONTEXT.md vs 25-UI-SPEC

**CRITICAL for the planner.** 25-UI-SPEC's "Data Fetching Strategy: Entity Amount Resolution" section (lines 336-405) and the `useResolveNotificationAmount` (singular) hook + `useChargeById` + `fetchChargeById` + `GET /api/charges/:id` it describes are **superseded by CONTEXT D-25-1**. They contradict the locked decision in three concrete ways:

| 25-UI-SPEC prose (SUPERSEDED) | CONTEXT D-25-1 (AUTHORITATIVE) |
|-------------------------------|--------------------------------|
| Per-id fetch fallback (`fetchChargeById(id)`, `fetchTransaction(id)`), one query per row | Batched `id[]` queries, ≤2 requests/page |
| `GET /api/charges/:id` "exists in the backend (Phase 23)" | **FALSE** — verified: no `GET /api/charges/:id` route in `main.go` (only `pending-count`, `POST ""`, `GET ""`, and `/:id/{cancel,reject,accept}`). The single-id charge endpoint does NOT exist. |
| `useResolveNotificationAmount(entityType, entityId)` (per-row hook) | `useResolveNotificationAmounts(notifications[])` (page-level batch hook) returning a map |
| QueryKeys `TransactionById`, `ChargeById` | QueryKeys `NotificationChargesById`, `NotificationTransactionsById` keyed by sorted id-set (batch keys) |

CONTEXT.md is the authority (per the researcher role contract: "research THESE, not alternatives"). The planner must build the **batched** design. The 25-UI-SPEC visual/copy/state contract (Surfaces 1-5, copy table, testIds, icon tints, states) remains fully binding — only its data-fetching section is overridden. The `describeNotification(n, {amount, amountState})` consumer contract is compatible with the batch resolver (the resolver just supplies the same `{amount, amountState}` shape from a batch instead of a per-row query).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Charge filter-by-IDs | API / Backend (handler+repo) | — | IDOR-scoped query; reuses existing List handler's `UserID` gate. Belongs server-side. |
| Transaction filter-by-IDs (cross-period) | API / Backend (new handler) | — | Existing Search handler blocks cross-period; service-layer `Search` already supports it. New thin handler bypasses the period guard with the same IDOR scoping. |
| Inbox list / unread-count / mark-read | API / Backend (shipped Phase 23) | — | Already live; frontend consumes only. |
| Amount resolution orchestration | Frontend (TanStack Query) | — | Batch the IDs, dedupe via query cache, map back to rows. Pure client orchestration over server batch endpoints. |
| Unread badge + poll | Frontend (TanStack Query `refetchInterval`) | — | UI-state derived from a count query; 60s poll reconciles missed push events. |
| Navigation on tap | Frontend Client (TanStack Router) | — | `router.navigate` to list page; `deriveDeepLink` maps entity_type→path. |
| Optimistic mark-read | Frontend (query cache mutation) | API (background confirm) | Instant UI feedback; server is source of truth on `onSettled` invalidate. |

---

## Standard Stack

### Core (all already installed — ZERO new runtime deps)
| Library | Version (verified in package.json) | Purpose | Why Standard |
|---------|-------------------------------------|---------|--------------|
| @tanstack/react-query | ^5.71.10 | Inbox list (`useInfiniteQuery`), unread count (`useQuery` + `refetchInterval`), mutations + optimistic cache updates | Already the app's data layer; convention mandates all fetching via it |
| @mantine/core | ^9.2.1 | Drawer, Skeleton, ThemeIcon, Badge, Indicator, UnstyledButton, Button | App's component library |
| @mantine/notifications | ^9.2.1 | Error toasts on mark-read / mark-all-read failure | Already used app-wide |
| @tanstack/react-router | ^1.166.8 | `/notifications` file route + `router.navigate` | App's router |
| @tabler/icons-react | ^3.40.0 | IconBell, IconCreditCard, IconCircleCheck, IconUsers, IconRefresh, IconChevronRight, IconBellOff | App's icon set |

> **Version correction for the planner:** the objective text says "Mantine v7" — the repo is actually on **Mantine v9.2.1** (verified in `frontend/package.json`). Use v9 component APIs. `Indicator`, `ThemeIcon variant="light"`, `Skeleton`, `Drawer`/`ResponsiveDrawer` are all v9-stable; no API surprises versus v7 for the primitives this phase uses.

### Supporting (existing utilities — reuse, do not recreate)
| Util | Path | Purpose |
|------|------|---------|
| `formatBalance(cents)` | `src/utils/formatCents.ts` | `R$ X.XXX,XX` (no sign) for the `{amount}` slot |
| `deriveDeepLink({type, entity_type})` | `src/utils/pushDeepLink.ts` | entity_type→`/charges`\|`/transactions` (REUSE — single source of truth with Phase 24) |
| `renderDrawer` / `useDrawerContext` | `src/utils/renderDrawer.tsx` | Mobile bottom-sheet inbox drawer (isolated React root + own QueryClientProvider) |
| `router` (global) | `src/router` | Navigation from inside `renderDrawer` roots (which lack RouterProvider — see MoreDrawer precedent) |
| `useAccounts(select)` | `src/hooks/useAccounts.ts` | Partner-name derivation from cached `user_connection` (no extra API call) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useInfiniteQuery` for the cursor list | Manual `useState` cursor + `useQuery` reducer | `useInfiniteQuery` is the v5-blessed pattern for cursor pagination, handles `pages[]` accumulation, `fetchNextPage`, `hasNextPage`, `isFetchingNextPage` natively. Manual reducer reinvents this and complicates optimistic cache writes. **Recommend `useInfiniteQuery`** with `getNextPageParam: (last) => last.has_more ? last.next_cursor : undefined`. The "explicit Carregar mais button" requirement is satisfied by calling `fetchNextPage()` from a button onClick (no IntersectionObserver). |
| Batched `id[]` query keyed on sorted id-set | One query per distinct id (`useQueries`) | D-25-1 mandates ≤2 requests/page. `useQueries` per-id is N+1 (the rejected approach). Use a single `useQuery` per entity type with the distinct sorted id-array in the query key. |

**Installation:** none — no new packages. (No `@types` additions needed either; all libraries ship their own types.)

**Version verification (run during planning if unsure):**
```bash
cd frontend && npm view @tanstack/react-query version   # confirm ^5.x current
```
Versions above are read directly from `frontend/package.json` on 2026-05-30 — treat as VERIFIED.

---

## Architecture Patterns

### System Architecture Diagram

```
                       ┌─────────────────────────────────────────────┐
   Inbox open  ───────▶│ useNotificationInbox (useInfiniteQuery)       │
   (drawer/page)       │ GET /api/notifications?cursor&limit=20        │──┐ newest-first,
                       │ → pages[]: {notifications[], next_cursor,      │  │ cursor-paginated,
                       │            has_more}                           │  │ IDOR-scoped
                       └───────────────────┬───────────────────────────┘  │
                                           │ flatten pages → notifications[]│
                                           ▼                                │
            ┌──────────────────────────────────────────────────────┐      │
            │ useResolveNotificationAmounts(notifications)           │      │
            │  1. split distinct entity_ids by entity_type           │      │
            │  2. chargeIds[] ─▶ GET /api/charges?id[]=… (≤1 req)     │◀─────┘
            │     txIds[]     ─▶ GET /api/transactions/by-ids?id[]=…  │  (NEW backend)
            │  3. build Map<`${type}:${id}`, {amount, amountState}>   │
            │     amountState: id requested & present→known;          │
            │                  in-flight→loading;                     │
            │                  requested & absent in response→missing │
            └───────────────────────────┬──────────────────────────┘
                                         ▼
            ┌──────────────────────────────────────────────────────┐
            │ NotificationRow (per item)                             │
            │  partnerName ← useAccounts(select) cache               │
            │  describeNotification(n, {amount, amountState})        │
            │  → pt-BR copy (formatBalance for {amount})             │
            │  tap ▶ optimistic markRead + decrement count           │
            │       ▶ deriveDeepLink → router.navigate(list page)    │
            │       ▶ (mobile) ctx.close()                           │
            └──────────────────────────────────────────────────────┘

   Badge:  useNotificationUnreadCount  GET /api/notifications/unread-count
           (refetchInterval 60s, refetchOnWindowFocus)
           → DesktopSidebar blue badge (cap 9+)
           → MobileTabBar "Mais" Indicator dot (no count)
           → MoreDrawer item blue count badge (cap 9+)
```

### Recommended Project Structure (additions)
```
frontend/src/
├── api/
│   ├── notifications.ts          # NEW: list, unread-count, markRead, markAllRead
│   ├── charges.ts                # EDIT: add fetchChargesByIds(ids[])
│   └── transactions.ts           # EDIT: add fetchTransactionsByIds(ids[])
├── types/
│   └── notifications.ts          # NEW: Notifications namespace (per 25-UI-SPEC)
├── hooks/
│   ├── useNotificationInbox.ts        # NEW: useInfiniteQuery
│   ├── useNotificationUnreadCount.ts  # NEW: useQuery + 60s poll
│   ├── useMarkNotificationRead.ts     # NEW: mutation
│   ├── useMarkAllNotificationsRead.ts # NEW: mutation
│   └── useResolveNotificationAmounts.ts # NEW: batch resolver
├── components/notifications/
│   ├── NotificationInboxDrawer.tsx    # NEW: mobile bottom sheet
│   ├── NotificationInboxContent.tsx   # NEW: shared list (drawer + page)
│   ├── NotificationRow.tsx            # NEW
│   └── describeNotification.ts        # NEW: copy builder (pure → unit-testable)
├── pages/
│   └── NotificationInboxPage.tsx      # NEW: desktop full page
├── routes/
│   └── _authenticated.notifications.tsx # NEW: thin route
├── testIds/
│   └── notifications.ts               # NEW: NotificationsTestIds
└── (EDIT) components/{MobileTabBar,MobileMoreDrawer,DesktopSidebar}.tsx
        utils/queryKeys.ts
```

backend additions:
```
backend/internal/
├── domain/charge.go              # EDIT: add IDs []int to ChargeSearchOptions
├── repository/charge_repository.go # EDIT: WHERE id IN (?) in Search()
├── handler/charge_handler.go     # EDIT: swagger @Param id[] on List
├── handler/transaction_handler.go # EDIT: new ListByIDs handler
└── cmd/server/main.go            # EDIT: register transactions/by-ids route
backend/docs/                     # regenerate via just generate-docs
```

### Pattern 1: Query hook returns `{ query, invalidate }`; mutation returns `{ mutation }`
**What:** Every query hook exposes `{ query, invalidate }`; every mutation hook exposes `{ mutation }` and **invalidation is the caller's job** (no hard-coded `onSuccess` invalidation inside the mutation hook). Query keys come from `QueryKeys` const. Derived state via `select`.
**When to use:** All Phase 25 hooks.
**Example (verified convention):**
```ts
// Source: frontend/src/hooks/useChargesPendingCount.ts (existing precedent)
export function useNotificationUnreadCount<T = Notifications.UnreadCountResponse>(
  select?: (d: Notifications.UnreadCountResponse) => T,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.NotificationUnreadCount],
    queryFn: fetchNotificationUnreadCount,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,        // 60s poll (25-UI-SPEC) — only polling query in the app
    refetchIntervalInBackground: false, // pause when tab hidden
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.NotificationUnreadCount] })
  return { query, invalidate }
}
```

### Pattern 2: Navigation from inside a `renderDrawer` root uses the global `router`
**What:** `renderDrawer` mounts in an isolated React root WITHOUT `RouterProvider`, so `useNavigate()` returns null. Drive navigation through the imported global `router` instance.
**When to use:** Tap-to-navigate from the mobile `NotificationInboxDrawer`.
**Example (verified convention):**
```ts
// Source: frontend/src/components/MobileMoreDrawer.tsx (lines 44-48 comment + usage)
import { router } from '@/router'
// ...
void router.navigate({ to: deriveDeepLink({ type: n.type, entity_type: n.entity_type }) })
```

### Pattern 3: Shared list content extracted so drawer + page reuse one renderer
**What:** `NotificationInboxContent` owns the list/empty/error/load-more rendering and the inbox hooks; `NotificationInboxDrawer` and `NotificationInboxPage` are thin shells (drawer chrome vs page heading). Avoids duplicating state logic across the two surfaces.
**When to use:** Both inbox surfaces (per 25-UI-SPEC Component Inventory).

### Anti-Patterns to Avoid
- **Per-id amount fetch (N+1):** Forbidden by D-25-1. The superseded 25-UI-SPEC prose suggests it — do not implement it.
- **`GET /api/charges/:id`:** Does not exist (verified). Do not call it; do not add `fetchChargeById`/`useChargeById`.
- **`useEffect` in components:** Forbidden by frontend/CLAUDE.md §4. The 60s poll is `refetchInterval` (a query option), not an effect. SW-navigation interplay is already encapsulated in `useServiceWorkerNavigation` — no new effects needed.
- **Magic-string query keys / testids:** Add to `QueryKeys` const + `src/testIds/notifications.ts` first.
- **Blocking navigation on the mark-read mutation:** Navigate immediately; mark-read runs in background (25-UI-SPEC Surface 4).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cursor pagination state | Manual `useState` cursor + page-array reducer | `useInfiniteQuery` (`getNextPageParam`) | v5-native; handles `pages[]`, `fetchNextPage`, `hasNextPage`, `isFetchingNextPage` |
| Per-row amount fetch | 20 individual fetches | Batched `id[]` query (D-25-1) | Bounded to 2 requests/page; cache-deduped |
| BRL formatting | `Intl.NumberFormat` inline | `formatBalance(cents)` | Existing util, app-wide consistency |
| entity_type→route mapping | New switch in the row | `deriveDeepLink` (existing) | One source of truth with Phase 24 push deep-link |
| Partner name lookup | New API call | `useAccounts(select)` over cached `user_connection` | Already in cache; 25-UI-SPEC mandates no extra call |
| Charge single-by-id endpoint | New `GET /api/charges/:id` route | `GET /api/charges?id[]=…` via existing List handler | List handler already has the IDOR gate; only a filter field + repo WHERE needed |
| Transaction batch service method | New `TransactionService.GetByIDs` | Reuse `Search(Period{0,0}, TransactionFilter{IDs, WithSettlements:true})` | Service already honors `IDs`; only a thin handler needed (mirrors `GetByID`) |

**Key insight:** The backend already has 90% of the machinery. Charges need one struct field + one WHERE clause exposed through an existing handler. Transactions need one thin handler reusing an existing service path. The frontend resolver is pure orchestration over those two batch endpoints — no new persistence, no new service logic.

---

## Backend Additions (their own early tasks — frontend resolver depends on them)

### Task B1: Charges filter-by-IDs (via existing List handler)
1. **`backend/internal/domain/charge.go`** — add to `ChargeSearchOptions`:
   ```go
   IDs []int `json:"-" query:"id[]"`
   ```
   (Verified current struct has UserID/Direction/Status/ConnectionID/Limit/Offset only.)
2. **`backend/internal/repository/charge_repository.go`** — in `Search()`, after the IDOR/status/connection filters, before `Order`:
   ```go
   if len(options.IDs) > 0 {
       query = query.Where("id IN ?", options.IDs)
   }
   ```
   (The IDOR `WHERE (charger_user_id = ? OR payer_user_id = ?)` already runs first, so an id the caller doesn't own is filtered out → not returned → frontend marks it `missing`. This is the IDOR-safe behavior.)
3. **`backend/internal/handler/charge_handler.go`** — `List` already binds `ChargeSearchOptions` via `c.Bind(&options)` and force-sets `options.UserID = userID`. Echo's binder maps `id[]` query params to the `query:"id[]"` tag — **no handler code change** beyond adding a swagger annotation:
   ```go
   // @Param  id[]  query  []int  false  "Filter by charge IDs"  collectionFormat(multi)
   ```
4. `cd backend && just generate-docs`. **No `just generate-mocks`** (no interface change — `ChargeService.List(ctx, options)` signature is unchanged; only the options struct gained a field).
5. Response shape is unchanged: `{ "charges": [...] }`.

### Task B2: Transactions by-IDs (new thin handler + route)
1. **`backend/internal/handler/transaction_handler.go`** — new handler mirroring `GetByID` but for a slice (verified `GetByID` already uses the `Search(Period{0,0}, TransactionFilter{IDs, WithSettlements:true})` pattern at lines 179-185):
   ```go
   // ListByIDs godoc
   // @Summary  Get transactions by IDs (cross-period batch)
   // @Tags     transactions
   // @Produce  json
   // @Security CookieAuth
   // @Security BearerAuth
   // @Param    id[]  query  []int  true  "Transaction IDs"  collectionFormat(multi)
   // @Success  200  {array}   domain.Transaction
   // @Failure  400  {object}  middleware.ErrorResponse
   // @Failure  401  {object}  middleware.ErrorResponse
   // @Router   /api/transactions/by-ids [get]
   func (h *TransactionHandler) ListByIDs(c echo.Context) error {
       ctx := c.Request().Context()
       userID := appcontext.GetUserIDFromContext(ctx)
       var filter domain.TransactionFilter
       if err := c.Bind(&filter); err != nil {
           return echo.NewHTTPError(http.StatusBadRequest, "invalid query parameters")
       }
       if len(filter.IDs) == 0 {
           return c.JSON(http.StatusOK, []domain.Transaction{}) // empty → empty (no 400)
       }
       filter.UserID = &userID                 // IDOR scope (mirrors Search line 137)
       filter.WithSettlements = true
       txs, err := h.transactionService.Search(ctx, userID, domain.Period{Month: 0, Year: 0}, filter)
       if err != nil {
           return pkgErrors.ToHTTPError(err)
       }
       return c.JSON(http.StatusOK, txs)
   }
   ```
2. **`backend/cmd/server/main.go`** — register **BEFORE `/:id`** to avoid the `:id` wildcard shadowing `by-ids`. Verified current order (lines 252-261): `GET ""`, `POST ""`, `GET /balance`, `GET /suggestions`, `DELETE /:id`, `GET /:id`, `PUT /:id`, … Echo routes static segments with priority over `:id` params, so placement is robust either way, but place it adjacent to the other static GETs for clarity:
   ```go
   transactions.GET("/by-ids", h.ListByIDs)   // add near /balance & /suggestions, before /:id
   ```
   (Echo's router gives literal `/by-ids` precedence over `/:id`; confirm with the handler test below regardless.)
3. **No service or mock change** — reuses `TransactionService.Search`. `just generate-docs` to regenerate swagger.
4. Document the **≤20 ids cap** in the swagger description; the frontend bounds it to one page's distinct transaction ids (page limit 20).

### Backend testing (go test -short, Docker not required)
- `charge_handler_test.go` — mockery-based unit test (precedent verified): assert `List` binds `id[]` into `options.IDs` and the IDOR `UserID` is force-set. Mock `ChargeService.List` and assert it receives the expected options (`mock.MatchedBy`).
- `charge_repository_test.go` — the `WHERE id IN` clause is exercised by an **integration** test (`ServiceTestWithDBSuite`, testcontainers) which is `-short`-skipped → **authored but not runnable** without Docker (honest limit, see Testing Strategy).
- `transaction_handler_test.go` — mockery unit test for `ListByIDs`: empty-ids→200 empty array (no 400); ids present → service called with `Period{0,0}` + `filter.IDs` + `UserID` set + `WithSettlements:true`.

---

## Frontend Code Examples (skeletons — NOT production components)

### Skeleton 1: Batch resolver hook (the core of D-25-1)
```ts
// src/hooks/useResolveNotificationAmounts.ts  (SKELETON)
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchChargesByIds } from '@/api/charges'
import { fetchTransactionsByIds } from '@/api/transactions'
import { QueryKeys } from '@/utils/queryKeys'
import { Notifications } from '@/types/notifications'

export type AmountState = 'known' | 'loading' | 'missing'
export type ResolvedAmount = { amount: number | null; amountState: AmountState }

function distinct(ids: number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b) // sorted → stable query key
}

export function useResolveNotificationAmounts(
  notifications: Notifications.Notification[],
): Map<string, ResolvedAmount> {
  const queryClient = useQueryClient()

  const chargeIds = distinct(
    notifications.filter((n) => n.entity_type === 'charge').map((n) => n.entity_id),
  )
  const txIds = distinct(
    notifications.filter((n) => n.entity_type === 'transaction').map((n) => n.entity_id),
  )

  // ≤1 batched charges request. Key on the sorted id-set so re-renders dedupe.
  const chargesQ = useQuery({
    queryKey: [QueryKeys.NotificationChargesById, chargeIds],
    queryFn: () => fetchChargesByIds(chargeIds),
    enabled: chargeIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })
  // ≤1 batched transactions request.
  const txQ = useQuery({
    queryKey: [QueryKeys.NotificationTransactionsById, txIds],
    queryFn: () => fetchTransactionsByIds(txIds),
    enabled: txIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // (Optional cache-first warm-up: seed from any open Charges/Transactions list
  //  via queryClient.getQueryData before relying on the batch — purely an
  //  optimization; the batch endpoints are the source of truth.)
  void queryClient

  const map = new Map<string, ResolvedAmount>()
  const chargeById = new Map((chargesQ.data?.charges ?? []).map((c) => [c.id, c]))
  const txById = new Map((txQ.data ?? []).map((t) => [t.id, t]))

  for (const n of notifications) {
    const key = `${n.entity_type}:${n.entity_id}`
    if (n.entity_type === 'charge') {
      if (chargesQ.isPending && chargeIds.includes(n.entity_id)) {
        map.set(key, { amount: null, amountState: 'loading' })
      } else {
        const c = chargeById.get(n.entity_id)
        // requested but absent in response → soft-deleted / not owned → missing
        map.set(key, c?.amount != null
          ? { amount: c.amount, amountState: 'known' }
          : { amount: null, amountState: 'missing' })
      }
    } else {
      if (txQ.isPending && txIds.includes(n.entity_id)) {
        map.set(key, { amount: null, amountState: 'loading' })
      } else {
        const t = txById.get(n.entity_id)
        map.set(key, t
          ? { amount: t.amount, amountState: 'known' }
          : { amount: null, amountState: 'missing' })
      }
    }
  }
  return map
}
```
`amountState` detection rule (D-25-1): an id is **requested** (in `chargeIds`/`txIds`) but **absent** from the response (404 / soft-deleted / not owned by caller) → `missing` → row renders `—`. In-flight → `loading` → no-amount copy. Present with a non-null amount → `known`.

> Note: `charge.amount` is `*int64` (verified `domain.Charge.Amount *int64`), serialized with `omitempty` — a charge with no amount set serializes without the field, so `c?.amount != null` correctly yields `missing`. Transaction `amount` is always present (`int64`).

### Skeleton 2: Inbox list (cursor) hook
```ts
// src/hooks/useNotificationInbox.ts  (SKELETON)
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNotifications } from '@/api/notifications'
import { QueryKeys } from '@/utils/queryKeys'

export function useNotificationInbox() {
  const queryClient = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: [QueryKeys.Notifications],
    queryFn: ({ pageParam }) => fetchNotifications({ cursor: pageParam, limit: 20 }),
    initialPageParam: '' as string,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Notifications] })
  return { query, invalidate } // page consumes query.data.pages.flatMap(p => p.notifications)
}
```
"Carregar mais" button: `onClick={() => query.fetchNextPage()}`, disabled `query.isFetchingNextPage`, shown when `query.hasNextPage`. End indicator "Você está em dia" when `!query.hasNextPage`.

### Skeleton 3: Optimistic mark-read mutation (cache update across BOTH keys)
```ts
// src/hooks/useMarkNotificationRead.ts  (SKELETON)
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { markNotificationRead } from '@/api/notifications'
import { QueryKeys } from '@/utils/queryKeys'
import { Notifications } from '@/types/notifications'

type InboxData = { pages: Notifications.NotificationListResponse[]; pageParams: unknown[] }

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [QueryKeys.Notifications] })
      await queryClient.cancelQueries({ queryKey: [QueryKeys.NotificationUnreadCount] })
      const prevInbox = queryClient.getQueryData<InboxData>([QueryKeys.Notifications])
      const prevCount = queryClient.getQueryData<{ count: number }>([QueryKeys.NotificationUnreadCount])
      const wasUnread = prevInbox?.pages.some((pg) =>
        pg.notifications.some((n) => n.id === id && !n.read))
      // flip the one row to read
      queryClient.setQueryData<InboxData>([QueryKeys.Notifications], (old) =>
        old && { ...old, pages: old.pages.map((pg) => ({
          ...pg, notifications: pg.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n) })) })
      // decrement count (floor 0) only if it was unread
      if (wasUnread) {
        queryClient.setQueryData<{ count: number }>([QueryKeys.NotificationUnreadCount],
          (c) => c && { count: Math.max(0, c.count - 1) })
      }
      return { prevInbox, prevCount }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prevInbox) queryClient.setQueryData([QueryKeys.Notifications], ctx.prevInbox)
      if (ctx?.prevCount) queryClient.setQueryData([QueryKeys.NotificationUnreadCount], ctx.prevCount)
      // caller shows error toast (mutation hook returns { mutation }; invalidation/toast = caller)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.NotificationUnreadCount] })
    },
  })
  return { mutation }
}
```
> Convention nuance: frontend/CLAUDE.md says "invalidation is the caller's responsibility — do not hard-code `onSuccess` invalidations." The **optimistic** cache writes (`onMutate`/`onError` rollback) are intrinsic to the mutation's correctness, so they belong in the hook. The `onSettled` reconcile-invalidate is borderline — the planner may either keep it here (it's reconciliation, not the caller's domain choice) or hand it to the caller. Recommend keeping `onMutate`/`onError` in the hook and exposing an `onSuccess?` option so the caller can additionally invalidate `Notifications` if it wants a hard refetch. Mark-all-read (`useMarkAllNotificationsRead`) mirrors this: optimistically set every row `read:true` + count `0`, rollback on error.

### Skeleton 4: by-IDs api functions
```ts
// src/api/charges.ts  (ADD)
export async function fetchChargesByIds(ids: number[]): Promise<Charges.ListResponse> {
  if (ids.length === 0) return { charges: [] }
  const url = new URL(`${apiUrl}/api/charges`, window.location.origin)
  ids.forEach((id) => url.searchParams.append('id[]', String(id)))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch charges by ids')
  return res.json()
}

// src/api/transactions.ts  (ADD)
export async function fetchTransactionsByIds(ids: number[]): Promise<Transactions.Transaction[]> {
  if (ids.length === 0) return []
  const url = new URL(`${apiUrl}/api/transactions/by-ids`, window.location.origin)
  ids.forEach((id) => url.searchParams.append('id[]', String(id)))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch transactions by ids')
  return res.json()
}
```

---

## File-Touch List

### BACKEND (land first — frontend resolver depends on these)
| File | Change | Task |
|------|--------|------|
| `internal/domain/charge.go` | Add `IDs []int \`query:"id[]"\`` to `ChargeSearchOptions` | B1 |
| `internal/repository/charge_repository.go` | `WHERE id IN ?` when `len(IDs)>0` in `Search()` | B1 |
| `internal/handler/charge_handler.go` | Swagger `@Param id[]` on `List` (no logic change) | B1 |
| `internal/handler/transaction_handler.go` | New `ListByIDs` handler (reuses `Search`) | B2 |
| `cmd/server/main.go` | Register `transactions.GET("/by-ids", h.ListByIDs)` before `/:id` | B2 |
| `backend/docs/*` | `just generate-docs` (NOT generate-mocks) | B1+B2 |
| `internal/handler/charge_handler_test.go` | Unit test: `id[]` binds, IDOR UserID forced | B1 (test) |
| `internal/handler/transaction_handler_test.go` | Unit test: empty→200[]; ids→Search(Period{0,0},IDs,UserID,WithSettlements) | B2 (test) |
| `internal/repository/charge_repository_test.go` (or service WithDB) | Integration test for `id IN` (Docker-gated, authored-not-run) | B1 (test) |

### FRONTEND
| File | Change |
|------|--------|
| `src/types/notifications.ts` | NEW — `Notifications` namespace (Notification, NotificationListResponse `{notifications,next_cursor,has_more}`, UnreadCountResponse `{count}`) |
| `src/utils/queryKeys.ts` | ADD `Notifications`, `NotificationUnreadCount`, `NotificationChargesById`, `NotificationTransactionsById` |
| `src/api/notifications.ts` | NEW — `fetchNotifications({cursor,limit})`, `fetchNotificationUnreadCount()`, `markNotificationRead(id)` (POST `/:id/read`, 204), `markAllNotificationsRead()` (POST `/read-all`, 204) |
| `src/api/charges.ts` | ADD `fetchChargesByIds(ids[])` |
| `src/api/transactions.ts` | ADD `fetchTransactionsByIds(ids[])` |
| `src/hooks/useNotificationInbox.ts` | NEW — `useInfiniteQuery` |
| `src/hooks/useNotificationUnreadCount.ts` | NEW — `useQuery` + 60s `refetchInterval` |
| `src/hooks/useMarkNotificationRead.ts` | NEW — optimistic mutation |
| `src/hooks/useMarkAllNotificationsRead.ts` | NEW — optimistic mutation |
| `src/hooks/useResolveNotificationAmounts.ts` | NEW — batch resolver (D-25-1) |
| `src/components/notifications/describeNotification.ts` | NEW — pure copy builder (unit-testable) |
| `src/components/notifications/NotificationRow.tsx` | NEW |
| `src/components/notifications/NotificationInboxContent.tsx` | NEW — shared list |
| `src/components/notifications/NotificationInboxDrawer.tsx` | NEW — mobile bottom sheet |
| `src/pages/NotificationInboxPage.tsx` | NEW — desktop page |
| `src/routes/_authenticated.notifications.tsx` | NEW — thin route |
| `src/testIds/notifications.ts` | NEW — `NotificationsTestIds` (per 25-UI-SPEC table) |
| `src/testIds/index.ts` | ADD re-export |
| `src/components/MobileTabBar.tsx` | ADD `Indicator` dot on "Mais" tab when `unreadCount>0` (uses `useNotificationUnreadCount`) |
| `src/components/MobileMoreDrawer.tsx` | ADD "Notificações" `MoreItem` above "Sair"; opens `NotificationInboxDrawer` via `renderDrawer`; blue count badge |
| `src/components/DesktopSidebar.tsx` | ADD `{to:'/notifications',label:'Notificações',icon:IconBell}` to `navLinks`; blue badge (cap 9+) mirroring the charges red-badge `showBadge` pattern |
| `frontend/e2e/tests/notifications-inbox.spec.ts` | NEW — Playwright (authored; not run without Docker) |

---

## Common Pitfalls

### Pitfall 1: Following the superseded 25-UI-SPEC per-id strategy
**What goes wrong:** Building `fetchChargeById`/`useChargeById`/`GET /api/charges/:id` and per-row resolution.
**Why it happens:** 25-UI-SPEC lines 336-405 describe it in detail and falsely claim the charge `:id` endpoint exists.
**How to avoid:** Follow CONTEXT D-25-1 (batched). Verified: no `GET /api/charges/:id` route. See Conflict Resolution section.
**Warning signs:** A plan task creating `fetchChargeById`, or more than 2 entity requests per inbox page.

### Pitfall 2: Echo route shadowing `/by-ids` with `/:id`
**What goes wrong:** `GET /api/transactions/by-ids` resolves to `GetByID` with `id="by-ids"` → 400.
**Why it happens:** If registered after `/:id` in a router that prefers declaration order.
**How to avoid:** Echo prioritizes static segments over `:param`, but register `/by-ids` adjacent to other static GETs (`/balance`, `/suggestions`) and assert with a handler test that `/by-ids` routes to `ListByIDs`.
**Warning signs:** Handler test for `/by-ids` hits `GetByID`.

### Pitfall 3: IDOR leak via id-filter
**What goes wrong:** Returning a charge/transaction the caller doesn't own because they passed its id.
**Why it happens:** Applying the `id IN` filter without the user scope.
**How to avoid:** Charges — the existing List handler force-sets `options.UserID` and the repo applies the owner WHERE before the id filter (verified). Transactions — `ListByIDs` MUST set `filter.UserID = &userID` (mirrors `Search` line 137). Not-owned ids fall out of the result → frontend marks them `missing`. Cover with a handler/repo test.
**Warning signs:** A test where user A passes user B's entity id and gets data back.

### Pitfall 4: Unread-count drift from optimistic decrements
**What goes wrong:** Count goes negative or desyncs after rapid taps / mark-all.
**Why it happens:** Decrementing without a floor, or decrementing already-read rows.
**How to avoid:** Floor at 0 (`Math.max(0, c-1)`); only decrement when the tapped row `was unread`; `onSettled` invalidate `NotificationUnreadCount` to reconcile with the server. The 60s poll is the backstop.
**Warning signs:** Badge shows a count inconsistent with visible unread rows.

### Pitfall 5: Polling never pausing / hammering when hidden
**What goes wrong:** 60s poll keeps firing on a backgrounded tab.
**How to avoid:** `refetchIntervalInBackground: false` (default). One polling query only (unread-count) — the inbox list does NOT poll.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useInfiniteQuery` with `pageParam` arg | `initialPageParam` required + `pageParam` in queryFn destructure | TanStack Query v5 | Use `initialPageParam: ''`; `getNextPageParam` returns `undefined` to stop |
| Mutation `onSuccess` invalidation in hook | Caller-owned invalidation (this repo's convention) | repo convention | Keep optimistic `onMutate`/`onError` in hook; expose `onSuccess?` option for caller |

**Deprecated/outdated:** The objective's "Mantine v7" reference — repo is on **v9.2.1**. No v7-vs-v9 API differences affect the primitives used here.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Echo gives literal `/by-ids` precedence over `/:id` regardless of registration order | Pitfall 2 / B2 | LOW — a handler test settles it; worst case adjust order. Echo's radix router does prioritize static over param. |
| A2 | `charge.amount` being `*int64` + `omitempty` means a deleted/amount-less charge yields `missing` cleanly | Skeleton 1 | LOW — verified field type; behavior is `c?.amount != null` |
| A3 | The 60s poll is acceptable as the only polling query (no perf/cost concern) | INBOX-02 | LOW — 25-UI-SPEC explicitly justifies it; backend count query is cheap (indexed) |
| A4 | Backend `unread-count` returns `{ "count": <int> }` (field name `count`) | Inbox API contract | NONE — VERIFIED in `domain.NotificationUnreadCountResponse{Count int64 json:"count"}` |

**All other claims are VERIFIED against live code (handlers, domain structs, routes, hooks) read this session.**

---

## Open Questions

1. **Should `onSettled` invalidation of `Notifications` live in the hook or the caller?**
   - What we know: repo convention pushes invalidation to the caller; optimistic rollback must live in the hook.
   - What's unclear: whether the reconcile-invalidate is "caller domain choice" or "intrinsic correctness."
   - Recommendation: keep `onMutate`/`onError`/`onSettled(unread-count)` in the hook; expose `onSuccess?` so the caller can additionally invalidate the inbox list if desired. Planner to confirm with the executor against CLAUDE.md §3.

2. **Cache-first warm-up from open Charges/Transactions lists — implement now or skip?**
   - What we know: D-25-1 says "cache-first (TanStack Query dedupes)"; the batch endpoints already dedupe by query key.
   - What's unclear: whether scanning `queryClient.getQueryData` for already-loaded list entities is worth the complexity vs just relying on the batch.
   - Recommendation: SKIP the manual list-scan in v1 (the batch is ≤2 requests and `staleTime` 5min already avoids refetch on re-open). The batch keys satisfy D-25-1's "≤2 requests/page." Treat list-scan as a later optimization. Planner: keep `useResolveNotificationAmounts` API stable so it can be added without consumer changes.

3. **`limit` for the inbox page — 20 confirmed?**
   - 25-UI-SPEC and CONTEXT both reference ~20. Recommendation: `limit=20`, which also bounds the by-IDs cap. Confirmed sufficient.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node/npm (frontend build, vitest) | Frontend unit tests + build | ✓ (repo standard) | per package.json | — |
| Go toolchain (`just test-unit`) | Backend handler unit tests | ✓ | repo standard | — |
| Docker / testcontainers | Backend integration tests (`charge_repository` WHERE id IN), Playwright e2e | ✗ (stated unavailable) | — | Author tests; run later in CI. Unit-level handler tests (mockery) cover the logic without Docker. |

**Missing dependencies with no fallback:** none block authoring.
**Missing dependencies with fallback:** Docker — integration + e2e tests are **authored but not run** this phase; covered by mockery unit tests (backend) and pure-function unit tests (frontend) in the meantime.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frontend unit | vitest ^4.1.6 (jsdom), `src/**/*.test.{ts,tsx}` |
| Frontend e2e | Playwright (`frontend/e2e/`), `data-testid` selectors only, route-mock via `page.route().fulfill()` |
| Backend unit | Go `testify` + mockery mocks (`go test -short`) |
| Backend integration | `ServiceTestWithDBSuite` testcontainers (Docker-gated, `-short`-skipped) |
| Quick run (frontend) | `cd frontend && npm run test:component` |
| Quick run (backend) | `cd backend && just test-unit` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-25-1 | Charges `id[]` filter binds + IDOR scope | unit (Go) | `cd backend && go test ./internal/handler/ -run TestChargeHandler_List` | ❌ Wave 0 |
| D-25-1 | Transactions `/by-ids` reuses Search(Period{0,0}) | unit (Go) | `cd backend && go test ./internal/handler/ -run TestTransactionHandler_ListByIDs` | ❌ Wave 0 |
| D-25-1 | `id IN` repo clause | integration (Go) | `cd backend && just test-integration` (Docker) | ❌ Wave 0 (authored-not-run) |
| D-25-1 | Resolver maps ids → {amount, amountState}; missing detection | unit (vitest, mocked api) | `cd frontend && npm run test:component` | ❌ Wave 0 |
| INBOX-01..04 | describeNotification copy per type/amountState | unit (vitest, pure) | `cd frontend && npm run test:component` | ❌ Wave 0 |
| INBOX-02 | Badge cap (9+) derivation | unit (vitest, pure) | `cd frontend && npm run test:component` | ❌ Wave 0 |
| INBOX-04 | Optimistic mark-read cache reducer (flip read, decrement floor-0) | unit (vitest) | `cd frontend && npm run test:component` | ❌ Wave 0 |
| INBOX-01..04 | Inbox open, list render, unread styling, mark-all, tap→navigate | e2e (Playwright, mocked routes) | `cd frontend && npm run test:e2e` (Docker) | ❌ Wave 0 (authored-not-run) |

### Sampling Rate
- **Per task commit:** the matching quick-run command above.
- **Per wave merge:** `cd frontend && npm run test:component` + `cd backend && just test-unit`.
- **Phase gate:** both unit suites green; Playwright + integration authored (run in CI where Docker exists).

### Wave 0 Gaps
- [ ] `frontend/src/hooks/useResolveNotificationAmounts.test.ts` — batch mapping + missing detection (mock `fetchChargesByIds`/`fetchTransactionsByIds`)
- [ ] `frontend/src/components/notifications/describeNotification.test.ts` — copy per type × amountState (pure)
- [ ] `frontend/src/hooks/useMarkNotificationRead.test.tsx` — optimistic flip + decrement + rollback (QueryClient harness; precedent: `usePushSubscription.test.tsx`)
- [ ] `backend/internal/handler/charge_handler_test.go` — extend with `id[]` bind + IDOR assertion
- [ ] `backend/internal/handler/transaction_handler_test.go` — add `ListByIDs` cases
- [ ] `backend/internal/repository/charge_repository_test.go` — `id IN` integration (Docker-gated)
- [ ] `frontend/e2e/tests/notifications-inbox.spec.ts` — mocked-route e2e (Docker-gated)

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing JWT/cookie auth middleware on `/api` group (unchanged) |
| V3 Session Management | no | No session changes |
| V4 Access Control | **yes** | **IDOR is the central risk.** Charges: existing List handler force-sets `options.UserID`; repo applies owner WHERE before `id IN`. Transactions `ListByIDs`: MUST set `filter.UserID = &userID`. Not-owned ids fall out → `missing`. |
| V5 Input Validation | yes | `id[]` parsed as `[]int` by Echo binder; non-int → bind error → 400. Empty ids → 200 empty (no error). Cap ≤20 documented. |
| V6 Cryptography | no | None |

### Known Threat Patterns for Go/Echo + React
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR via id[]-filter (read another user's charge/transaction) | Information Disclosure / Elevation | User-scope WHERE applied alongside id filter (verified for charges; required for tx ListByIDs) |
| Open-redirect on tap-navigation | Tampering | `deriveDeepLink` returns only fixed internal paths (`/charges`, `/transactions`, `/`); no user-supplied URL. Phase 24 SW-nav already guards `startsWith('/')`. |
| SQL injection via id filter | Tampering | GORM parameterized `query.Where("id IN ?", ids)` — never string-interpolated |

---

## Project Constraints (from CLAUDE.md)

**Root CLAUDE.md:** Money is **cents (int64)** end-to-end (resolver returns cents; format only at display via `formatBalance`). Times UTC. Swagger generated from handler annotations — run `just generate-docs` after the charge/transaction handler annotation touch. Spans both layers → honor both `backend/CLAUDE.md` and `frontend/CLAUDE.md`.

**backend/CLAUDE.md:** Layered (handler→service→repo). Handlers thin: extract userID, bind, call service, `pkgErrors.ToHTTPError`. Business logic in service (here we add NO service logic — reuse). `just generate-docs` after annotation change; **no `just generate-mocks`** (no interface change). SearchOptions/Filter structs for query params. Handler tests inject user via `appcontext.WithUserID`, use mockery + `httptest`.

**frontend/CLAUDE.md:** Routes thin; pages own logic. ALL fetching via TanStack Query (no `fetch` in components). Query hooks return `{query, invalidate}`; mutation hooks return `{mutation}`, **caller invalidates**. QueryKeys const (no magic strings). Derived state via `select`. **Zero `useEffect` in components** (60s poll is `refetchInterval`, not an effect). Drawers via `renderDrawer` + `useDrawerContext` (no `useDisclosure`); navigate from drawer roots via global `router`. testIds in `src/testIds/`, declared `as const`, re-exported from `index.ts`; e2e uses `getByTestId` only. Mobile-first 375px. No `any`. Amounts cents; `formatBalance` at display only.

---

## Sources

### Primary (HIGH confidence — read this session)
- `backend/internal/handler/notification_handler.go` — inbox API contract (List cursor/limit, UnreadCount, MarkRead `/:id/read`, MarkAllRead `/read-all`)
- `backend/internal/domain/push_subscription.go` — `Notification`, `NotificationListResult{notifications,next_cursor,has_more}`, `NotificationUnreadCountResponse{count int64}`
- `backend/internal/handler/charge_handler.go` — List binds `ChargeSearchOptions`, force-sets `options.UserID` (IDOR gate)
- `backend/internal/domain/charge.go` — `ChargeSearchOptions` (no IDs field), `Charge.Amount *int64`
- `backend/internal/repository/charge_repository.go` — `Search()` filter structure (where to add `id IN`)
- `backend/internal/handler/transaction_handler.go` — `Search` requires month/year (400 otherwise); `GetByID` uses `Search(Period{0,0}, TransactionFilter{IDs,WithSettlements:true})`
- `backend/internal/domain/transaction.go` — `TransactionFilter.IDs []int query:"id[]"` (already present)
- `backend/cmd/server/main.go` — verified routes (no `GET /api/charges/:id`; transactions `/:id` after static GETs)
- `backend/internal/handler/charge_handler_test.go` — mockery handler test pattern
- `frontend/package.json` — versions (TanStack Query 5.71, Mantine 9.2.1, vitest 4.1.6)
- `frontend/src/api/{charges,transactions}.ts` — fetch-wrapper conventions; `id[]` append pattern in `fetchBalance`/`fetchTransactions`
- `frontend/src/utils/{queryKeys,formatCents,pushDeepLink}.ts`, `frontend/src/components/{MobileTabBar,MobileMoreDrawer,DesktopSidebar}.tsx`, `frontend/src/hooks/{useChargesPendingCount,useAccounts,useServiceWorkerNavigation}.ts`, `frontend/vitest.config.ts`, `frontend/CLAUDE.md`, `backend/CLAUDE.md`
- `.planning/phases/25-frontend-notification-inbox/25-CONTEXT.md`, `25-UI-SPEC.md`

### Secondary
- TanStack Query v5 `useInfiniteQuery` (`initialPageParam` + `getNextPageParam`) and optimistic-update (`onMutate`/`onError`/`onSettled`) patterns — standard v5 API, matches installed ^5.71.10. [CITED: tanstack.com/query/v5]

### Tertiary
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions read from package.json; zero new deps
- Backend additions: HIGH — verified every struct/handler/route; changes are additive and minimal
- Bulk-resolution design (D-25-1): HIGH — grounded in existing `id[]` binder + `TransactionFilter.IDs` + List IDOR gate
- Frontend wiring: HIGH — conventions verified against existing hooks/components
- Testing limits: HIGH — Docker-less constraint explicit; unit coverage paths verified

**Research date:** 2026-05-30
**Valid until:** 2026-06-29 (stable stack; re-verify package versions if >30 days)
