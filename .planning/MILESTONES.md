# Milestones

## v1.2 Transactions Bulk Actions (Shipped: 2026-04-17)

**Phases completed:** 2 phases, 6 plans
**Commits:** 93
**Files changed:** 88 files, +8967 / -279 lines
**Timeline:** 2026-04-17 (1 day)
**Known deferred items at close:** 5 (see STATE.md Deferred Items)

**Key accomplishments:**

1. Generic BulkProgressDrawer with sequential processing, stop-on-error, and parameterized PropagationSettingsDrawer for update vs delete wording
2. SelectCategoryDrawer (read-only category hierarchy) and SelectDateDrawer (bottom date picker) as renderDrawer-promise-based input components
3. Bulk category/date change wired into SelectionActionBar with SEL-02 silent skip and per-item propagation settings
4. Backend avatar infrastructure — OAuth avatar extraction on login, account background color column, partner avatar/name in shared account queries
5. Frontend avatar components (UserAvatar, AccountAvatar, ColorSwatchPicker) with initials fallback, wired into header, split settings, transaction rows, and account cards
6. TransactionRow account cell rewrite — avatars with tooltips, transfer rows show source→dest avatar pair

---

## v1.1 Charges (Shipped: 2026-04-16)

**Phases completed:** 4 phases, 9 plans, 2 tasks

**Key accomplishments:**

- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- Assembled complete charges page with createAuthenticatedRoute utility, two-tab layout (Recebidas/Enviadas), period navigation, ChargeCards with balance amounts, reject/cancel confirmation modals with success notifications, skeleton loading, and empty states.

---

## v1.0 Recurrence Redesign (Shipped: 2026-04-10)

**Phases completed:** 4 phases, 8 plans
**Git range:** `8482c09` → `aad7de2`
**Files changed:** 27 files, +3460 / -489 lines
**Timeline:** 2026-04-09 → 2026-04-10 (1 day)

**Key accomplishments:**

1. Replaced `RecurrenceSettings.Repetitions | EndDate` with `CurrentInstallment + TotalInstallments` across the Go domain, service, and error constant layers
2. Fixed the create loop to start from `current_installment`, producing the correct installment series (e.g. installments 3–10 for `current=3, total=10`)
3. Replaced the recurrence form UI in React: removed end-date toggle and repetitions input; added "Parcela atual" and "Total de parcelas" number inputs with Zod cross-field validation
4. Updated TypeScript types, payload builder, and form schema to send the new fields to the API
5. Added integration tests for the two canonical cases (`current=1 total=5`, `current=3 total=10`) and unit tests for all three validation rules
6. Updated all existing Playwright e2e test seeds and added new recurrence e2e tests

---
