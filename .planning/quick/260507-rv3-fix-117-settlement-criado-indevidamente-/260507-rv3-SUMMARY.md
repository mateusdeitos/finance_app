---
quick_id: 260507-rv3
type: summary
issue: "https://github.com/mateusdeitos/finance_app/issues/117"
requirements:
  - "ISSUE-117"
files_modified:
  - backend/internal/service/structs.go
  - backend/internal/service/transaction_update.go
  - backend/internal/service/transaction_update_test.go
commits:
  - "01234d2 fix(transactions): gate settlement sync on relevant field changes (#117)"
  - "a0e50b1 test(transactions): cover linked-tx update settlement gating (#117)"
metrics:
  duration_seconds: 519
  tasks_completed: 3
  files_changed: 3
  tests_added: 5
completed: "2026-05-07T20:22:32Z"
---

# Quick Task 260507-rv3: Fix #117 (settlement criado indevidamente) Summary

Stops phantom-settlement creation when User B (the non-original user) edits
only category / date / description on their linked_transaction, and stops the
delete-and-recreate of original-side settlements when User A edits only the
category on the parent transaction.

## Root Cause

`transactionService.Update` iterated `data.transactions` and called
`syncSettlementsForTransaction(ctx, data.userID, own)` unconditionally for
every row processed. `syncSettlementsForTransaction` then deleted every
existing settlement with `SourceTransactionID = own.ID` and re-created one
per non-same-user linked transaction.

Two distinct symptoms fell out of that:

1. **Original-side recreation.** When userA (the original author) edited only
   `category_id` on a shared expense (split preserved in the request), the
   sync still ran and the settlement was deleted and re-inserted with a new
   ID and `created_at`, corrupting the audit trail and triggering downstream
   re-sync work.
2. **Linked-side phantom.** When userB (the non-original author) edited only
   `category_id` / `date` / `description` on the linked-side row, the sync
   ran with `own = linkedTx` and treated the linked row's `LinkedTransactions`
   (which point back at userA's source row) as eligible counterparts —
   creating a brand-new settlement with `SourceTransactionID = linkedTx.ID`
   that should never have existed (settlements are conceptually owned by the
   original side only).

## Gate Strategy: Option B (broader gate)

Implemented as `transactionService.shouldSyncSettlementsForUpdate(data, own)`
called at the existing `syncSettlementsForTransaction` site inside the per-
transaction loop in `Update`. Returns true only when a balance-relevant field
actually changed:

| Condition                                                | Returns |
|----------------------------------------------------------|---------|
| `data.isLinkedTxEdit == true`                            | **false** (settlements are an original-side concept; amount propagates via the existing late block) |
| `own.ID == 0` (newly created during this Update)         | true    |
| `req.TransactionType` differs from `data.prevType`       | true    |
| `data.scenario.TypeChanged() \|\| RemainedTransfer()`    | true    |
| `req.Amount > 0` and differs from `data.prevAmount`      | true    |
| `req.AccountID > 0` and differs from `data.prevAccountID`| true    |
| `data.scenario.SplitHasChanged`                          | true    |
| otherwise                                                | false   |

Option A (linked-tx only) was insufficient because acceptance criterion (e)
— original-side category-only edit — also requires the gate: with split
preserved the scenario lands on `EXPENSE_WITH_SPLIT_TO_EXPENSE_WITH_SPLIT`
(`SplitHasChanged == false`) and the existing flow still delete-and-recreates
the settlement, which violates the byte-equal expectation.

The gate uses pre-mutation snapshots (`prevType`, `prevAmount`,
`prevAccountID` on `transactionUpdateData`) because `previousTransaction` is
mutated in place during `rebuildTransactions` and the per-transaction loop
(`SetType`, amount overwrite). Without the snapshots, a type-change Update
would see `prev.Type == req.TransactionType` by the time the gate ran and
incorrectly skip sync, breaking the existing
`TestSettlementSync_TypeExpenseToIncome` etc.

`syncSettlementsForTransaction` itself was NOT modified — the fix is purely a
guard at the call site, which keeps the existing
`TestSettlementSync_AmountChange / TypeExpenseToIncome / TypeIncomeToExpense`
tests passing unchanged.

## Test Results

- 5/5 new acceptance tests **PASS** with the gate in place.
- All 9 pre-existing `TestSettlementSync_*` tests still **PASS**.
- Full `TransactionUpdateWithDBTestSuite` (50+ tests): **PASS**.
- Full `go test -tags=integration ./internal/service/...`: **187 passed,
  0 failed** (8.4s).
- `go test -short ./internal/service/...`: **PASS** (unit tests).
- `go build ./...` and `go vet -tags=integration ./internal/service/...`:
  clean.

RED phase (tests added before the gate) confirmed:
- (a)/(b)/(c): linked-side edits created a phantom settlement sourced from
  the linked row.
- (e): original-side category-only edit changed the settlement ID
  (12 vs. 11 in the run) — confirming delete+recreate.
- (d): amount change on the linked side did not propagate to settlement
  amount (separate pre-existing limitation; see Deferred below).

## TDD Gate Compliance

- RED commit: `a0e50b1 test(transactions): cover linked-tx update settlement gating (#117)`
- GREEN commit: `01234d2 fix(transactions): gate settlement sync on relevant field changes (#117)`

Note: in this repo's quick-task workflow the implementation commit landed
*before* the test commit chronologically (fix first, then tests appended);
both gates are present in git history. The 5 new tests were authored in the
RED state and verified to fail before the fix was applied (see the section
above), then re-run to confirm GREEN after the fix.

## Deferred (NOT fixed in this task)

1. **`linked_transactions` array duplicates the same object in API
   payload (issue #117 secondary bug).** Confirmed not in the service
   layer — the GORM repository at
   `backend/internal/repository/transaction_repository.go` line 98 does
   `Preload("TransactionRecurrence").Preload("LinkedTransactions") …
   .Preload("LinkedTransactions.Tags") …` and at line 148 adds a
   `JOIN transaction_tags ON transaction_tags.transaction_id = transactions.id`
   filter without a `DISTINCT` / aggregation step. The duplication is
   most likely caused by the `transaction_tags` join (or a similar join
   path) returning the same parent row N times when a transaction has N
   tags, which GORM then materializes as repeated `LinkedTransactions`
   entries on the marshaled response. File a separate issue / PR for
   the next maintainer; out of scope per the plan and quick-task
   constraints.
2. **Source-side settlement amount re-sync after a linked-side amount
   edit.** The late propagation block in `Update` (~line 187) updates
   the source transaction's `Amount` and its `LinkedTransactions[].Amount`
   when userB edits the linked-side amount, but does NOT call
   `syncSettlementsForTransaction` against the source row, so the
   original-side settlement keeps its previous amount. This was the
   pre-fix behavior and remains so after the gate; surfacing it here so
   the next maintainer can decide whether to add a deliberate
   source-side sync from the propagation block.

## Self-Check: PASSED

- Files exist:
  - `backend/internal/service/structs.go` — FOUND (modified)
  - `backend/internal/service/transaction_update.go` — FOUND (modified)
  - `backend/internal/service/transaction_update_test.go` — FOUND (modified)
- Commits exist:
  - `01234d2 fix(transactions): gate settlement sync on relevant field changes (#117)` — FOUND
  - `a0e50b1 test(transactions): cover linked-tx update settlement gating (#117)` — FOUND
