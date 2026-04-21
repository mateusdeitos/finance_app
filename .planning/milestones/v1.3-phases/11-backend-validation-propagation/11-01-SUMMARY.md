---
phase: 11-backend-validation-propagation
plan: "01"
subsystem: backend
tags: [validation, linked-transactions, propagation, error-handling]
dependency_graph:
  requires: []
  provides: [linked-transaction-field-validation, propagation-scoping]
  affects: [backend/pkg/errors/errors.go, backend/internal/service/transaction_update.go]
tech_stack:
  added: []
  patterns: [per-field validation, propagation guard]
key_files:
  created: []
  modified:
    - backend/pkg/errors/errors.go
    - backend/internal/service/transaction_update.go
decisions:
  - Replace blanket ErrChildTransactionCannotBeUpdated with per-field check allowing date/description/category/tags/propagation on linked transactions
  - Guard isLinkedTxEdit flag computed at Update function scope, separate from validateUpdateTransactionRequest scope
  - LinkedTransactions date/description cross-propagation blocked via !isLinkedTxEdit guards; own-side updates always proceed
metrics:
  duration: "~10 minutes"
  completed_date: "2026-04-18"
  tasks_completed: 2
  files_modified: 2
---

# Phase 11 Plan 01: Backend Validation & Propagation Guard Summary

**One-liner:** Per-field linked-transaction validation using ErrLinkedTransactionDisallowedFieldChanged plus isLinkedTxEdit propagation guard preventing cross-partner date/description changes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add error constant and replace validation block | 2baef85 | backend/pkg/errors/errors.go, backend/internal/service/transaction_update.go |
| 2 | Guard propagation loop for "edit my side only" | 0dbb6ab | backend/internal/service/transaction_update.go |

## What Was Built

### Task 1: Field-level validation for linked transactions

Replaced the blanket `ErrChildTransactionCannotBeUpdated` block that rejected ALL updates to linked transactions with a per-field check:

- Added `ErrorTagLinkedTransactionDisallowedFieldChanged ErrorTag = "TRANSACTION.LINKED_TRANSACTION_DISALLOWED_FIELD_CHANGED"` to `errors.go`
- Added `ErrLinkedTransactionDisallowedFieldChanged` error variable with message "linked transactions can only edit date, description, category, and tags"
- New validation logic detects `isLinkedTransaction` (has sourceIDs) and only rejects requests where `Amount`, `AccountID`, `TransactionType`, `RecurrenceSettings`, `SplitSettings`, or `DestinationAccountID` are set
- The account validation block below reuses the `isLinkedTransaction` variable instead of re-checking `len(sourceIDs) > 0`
- `ErrChildTransactionCannotBeUpdated` preserved in errors.go (may be referenced elsewhere)

### Task 2: Propagation guard for partner isolation

Added `isLinkedTxEdit` flag in the `Update` function (computed from `GetSourceTransactionIDs` after `fetchRelatedTransactions`):

- Date cross-propagation to `own.LinkedTransactions` wrapped with `if !isLinkedTxEdit` — editing user's own date always shifts, partner's linked transaction dates never shift
- Description cross-propagation to `own.LinkedTransactions` wrapped with `if !isLinkedTxEdit` — editing user's own description always updates, partner's linked transaction descriptions never update
- Category: already only sets `own.CategoryID`, no cross-propagation loop existed — no change needed
- Tags: already filters by `own.LinkedTransactions[i].UserID == userID` — no change needed

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-11-01 (Tampering via disallowed fields) | Mitigated — per-field nil/zero check in validateUpdateTransactionRequest |
| T-11-02 (Elevation via cross-user propagation) | Mitigated — isLinkedTxEdit guard prevents partner date/description modification |
| T-11-03 (Information disclosure in error message) | Accepted per plan |

## Known Stubs

None — all logic is wired and functional.

## Self-Check

Files exist:
- backend/pkg/errors/errors.go: FOUND
- backend/internal/service/transaction_update.go: FOUND

Commits exist:
- 2baef85: FOUND
- 0dbb6ab: FOUND

## Self-Check: PASSED
