# Roadmap: Couples Finance App

## Milestones

- ✅ **v1.0 Recurrence Redesign** — Phases 1–4 (shipped 2026-04-10)
- ✅ **v1.1 Charges** — Phases 5–8 (shipped 2026-04-16)
- ✅ **v1.2 Transactions Bulk Actions** — Phases 9–10 (shipped 2026-04-17)
- ✅ **v1.3 Editing Linked Transactions** — Phase 11 (shipped 2026-04-20, Phase 12 deferred)
- ✅ **v1.4 Bulk Update Split Settings** — Phases 13–15 (shipped 2026-05-05)
- ✅ **v1.5 Import Transactions Performance** — Phases 16–21 (shipped 2026-05-07; Phase 20 skipped)
- 🚧 **v1.6 Push Notifications** — Phases 22–25 (in progress)
- 🔜 **v1.7 Budgets (Orçamentos)** — Phases 26–29

## Phases

<details>
<summary>✅ v1.0 Recurrence Redesign (Phases 1–4) — SHIPPED 2026-04-10</summary>

- [x] Phase 1: Domain & Validation (3/3 plans) — completed 2026-04-09
- [x] Phase 2: Service & API (2/2 plans) — completed 2026-04-09
- [x] Phase 3: Frontend (1/1 plan) — completed 2026-04-10
- [x] Phase 4: Tests (2/2 plans) — completed 2026-04-10

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Charges (Phases 5–8) — SHIPPED 2026-04-16</summary>

- [x] Phase 5: Charge Domain & DB (2/2 plans) — completed 2026-04-14
- [x] Phase 6: Repository, Service & API (2/2 plans) — completed 2026-04-15
- [x] Phase 7: Accept + Atomic Transfer (2/2 plans) — completed 2026-04-16
- [x] Phase 8: Frontend (3/3 plans) — completed 2026-04-16

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Transactions Bulk Actions (Phases 9–10) — SHIPPED 2026-04-17</summary>

- [x] Phase 9: Bulk Actions (3/3 plans) — completed 2026-04-17
- [x] Phase 10: User Avatar System (3/3 plans) — completed 2026-04-17

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Editing Linked Transactions (Phase 11) — SHIPPED 2026-04-20 (Phase 12 deferred)</summary>

- [x] Phase 11: Backend Validation & Propagation (2/2 plans) — completed 2026-04-18
- ⏸️ Phase 12: Frontend Edit Form — **deferred to backlog** (FE-01..FE-05)

