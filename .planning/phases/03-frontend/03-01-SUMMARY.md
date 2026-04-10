---
phase: "03-frontend"
plan: "03-01"
subsystem: "frontend/transactions"
tags: ["typescript", "react", "forms", "recurrence", "mantine"]
dependency_graph:
  requires: []
  provides: ["FE-01", "FE-02", "FE-03", "FE-04", "FE-05", "FE-06"]
  affects: ["frontend/src/types/transactions.ts", "frontend/src/components/transactions/form/", "frontend/src/utils/buildTransactionPayload.ts"]
tech_stack:
  added: []
  patterns: ["react-hook-form Controller", "Zod superRefine", "Mantine NumberInput Group layout"]
key_files:
  created: []
  modified:
    - frontend/src/types/transactions.ts
    - frontend/src/components/transactions/form/transactionFormSchema.ts
    - frontend/src/utils/buildTransactionPayload.ts
    - frontend/src/components/transactions/form/RecurrenceFields.tsx
    - frontend/src/components/transactions/CreateTransactionDrawer.tsx
    - frontend/src/components/transactions/UpdateTransactionDrawer.tsx
    - frontend/src/routes/_authenticated.transactions_.import.tsx
    - frontend/src/components/transactions/import/ImportReviewRow.tsx
decisions:
  - "RecurrenceLocalValues in RecurrencePopover updated to use new field names (no end_date toggle in import popover)"
  - "Import buildPayload guarded with recurrenceEnabled + null checks before setting recurrence_settings"
  - "Installed @rollup/rollup-linux-arm64-gnu to fix vite build in arm64 environment"
metrics:
  duration: "~20 minutes"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 8
  completed_date: "2026-04-10"
---

# Phase 3 Plan 01: Replace Recurrence Fields Across Types, Schema, Payload, and UI Summary

Replace `repetitions`/`end_date` recurrence model with `current_installment`/`total_installments` across TypeScript types, form schema, payload builder, UI component, and all import-related files.

## What Was Done

### Task 1: TypeScript type, form schema, validation, payload builder (commit e667c48)

- `RecurrenceSettings` interface updated: removed `repetitions?: number` and `end_date?: string`, added `current_installment: number` and `total_installments: number` (required, not optional)
- `baseTransactionFields` updated: removed `recurrenceEndDateMode`, `recurrenceEndDate`, `recurrenceRepetitions`; added `recurrenceCurrentInstallment` and `recurrenceTotalInstallments` (both `z.number().int().nullable()`)
- `SharedRefinementData` type updated to use new field names
- `applySharedRefinements` recurrence block replaced: null-checks for both installment fields + `current > total` comparison validation with Portuguese error messages
- `buildTransactionPayload` updated to emit `current_installment` and `total_installments` using non-null assertions (safe because schema validates non-null before submission)

### Task 2: RecurrenceFields UI and drawer defaults (commit a903ed5)

- `RecurrenceFields.tsx` rewritten: removed `Switch`, `DatePickerInput`, `useWatch`; added two `NumberInput` components in a `Group` with `flex: 1` and `min={1}`, labeled "Parcela atual" and "Total de parcelas"
- `CreateTransactionDrawer.tsx` defaults updated to `recurrenceCurrentInstallment: null, recurrenceTotalInstallments: null`
- `UpdateTransactionDrawer.tsx` updated to pre-fill `recurrenceCurrentInstallment` from `transaction.installment_number` and `recurrenceTotalInstallments` from `transaction.transaction_recurrence?.installments`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed broken references in import route file**
- **Found during:** Task 2 build verification
- **Issue:** `_authenticated.transactions_.import.tsx` `buildPayload` function used `recurrenceEndDateMode`, `recurrenceEndDate`, `recurrenceRepetitions`, and old type fields `end_date`/`repetitions` on `RecurrenceSettings`
- **Fix:** Updated `buildPayload` to check `recurrenceEnabled` + null guards before setting `recurrence_settings` with `current_installment`/`total_installments`; updated `parsedRowToFormValues` to use `recurrenceCurrentInstallment`/`recurrenceTotalInstallments`
- **Files modified:** `frontend/src/routes/_authenticated.transactions_.import.tsx`
- **Commit:** a903ed5

**2. [Rule 1 - Bug] Fixed broken references in ImportReviewRow.tsx**
- **Found during:** Task 2 build verification
- **Issue:** `ImportReviewRow.tsx` had `useWatch` tracking `recurrenceRepetitions`, `recurrenceSummary()` using old variable, `RecurrenceLocalValues` interface with old fields, and `RecurrencePopover` syncing old fields between local and parent form
- **Fix:** Updated all usages to `recurrenceCurrentInstallment`/`recurrenceTotalInstallments`; removed `recurrenceEndDateMode`/`recurrenceEndDate` from local form since `RecurrenceFields` no longer renders them
- **Files modified:** `frontend/src/components/transactions/import/ImportReviewRow.tsx`
- **Commit:** a903ed5

**3. [Rule 3 - Blocking] Installed missing Rollup arm64 native binary**
- **Found during:** Task 2 `npm run build` verification
- **Issue:** `@rollup/rollup-linux-arm64-gnu` was missing, causing build failure unrelated to code changes
- **Fix:** Installed via `npm install @rollup/rollup-linux-arm64-gnu --legacy-peer-deps`
- **Files modified:** `frontend/package.json`, `frontend/package-lock.json`
- **Commit:** a903ed5

## Known Stubs

None — all recurrence fields are wired to form state. The import popover uses `recurrenceCurrentInstallment: null` as initial state when opening (pre-fill from parent row values on open).

## Threat Surface Scan

No new network endpoints or auth paths introduced. Changes are UI-only (form fields and validation). The existing mitigations from the plan's threat model are implemented:

- T-03-01: `min={1}` on both NumberInputs
- T-03-02: `applySharedRefinements` rejects `current > total` before payload is built
- T-03-04: Null-check validation in `applySharedRefinements` for both fields when recurrence is enabled

## Self-Check: PASSED

- All modified files exist on disk
- Commits e667c48 and a903ed5 exist in git history
- `npx tsc --noEmit` passes with zero errors
- `npm run build` exits 0 (after installing missing arm64 rollup binary)
- Zero references to old field names in all seven originally-planned files
