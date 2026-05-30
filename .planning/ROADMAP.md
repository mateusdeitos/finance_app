# Roadmap: Couples Finance App

## Milestones

- ✅ **v1.0 Recurrence Redesign** — Phases 1–4 (shipped 2026-04-10)
- ✅ **v1.1 Charges** — Phases 5–8 (shipped 2026-04-16)
- ✅ **v1.2 Transactions Bulk Actions** — Phases 9–10 (shipped 2026-04-17)
- ✅ **v1.3 Editing Linked Transactions** — Phase 11 (shipped 2026-04-20, Phase 12 deferred)
- ✅ **v1.4 Bulk Update Split Settings** — Phases 13–15 (shipped 2026-05-05)
- ✅ **v1.5 Import Transactions Performance** — Phases 16–21 (shipped 2026-05-07; Phase 20 skipped)
- 🚧 **v1.6 Push Notifications** — Phases 22–25 (in progress)

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
| 24. Frontend Permission, Subscribe & Service Worker | v1.6 | 0/5 | Planned | - |
| 25. Frontend Notification Inbox | v1.6 | 0/? | Not started | - |

---

_Roadmap started: 2026-04-09 · v1.0 shipped: 2026-04-10 · v1.1 shipped: 2026-04-16 · v1.2 shipped: 2026-04-17 · v1.3 shipped: 2026-04-20 · v1.4 shipped: 2026-05-05 · v1.5 shipped: 2026-05-07 · v1.6 started: 2026-05-30_
