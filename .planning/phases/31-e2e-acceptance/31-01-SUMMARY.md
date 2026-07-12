---
phase: 31-e2e-acceptance
plan: 01
subsystem: testing
tags: [playwright, e2e, transactions, templates, page-object]

# Dependency graph
requires:
  - phase: 29-frontend-chip-apply-flow
    provides: TemplateQuickChips + handleApplyTemplate (chip apply, stale-ref clearing) on the create-transaction form
  - phase: 30-frontend-management-ui
    provides: TemplatesManagementDrawer, TemplateFormDrawer/TemplateFormFields, SaveAsTemplateDrawer, and their testids
provides:
  - "TransactionTemplatesPage Playwright page object driving management drawer, template form, chip apply, and save-as-template flows"
  - "transaction-templates.spec.ts acceptance suite (8 tests) covering manage CRUD, chip apply, stale-ref degradation, save-as-template, cap enforcement, and split round-trip"
affects: [e2e-acceptance, ci-e2e-job]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Page object caches one Locator per drawer (managementDrawer/formDrawer/saveAsDrawer/createDrawer) and scopes every field lookup to the owning drawer, since template drawers reuse the transaction form's field testids (SelectAccount, SelectCategory, InputDescription, TagsInput)"
    - "One fresh user per test via getAuthTokenForUser + apiFetchAs + openAuthedPage + page.close(); API is the source of truth (GET /api/transaction-templates), one UI assertion per scenario"

key-files:
  created:
    - frontend/e2e/pages/TransactionTemplatesPage.ts
    - frontend/e2e/tests/transaction-templates.spec.ts
  modified: []

key-decisions:
  - "Every TransactionTemplatesPage method scopes field lookups to the correct drawer locator (never bare `page.getByTestId`) — an unscoped lookup would silently match a stale duplicate testid from another open drawer, since template drawers deliberately reuse the transaction form's field testids."
  - "Included the optional 8th test (split template round-trip, TMPL-05) via createUserAndPartner + a percentage split_settings row, asserting InputSplitPercentage after expandExtraSection('split')."
  - "Full suite execution delegated to CI's e2e job (docker-compose.e2e.yml) — no Docker in this sandbox. Local verification: tsc --noEmit -p e2e/tsconfig.json, playwright test ... --list (lists all 8 tests), and eslint (clean)."

patterns-established:
  - "Drawer-scoped page objects for reused-testid form surfaces: cache each drawer's root Locator in the constructor, thread it into every formFields.ts class construction."

requirements-completed: [TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05, APPLY-01, APPLY-02, APPLY-03, APPLY-04, MNG-01, MNG-02, MNG-03, SAFE-01, SAFE-02]

# Metrics
duration: 45min
completed: 2026-07-12
---

# Phase 31 Plan 01: E2E Acceptance Summary

**Playwright acceptance suite for transaction templates: a drawer-scoped TransactionTemplatesPage page object plus an 8-test transaction-templates.spec.ts covering manage CRUD, chip apply (incl. stale-account-reference degradation), save-as-template, cap enforcement, and a split-settings round-trip — the acceptance gate that closes out v1.7.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-07-12T11:00:00Z (approx.)
- **Completed:** 2026-07-12T11:32:39Z
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments
- `TransactionTemplatesPage` page object driving the templates management drawer (list/new/edit/delete), the template form drawer (create/edit), the quick-apply chip row on the create-transaction form, and the save-as-template mini-drawer — all field interactions scoped to the correct drawer via `formFields.ts` classes, testid-only.
- `transaction-templates.spec.ts` with 8 independent, per-user tests: manage create/edit/delete, chip apply, stale-account-reference apply (APPLY-04), save-as-template (MNG-02), 3-template cap enforcement (SAFE-01), and a split-settings round-trip (TMPL-05).
- Verified compilation two ways (`tsc --noEmit -p e2e/tsconfig.json` and `playwright test e2e/tests/transaction-templates.spec.ts --list`, which lists all 8 tests) plus a clean `eslint` pass — no Docker available locally, so actual execution is delegated to CI's `e2e` job.

