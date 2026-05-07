# Roadmap: Couples Finance App

## Milestones

- ✅ **v1.0 Recurrence Redesign** — Phases 1–4 (shipped 2026-04-10)
- ✅ **v1.1 Charges** — Phases 5–8 (shipped 2026-04-16)
- ✅ **v1.2 Transactions Bulk Actions** — Phases 9–10 (shipped 2026-04-17)
- ✅ **v1.3 Editing Linked Transactions** — Phase 11 (shipped 2026-04-20, Phase 12 deferred)
- ✅ **v1.4 Bulk Update Split Settings** — Phases 13–15 (shipped 2026-05-05)
- ✅ **v1.5 Import Transactions Performance** — Phases 16–21 (shipped 2026-05-07; Phase 20 skipped)

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

---

_Roadmap started: 2026-04-09 · v1.0 shipped: 2026-04-10 · v1.1 shipped: 2026-04-16 · v1.2 shipped: 2026-04-17 · v1.3 shipped: 2026-04-20 · v1.4 shipped: 2026-05-05 · v1.5 shipped: 2026-05-07_
