# Roadmap: Couples Finance App

## Milestones

- ✅ **v1.0 Recurrence Redesign** — Phases 1–4 (shipped 2026-04-10)
- ✅ **v1.1 Charges** — Phases 5–8 (shipped 2026-04-16)

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

### v1.2 Transactions Bulk Actions (Phase 9)

- [ ] **Phase 9: Bulk Actions** — Selection, toolbar with category/date pickers, propagation drawer, and progress tracking for bulk transaction updates

Full details: `.planning/milestones/v1.1-ROADMAP.md`

### Phase 9: Bulk Actions

**Goal**: Users can apply bulk category and date changes to selected transactions, with propagation control for installments and real-time progress feedback
**Depends on**: Phase 8 (existing selection state, SelectionActionBar, BulkDeleteProgressDrawer, PropagationSettingsDrawer infrastructure)
**Requirements**: SEL-01, SEL-02, BAR-01, BAR-02, BAR-03, BAR-04, PROP-01, PROP-02, PROG-01, PROG-02, PROG-03, PROG-04
**Success Criteria** (what must be TRUE):

1. User can select transactions using existing checkboxes and see category change and date change actions appear in the selection action bar
2. User can pick a category from a dropdown in the toolbar and apply it to all selected transactions; linked transactions where the user is not the original owner are silently skipped
3. User can pick a date from a date picker in the toolbar and apply it to all selected transactions; linked transactions where the user is not the original owner are silently skipped
4. When any selected transaction belongs to a recurring series, the propagation settings drawer appears before the bulk action executes, and the user's single choice applies to all installment transactions in the batch
5. During bulk update execution, user sees a progress drawer showing per-transaction status (in-progress, success, error) with a progress bar
6. On completion, user sees a success state with the count of updated transactions; if an update fails, user sees the failed transaction and the remaining list; in both cases, the transactions query is invalidated so the list reflects current state
   **Plans**: 3 plans
   Plans:

- [x] 09-01-PLAN.md — Generic BulkProgressDrawer + parameterized PropagationSettingsDrawer
- [x] 09-02-PLAN.md — SelectCategoryDrawer + SelectDateDrawer input drawers
- [x] 09-03-PLAN.md — Wire SelectionActionBar menu + bulk action handlers in transactions page
      **UI hint**: yes

### Phase 10: Request Logging & Observability

**Goal**: Structured request logging using zerolog with Stripe's single-log-per-request pattern, context-propagated logger accessible from all layers, dynamic log leveling, and configurable minimum level
**Depends on**: None (cross-cutting concern, can be added independently)
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, LOG-06, LOG-07, LOG-08, LOG-09, LOG-10
**Success Criteria** (what must be TRUE):

1. Every HTTP request emits exactly one structured JSON log line on completion, containing method, path, status, latency, IP, and user_id
2. Any layer (handler, service, repository) can append arbitrary fields to the request log via `context.Context` without importing HTTP packages
3. Any layer can emit intermediate logs (debug/warn) that automatically carry all accumulated request context
4. Final log level is dynamic: 2xx→info, 4xx→warn, 5xx→error
5. Minimum log level is configurable via environment variable; requests below threshold are not emitted
6. Existing request handling and error responses are unaffected

**Plans**: 2 plans
Plans:
- [x] 10-01-PLAN.md — pkg/applog package: Logger wrapper, WithLogger, FromContext, field accumulation
- [x] 10-02-PLAN.md — LoggingMiddleware, ErrorHandler integration, auth user_id injection, config + main.go wiring
**UI hint**: no

## Progress

| Phase                                                | Milestone | Plans Complete | Status      | Completed  |
| ---------------------------------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Domain & Validation                               | v1.0      | 3/3            | Complete    | 2026-04-09 |
| 2. Service & API                                     | v1.0      | 2/2            | Complete    | 2026-04-09 |
| 3. Frontend                                          | v1.0      | 1/1            | Complete    | 2026-04-10 |
| 4. Tests                                             | v1.0      | 2/2            | Complete    | 2026-04-10 |
| 5. Charge Domain & DB                                | v1.1      | 2/2            | Complete    | 2026-04-14 |
| 6. Charge Repository, Service & API (CRUD + Listing) | v1.1      | 2/2            | Complete    | 2026-04-15 |
| 7. Accept + Atomic Transfer                          | v1.1      | 2/2            | Complete    | 2026-04-16 |
| 8. Frontend                                          | v1.1      | 3/3            | Complete    | 2026-04-16 |
| 9. Bulk Actions                                      | v1.2      | 0/3            | Not started | -          |
| 10. Request Logging & Observability                  | v1.2      | 2/2 | Complete   | 2026-04-17 |

---

_Roadmap started: 2026-04-09 · v1.0 shipped: 2026-04-10 · v1.1 completed: 2026-04-16 · v1.2 started: 2026-04-17_