## Task Commits

Each task was committed atomically:

1. **Task 1: TransactionTemplatesPage page object** - `07baa6c` (feat)
2. **Task 2: transaction-templates.spec.ts acceptance suite** - `e0b0452` (test)

**Plan metadata:** (this commit) `docs(31-01): complete transaction-templates e2e acceptance plan`

## Files Created/Modified
- `frontend/e2e/pages/TransactionTemplatesPage.ts` - Page object: `openManagementDrawer`, `openNewTemplateForm`, `openEditTemplateForm`, `fillTemplateForm`, `saveTemplateForm`, `deleteTemplate`, `expectTemplateRow`, `chip`/`applyChip`, `newTemplateButton`, `saveAsTemplateButton`, `saveCurrentFormAsTemplate` — all drawer-scoped.
- `frontend/e2e/tests/transaction-templates.spec.ts` - 8 acceptance tests (`test.describe('Transaction Templates', ...)`), each with a fresh user via `getAuthTokenForUser`, API-seeded prerequisites via `apiFetchAs`, `openAuthedPage(browser, token)`, and `await page.close()` at the end.

## Decisions Made
- Scoped every page-object field lookup to the owning drawer locator (`managementDrawer`/`formDrawer`/`saveAsDrawer`/`createDrawer`) rather than bare `page.getByTestId` — required because template drawers deliberately reuse the transaction-form's field testids (`SelectAccount`, `SelectCategory`, `InputDescription`, `TagsInput`, `SegmentedTransactionType`), so an unscoped lookup risks matching a stale duplicate from a different open drawer.
- Confirmed the description field testid via `DescriptionAutocomplete.tsx` and `TransactionsPage.ts`: it's the shared `TransactionsTestIds.InputDescription`, filled with `TextField` (not a dedicated `Autocomplete` field class) — matches the existing `TransactionsPage.fillDescription` precedent, since a plain `.fill()` doesn't need the suggestion-picking behavior.
- Included the optional 8th scenario (split template round-trip, TMPL-05) since context-gathering surfaced enough detail (`createUserAndPartner`, `SplitSetting.connection_id`, backend rule that split-settings require a private, non-connection `account_id`) to implement it reliably within the "if time permits" scope.
- For the "save as template" test, reload the page and reopen the create form before asserting the new chip is visible — simpler and more robust than asserting an in-place TanStack Query refetch timing inside the still-open drawer.
- Cap-enforcement test seeds exactly 3 templates via API (bypassing the UI form) since the cap is only exercised at drawer-open / button-disabled level, not the create flow itself.

## Deviations from Plan

None - plan executed exactly as written. No product code was touched (no real bug surfaced); all testids named in the plan existed as described, except the description field id — the plan flagged it as "likely `InputDescription`" and read-first confirmed it is indeed `TransactionsTestIds.InputDescription` (shared with the main transaction form via `DescriptionAutocomplete`), so no invented selector was needed.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v1.7 (Transaction Templates) is now feature+acceptance complete: all 6 phases (26-31) done, all requirements (TMPL-01..05, APPLY-01..04, MNG-01..03, SAFE-01..02) implemented and covered by this acceptance suite.
- **Outstanding before shipping:** run `transaction-templates.spec.ts` in CI's `e2e` job (needs `docker-compose.e2e.yml`, unavailable in this sandbox) to confirm all 8 tests pass against a live stack — same CI-deferred pattern already used for Phase 27's testcontainers suite and Phase 25's notification e2e coverage.
- No blockers for milestone close.

---
*Phase: 31-e2e-acceptance*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: frontend/e2e/pages/TransactionTemplatesPage.ts
- FOUND: frontend/e2e/tests/transaction-templates.spec.ts
- FOUND: .planning/phases/31-e2e-acceptance/31-01-SUMMARY.md
- FOUND commit: 07baa6c (Task 1)
- FOUND commit: e0b0452 (Task 2)
- FOUND commit: e1bddbf (plan metadata)
