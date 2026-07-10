---
phase: 29-frontend-chip-apply-flow
plan: 02
subsystem: ui
tags: [react-hook-form, mantine, vitest, transactions, templates]

# Dependency graph
requires:
  - phase: 29-frontend-chip-apply-flow
    provides: "Transactions.Template/TemplatePayload types, useTransactionTemplates list hook, QueryKeys.TransactionTemplates (29-01)"
  - phase: 28-splitsettingsfields-template-mode
    provides: "SplitSettingsFields templateMode, ready to render TemplatePayload.split_settings"
provides:
  - "buildTemplateFormPatch pure mapping (payload -> TransactionFormValues fields) with stale-ref clearing"
  - "TemplateQuickChips presentational chip row"
  - "TransactionForm showTemplateChips prop + handleApplyTemplate wiring"
  - "CreateTransactionDrawer renders the chip row; UpdateTransactionDrawer unaffected"
affects: [30-frontend-management-ui, 31-e2e-acceptance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Template apply is a pure mapping function (applyTemplate.ts) + an event-handler wiring in the form component, mirroring the existing handleSuggestionSelect precedent — no new useEffect"

key-files:
  created:
    - frontend/src/components/transactions/form/applyTemplate.ts
    - frontend/src/components/transactions/form/applyTemplate.test.tsx
    - frontend/src/components/transactions/form/TemplateQuickChips.tsx
    - frontend/src/components/transactions/form/TemplateQuickChips.module.css
    - frontend/src/components/transactions/form/TemplateQuickChips.test.tsx
  modified:
    - frontend/src/testIds/transactions.ts
    - frontend/src/components/transactions/form/TransactionForm.tsx
    - frontend/src/components/transactions/CreateTransactionDrawer.tsx

key-decisions:
  - "account_id has no null/undefined variant in TransactionFormValues (z.number().int(), not nullable) — buildTemplateFormPatch clears a stale account_id to 0, the form's existing 'unselected' sentinel (Select renders falsy as empty, superRefine flags 0 as missing), rather than undefined/null which would not typecheck against setValue's FieldPathValue"
  - "buildTemplateFormPatch returns Pick<TransactionFormValues, ...> (a fully-required subset) instead of the plan's illustrative Partial<TransactionFormValues> — avoids non-null assertions at the TransactionForm call site while keeping the same 7-field contract (transaction_type, description, account_id, category_id, destination_account_id, tags, split_settings)"

patterns-established:
  - "TemplateQuickChips deliberately omits DateQuickChips' data-active styling/state (D-02): chips are one-shot action buttons, not toggles"

requirements-completed: [APPLY-01, APPLY-02, APPLY-03, APPLY-04]

# Metrics
duration: 12min
completed: 2026-07-09
---

# Phase 29 Plan 02: TemplateQuickChips + Apply Flow Summary

**Pure buildTemplateFormPatch (stale-ref clearing for account/category/tags) + presentational TemplateQuickChips wired into TransactionForm via a setValue-per-field event handler, gated to create mode by an additive showTemplateChips prop.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-09T19:44:00Z (approx, continuing from 29-01 session)
- **Completed:** 2026-07-09T19:55:54Z
- **Tasks:** 3
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments
- `buildTemplateFormPatch(payload, {accounts, categories, tags})` — pure function mapping a `TemplatePayload` to form fields, clearing stale `account_id` (→ 0 sentinel), `category_id`/`destination_account_id` (→ null), and dropping stale `tag_ids` while mapping valid ones to tag names (APPLY-04); `split_settings` passthrough (APPLY-03)
- `TemplateQuickChips` — presentational chip row mirroring `DateQuickChips`, returns `null` when there are no templates (APPLY-01), no active/selected state per D-02
- `TransactionForm` gains additive `showTemplateChips` prop (default `false`), renders the chip row at the top of the visible `<Stack>`, and a `handleApplyTemplate` event handler that applies the patch via `setValue` per field, blanks the amount to 0, and calls `setFocus("amount")` (APPLY-02)
- `CreateTransactionDrawer` passes `showTemplateChips`; `UpdateTransactionDrawer` is untouched, so the edit flow never shows chips (D-07)
- 8 new vitest cases (5 for `buildTemplateFormPatch`, 3 for `TemplateQuickChips`); full `src/components/transactions/form/` suite (5 files, 20 tests) green with no regression

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure buildTemplateFormPatch + unit tests** - `24bafa0` (feat)
2. **Task 2: TemplateQuickChips component + testids + render test** - `3a827f5` (feat)
3. **Task 3: Wire chips + apply handler into TransactionForm (create-only)** - `c0a3c63` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `frontend/src/components/transactions/form/applyTemplate.ts` - Pure `buildTemplateFormPatch` mapping + stale-ref clearing
- `frontend/src/components/transactions/form/applyTemplate.test.tsx` - 5 unit tests (full mapping, stale account/category, stale tags, empty optionals)
- `frontend/src/components/transactions/form/TemplateQuickChips.tsx` - Presentational chip row (null when empty)
- `frontend/src/components/transactions/form/TemplateQuickChips.module.css` - Chip styling (copied from `DateQuickChips.module.css`, minus the `[data-active]` rule per D-02)
- `frontend/src/components/transactions/form/TemplateQuickChips.test.tsx` - 3 tests (render/testids, empty → null, click → onApply)
- `frontend/src/testIds/transactions.ts` - Added `TemplateChipsRow` and `TemplateChip(id)` testids
- `frontend/src/components/transactions/form/TransactionForm.tsx` - Added `showTemplateChips` prop, `useTags`/`useTransactionTemplates` calls, `handleApplyTemplate`, chip row render
- `frontend/src/components/transactions/CreateTransactionDrawer.tsx` - Passes `showTemplateChips` to `TransactionForm`

## Decisions Made
- `account_id` clearing uses `0` (the form's pre-existing "unselected" sentinel), not `undefined`/`null` — `TransactionFormValues.account_id` is a strict `number` in the zod schema (no `.nullable()`/`.optional()`), so `0` is the only type-safe way to represent "cleared" while still tripping the existing `!data.account_id` required-field validation and rendering the `Select` as empty (`field.value ? String(field.value) : null`).
- `buildTemplateFormPatch`'s return type is `Pick<TransactionFormValues, "transaction_type" | "description" | "account_id" | "category_id" | "destination_account_id" | "tags" | "split_settings">` rather than the plan's illustrative `Partial<TransactionFormValues>` — the function always sets all 7 fields, so a fully-required subset type avoids non-null assertions (`!`) at the `TransactionForm` call site while carrying the exact same information. `date`/`amount` are intentionally excluded from the type (never touched by apply, per D-04).
- Explicit per-field `setValue` calls in `handleApplyTemplate` (as the plan's fallback suggested) rather than a generic `Object.entries(patch).forEach(...)` cast — fully typed against RHF's `FieldPathValue` without an `any`/broad-union cast.

## Deviations from Plan

None beyond the two typing refinements documented above under "Decisions Made" (Rule 1 — minor precision fixes to keep `tsc --noEmit` clean without `any` or non-null assertions; no functional or behavioral difference from the plan's intent).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- APPLY-01..04 are fully implemented and covered: chip row (create-only), apply-and-focus-amount, editable split prefill, and stale-reference silent clearing.
- Edit/update flow verified untouched — `UpdateTransactionDrawer.tsx` does not pass `showTemplateChips` and was not modified.
- Phase 29 (Frontend Chip Apply Flow) is now complete (2/2 plans). Phase 30 (Frontend Management UI — templates CRUD + "Save as template") can proceed; it will reuse `Transactions.Template`/`TemplatePayload` and the `useTransactionTemplates` query hook from 29-01, and the chip row will immediately reflect new/edited/deleted templates via query invalidation once mutation hooks exist.
- No mutation hooks exist yet for templates (create/update/delete) — that is Phase 30 scope, unchanged from the 29-01 readiness note.

---
*Phase: 29-frontend-chip-apply-flow*
*Completed: 2026-07-09*

## Self-Check: PASSED

All 8 created/modified files found on disk; all 3 task commits (24bafa0, 3a827f5, c0a3c63) verified present in git log.
