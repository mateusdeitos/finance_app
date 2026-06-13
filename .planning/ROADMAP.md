# Roadmap: Couples Finance App

## Milestones

- ✅ **v1.0 Recurrence Redesign** — Phases 1–4 (shipped 2026-04-10)
- ✅ **v1.1 Charges** — Phases 5–8 (shipped 2026-04-16)
- ✅ **v1.2 Transactions Bulk Actions** — Phases 9–10 (shipped 2026-04-17)
- ✅ **v1.3 Editing Linked Transactions** — Phase 11 (shipped 2026-04-20, Phase 12 deferred)
- ✅ **v1.4 Bulk Update Split Settings** — Phases 13–15 (shipped 2026-05-05)
- ✅ **v1.5 Import Transactions Performance** — Phases 16–21 (shipped 2026-05-07; Phase 20 skipped)
- 🚧 **v1.6 Push Notifications** — Phases 22–25 (in progress)
- 📋 **v1.7 Transaction Templates** — Phases 26–31 (planned)

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

### v1.7 Transaction Templates (Phases 26–31)

- [ ] **Phase 26: Backend Foundation** - DB migration (opaque JSONB payload), domain/entity types, financial-query isolation
- [ ] **Phase 27: Backend CRUD API** - repository, service (cap + IDOR), handler, wiring, Swagger
- [ ] **Phase 28: SplitSettingsFields Template Mode** - resolve and implement no-amount display in template context
- [ ] **Phase 29: Frontend Chip Apply Flow** - types, API client, query hooks, TemplateQuickChips, stale-ref handling
- [ ] **Phase 30: Frontend Management UI** - TemplatesManagementDrawer, TemplateForm, Save-as-template
- [ ] **Phase 31: E2E Acceptance** - end-to-end coverage for chip apply, management, cap enforcement, stale-ref

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
- [x] 23-02-PLAN.md — NotificationService (post-commit dispatch + D-08 coalescing + pt-BR push + 404/410 prune) + inbox handler (4 endpoints) + DI wiring + route registration (/unread-count, /read-all before /:id/read); MockNotificationService + MockPushSender regenerated; swagger regenerated with 4 /api/notifications paths; go build ./... + go vet green.

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

### Phase 26: Backend Foundation
**Goal**: The database schema for templates is live and the Go domain/entity types exist — template form fields stored in a JSONB `payload` column with a strict `domain.TransactionTemplatePayload` struct as the typed write boundary — isolating templates from all financial query paths from the first deploy, with existence/stale validation deferred to apply (Phase 29)
**Depends on**: Nothing (first phase of v1.7; additive schema change with no existing queries affected)
**Requirements**: TMPL-01, TMPL-05
**Success Criteria** (what must be TRUE):
  1. A `transaction_templates` table exists with columns `id`, `user_id` (NOT NULL), `name` (NOT NULL, `UNIQUE(user_id, name)`), `payload` (JSONB NOT NULL), `created_at`, `updated_at` — no `amount`, no `date`, no `deleted_at`, no per-field FK columns, and no FK to `transactions`
  2. `domain.TransactionTemplate` (`ID`, `UserID`, `Name`, `Payload`) and `domain.TransactionTemplatePayload` (type, account_id, category_id, destination_account_id, description, tag_ids, split_settings) exist; a unit test proves a payload unmarshals into the strict struct and re-marshals preserving all fields including percentage vs fixed-amount split rows (TMPL-05); `amount`/`date` keys are dropped by the strict unmarshal
  3. The backend validates payload SHAPE via the strict struct on write, but performs NO existence check — deleting a category/account/tag requires no template cleanup (stale ids filtered at apply time, Phase 29; no CategoryService.Delete extension)
  4. All existing financial queries (`Search`, `GetBalance`, `FindOrphanedSettlementTransactions`) are unaffected — no template rows appear in transaction lists or balance calculations
**Plans**: TBD

### Phase 27: Backend CRUD API
**Goal**: A fully functional, IDOR-scoped template API exists at `/api/transaction-templates` with cap enforcement that is race-safe — any authenticated user can create up to 3 personal templates, list, update, and delete them, and no user can access another user's templates
**Depends on**: Phase 26
**Requirements**: TMPL-02, TMPL-03, TMPL-04, SAFE-01, SAFE-02
**Success Criteria** (what must be TRUE):
  1. GET /api/transaction-templates returns only the authenticated user's templates (never another user's), ordered by created_at ASC
  2. POST /api/transaction-templates creates a template and returns it; a second concurrent POST when count is already 3 returns an error with tag `TEMPLATE.LIMIT_REACHED` (race-safe via conditional INSERT)
  3. PUT /api/transaction-templates/:id updates the template's fields including tag replacement; requesting with another user's template ID returns 404, not 403
  4. DELETE /api/transaction-templates/:id removes the template and its tag associations; requesting with another user's template ID returns 404
  5. Swagger documentation is generated and reflects all four endpoints with correct request/response schemas
**Plans**: TBD

