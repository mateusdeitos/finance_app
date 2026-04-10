---
phase: 01-domain-validation
plan: "03"
subsystem: service-tests
tags: [tests, seed, recurrence, refactor, compile-fix]
dependency_graph:
  requires: [RecurrenceSettings-new-shape, validateRecurrenceSettings-new-impl]
  provides: [compile-clean-backend]
  affects: [service/transaction_create_test.go, service/transaction_update_test.go, service/transaction_delete_test.go, cmd/scripts/seed/main.go]
tech_stack:
  added: []
  patterns: [field-rename-migration]
key_files:
  created: []
  modified:
    - backend/internal/service/transaction_create_test.go
    - backend/internal/service/transaction_update_test.go
    - backend/internal/service/transaction_delete_test.go
    - backend/cmd/scripts/seed/main.go
decisions:
  - "Removed TestCreateRecurringExpenseWithEndDate entirely since EndDate-based recurrence is gone; Phase 4 will add new tests for the new behavior"
  - "Task 1 (production service files) was a no-op: createRecurrence and RecurrenceFromSettings call sites were already fixed as deviations in plan 02"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-09T23:35:06Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 01 Plan 03: Fix All Compile-Breaking Callers Summary

Fix all compile-breaking usages of old `RecurrenceSettings` fields (`Repetitions`, `EndDate`) and old `RecurrenceFromSettings` call signatures across test files and the seed script. After this plan, `go build ./...` exits 0.

## What Was Built

Migrated all test files and the seed script from the old `Repetitions *int` / `EndDate *time.Time` model to the new `CurrentInstallment int` / `TotalInstallments int` model. Removed `TestCreateRecurringExpenseWithEndDate` test since EndDate-based recurrence no longer exists as a concept. The entire backend now compiles cleanly.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix RecurrenceFromSettings call sites in production service files | (no-op - already done in plan 02) | — |
| 2 | Update test files and seed script to use new RecurrenceSettings fields | 772468f | backend/internal/service/transaction_create_test.go, backend/internal/service/transaction_update_test.go, backend/internal/service/transaction_delete_test.go, backend/cmd/scripts/seed/main.go |

## Key Changes

### backend/internal/service/transaction_create_test.go

- 3 standalone `RecurrenceSettings` literals: replaced `Repetitions: lo.ToPtr(3)` with `CurrentInstallment: 1, TotalInstallments: 3`
- `TestCreateRecurringExpenseWithRepetitions`: updated 4 struct literals (daily/weekly/monthly/yearly) and replaced `lo.FromPtr(transaction.RecurrenceSettings.Repetitions)` assertion with `transaction.RecurrenceSettings.TotalInstallments`
- `TestCreateRecurringExpenseWithEndDate`: entire function removed (4 struct literals using `EndDate` field)

### backend/internal/service/transaction_update_test.go

- 22 occurrences of `Repetitions: lo.ToPtr(3)` → `CurrentInstallment: 1, TotalInstallments: 3`
- 5 occurrences of `Repetitions: lo.ToPtr(5)` → `CurrentInstallment: 1, TotalInstallments: 5`
- 3 occurrences of `Repetitions: lo.ToPtr(2)` → `CurrentInstallment: 1, TotalInstallments: 2`

### backend/internal/service/transaction_delete_test.go

- 5 occurrences of `Repetitions: lo.ToPtr(installments)` → `CurrentInstallment: 1, TotalInstallments: installments`

### backend/cmd/scripts/seed/main.go

- 1 occurrence: `Repetitions: &installments` → `CurrentInstallment: 1, TotalInstallments: installments`

## Verification

- `cd /workspace/backend && go build ./...` exits 0
- `grep -rn "\.Repetitions\b\|RecurrenceSettings.*EndDate" backend/` — zero matches
- `grep -rn "RecurrenceFromSettings" backend/internal/service/` — all calls use 2 arguments
- `cd /workspace/backend && go vet ./...` — no vet errors
- `grep "TestCreateRecurringExpenseWithEndDate" backend/internal/service/transaction_create_test.go` — 0 matches

## Deviations from Plan

### Task 1 Was a No-Op

**Context:** Plan 03 Task 1 described fixing `createRecurrence` and `RecurrenceFromSettings` call sites in `transaction_create.go` and `transaction_update.go`. These were already fixed as deviations in plan 02 (documented in 01-02-SUMMARY.md under "Auto-fixed Issues"). The worktree was properly initialized at commit `b9656f0` which included those fixes. No changes were needed for Task 1.

## Known Stubs

None - all changes are compile-correctness fixes. No placeholder values or incomplete data wiring.

## Threat Flags

None - no new network endpoints, auth paths, or schema changes introduced. Changes are purely test fixtures and seed script.

## Self-Check: PASSED

- backend/internal/service/transaction_create_test.go: modified and committed at 772468f
- backend/internal/service/transaction_update_test.go: modified and committed at 772468f
- backend/internal/service/transaction_delete_test.go: modified and committed at 772468f
- backend/cmd/scripts/seed/main.go: modified and committed at 772468f
- `go build ./...` exits 0
- Commit 772468f verified in git log
