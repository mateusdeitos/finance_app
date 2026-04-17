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
| 10. User Avatar System                               | v1.2      | 0/3            | Not started | -          |

### Phase 10: User Avatar System

**Goal:** Save and display user avatars from OAuth providers across the app — header, split settings, transfers, and account lists. Also introduce avatar-style display for private accounts with customizable background colors.
**Requirements**:
- AVA-01: Save avatar URL from OAuth provider on login
- AVA-02: Display user avatar in top header menu
- AVA-03: Show avatars in split settings connection list
- AVA-04: Show transfer indication as avatar -> avatar in transaction list
- AVA-05: Migrate account column in transaction list to always show avatar (initials for private accounts)
- AVA-06: Allow user to set background color for private account avatars
- AVA-07: Show avatar in account list (shared accounts show connected user avatar)
**Depends on:** Phase 9
**Plans:** 3 plans

Plans:
- [ ] 10-01-PLAN.md — Backend: migrations, domain/entity/service/handler for avatar storage and retrieval
- [ ] 10-02-PLAN.md — Frontend: shared components (UserAvatar, AccountAvatar, ColorSwatchPicker), types, header + split settings wiring
- [ ] 10-03-PLAN.md — Frontend: TransactionRow avatars, AccountCard avatars, AccountForm color picker + visual verification

---

_Roadmap started: 2026-04-09 · v1.0 shipped: 2026-04-10 · v1.1 completed: 2026-04-16 · v1.2 started: 2026-04-17_
