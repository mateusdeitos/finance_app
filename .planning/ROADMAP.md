# Roadmap: Couples Finance App

## Milestones

- ✅ **v1.0 Recurrence Redesign** — Phases 1–4 (shipped 2026-04-10)
- ✅ **v1.1 Charges** — Phases 5–8 (shipped 2026-04-16)
- ✅ **v1.2 Transactions Bulk Actions** — Phases 9–10 (shipped 2026-04-17)
- ✅ **v1.3 Editing Linked Transactions** — Phase 11 (shipped 2026-04-20, Phase 12 deferred)
- 🔄 **v1.4 Bulk Update Split Settings** — Phases 13–15 (active)

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

<details open>
<summary>🔄 v1.4 Bulk Update Split Settings — ACTIVE</summary>

- [ ] **Phase 13: BulkDivisionDrawer Form** — Percentage-only split form with dynamic rows, sum-validates-to-100, and smart connected-account pre-selection
- [ ] **Phase 14: Bulk Action Wiring & Cent-Exact Conversion** — Menu integration, disabled state, percentage→cents conversion with last-split-absorbs-rest, and sequential progress-drawer execution with silent skip for linked txs
- [ ] **Phase 15: E2E Coverage & Rounding Verification** — Playwright happy-path test and cent-exact verification that Σ split.amount equals tx.amount across rounding edge cases

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
**Plans**: TBD

### Phase 12: Frontend Edit Form
**Goal**: Users editing a linked transaction see only the fields they can change, with non-editable fields clearly disabled and the propagation drawer available when recurrences exist
**Depends on**: Phase 11
**Requirements**: FE-01, FE-02, FE-03, FE-04, FE-05
**Success Criteria** (what must be TRUE):
  1. When opening the edit form for a linked transaction, amount and account fields are visible but disabled and cannot be interacted with
  2. The transaction type selector is not rendered when editing a linked transaction
  3. The recurrence toggle and its associated inputs are not rendered when editing a linked transaction
  4. The split settings section is not rendered when editing a linked transaction
  5. When editing a linked transaction that belongs to a recurring series, the propagation settings drawer appears and the user can select all/current/current_and_future before saving
**Plans**: TBD
**UI hint**: yes

### Phase 13: BulkDivisionDrawer Form
**Goal**: Users can open a percentage-only split-settings drawer from the bulk transactions flow, with split rows that validate to 100% and smart pre-selection when exactly one connected account exists
**Depends on**: Nothing (first phase of v1.4; reuses renderDrawer promise pattern from v1.2)
**Requirements**: UI-03, UI-04, FORM-01, FORM-02, FORM-03
**Success Criteria** (what must be TRUE):
  1. A `BulkDivisionDrawer` component renders a React Hook Form with dynamic split rows (`useFieldArray`), each row capturing a `connection_id` and a `percentage`
  2. The drawer shows no fixed-amount toggle — only percentage input is available on every row
  3. The submit button is disabled (or submit is blocked) whenever the sum of all row percentages does not equal exactly 100
  4. When the user has exactly one connected account, the drawer opens with that account pre-selected in the first row
  5. When the user has two or more connected accounts, the drawer opens without any pre-selection and the user explicitly picks the account in the first row
**Plans**: TBD
**UI hint**: yes

### Phase 14: Bulk Action Wiring & Cent-Exact Conversion
**Goal**: The "Divisão" bulk action is fully wired into `SelectionActionBar` and, on submit, converts percentages into cents per-transaction (last split absorbs the rounding remainder) before sequentially applying the update to each selected transaction via the existing progress drawer
**Depends on**: Phase 13
**Requirements**: UI-01, UI-02, PAY-01, PAY-02, PAY-03, BULK-01, BULK-02, BULK-03
**Success Criteria** (what must be TRUE):
  1. A "Divisão" menu item appears in `SelectionActionBar` positioned immediately before the `Menu.Divider` that precedes "Excluir"
  2. When the user has zero connected accounts, the "Divisão" menu item is visibly disabled and surfaces a message explaining that a connected account is required
  3. On submit, for every selected transaction the frontend computes each split's `amount` in cents as `round(tx.amount * percentage / 100)` with the last split absorbing the rounding remainder so `Σ split.amount === tx.amount` holds exactly
  4. The outgoing `split_settings` array on each `PUT /api/transactions/{id}` contains only `connection_id` and `amount` — no `percentage` field is sent on the wire
  5. Each PUT request carries the full existing transaction payload (not a partial), matching the pattern from commit `19f2bbb`
  6. The existing `BulkProgressDrawer` is reused to show sequential per-transaction progress, and linked/unsplittable transactions in the selection are silently skipped (no error rows surfaced), while income transactions are processed normally
**Plans**: TBD
**UI hint**: yes

### Phase 15: E2E Coverage & Rounding Verification
**Goal**: The bulk split flow has Playwright e2e coverage for the happy path and explicit verification that percentage-to-cent conversion produces exact sums with no 1-cent drift
**Depends on**: Phase 14
**Requirements**: TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. A Playwright e2e test drives the full happy path: single connected account auto-selected in the drawer, a multi-transaction selection is submitted, and each transaction reflects the new split settings after the run completes
  2. A Playwright (or unit) test verifies that for a representative percentage mix on an odd-cent amount (e.g. 30/70 split on an amount that does not divide evenly by 100), `Σ split.amount === tx.amount` with the last split absorbing the rounding remainder
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
| 11. Backend Validation & Propagation | v1.3 | 2/2 | Complete   | 2026-04-18 |
| 12. Frontend Edit Form | v1.3 | 0/? | Deferred | - |
| 13. BulkDivisionDrawer Form | v1.4 | 0/? | Not started | - |
| 14. Bulk Action Wiring & Cent-Exact Conversion | v1.4 | 0/? | Not started | - |
| 15. E2E Coverage & Rounding Verification | v1.4 | 0/? | Not started | - |

---

_Roadmap started: 2026-04-09 · v1.0 shipped: 2026-04-10 · v1.1 shipped: 2026-04-16 · v1.2 shipped: 2026-04-17 · v1.3 shipped: 2026-04-20 · v1.4 started: 2026-04-20_
