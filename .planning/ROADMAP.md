# Roadmap: Couples Finance App

## Milestones

- ✅ **v1.0 Recurrence Redesign** — Phases 1–4 (shipped 2026-04-10)
- ✅ **v1.1 Charges** — Phases 5–8 (shipped 2026-04-16)
- ✅ **v1.2 Transactions Bulk Actions** — Phases 9–10 (shipped 2026-04-17)
- ✅ **v1.3 Editing Linked Transactions** — Phase 11 (shipped 2026-04-20, Phase 12 deferred)
- ✅ **v1.4 Bulk Update Split Settings** — Phases 13–15 (shipped 2026-05-05)
- 🔄 **v1.5 Import Transactions Performance** — Phases 16–21 (active)

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

<details open>
<summary>🔄 v1.5 Import Transactions Performance — ACTIVE</summary>

- [x] **Phase 16: Baseline Profiling & Diagnostics** — Establish a reproducible perf baseline using React DevTools Profiler against a 100-row CSV (system hard limit) in dev-server mode (`just profile`)
- [ ] **Phase 17: Eliminate Page-Level useWatch Cascade** — Replace the broad `useWatch({ name: 'rows' })` in `ImportTransactionsPage` with `compute`-scoped subscriptions so per-row edits stop re-rendering the page
- [ ] **Phase 18: Move Select Options to Query `select`** — Derive `categoryOptions`/`accountOptions` inside TanStack Query `select` callbacks so Mantine `Select.data` receives stable references across row renders
- [ ] **Phase 19: Scope & Debounce Duplicate Check** — Audit `useDuplicateTransactionCheck`, add debounce + `enabled` gating so date/amount edits stop firing N requests across hundreds of subscribed rows
- [ ] **Phase 20: Virtualize Import Review Table** *(gated post-P19)* — Introduce `@tanstack/react-virtual` and convert `<Table>` to a CSS-grid layout. With 100-row hard limit, this is future-proofing + extra polish; orchestrator may skip if P19 measurements already meet the perf bar
- [ ] **Phase 21: Verification & E2E Coverage** — Re-run profiler vs baseline, run lint/build/e2e suite, add 1 new e2e covering edit-after-scroll on a >100-row CSV, plus a manual smoke test

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

