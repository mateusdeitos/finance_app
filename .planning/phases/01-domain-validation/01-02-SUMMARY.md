---
phase: 01-domain-validation
plan: "02"
subsystem: service
tags: [service, validation, recurrence, refactor]
dependency_graph:
  requires: [RecurrenceSettings-new-shape, recurrence-error-constants]
  provides: [validateRecurrenceSettings-new-impl, recurrence-validation-unified]
  affects: [service/transaction_create.go, service/transaction_update.go]
tech_stack:
  added: []
  patterns: [shared-validation-function, single-responsibility]
key_files:
  created: []
  modified:
    - backend/internal/service/transaction_create.go
    - backend/internal/service/transaction_update.go
decisions:
  - "Removed startDate parameter from createRecurrence helper since RecurrenceFromSettings no longer needs it; all three call sites updated"
  - "Removed unused date variable in handlerRecurrenceUpdate after RecurrenceFromSettings call was updated"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-09T23:55:00Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 01 Plan 02: Rewrite validateRecurrenceSettings and Unify Service Validation Summary

Rewrite `validateRecurrenceSettings()` in `transaction_create.go` to enforce CurrentInstallment/TotalInstallments rules, then replace duplicated inline validation in `transaction_update.go` with a call to the shared function.

## What Was Built

Both `transaction_create.go` and `transaction_update.go` now use a single `validateRecurrenceSettings` function that enforces VAL-01 through VAL-06 using the new struct fields. The old EndDate/Repetitions validation logic is fully removed from both files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite validateRecurrenceSettings in transaction_create.go | 717c727 | backend/internal/service/transaction_create.go |
| 2 | Replace inline validation in transaction_update.go with shared call | d521a16 | backend/internal/service/transaction_create.go, backend/internal/service/transaction_update.go |

## Key Changes

### backend/internal/service/transaction_create.go

- `validateRecurrenceSettings` signature: removed `transactionDate time.Time` parameter; now accepts only `recurrenceSettings *domain.RecurrenceSettings`
- New validation rules: `CurrentInstallment < 1` (VAL-02), `TotalInstallments < CurrentInstallment` (VAL-03), `TotalInstallments > 1000` (VAL-05)
- Old checks removed: EndDate/Repetitions mutual exclusion, EndDate.After, repetitions <= 1000
- `createRecurrence` helper: removed `startDate time.Time` parameter since `RecurrenceFromSettings` no longer accepts it; all 3 call sites updated

### backend/internal/service/transaction_update.go

- Call at line 778 updated from 2-argument `s.validateRecurrenceSettings(lo.FromPtr(data.req.Date), data.req.RecurrenceSettings)` to `s.validateRecurrenceSettings(data.req.RecurrenceSettings)`
- 34-line inline validation block in `validateUpdateTransactionRequest` replaced with 3-line delegate: `if rErrs := s.validateRecurrenceSettings(req.RecurrenceSettings); len(rErrs) > 0 { errs = append(errs, rErrs...) }`
- Removed unused `date` variable that previously held the coalesced start date for `RecurrenceFromSettings`

## Verification

- `grep "EndDate\|Repetitions" backend/internal/service/transaction_create.go` — zero hits
- `grep "req.RecurrenceSettings.EndDate\|req.RecurrenceSettings.Repetitions" backend/internal/service/transaction_update.go` — zero hits
- `grep "ErrRecurrenceCurrentInstallmentMustBeAtLeastOne\|ErrRecurrenceTotalInstallmentsMustBe" backend/internal/service/transaction_create.go` — 3 hits
- `cd /workspace/backend && go build ./internal/service/...` — exits 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed RecurrenceFromSettings call signature in transaction_create.go**
- **Found during:** Task 2 build verification
- **Issue:** `domain.RecurrenceFromSettings` had its `startDate time.Time` parameter removed in plan 01, but the `createRecurrence` helper in `transaction_create.go` was still passing `startDate` as the third argument at 3 call sites
- **Fix:** Removed `startDate time.Time` parameter from `createRecurrence` signature and updated all 3 call sites
- **Files modified:** backend/internal/service/transaction_create.go
- **Commit:** d521a16

**2. [Rule 3 - Blocking] Removed unused date variable in transaction_update.go**
- **Found during:** Task 2 build verification
- **Issue:** After updating `RecurrenceFromSettings` call to 2-arg form, the `date` variable at line 782 was no longer referenced, causing a Go compile error
- **Fix:** Removed `date := lo.CoalesceOrEmpty(data.req.Date, &data.previousTransaction.Date)` line
- **Files modified:** backend/internal/service/transaction_update.go
- **Commit:** d521a16

## Known Stubs

None - all changes are service validation logic with no placeholder values or incomplete wiring.

## Threat Flags

None - no new network endpoints, auth paths, or schema changes introduced. Changes are purely service-layer validation refactoring.

## Self-Check: PASSED

- backend/internal/service/transaction_create.go: modified and committed at 717c727, d521a16
- backend/internal/service/transaction_update.go: modified and committed at d521a16
- `go build ./internal/service/...` exits 0
- Both task commits verified in git log
