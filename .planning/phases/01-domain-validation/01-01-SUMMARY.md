---
phase: 01-domain-validation
plan: "01"
subsystem: domain
tags: [domain, recurrence, refactor, breaking-change]
dependency_graph:
  requires: []
  provides: [RecurrenceSettings-new-shape, recurrence-error-constants]
  affects: [service/transaction_create.go, service/transaction_update.go, handler annotations]
tech_stack:
  added: []
  patterns: [domain-first-refactor]
key_files:
  created: []
  modified:
    - backend/internal/domain/transaction.go
    - backend/pkg/errors/errors.go
decisions:
  - "Removed startDate parameter from RecurrenceFromSettings since new design uses TotalInstallments directly; callers updated in plan 03"
  - "Removed math and github.com/samber/lo imports from domain/transaction.go as they were only used in the old RecurrenceFromSettings implementation"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-09T23:20:45Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 01 Plan 01: Redefine RecurrenceSettings Domain Contract Summary

Replace `RecurrenceSettings.Repetitions *int` and `EndDate *time.Time` with `CurrentInstallment int` and `TotalInstallments int`. Update error constants to match the new validation rules.

## What Was Built

Changed the core recurrence domain contract from a "repetitions or end_date" model to an explicit "current + total installments" model. This is the foundation change for the entire phase — all other plans depend on this new struct shape.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Redefine RecurrenceSettings struct and RecurrenceFromSettings | 127d49e | backend/internal/domain/transaction.go |
| 2 | Update error constants in pkg/errors/errors.go | e330ac8 | backend/pkg/errors/errors.go |

## Key Changes

### backend/internal/domain/transaction.go

- `RecurrenceSettings` struct: removed `Repetitions *int` and `EndDate *time.Time`; added `CurrentInstallment int` and `TotalInstallments int`
- `RecurrenceFromSettings`: simplified from 3 params + complex end_date math to 2 params; assigns `Installments: recurrenceSettings.TotalInstallments` directly
- Removed `"math"` and `"github.com/samber/lo"` imports (no longer needed)
- `TransactionFilter.EndDate *ComparableSearch[time.Time]` left intact (unrelated to recurrence)

### backend/pkg/errors/errors.go

Removed:
- `ErrorTagRecurrenceEndDateOrRepetitionsIsRequired`
- `ErrorTagRecurrenceEndDateMustBeAfterTransactionDate`
- `ErrorTagRecurrenceEndDateAndRepetitionsCannotBeUsedTogether`
- `ErrorTagRecurrenceRepetitionsMustBePositive`
- `ErrorTagRecurrenceRepetitionsMustBeLessThanOrEqualTo`
- Corresponding `Err...` vars for all 5 above

Added:
- `ErrorTagRecurrenceCurrentInstallmentMustBeAtLeastOne`
- `ErrorTagRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent`
- `ErrorTagRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo`
- `ErrRecurrenceCurrentInstallmentMustBeAtLeastOne` (static error)
- `ErrRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent` (static error)
- `ErrRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo` (func var taking maxValue int)

## Verification

- `go build ./pkg/errors/... ./internal/domain/...` exits 0
- `RecurrenceSettings` has `CurrentInstallment int` and `TotalInstallments int`; no `Repetitions` or `EndDate` fields
- `RecurrenceFromSettings` has 2-param signature; assigns `Installments: recurrenceSettings.TotalInstallments`
- Old error constants fully removed

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - both files are complete domain/error definitions with no placeholder values.

## Threat Flags

None - no new network endpoints, auth paths, or schema changes introduced. Changes are purely in-memory domain types and error constants.

## Self-Check: PASSED

- backend/internal/domain/transaction.go: modified and committed at 127d49e
- backend/pkg/errors/errors.go: modified and committed at e330ac8
- Both commits exist in git log
- Both packages build cleanly