Full details: `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v1.4 Bulk Update Split Settings (Phases 13–15) — SHIPPED 2026-05-05</summary>

- [x] Phase 13: BulkDivisionDrawer Form (1/1 plan) — completed 2026-04-20
- [x] Phase 14: Bulk Action Wiring & Cent-Exact Conversion (1/1 plan) — completed 2026-04-20
- [x] Phase 15: E2E Coverage & Rounding Verification (3/3 plans) — completed 2026-05-05

Full details: `.planning/milestones/v1.4-ROADMAP.md`

</details>

<details>
<summary>✅ v1.5 Import Transactions Performance (Phases 16–21) — SHIPPED 2026-05-07</summary>

- [x] Phase 16: Baseline Profiling & Diagnostics (3/3 plans) — completed 2026-05-06
- [x] Phase 17: Eliminate Page-Level useWatch Cascade (ad-hoc) — completed 2026-05-07
- [x] Phase 18: Memoize Options + Rearch Selection (ad-hoc) — completed 2026-05-07
- [x] Phase 19: Scope & Debounce Duplicate Check (ad-hoc) — completed 2026-05-07
- [-] Phase 20: Virtualize Import Review Table — **SKIPPED** post-P19 gate decision
- [x] Phase 21: Verification & E2E Coverage (ad-hoc) — completed 2026-05-07

Full details: `.planning/milestones/v1.5-ROADMAP.md` · Retrospective: `.planning/milestones/v1.5-RETROSPECTIVE.md`

</details>

### v1.6 Push Notifications (Phases 22–25)

- [x] **Phase 22: Backend Subscription Foundation** - DB schema, VAPID config, subscription register/remove/prune API (completed 2026-05-30)
- [x] **Phase 23: Backend Notification Events & Inbox API** - 4 event triggers, best-effort dispatch, inbox endpoints (completed 2026-05-30)
- [ ] **Phase 24: Frontend Permission, Subscribe & Service Worker** - permission prompt, subscribe/unsubscribe toggle, SW push handler, deep-link navigation
- [ ] **Phase 25: Frontend Notification Inbox** - inbox UI, unread badge, open-entity navigation, mark-read actions

### v1.7 Budgets (Orçamentos) (Phases 26–29)

- [x] **Phase 26: DB Migrations + Domain Types** - Goose migrations for budgets + budget_alert_thresholds, all Go domain types and GORM entity structs (completed 2026-06-14)
- [ ] **Phase 27: Budget CRUD + Realizado** - Budget management API (create/edit/delete/list) with per-category caps, GetSpent via GetBalance reuse, IDOR guards
- [ ] **Phase 28: Threshold Alerts** - CheckAndFireAlerts with last_fired_period latch, post-commit goroutine hooks on transaction writes, inbox notification persistence
- [ ] **Phase 29: Budget Frontend** - BudgetsPage, BudgetCard with Mantine Progress, BudgetFormDrawer, alert notification navigation, query cache invalidation

## Phase Details

### Phase 11: Backend Validation & Propagation
**Goal**: The backend correctly enforces that only date, description, and category are editable on linked transactions, and propagates those changes using existing diff-based logic
**Depends on**: Nothing (first phase of milestone; builds on existing service layer)
**Requirements**: VAL-01, VAL-02, PROP-01
**Success Criteria** (what must be TRUE):
  1. A PUT request to update amount, account, type, recurrence, or split settings on a linked transaction returns an error
  2. A PUT request to update date, description, or category on a linked transaction succeeds
  3. When a linked transaction's date is updated with propagation=all, all installments in the series shift by the same diff applied via existing logic
  4. When propagation=current_and_future is used, only the current and future installments shift; past installments are unaffected
  5. No new propagation logic is introduced — the existing date diff mechanism is reused for all three propagation modes
**Plans:** 2/2 plans complete

### Phase 12: Frontend Edit Form (deferred)
**Status**: Deferred to backlog — FE-01..FE-05 to be revisited after v1.4

### Phase 13: BulkDivisionDrawer Form
**Status:** Shipped (v1.4) — see `.planning/milestones/v1.4-ROADMAP.md`

### Phase 14: Bulk Action Wiring & Cent-Exact Conversion
**Status:** Shipped (v1.4) — see `.planning/milestones/v1.4-ROADMAP.md`

### Phase 15: E2E Coverage & Rounding Verification
**Status:** Shipped (v1.4) — see `.planning/milestones/v1.4-ROADMAP.md`

### Phase 22: Backend Subscription Foundation
**Goal**: The backend can store Web Push subscriptions per device and is configured to send VAPID-signed pushes; stale subscriptions are pruned automatically
**Depends on**: Nothing (first phase of v1.6; builds on existing config and migration patterns)
**Requirements**: SUB-03, SUB-04
**Success Criteria** (what must be TRUE):
  1. A push_subscriptions table exists in the DB with columns for user_id, endpoint, p256dh key, auth key, and created_at; a notifications table exists with type, entity reference (type + id), user_id, read state, and created_at
  2. VAPID public/private keys are loaded from environment config and available to the notification sender; the app starts without error when keys are present
  3. A POST /api/push-subscriptions endpoint stores a new subscription for the authenticated user and device endpoint, replacing any prior subscription for the same endpoint
  4. A DELETE /api/push-subscriptions endpoint removes the authenticated user's subscription for the given endpoint
  5. A GET /api/push-subscriptions endpoint reports whether the authenticated user already has an active subscription for the given device endpoint, so the frontend can render the correct enabled/disabled state
  6. When a push delivery attempt returns HTTP 404 or 410 from the push service, the corresponding subscription row is deleted from the database automatically
**Plans**: 3 plans
Plans:
**Wave 1**
- [x] 22-01-PLAN.md — webpush-go dependency, VAPID config, push_subscriptions + notifications migrations, domain/entity types

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 22-02-PLAN.md — repository interfaces + push subscription repo (upsert/delete/admin-prune/exists), notification stub, mocks, test suite wiring

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 22-03-PLAN.md — service + 3-endpoint handler, main.go DI/routes/VAPID startup guard, swagger regen, integration tests

### Phase 23: Backend Notification Events & Inbox API
**Goal**: The backend fires Web Push notifications for all four finance events, persists each notification with a deep-link reference, and exposes an inbox API for listing and marking notifications read
**Depends on**: Phase 22
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06
**Success Criteria** (what must be TRUE):
  1. When a charge is created, the charge recipient receives a push notification and a notifications row is persisted with type "charge_received" and a reference to the charge id
  2. When a charge is accepted, the charge creator receives a push notification and a notifications row is persisted with type "charge_accepted" and a reference to the charge id
  3. When a split transaction is created, the partner whose linked side was injected receives a push notification and a notifications row is persisted with type "split_created" and a reference to the linked transaction id
  4. When a split transaction is updated in a way that affects the partner's linked side, that partner receives a push notification and a notifications row is persisted with type "split_updated" and a reference to the linked transaction id
  5. Push dispatch runs in a goroutine that starts after the originating DB transaction commits; a push delivery failure (including network errors) does not cause the originating HTTP request to fail or its DB transaction to roll back
  6. GET /api/notifications returns the authenticated user's notifications newest-first; GET /api/notifications/unread-count returns the unread count; POST /api/notifications/:id/read and POST /api/notifications/read-all mark notifications as read
**Plans**: 3 plans
Plans:

**Wave 1**
- [x] 23-01-PLAN.md — Notification data layer: repository methods (Create/List-cursor/UnreadCount/MarkRead/MarkAllRead), ListByUserID, domain types, cursor index migration, mocks

**Wave 2** *(blocked on Wave 1)*
- [x] 23-02-PLAN.md — NotificationService (post-commit dispatch + D-08 coalescing + pt-BR push + 404/410 prune) + inbox handler (4 endpoints) + DI wiring + swagger

**Wave 3** *(blocked on Wave 2)*
- [x] 23-03-PLAN.md — Event-source hooks (NOTIF-01..04) + DB test-suite wiring + integration tests (NOTIF-01..06, inbox, IDOR, mock PushSender)

### Phase 24: Frontend Permission, Subscribe & Service Worker
**Goal**: Users can grant or revoke browser notification permission from within the app, the frontend registers and removes Web Push subscriptions with the backend, and the service worker handles incoming pushes and routes a tap to the correct entity screen
**Depends on**: Phase 22
**Requirements**: SUB-01, SUB-02, CTRL-01, CTRL-02, CTRL-03
**Success Criteria** (what must be TRUE):
  1. A user who has not yet granted permission is never shown a browser permission prompt on page load; the prompt appears only when they take an explicit in-app action (e.g. tapping an enable button)
  2. After granting permission and subscribing, the current device's push subscription is sent to and stored by the backend; the in-app toggle reflects the "on" state
  3. After disabling notifications via the in-app toggle, the device's push subscription is removed from the backend and the toggle reflects the "off" state
  4. When the backend delivers a push notification, the browser shows an OS/browser-level notification with a title and body describing the event
  5. Tapping a delivered OS/browser notification opens (or focuses) the app and navigates directly to the related charge or transaction; no extra tap or search is required
**Plans**: 5 plans
Plans:

**Wave 1**
- [ ] 24-01-PLAN.md — Backend prerequisites: VAPID public-key endpoint (D-24-1) + per-type push title in buildPayload (D-24-2) + swagger regen
- [ ] 24-02-PLAN.md — Test config widen + jsdom push stubs + pure helpers (urlBase64ToUint8Array, deriveDeepLink) + QueryKey + NotificationsTestIds

**Wave 2** *(blocked on Wave 1)*
- [ ] 24-03-PLAN.md — SW strategy switch (generateSW→injectManifest) + src/sw.ts (precache + preserved auth-boot cache + push + notificationclick)
- [ ] 24-04-PLAN.md — Push API client + usePushSubscription 5-state machine + status query (SUB-01/02, CTRL-01/02)

**Wave 3** *(blocked on Wave 2)*
- [ ] 24-05-PLAN.md — NotificationToggleRow + mobile/desktop wiring + useServiceWorkerNavigation + e2e + human-verify checkpoint (CTRL-02/03)
**UI hint**: yes

### Phase 25: Frontend Notification Inbox
**Goal**: Users can view all their notifications in an in-app inbox, distinguish unread from read ones, navigate to the referenced entity, and mark notifications as read
**Depends on**: Phase 23, Phase 24
**Requirements**: INBOX-01, INBOX-02, INBOX-03, INBOX-04
**Success Criteria** (what must be TRUE):
  1. A user can open a notification inbox from the app navigation; notifications are listed newest-first with a human-readable description of each event
  2. An unread count badge is visible in the navigation entry point when there are unread notifications; unread notifications are visually distinguished from read ones inside the inbox
  3. Tapping a notification navigates the user to the related charge or transaction screen and marks that notification as read
  4. A user can mark all notifications as read in a single action; after doing so the unread badge disappears and all notifications display as read
**Plans**: 5 plans
Plans:
**Wave 1**
- [ ] 25-01-PLAN.md — Backend bulk get-by-IDs: ChargeSearchOptions.IDs + repo WHERE id IN (via existing List), new GET /api/transactions/by-ids handler, swagger, handler tests
- [ ] 25-02-PLAN.md — FE data foundation: Notifications types, QueryKeys, api/notifications.ts, useNotificationInbox (cursor) + useNotificationUnreadCount (60s poll), inbox testIds, describeNotification + tests

**Wave 2** *(blocked on 25-01, 25-02)*
- [ ] 25-03-PLAN.md — Batch amount resolver (useResolveNotificationAmounts, D-25-1) + by-IDs api fns + optimistic mark-read/mark-all mutations (D-25-2) + tests

**Wave 3** *(blocked on 25-02, 25-03)*
- [ ] 25-04-PLAN.md — Inbox UI surfaces: NotificationRow, shared NotificationInboxContent, mobile NotificationInboxDrawer, desktop NotificationInboxPage, thin /notifications route

**Wave 4** *(blocked on 25-02, 25-04)*
- [ ] 25-05-PLAN.md — Nav wiring: DesktopSidebar link + blue badge, MobileTabBar Mais-tab dot, MobileMoreDrawer item; authored Playwright e2e spec
**UI hint**: yes

### Phase 26: DB Migrations + Domain Types
**Goal**: The database schema for private budgets with per-category caps and alert thresholds is in place, and all Go domain types and GORM entity structs compile; no service or handler code yet
**Depends on**: Phase 25 (v1.7 starts after v1.6 ships)
**Requirements**: (none — foundation phase; all v1.7 requirements build on this schema)
**Success Criteria** (what must be TRUE):
  1. A `budgets` table exists with columns for owner_user_id, category_id, amount_cents, active, and timestamps; a `budget_alert_thresholds` table exists as a child of budgets with threshold_pct, last_fired_period, and a unique constraint on (budget_id, threshold_pct)
  2. Both Goose migrations include correct Down blocks and `just migrate-down` executes without constraint errors on a local DB
  3. `go build ./...` passes with the new `internal/domain/budget.go` (Budget, BudgetAlertThreshold, BudgetFilter, BudgetSpentResult, BudgetScope) and `internal/entity/budget.go` (GORM structs with ToDomain/FromDomain) in place
  4. Period-boundary contract is established: all realizado queries will use `domain.Period.StartDate()` / `domain.Period.EndDate()` exclusively — verified by a unit test that asserts a transaction at exactly EndDate() is included and one at EndDate()+1ns is excluded
**Plans**: 3 plans (2 waves)
Plans:

**Wave 1**
- [x] 26-01-PLAN.md — Goose migrations: budgets + budget_alert_thresholds tables (FK CASCADE, UNIQUE, CHECK, Down blocks, migrate-down round-trip)
- [x] 26-02-PLAN.md — domain/budget.go (Budget, BudgetAlertThreshold, BudgetFilter, BudgetSpentResult, BudgetScope Private-only) + Period-boundary contract test

**Wave 2** *(blocked on 26-02)*
- [x] 26-03-PLAN.md — entity/budget.go GORM structs + ToDomain/FromDomain conversions + full `go build ./...` verification (SC3)

### Phase 27: Budget CRUD + Realizado
**Goal**: Users can manage their single private budget (add, edit, remove per-category caps) via the API, and retrieve per-category realized spend for any calendar month computed correctly via GetBalance reuse
**Depends on**: Phase 26
**Requirements**: BUD-01, BUD-02, BUD-03, BUD-04, BUD-05, SPEND-01, SPEND-02, SPEND-03
**Success Criteria** (what must be TRUE):
  1. A user can create a budget entry for a category with a cap in cents; POST /api/budgets returns the new budget with its id, category_id, and amount_cents; creating a second entry for the same category returns a conflict error (one cap per category enforced)
  2. A user can update a category cap (PUT /api/budgets/:id) and the change applies immediately; a user can delete a single category cap or all caps without affecting the underlying transactions
  3. GET /api/budgets returns only the authenticated user's own budget entries (IDOR: another user's budget IDs return 403)
  4. GET /api/budgets/:id/spent?month=YYYY-MM returns spent_cents, limit_cents, and remaining_cents for the given month, computed exclusively via TransactionRepository.GetBalance with CategoryIDs=[budget.category_id] and HideSettlements=false — never new aggregation SQL
  5. A split transaction counts only the owner's net portion in realizado: an integration test creating a 50/50 split expense of R$100 asserts spent_cents=5000 (not 10000) for the owner's private budget
  6. Realizado is scoped to the requested calendar month with no rollover; changing the month parameter returns spend only for that month's transactions
**Plans**: TBD

### Phase 28: Threshold Alerts
**Goal**: When a transaction write causes a category's realized spend to cross a configured threshold for the first time in a calendar month, the budget owner receives a push notification and an inbox entry; the alert never fires twice for the same threshold in the same month
**Depends on**: Phase 27
**Requirements**: ALERT-01, ALERT-02, ALERT-03, ALERT-04
**Success Criteria** (what must be TRUE):
  1. A user can configure one or more threshold percentages (e.g. 80, 100) per category cap via the budget create/update endpoint; alerts can be individually enabled or disabled per cap
  2. After a transaction is committed that causes realized spend to cross a configured threshold, a push notification is delivered to the owner and a notification row of type "budget_alert" is persisted with a deep-link to the budget; the alert fires in a post-commit goroutine and never blocks or fails the originating transaction write
  3. A second transaction in the same calendar month that keeps realized spend above the same threshold does not fire a second alert; the last_fired_period latch is updated only after a successful push delivery, so a push failure leaves the latch unset and the next qualifying write retries delivery
  4. When the calendar month rolls over, the same threshold can fire again for the new month without any manual reset or scheduled job
  5. Two concurrent transaction writes that both cross the same threshold in the same second result in exactly one alert (the conditional UPDATE on last_fired_period acts as the sole write fence; the goroutine that sees rowsAffected=0 skips dispatch)
**Plans**: TBD

### Phase 29: Budget Frontend
**Goal**: Users can open a budget page, visualize per-category spend vs. cap with a progress bar, add and edit category caps with threshold configuration through a validated form, and navigate from a budget alert notification directly to their budget
**Depends on**: Phase 27, Phase 28
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. A user can navigate to a /budgets page from the app sidebar/navigation; each category cap is shown as a card with a Mantine Progress bar displaying spent amount, cap amount, and percentage — with a visually distinct over-budget state (red color, numeric overage) when spent exceeds cap
  2. A user can open a drawer to add a new category cap or edit an existing one; the form validates that cap is a positive amount in cents and that threshold percentages are integers between 1 and 200; submitting an invalid form shows inline errors and does not call the API
  3. The budget progress bars refresh to reflect updated spend after a user creates, edits, or deletes a transaction — without a full page reload; QueryKeys.BudgetSpent is invalidated by all transaction mutations
  4. Selecting a "budget_alert" notification in the inbox navigates the user to the /budgets page; the correct category cap is visually identifiable on arrival
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Domain & Validation | v1.0 | 3/3 | Complete | 2026-04-09 |
| 2. Service & API | v1.0 | 2/2 | Complete | 2026-04-09 |
| 3. Frontend | v1.0 | 1/1 | Complete | 2026-04-10 |
| 4. Tests | v1.0 | 2/2 | Complete | 2026-04-10 |
| 5. Charge Domain & DB | v1.1 | 2/2 | Complete | 2026-04-14 |
| 6. Charge Repository, Service & API (CRUD + Listing) | v1.1 | 2/2 | Complete | 2026-04-15 |
| 7. Accept + Atomic Transfer | v1.1 | 2/2 | Complete | 2026-04-16 |
| 8. Frontend | v1.1 | 3/3 | Complete | 2026-04-16 |
| 9. Bulk Actions | v1.2 | 3/3 | Complete | 2026-04-17 |
| 10. User Avatar System | v1.2 | 3/3 | Complete | 2026-04-17 |
| 11. Backend Validation & Propagation | v1.3 | 2/2 | Complete | 2026-04-18 |
| 12. Frontend Edit Form | v1.3 | 0/? | Deferred | - |
| 13. BulkDivisionDrawer Form | v1.4 | 1/1 | Complete | 2026-04-20 |
| 14. Bulk Action Wiring & Cent-Exact Conversion | v1.4 | 1/1 | Complete | 2026-04-20 |
| 15. E2E Coverage & Rounding Verification | v1.4 | 3/3 | Complete | 2026-05-05 |
| 16. Baseline Profiling & Diagnostics | v1.5 | 3/3 | Complete | 2026-05-06 |
| 17. Eliminate Page-Level useWatch Cascade | v1.5 | ad-hoc | Complete | 2026-05-07 |
| 18. Memoize Options + Rearch Selection | v1.5 | ad-hoc | Complete | 2026-05-07 |
| 19. Scope & Debounce Duplicate Check | v1.5 | ad-hoc | Complete | 2026-05-07 |
| 20. Virtualize Import Review Table | v1.5 | — | Skipped | 2026-05-07 |
| 21. Verification & E2E Coverage | v1.5 | ad-hoc | Complete | 2026-05-07 |
| 22. Backend Subscription Foundation | v1.6 | 3/3 | Complete    | 2026-05-30 |
| 23. Backend Notification Events & Inbox API | v1.6 | 3/3 | Complete   | 2026-05-30 |
| 24. Frontend Permission, Subscribe & Service Worker | v1.6 | 5/5 | Complete (UAT pending) | 2026-05-30 |
| 25. Frontend Notification Inbox | v1.6 | 5/5 | Complete (e2e CI-deferred) | 2026-05-30 |
| 26. DB Migrations + Domain Types | v1.7 | 3/3 | Complete   | 2026-06-14 |
| 27. Budget CRUD + Realizado | v1.7 | 0/? | Not started | - |
| 28. Threshold Alerts | v1.7 | 0/? | Not started | - |
| 29. Budget Frontend | v1.7 | 0/? | Not started | - |

---

_Roadmap started: 2026-04-09 · v1.0 shipped: 2026-04-10 · v1.1 shipped: 2026-04-16 · v1.2 shipped: 2026-04-17 · v1.3 shipped: 2026-04-20 · v1.4 shipped: 2026-05-05 · v1.5 shipped: 2026-05-07 · v1.6 started: 2026-05-30 · v1.7 started: 2026-06-07_
