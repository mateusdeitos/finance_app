# Phase 23: Backend Notification Events & Inbox API - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

The backend fires Web Push notifications for all four finance events, persists each
notification with a deep-link reference, and exposes an inbox API for listing and
marking notifications read.

**In scope:**
- Wire `webpush.SendNotification` (webpush-go v1.4.0) with 404/410 stale-subscription
  pruning at the call-site (the `DeleteByEndpointAdmin` repo method already exists from Phase 22).
- `NotificationRepository` write/read methods (create, cursor-paginated list, unread-count,
  mark-read by id, mark-all-read) — the repo stub + `notifications` table already exist from Phase 22.
- A post-commit dispatch path that persists notification rows and best-effort sends pushes,
  hooked into the four event sources: `chargeService.Create`, `chargeService.Accept`,
  `transactionService.Create` (split path), and the split-affecting branch of `transaction_update.go`.
- Inbox API: `GET /api/notifications`, `GET /api/notifications/unread-count`,
  `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`.

**Out of scope (other phases):**
- Frontend permission/subscribe/service-worker (Phase 24) and the in-app inbox UI / deep-link
  navigation (Phase 25). This phase only defines the API contract + reference data.
- Notification retention/cleanup jobs, per-type preference toggles, and any non-Web-Push
  delivery channel (deferred / out of milestone).
</domain>

<decisions>
## Implementation Decisions

### NOTIF-04 — "split updated in a way that affects the partner's linked side"
- **D-01:** `split_updated` fires **only** when a partner-initiated edit changes the user's linked
  side's **amount**, or **adds/removes** the split (the linked side comes into or goes out of
  existence). `transaction_update.go` already exposes `updateChanges.AddedSplit()` /
  `RemovedSplit()` — reuse them; add amount-change detection on the linked side.
- **D-02:** Cosmetic edits to a split transaction — **category, description, date** — do **not**
  fire a notification.
- **D-03:** Only **partner-initiated** changes notify the other user. A user's edits to their own
  side never notify themselves.
- **D-04:** When a split is **removed**, the recipient is still notified (existence change). The
  deep-link references the (soft-deleted) linked transaction; the frontend can render the removed
  state. (Claude discretion on exact rendering — Phase 25.)

### Notification content & privacy
- **D-05:** Push notifications carry **rich content**: partner display name + formatted **BRL
  amount** + short context, per event type. Lock-screen exposure of amounts is accepted (shared
  finances between partners).
- **D-06:** Copy is **Portuguese (pt-BR)**, matching the frontend UI language (backend internal
  error strings stay English — they are developer/log-facing, never shown to users). Currency is
  formatted as `R$ 1.234,56` per existing app conventions.
- **D-07 (proposed templates — Claude discretion, user may adjust):**
  - `charge_received` → `"{partner} te cobrou {amount}: {description}"`
  - `charge_accepted` → `"{partner} aceitou sua cobrança de {amount}"`
  - `split_created` → `"{partner} adicionou uma transação dividida de {amount}"`
  - `split_updated` → `"{partner} atualizou uma transação dividida ({amount})"`
  - bulk summary → `"{partner} adicionou {n} transações divididas"`

### Bulk-operation volume
- **D-08:** Coalesce by **(recipient, notification type) per originating request**: persist **one
  inbox notification row per affected entity** (each deep-linking to its own transaction), but send
  **a single summary push** when one request produces multiple notifications of the same type for
  the same recipient. A single-event request sends one specific push.
- **D-09:** This rule generalizes cleanly: it covers single events (charge create/accept, single
  split) and bulk flows (bulk split v1.4, CSV import, bulk update) without special-casing each
  event source. The dispatcher receives the set of notification events produced by a request after
  commit and groups them before sending.

### Inbox API
- **D-10:** `GET /api/notifications` uses **cursor-based pagination, most-recent-first**, returning
  both read and unread notifications each with a `read` flag. (Cursor preferred over offset for
  stability under concurrent inserts; researcher to confirm the cursor shape — likely
  `(created_at, id)`.)
- **D-11:** `GET /api/notifications/unread-count` returns the **exact** integer count; any "99+"
  style capping is a frontend display concern (Phase 25).
- **D-12:** Marking read is **explicit only** — `POST /api/notifications/:id/read` and
  `POST /api/notifications/read-all`. `GET` endpoints never mutate read state. Auto-mark-on-navigate
  (if desired) is the frontend calling the POST endpoint in Phase 25.
- **D-13:** All inbox endpoints are **IDOR-scoped to the authenticated user** (`user_id` filter on
  every query and on mark-read), consistent with the Phase 22 subscription endpoints.

### Carried forward (locked upstream — do not re-litigate)
- **Dispatch model:** synchronous best-effort in a **goroutine that starts after the originating DB
  transaction commits**; a push failure (incl. network/410) never rolls back or blocks the HTTP
  request (PROJECT.md Key Decisions + NOTIF-06).
- **Library:** `github.com/SherClockHolmes/webpush-go v1.4.0`; prune subscriptions on HTTP
  **404/410** via `PushSubscriptionRepository.DeleteByEndpointAdmin` (built in Phase 22).
- **Persistence shape:** every notification persisted with `type` + `entity_type`/`entity_id`
  deep-link; `notifications` table + `Notification` entity + `NotificationRepository` stub already
  exist from Phase 22.

