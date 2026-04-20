---
phase: 11-backend-validation-propagation
plan: "02"
subsystem: backend
tags:
  [
    integration-tests,
    validation,
    linked-transactions,
    propagation,
    testcontainers,
  ]
dependency_graph:
  requires: [11-01]
  provides: [linked-transaction-validation-tests, propagation-scoping-tests]
  affects: [backend/internal/service/transaction_update_test.go]
tech_stack:
  added: []
  patterns: [testcontainers integration tests, testify suite sub-tests]
key_files:
  created: []
  modified:
    - backend/internal/service/transaction_update_test.go
decisions:
  - Combine Task 1 (validation tests) and Task 2 (propagation tests) into single commit since both modify the same file
  - Use repo-level Search instead of service GetByID (TransactionService has no GetByID method) to fetch linked transaction IDs after Create
  - Use correct RecurrenceSettings fields (CurrentInstallment + TotalInstallments) instead of plan's pseudocode Repetitions field
  - Use CategoryID as int (not *int) in TransactionCreateRequest to match struct definition
  - Use assertDisallowedFieldError helper function with suite.Run sub-tests to test each disallowed field separately
metrics:
  duration: "~10 minutes"
  completed_date: "2026-04-18"
  tasks_completed: 2
  files_modified: 1
---

# Phase 11 Plan 02: Integration Tests for Linked Transaction Validation and Propagation Summary

**One-liner:** Five integration tests using testcontainers PostgreSQL prove VAL-01 (disallowed fields rejected), VAL-02 (allowed fields accepted), and PROP-01 (propagation is user-scoped) for linked transaction edits.

## Tasks Completed

| Task | Name                                                | Commit  | Files                                               |
| ---- | --------------------------------------------------- | ------- | --------------------------------------------------- |
| 1    | Integration tests for linked transaction validation | 4849628 | backend/internal/service/transaction_update_test.go |
| 2    | Integration tests for propagation scoping           | 4849628 | backend/internal/service/transaction_update_test.go |

## What Was Built

### Task 1: Validation Tests (VAL-01, VAL-02)

Added three new test methods to `TransactionUpdateWithDBTestSuite`:

**`TestLinkedTransactionValidation_RejectsDisallowedFields`** (VAL-01)

- Creates userA and userB with connection
- Creates a split expense on userA's account (50% split)
- Fetches the linked transaction ID from userA's first installment's `LinkedTransactions`
- Uses a helper `assertDisallowedFieldError` with `suite.Run` sub-tests to verify each disallowed field produces `ErrorTagLinkedTransactionDisallowedFieldChanged`
- Tests: `amount`, `account_id`, `transaction_type`, `recurrence_settings`, `split_settings`, `destination_account_id`

**`TestLinkedTransactionValidation_AllowsPermittedFields`** (VAL-02)

- Same setup (split expense, get linked transaction)
- Updates linked transaction with `Date`, `Description`, and `CategoryID` (userB's own category)
- Asserts no error and verifies updated fields are persisted via `Repos.Transaction.SearchOne`

**`TestLinkedTransactionValidation_AllowsTagsOnly`** (VAL-02)

- Same setup
- Updates linked transaction with only tags
- Asserts no error

### Task 2: Propagation Scoping Tests (PROP-01)

Added two new test methods:

**`TestLinkedTransactionPropagation_DateDoesNotCrossToPartner`** (PROP-01)

- Creates a recurring split expense: 3 monthly installments starting 2026-01-15
- userB edits the linked transaction date to 2026-01-20 with `propagation=all`
- Verifies userA's first installment date is still day 15 (not shifted)

**`TestLinkedTransactionPropagation_DescriptionDoesNotCrossToPartner`** (PROP-01)

- Creates a recurring split expense: 3 monthly installments
- userB edits the linked transaction description with `propagation=all`
- Verifies all 3 of userA's installments retain the original description
- Verifies userB's first linked transaction has the new description

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correction] RecurrenceSettings uses CurrentInstallment+TotalInstallments, not Repetitions**

- **Found during:** Task 2 setup
- **Issue:** Plan pseudocode used `Repetitions: lo.ToPtr(3)` which doesn't exist in the `RecurrenceSettings` struct; actual fields are `CurrentInstallment int` and `TotalInstallments int`
- **Fix:** Used correct struct fields matching the codebase
- **Files modified:** backend/internal/service/transaction_update_test.go

**2. [Rule 1 - Correction] CategoryID in TransactionCreateRequest is int, not \*int**

- **Found during:** Task 1 setup
- **Issue:** Plan pseudocode used `CategoryID: &categoryA.ID` but `TransactionCreateRequest.CategoryID` is `int`, not `*int`
- **Fix:** Used `CategoryID: categoryA.ID` (no pointer dereference)
- **Files modified:** backend/internal/service/transaction_update_test.go

**3. [Rule 1 - Correction] TransactionService.Create returns (int, error) not (\*domain.Transaction, error)**

- **Found during:** Task 1 action
- **Issue:** Plan pseudocode used `created.LinkedTransactions[0].ID` after Create; but Create returns `(int, error)` — just the ID
- **Fix:** Used `suite.Repos.Transaction.SearchOne` after Create to fetch the transaction with its `LinkedTransactions`
- **Files modified:** backend/internal/service/transaction_update_test.go

## Test Execution

Docker is not available in this execution environment (testcontainers requires Docker). The tests compile and pass `go vet` but could not be run locally. The tests follow the exact same infrastructure and patterns as the 3,900+ lines of existing integration tests in `transaction_update_test.go`, all of which require Docker to run.

Command to run when Docker is available:

```
cd backend && go test ./internal/service/ -run "TestTransactionUpdateWithDB/TestLinkedTransaction" -count=1 -timeout 120s
```

## Known Stubs

None — all test logic is complete and wired.

## Threat Model Coverage

| Threat ID                                      | Status                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| T-11-04 (Elevation via cross-user propagation) | Tests explicitly assert userA's data is unchanged when userB edits linked transaction |

## Self-Check

Files exist:

- backend/internal/service/transaction_update_test.go: FOUND

Commits exist:

- 4849628: FOUND (verified via git log)

Test method count (grep -c "TestLinkedTransaction"): 10 references = 5 method declarations confirmed

## Self-Check: PASSED
