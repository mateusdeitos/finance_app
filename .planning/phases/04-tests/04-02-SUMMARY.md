---
phase: 04-tests
plan: "02"
subsystem: e2e-tests
tags: [e2e, playwright, recurrence, frontend]
dependency_graph:
  requires: [04-01]
  provides: [E2E-01, E2E-02, E2E-03, E2E-04, TST-07, TST-08]
  affects: [frontend/e2e/tests]
tech_stack:
  added: []
  patterns: [playwright-pom, api-seed-teardown, badge-assertion]
key_files:
  created:
    - frontend/e2e/tests/recurrence.spec.ts
  modified:
    - frontend/e2e/tests/update-transaction.spec.ts
    - frontend/e2e/tests/bulk-delete-transactions.spec.ts
decisions:
  - "Used baseDate 2025-01-15 (January 2025) as controlled past date to avoid current-month edge cases"
  - "E2E-03 navigates first 3 months only (3/10, 4/10, 5/10) per D-06"
  - "Badge assertions use data-transaction-id row scoping for month 0; page-level getByText for subsequent months"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-10"
  tasks_completed: 2
  files_modified: 3
---

# Phase 4 Plan 02: E2E Recurrence Test Fixes and New Tests Summary

**One-liner:** Fixed 4 stale `repetitions:3` seeds across 2 spec files and added `recurrence.spec.ts` with 3 Playwright e2e tests covering badge display, multi-month navigation, and form validation.

## Tasks Completed

### Task 1: Fix update-transaction.spec.ts seeds — replace repetitions with current_installment/total_installments (E2E-01)

Replaced all occurrences of the old `repetitions: 3` recurrence shape with the new `current_installment: 1, total_installments: 3` shape:

- `frontend/e2e/tests/update-transaction.spec.ts`: 3 occurrences replaced (lines ~225, ~251, ~286)
- `frontend/e2e/tests/bulk-delete-transactions.spec.ts`: 1 occurrence replaced (line ~94)

Commit: `cde170d`

### Task 2: Create recurrence.spec.ts with E2E-02, E2E-03, E2E-04 tests

Created `frontend/e2e/tests/recurrence.spec.ts` with:

- **E2E-02** (`creates recurring expense 1/5 and shows badge 1/5`): Seeds a monthly recurring expense at `current_installment=1, total_installments=5`, navigates to January 2025, finds row by `data-transaction-id`, asserts badge `1/5` is visible.
- **E2E-03** (`creates recurring expense 3/10 and shows correct badges across months`): Seeds at `current_installment=3, total_installments=10`, navigates months Jan/Feb/Mar 2025, asserts badges `3/10`, `4/10`, `5/10` sequentially.
- **E2E-04** (`shows validation error when parcela atual is greater than total de parcelas`): Opens create form, fills expense fields, enables "Recorrência" switch, sets current=5 > total=3, submits, asserts error message `"Parcela atual nao pode ser maior que o total"` is visible and drawer is still open.

Commit: `4baaddb`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder data or unconnected components.

## Self-Check: PASSED

Files verified:
- FOUND: `frontend/e2e/tests/recurrence.spec.ts`
- FOUND: `frontend/e2e/tests/update-transaction.spec.ts` (0 occurrences of `repetitions`, 3 of `current_installment: 1, total_installments: 3`)
- FOUND: `frontend/e2e/tests/bulk-delete-transactions.spec.ts` (0 occurrences of `repetitions`, 1 of `current_installment`)

Commits verified:
- FOUND: `cde170d` (fix: seeds update)
- FOUND: `4baaddb` (feat: recurrence.spec.ts)

TypeScript: compiled with zero errors.