### Phase 16: Baseline Profiling & Diagnostics
**Goal**: A reproducible 100-row CSV fixture and a documented React DevTools Profiler baseline (production preview build) exist so subsequent phases can be measured against numeric before/after evidence
**Depends on**: Nothing (first phase of v1.5)
**Requirements**: PROF-01, PROF-02, PROF-03
**Success Criteria** (what must be TRUE):
  1. A TS generator script under `frontend/scripts/` produces a deterministic 100-row CSV (matching the system's hard-limit max) that the import flow accepts end-to-end; `buildCsvContent` is centralized in `frontend/e2e/helpers/csv.ts` (consumed by both the generator and the 4 e2e files that currently inline it)
  2. `babel-plugin-react-compiler` is empirically checked in the production build (`vite.config.ts` plugin chain + `npm run build` output); the result (active/inactive) is documented in `16-PERF-BASELINE.md`. Wiring is **not** changed in this phase — Phase 17 absorbs it if needed
  3. A baseline profile (commit duration ms + rendered component count for: 1 description keystroke, 1 amount keystroke, 1 checkbox toggle, 1 shift-click row select; all on a fixed mid-list row of the 100-row fixture, captured in `npm run preview` mode with React DevTools) is saved to `.planning/phases/16-baseline-profiling/16-PERF-BASELINE.md`
  4. The page-level `useWatch({ name: 'rows' })` re-render hypothesis is empirically validated against the profile; if contradicted, an additional `16-DIAGNOSIS.md` is produced naming the actual culprit and recommending replan changes (the roadmap is **not** auto-edited)
**Plans:** 3/3 plans executed
- [x] 16-01-PLAN.md — Extract CSV helper + write deterministic 100-row fixture generator (PROF-01)
- [x] 16-02-PLAN.md — Empirical compiler-presence check + baseline doc skeleton (PROF-02)
- [x] 16-03-PLAN.md — Capture 4-scenario profiler baseline + validate useWatch hypothesis (PROF-03) — verdict CONFIRMED
**Context:** `.planning/phases/16-baseline-profiling/16-CONTEXT.md`
**Outcome:** Hypothesis CONFIRMED. Page-level `useWatch({ name: 'rows' })` at `ImportTransactionsPage.tsx:70` is the dominant trigger for keystroke scenarios. Two secondary findings (non-RHF cascade in scenarios 3/4 caused by `useState<Set<number>>` for `selected`; intra-row updater in scenario 2) recorded in `deferred-items.md` as P18/P19 input.

### Phase 17: Eliminate Page-Level useWatch Cascade
**Goal**: Per-row field edits no longer re-render `ImportTransactionsPage` — the page subscribes only to derived aggregates via `useWatch` `compute` callbacks
**Depends on**: Phase 16 (baseline + validated hypothesis)
**Requirements**: RR-01, RR-02
**Success Criteria** (what must be TRUE):
  1. `const rows = useWatch({ control: form.control, name: 'rows' })` (the broad subscription at `ImportTransactionsPage.tsx:70`) is removed
  2. `handleSelectAll` derives count from `useFieldArray.fields.length` instead of a watched array
  3. `toImportRows`/`errorCount` are derived inside `useWatch({ ..., compute })` returning only scalars (`toImportCount`, `errorCount`) — never the raw row array
  4. Profiler re-run on the 200-row baseline shows `ImportTransactionsPage` does NOT re-render on a single description keystroke in any row
**Plans:** TBD

### Phase 18: Move Select Options to Query `select`
**Goal**: Mantine `Select` components in `ImportReviewRow` receive stable `data` references across row renders, by deriving option arrays inside TanStack Query `select` callbacks per `frontend/CLAUDE.md` §3
**Depends on**: Phase 17 (so per-row optimizations are isolated and measurable)
**Requirements**: RR-03, RR-04
**Success Criteria** (what must be TRUE):
  1. `useFlattenCategories` accepts a generic `select<T>` parameter (matching the convention already exposed by `useAccounts`)
  2. `ImportReviewRow` consumes `categoryOptions` and `accountOptions` via `select`-derived query data, not via inline `categories.map(...)` per render
  3. `sharedAccounts` derivation also moves to a `select` slice or is otherwise made reference-stable across row re-renders
  4. Profiler re-run on the 200-row baseline shows that an isolated row re-render commit cost is reduced vs. the post-Phase-17 measurement
**Plans:** TBD

### Phase 19: Scope & Debounce Duplicate Check
**Goal**: `useDuplicateTransactionCheck` no longer fires per keystroke across all rows simultaneously — the check is debounced, disabled for skipped rows, and provably no longer the bottleneck for amount/date editing in large imports
**Depends on**: Phase 18
**Requirements**: NET-01, NET-02
**Success Criteria** (what must be TRUE):
  1. `useDuplicateTransactionCheck` consumers are gated by `enabled: action === 'import'` so skip/duplicate rows do not subscribe
  2. The hook applies a debounce (200–300ms) on the `[date, amount]` dependency before triggering any cache lookup or network call
  3. Editing the amount on a single row in a 500-row CSV does not generate a sustained burst of duplicate-check calls (verified in Network panel or via a small instrumentation test)
  4. Existing duplicate-detection behavior remains correct end-to-end — a true duplicate still flips `action` to `duplicate`, just on a debounced trigger
**Plans:** TBD

### Phase 20: Virtualize Import Review Table
**Goal**: The 100-row import review renders only rows in (and near) the viewport via `@tanstack/react-virtual`, while preserving the existing form behavior, popovers, and scroll-to-error UX. **Gated post-Phase 19** — if Phase 19 already brings the 100-row fixture to a fluid baseline, this phase is downsized or skipped at the orchestrator's call.
**Depends on**: Phase 19
**Requirements**: VIRT-01, VIRT-02, VIRT-03 (under review)
**Success Criteria** (what must be TRUE):
  1. `@tanstack/react-virtual` is installed and `ImportTransactionsPage` uses `useVirtualizer` over `fields` with `overscan` configured
  2. Mantine `Table.Tr`/`Table.Td` is replaced by a CSS-grid based row layout (`<div role="row" />` + `<div role="cell" />`) with the column template applied at the row level so headers and rows align without a `<table>` element
  3. On a 500-row CSV, only ~10–15 row instances are mounted at any given time (verified via React DevTools or a count assertion), and scroll remains smooth (no visible jank)
  4. Validation-error scroll behavior still works: focusing the first invalid row uses `virtualizer.scrollToIndex(firstErrorIndex)` followed by the existing ref-based `scrollIntoView`
  5. All popovers/portals (`SplitPopover`, `RecurrencePopover`, `DatePickerInput`) continue to render correctly above virtualized content
**Plans:** TBD
**UI hint**: yes

### Phase 21: Verification & E2E Coverage
**Goal**: The performance milestone is validated against the Phase 16 baseline with documented numbers, the existing test suite still passes, and a new e2e test covers the virtualization-specific risk of stale form state when scrolling unmounts/remounts rows
**Depends on**: Phase 20
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Profiler results for the same 50/200/500-row CSV scenarios from Phase 16 are recaptured and compared to baseline; the comparison artifact is saved alongside the baseline
  2. `npm run lint`, `npm run build`, and the existing `npm run test:e2e -- import` suite all pass against the new code
  3. A new Playwright e2e test imports a >100-row CSV, scrolls to a row that was never in the initial viewport, edits a field in that row, scrolls back to the top, and asserts the edit persisted (form state survived virtualization unmount/remount)
  4. A manual smoke run covers: upload real CSV, edit visible row, scroll to bottom, edit another row, shift-click selection, bulk action, confirm import — no regressions vs. v1.4 behavior
**Plans:** TBD

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
| 16. Baseline Profiling & Diagnostics | v1.5 | 2/3 | In Progress|  |
| 17. Eliminate Page-Level useWatch Cascade | v1.5 | 0/? | Not started | - |
| 18. Move Select Options to Query select | v1.5 | 0/? | Not started | - |
| 19. Scope & Debounce Duplicate Check | v1.5 | 0/? | Not started | - |
| 20. Virtualize Import Review Table | v1.5 | 0/? | Not started | - |
| 21. Verification & E2E Coverage | v1.5 | 0/? | Not started | - |

---

_Roadmap started: 2026-04-09 · v1.0 shipped: 2026-04-10 · v1.1 shipped: 2026-04-16 · v1.2 shipped: 2026-04-17 · v1.3 shipped: 2026-04-20 · v1.4 shipped: 2026-05-05 · v1.5 started: 2026-05-05_