### Phase 28: SplitSettingsFields Template Mode
**Goal**: The `SplitSettingsFields` component works correctly in a no-amount context — the template form can embed it without displaying a misleading "R$0,00" live calculation or causing confusing UX when no amount is present
**Depends on**: Phase 26 (domain types must exist for the frontend schema to reference)
**Requirements**: MNG-03
**Success Criteria** (what must be TRUE):
  1. When `SplitSettingsFields` is rendered inside the template form (where no amount field exists), the live percentage-of-total or amount calculation display is suppressed or replaced with a neutral indicator — no "R$0,00" is shown to the user
  2. The split mode toggle (percentage vs fixed-amount) still works correctly in template context, allowing the user to choose how the split is saved
  3. The existing transaction form's `SplitSettingsFields` behavior is unchanged — the prop or conditional is additive, not a breaking change
**UI hint**: yes
**Plans**: TBD

### Phase 29: Frontend Chip Apply Flow
**Goal**: Users see a row of template chips at the top of the transaction form; clicking a chip fills the form with the template's saved values, leaves the amount blank and focused, and handles stale references (deleted account, category, connection) without errors or crashes
**Depends on**: Phase 27 (API must exist), Phase 28 (SplitSettingsFields mode resolved before split apply can be tested)
**Requirements**: APPLY-01, APPLY-02, APPLY-03, APPLY-04
**Success Criteria** (what must be TRUE):
  1. The chip row is visible at the top of the transaction form when the user has at least one template; it is absent when the user has no templates (conditional render)
  2. Clicking a chip calls `reset()` with the template's fields, sets `amount: 0` and `date: today`, and moves keyboard focus to the amount field — the user's next keystroke enters the amount
  3. The split configuration from the template is applied to the form on chip click, preserving percentage vs fixed-amount mode so the form shows the correct split UI without requiring re-selection
  4. Clicking a chip when the template's account has been deleted clears the account field but preserves all other fields; clicking when the template's category or tags have been deleted silently clears only those fields — no error, no blank form, no crash
**UI hint**: yes
**Plans**: TBD

### Phase 30: Frontend Management UI
**Goal**: Users can create, edit, and delete templates from a dedicated management drawer and can save the current transaction form's state as a new template via a "Save as template" action — completing the full self-service lifecycle
**Depends on**: Phase 28 (SplitSettingsFields mode resolved for TemplateForm), Phase 29 (chip row exists so mutations immediately reflect in chips)
**Requirements**: MNG-01, MNG-02
**Success Criteria** (what must be TRUE):
  1. A user can open the template management drawer from within the transactions area; inside it they can see all their templates listed by name with type and account visible
  2. A user can create a new template from the management drawer with a name, type, account, category, tags, description, and split config — the chip row updates immediately after creation
  3. A user can edit an existing template's saved fields from the management drawer; changes are reflected in the chip row without a page reload
  4. A user can delete a template from the management drawer; the corresponding chip disappears immediately
  5. A user can click "Save as template" inside the create-transaction form to save the current form's fields as a new template (name auto-suggested from description); the action is disabled when the user already has 3 templates
**UI hint**: yes
**Plans**: TBD

### Phase 31: E2E Acceptance
**Goal**: Playwright end-to-end tests verify the complete template lifecycle — chip apply, management CRUD, cap enforcement, and stale-reference degradation — across real browser interactions, providing an acceptance gate before shipping v1.7
**Depends on**: Phase 29, Phase 30
**Requirements**: (cross-cutting acceptance coverage for TMPL-01..05, APPLY-01..04, MNG-01..03, SAFE-01..02)
**Success Criteria** (what must be TRUE):
  1. E2E test: create a template → chip appears in the transaction form; click chip → form is filled, amount field is blank and focused, date is today
  2. E2E test: edit a template → chip label updates; delete a template → chip disappears
  3. E2E test: attempt to create a 4th template → "Save as template" is disabled and the management drawer's create button is disabled
  4. E2E test: apply a template whose account was deleted → account field is blank, all other fields are filled, no error shown
  5. E2E test: create 3 templates, create several transactions → account balances are unaffected (templates are isolated from financial queries)
**Plans**: TBD

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
| 22. Backend Subscription Foundation | v1.6 | 3/3 | Complete | 2026-05-30 |
| 23. Backend Notification Events & Inbox API | v1.6 | 3/3 | Complete | 2026-05-30 |
| 24. Frontend Permission, Subscribe & Service Worker | v1.6 | 5/5 | Complete (UAT pending) | 2026-05-30 |
| 25. Frontend Notification Inbox | v1.6 | 5/5 | Complete (e2e CI-deferred) | 2026-05-30 |
| 26. Backend Foundation | v1.7 | 0/? | Not started | - |
| 27. Backend CRUD API | v1.7 | 0/? | Not started | - |
| 28. SplitSettingsFields Template Mode | v1.7 | 0/? | Not started | - |
| 29. Frontend Chip Apply Flow | v1.7 | 0/? | Not started | - |
| 30. Frontend Management UI | v1.7 | 0/? | Not started | - |
| 31. E2E Acceptance | v1.7 | 0/? | Not started | - |

---

_Roadmap started: 2026-04-09 · v1.0 shipped: 2026-04-10 · v1.1 shipped: 2026-04-16 · v1.2 shipped: 2026-04-17 · v1.3 shipped: 2026-04-20 · v1.4 shipped: 2026-05-05 · v1.5 shipped: 2026-05-07 · v1.6 started: 2026-05-30 · v1.7 planned: 2026-06-08_
