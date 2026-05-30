---
phase: 25
slug: frontend-notification-inbox
created: 2026-05-30
source: user decision during /gsd:progress → run-25 handoff
---

# Phase 25 — Locked Decisions (for the planner)

## D-25-1 — Entity amount resolution = BULK get-by-IDs (avoid N+1)

The inbox shows each notification's amount, resolved from the referenced entity
(`charge` or `transaction`). To avoid an N+1 across a page of ~20 notifications,
resolve amounts in **batched, by-IDs** queries — at most **2 requests per page**
(one for the distinct charge IDs, one for the distinct transaction IDs), not one
request per row.

### Backend facts (verified)
- **Transactions — needs a small backend touch (NOT a free reuse of the list route).**
  `domain.TransactionFilter` already has `IDs []int` (`query:"id[]"`) and
  `TransactionService.Search` honors it (that's how `GET /api/transactions/:id`
  works internally: `Search(..., Period{0,0}, TransactionFilter{IDs:[]int{id},
  WithSettlements:true})`). **BUT** the HTTP list handler `TransactionHandler.Search`
  (`GET /api/transactions`) **requires valid `month`+`year` query params (400
  otherwise)** and runs `period.IsValid()` — so it CANNOT be used for a
  cross-period bulk-by-IDs fetch. The per-`:id` route bypasses this at the service
  layer. **Planner decision:** add a dedicated guarded batch path that hits the
  service with `Period{0,0}` + `TransactionFilter{IDs, WithSettlements:true}` +
  `UserID` scoping — e.g. `GET /api/transactions/by-ids?id[]=<a>&id[]=<b>` (mirror
  the IDOR scoping the existing handlers use: `filter.UserID = &userID`). Keep it
  tiny; reuse `TransactionService.Search` (no new service method). Confirm whether
  a `POST .../by-ids` body is preferable if URLs get long for ~20 ids (recommend
  GET with repeated `id[]` for ≤20; document the cap).
- **Charges — small backend addition required.** `domain.ChargeSearchOptions`
  has NO `IDs` field today; `charge_repository.go` filters only by
  user/status/connection. Add:
  1. `IDs []int` (e.g. `query:"id[]"`) to `ChargeSearchOptions`.
  2. A `WHERE id IN (?)` clause in the charge repository's list query when
     `len(options.IDs) > 0`.
  3. Expose via the EXISTING `GET /api/charges` List handler (it already binds
     `ChargeSearchOptions` and **force-sets `options.UserID = userID`** — IDOR
     gate is already there). So `GET /api/charges?id[]=<a>&id[]=<b>` returns only
     the caller's charges among those IDs.
  4. `just generate-docs` after the handler/annotation touch. No new route, no
     service-interface change beyond the filter field → confirm no
     `just generate-mocks` needed (only a struct field + repo WHERE).

### Frontend resolution strategy
- New `src/api/notifications.ts` (inbox list, unread-count, mark-read, mark-all)
  per the 25-UI-SPEC API contract (Phase 23 backend already shipped:
  `GET /api/notifications` cursor, `GET /api/notifications/unread-count`,
  `POST /:id/read`, `POST /read-all`).
- A resolver hook (e.g. `useResolveNotificationAmounts`) that:
  - collects the distinct `entity_id`s on the current page split by `entity_type`,
  - fires at most one batched charges query (`id[]`) + one batched transactions
    query (`id[]`, `with_settlements`),
  - is **cache-first** (TanStack Query dedupes; reuse already-cached entities from
    the charges/transactions lists the user may have open),
  - exposes `{ amount, amountState }` per notification where
    `amountState ∈ 'known' | 'loading' | 'missing'` (missing = 404/soft-deleted →
    render `—`), feeding `describeNotification()` from the design's
    `notif-inbox-components.jsx`.
- BRL via existing `formatBalance` (cents → `R$ x.xxx,xx`).

### Why not `/:id` singular
A per-entity `GET /:id` would mean ~20 round-trips per inbox page (N+1). The
batched `id[]` approach bounds it to 2 requests/page and reuses the list-filter
machinery that already exists for transactions.

## Carried-forward (already locked in 25-UI-SPEC "Design Reference (LOCKED)")
- Mobile = bottom-sheet drawer; desktop = full `/notifications` page.
- OD-4: mobile entry = unread **dot on the "Mais" tab** (no new tab) + a
  `MoreDrawer` "Notificações" item; desktop = sidebar nav link with a **blue**
  unread count badge (distinct from the red Cobranças badge).
- Per-type ThemeIcon tints, 8px unread dot, `blue.0` unread row tint
  (dark mode `dark-5`), 2-line clamp description, relative timestamp.
- Amount-inclusive pt-BR copy mirroring Phase 23 D-07 push templates.
- Explicit mark-read only; cursor "Carregar mais"; "Você está em dia" end state.
- INBOX-01..04 → the four success criteria.