### Claude's Discretion
- Always **persist the notification row even when the recipient has no active push subscription**
  (the inbox is independent of push delivery; push is attempted only if subscriptions exist).
- Exact dispatcher abstraction (e.g., a `NotificationService` that collects events post-commit),
  goroutine lifecycle/logging, and currency-formatting helper location — planner/researcher decide
  within the layered architecture.
- Push payload JSON shape (title/body/data deep-link) for the service worker — coordinate with the
  Phase 24/25 contract; researcher proposes.
- Failure observability: log push send failures at an appropriate level (no metrics infra required
  for v1.6).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 23: Backend Notification Events & Inbox API" — goal + 6 success criteria.
- `.planning/REQUIREMENTS.md` — NOTIF-01 … NOTIF-06 (the requirement statements this phase satisfies).
- `.planning/PROJECT.md` § "Key Decisions" + § "Current Milestone: v1.6" — locked dispatch model
  (goroutine after commit, best-effort), Web Push choice, deep-link persistence.

### Phase 22 foundation (this phase builds directly on it)
- `.planning/phases/22-backend-subscription-foundation/22-RESEARCH.md` § "Pruning on 404/410 — What
  Goes Where" (the Phase 23 prune call-site, incl. the `resp.StatusCode == 404 || 410` snippet) and
  § "Pitfall 1: endpoint uniqueness scope" (why subscriptions are endpoint-unique / shared-device).
- `.planning/phases/22-backend-subscription-foundation/22-SUMMARY.md` files (22-01/02/03) — what was
  actually built (storage, config, routes).
- `backend/migrations/20260530125310_create_notifications_table.sql` — the `notifications` schema
  (type, entity_type, entity_id, user_id, read, created_at).
- `backend/internal/entity/notification.go` — `Notification` entity + ToDomain/FromDomain.
- `backend/internal/repository/notification_repository.go` — repo stub (db field pre-wired for
  Phase 23 write methods).
- `backend/internal/repository/interfaces.go` (≈line 107–122) — `PushSubscriptionRepository`
  incl. `DeleteByEndpointAdmin(ctx, endpoint)` used by the prune call-site.

### Conventions & integration points
- `backend/CLAUDE.md` — layered architecture, ServiceError conventions, GetTxFromContext, testing
  with testcontainers, mockery.
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`,
  `.planning/codebase/TESTING.md` — repo-wide patterns to match.

### Event source files (where notifications get fired)
- `backend/internal/service/charge_service.go` (`Create`, ≈line 52) — charge_received.
- `backend/internal/service/charge_accept.go` (`Accept`, ≈line 22) — charge_accepted.
- `backend/internal/service/transaction_create.go` (`Create` + `createSettlementsForSplit`,
  `injectUserConnectionsOnSplitSettings`) — split_created.
- `backend/internal/service/transaction_update.go` (+ `updateChanges.AddedSplit/RemovedSplit` in
  `structs.go` ≈line 168/179) — split_updated.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `notifications` table + `Notification` entity + `NotificationRepository` stub (Phase 22) — extend
  the stub with create/list/unread-count/mark-read methods; no new table migration needed.
- `PushSubscriptionRepository.DeleteByEndpointAdmin` (Phase 22) — the prune call-site invokes this
  on 404/410.
- VAPID config + DI wiring + `webpush-go` dependency already present from Phase 22.
- `updateChanges.AddedSplit()` / `RemovedSplit()` helpers — reuse for NOTIF-04 detection.

### Established Patterns
- Layered: Handler (Echo, thin, extracts userID) → Service (business logic, IDOR) → Repository
  (GORM, GetTxFromContext, domain/entity conversion). Match Phase 22's push-subscription slice.
- All times UTC; monetary amounts are cents (int64) end-to-end — format to BRL only when building
  push copy.
- Swagger generated from handler annotations — run `just generate-docs` (or the underlying `swag`
  command; `just` is not installed in the web environment) after adding handler comments.

### Integration Points
- Post-commit dispatch must hook the four service methods above **after** their DB transaction
  commits (not inside it) — aligns with the locked "fire after commit" decision and avoids holding
  the request on push I/O.
- Inbox routes register in `cmd/server/main.go` alongside the Phase 22 push-subscription routes,
  behind the same auth middleware.

</code_context>

<specifics>
## Specific Ideas

- pt-BR push copy with BRL amounts (see D-07 templates).
- Cursor-based pagination "most recent first" (user's exact words) for the inbox list.
- Bulk split / CSV import should feel like "one push, many inbox items" (D-08).

</specifics>

<deferred>
## Deferred Ideas

- **Notification retention / cleanup job** — the table grows unbounded in v1.6; no pruning of old
  rows this milestone. Candidate for a future maintenance phase.
- **Per-notification-type preference toggles** — explicitly out of v1.6 scope (PROJECT.md).
- **"99+" unread-count capping** and **auto-mark-read on navigate** — frontend concerns for Phase 25.
- **Aggregate/list deep-link entity type** — not needed given D-08 (per-tx rows); revisit only if a
  true batch-summary inbox entry is ever wanted.

</deferred>

---

*Phase: 23-backend-notification-events-inbox-api*
*Context gathered: 2026-05-30*
