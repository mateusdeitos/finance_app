---
phase: 30-frontend-management-ui
plan: 03
subsystem: ui
tags: [react, typescript, react-hook-form, mantine, tanstack-query]

# Dependency graph
requires:
  - phase: 30-frontend-management-ui
    plan: 01
    provides: useCreateTransactionTemplate ({ mutation }), buildTemplatePayloadFromForm
  - phase: 30-frontend-management-ui
    plan: 02
    provides: templates/ folder conventions, testid patterns (Tooltip-wraps-disabled-Button for the 3-cap)
  - phase: 29-frontend-chip-apply-flow
    provides: useTransactionTemplates (query + invalidate), showTemplateChips create-mode gate, TransactionForm's useFormContext wiring
provides:
  - SaveAsTemplateDrawer (confirm/edit-name mini drawer that creates a template from a pre-built TemplatePayload)
  - TransactionFormFooter onSaveAsTemplate / saveAsTemplateDisabled additive props
  - "Salvar como modelo" action wired into TransactionForm (create mode only, disabled at the 3-template cap)
affects: [31-e2e-acceptance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-field confirm drawers use a plain controlled TextInput + local useState (touched-on-blur validation) instead of a full RHF+zod setup when the drawer has exactly one field"

key-files:
  created:
    - frontend/src/components/transactions/templates/SaveAsTemplateDrawer.tsx
  modified:
    - frontend/src/testIds/transactions.ts
    - frontend/src/components/transactions/form/TransactionFormFooter.tsx
    - frontend/src/components/transactions/form/TransactionForm.tsx

key-decisions:
  - "SaveAsTemplateDrawer uses a simple controlled TextInput (local useState + touched-on-blur validation), not RHF+zod — the drawer has exactly one field, matching the plan's own 'simple controlled TextInput' suggestion"
  - "TransactionFormFooter's onSaveAsTemplate/saveAsTemplateDisabled props are purely additive; when absent (edit form) nothing renders or changes, keeping the footer a presentational component with hooks staying in TransactionForm"
  - "The 3-template cap is an inline literal (templates.length >= 3) in TransactionForm.tsx rather than importing TemplatesManagementDrawer's private (unexported) TEMPLATE_CAP constant — matches the plan's own illustrative snippet"

patterns-established:
  - "Tooltip-wraps-disabled-Button for cap-disabled actions (established in 30-02's TemplatesManagementDrawer) reused verbatim for the footer's Save-as-template button"

requirements-completed: [MNG-02]

# Metrics
duration: ~15min
completed: 2026-07-10
---

# Phase 30 Plan 03: Save-as-template Mini-drawer + Footer Button Summary

**A `SaveAsTemplateDrawer` confirm-name mini drawer (single controlled `TextInput`, default-filled from the description) wired to a new cap-aware "Salvar como modelo" button in the create-transaction form's footer, completing MNG-02 and Phase 30.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-10T19:32:00Z (approx)
- **Completed:** 2026-07-10T19:47:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `SaveAsTemplateDrawer.tsx` — takes a pre-built `Transactions.TemplatePayload` + `suggestedName` (from `renderDrawer`), lets the user confirm/edit the name (defaulted to `suggestedName.slice(0, 100)`, required non-empty, touched-on-blur validation), and creates the template via `useCreateTransactionTemplate`; on success invalidates `useTransactionTemplates()` and resolves with the created template. Surfaces mutation errors (409 cap/duplicate name) via a general error `Alert`.
- `TransactionFormFooter.tsx` gained two additive optional props (`onSaveAsTemplate`, `saveAsTemplateDisabled`) that render a secondary "Salvar como modelo" button (desktop: alongside "Salvar e criar outra"; mobile: in its own row) with a `Tooltip` ("Você já tem 3 modelos") shown only when disabled — mirrors the exact Tooltip-wraps-disabled-Button pattern from 30-02's `TemplatesManagementDrawer`. When the props are absent (the edit/update form), the footer renders exactly as before.
- `TransactionForm.tsx`, in create mode (`showTemplateChips`), builds a `handleSaveAsTemplate` handler that snapshots the form via `getValues()` (newly destructured from `useFormContext`), converts it to a `TemplatePayload` via `buildTemplatePayloadFromForm(values, tags)` (Plan-01), and opens `SaveAsTemplateDrawer` via `renderDrawer`. `atCap = templates.length >= 3` gates `saveAsTemplateDisabled`; both props are only passed when `showTemplateChips` is true, so the edit form is unaffected.
- 5 new testids added to `src/testIds/transactions.ts`: `BtnSaveAsTemplate`, `SaveAsTemplateDrawer`, `SaveAsTemplateInputName`, `TemplateBtnConfirmSaveAsTemplate`, `SaveAsTemplateError`.

## Task Commits

Each task was committed atomically:

1. **Task 1: SaveAsTemplateDrawer (confirm name -> create)** - `ea30191` (feat)
2. **Task 2: Footer button + create-form wiring (create mode, cap-disabled)** - `5f69a54` (feat)

**Plan metadata:** _pending_ (docs: complete plan)

## Files Created/Modified
- `frontend/src/components/transactions/templates/SaveAsTemplateDrawer.tsx` - new confirm-name mini drawer (create mutation + invalidate)
- `frontend/src/testIds/transactions.ts` - 5 new testids for the button + mini drawer
- `frontend/src/components/transactions/form/TransactionFormFooter.tsx` - additive `onSaveAsTemplate`/`saveAsTemplateDisabled` props + button rendering (desktop + mobile)
- `frontend/src/components/transactions/form/TransactionForm.tsx` - `getValues` destructure, `handleSaveAsTemplate` handler, `atCap`, footer wiring gated on `showTemplateChips`

## Decisions Made
See `key-decisions` in the frontmatter above. Notably: (1) a plain controlled `TextInput` rather than RHF+zod for the single-field drawer, (2) fully additive footer props so the edit form's rendering path is untouched, and (3) an inline `>= 3` literal instead of importing 30-02's private cap constant.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their acceptance criteria on the first pass; no auto-fixes were needed.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 30 (Frontend Management UI) is now fully complete (3/3 plans): MNG-01 (management drawer, landed 30-02) and MNG-02 (save-as-template, this plan) are both satisfied.
- Phase 31 (E2E Acceptance) is the only remaining phase in v1.7 — it can now exercise the full lifecycle: chip apply (Phase 29), management CRUD (30-02), and save-as-template (30-03), all behind stable testids.
- No blockers.

---
*Phase: 30-frontend-management-ui*
*Completed: 2026-07-10*

## Self-Check: PASSED

All created files found on disk (`SaveAsTemplateDrawer.tsx`, `30-03-SUMMARY.md`); all 3 commit hashes (`ea30191`, `5f69a54`, `5bf446d`) found in git history.
