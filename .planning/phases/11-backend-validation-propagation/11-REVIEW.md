---
phase: 11-backend-validation-propagation
reviewed: 2026-04-18T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - backend/internal/service/transaction_update.go
  - backend/internal/service/transaction_update_test.go
  - backend/pkg/errors/errors.go
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-04-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

The reviewed files implement the linked-transaction editing feature: validation, propagation logic for recurring/split transactions, settlement synchronisation, and comprehensive integration tests. The core logic is well-structured and the test suite has excellent scenario coverage (16+ installment scenarios, settlement sync tests, propagation isolation tests).

No security vulnerabilities or data-loss crashes were found. The warnings are logic-correctness issues: two nil-pointer dereferences that can panic under reachable inputs, an index variable shadowing bug in the main update loop, and a missing validation guard for the `determineTypeUpdateScenario` transfer path. The info items cover minor quality concerns in the test file.

## Warnings

### WR-01: Nil pointer dereference in `determineTypeUpdateScenario` — transfer path derefs `DestinationAccountID` without nil guard

**File:** `backend/internal/service/transaction_update.go:199`
**Issue:** The `case domain.TransactionTypeTransfer:` arms inside both the `TransactionTypeExpense` and `TransactionTypeIncome` parent cases call `checkIsTransferToSameUser(*data.req.DestinationAccountID, data.userID)` (lines 199, 231). If a caller submits `TransactionType = "transfer"` but omits `DestinationAccountID`, the nil pointer dereference panics before the validation in `validateUpdateTransactionRequest` can fire. `validateUpdateTransactionRequest` only checks for the missing field when `lo.FromPtr(req.TransactionType) == domain.TransactionTypeTransfer` (line 1014), but `determineTypeUpdateScenario` is called **after** validation, so the validation guard is fine — however the panic path is still reachable when `req.TransactionType` is nil and `previousTransaction.Type` is `expense`/`income` yet `req.DestinationAccountID` is nil and another code path reaches these arms through in-memory state. More concretely, the `TRANSFER_TO_EXPENSE/INCOME_*` arms at lines 254–270 also dereference `*data.req.DestinationAccountID` unconditionally when `newType == TransactionTypeTransfer` while `previousTransaction.Type == TransactionTypeTransfer`. The same issue is present at line 271.

**Fix:**
```go
// Guard before calling checkIsTransferToSameUser
if data.req.DestinationAccountID == nil {
    return updateChanges{}, pkgErrors.ErrMissingDestinationAccount
}
isTransferToSameUser, err := checkIsTransferToSameUser(*data.req.DestinationAccountID, data.userID)
```
Add this guard at lines 199, 231, and 271 (all three transfer-destination dereference sites inside `determineTypeUpdateScenario`).

---

### WR-02: Nil pointer dereference in `rebuildTransactions` when `DestinationAccountID` is nil on transfer path

**File:** `backend/internal/service/transaction_update.go:575`
**Issue:** Inside `rebuildTransactions`, when `data.scenario.TypeChangedToTransfer() || data.scenario.RemainedTransfer()` is true, line 575 dereferences `*data.req.DestinationAccountID` unconditionally:
```go
accountID := *data.req.DestinationAccountID
```
If `DestinationAccountID` is nil at this point (which the validation already rejects, but only for the case where `req.TransactionType` is explicitly set to transfer — a scenario change from a previous `transfer` type via a nil `req.TransactionType` could still exercise this branch), the deref panics. The validation gate is only checked in `validateUpdateTransactionRequest`; by the time `rebuildTransactions` runs, there is no redundant nil guard.

**Fix:**
```go
if data.req.DestinationAccountID == nil {
    return pkgErrors.Internal("destination account ID is required for transfer", nil)
}
accountID := *data.req.DestinationAccountID
```

---

### WR-03: Loop variable `i` shadowed inside nested range — wrong transaction blamed in error message

**File:** `backend/internal/service/transaction_update.go:79–156`
**Issue:** The outer loop uses `for i := range data.transactions` (line 79). Inside the loop body, lines 105 and 122 use `for i := range own.LinkedTransactions` — the inner `i` shadows the outer `i`. This is not a crash, but the error message at line 86 (`fmt.Sprintf("ownTransactions index %d not found", i)`) would report the wrong (inner) index if somehow evaluated after the inner loop ran. More importantly, the outer loop counter is lost for any diagnostics mid-inner-loop.

The real risk is code evolution: any new use of outer `i` inside those inner loops will silently read the wrong value. Go 1.22 range-loop variable semantics do not change the shadowing.

**Fix:** Rename the inner loop variables to `j`:
```go
if req.Date != nil && !req.Date.IsZero() {
    own.Date = own.Date.AddDate(0, 0, dateDiffDays)
    if !isLinkedTxEdit {
        for j := range own.LinkedTransactions {
            own.LinkedTransactions[j].Date = own.LinkedTransactions[j].Date.AddDate(0, 0, dateDiffDays)
        }
    }
}

if req.Description != nil && strings.TrimSpace(*req.Description) != "" {
    own.Description = *req.Description
    if !isLinkedTxEdit {
        for j := range own.LinkedTransactions {
            own.LinkedTransactions[j].Description = *req.Description
        }
    }
}

own.Tags = req.Tags
for j := range own.LinkedTransactions {
    if own.LinkedTransactions[j].UserID == userID {
        own.LinkedTransactions[j].Tags = req.Tags
    }
}
```

---

### WR-04: `handlerRecurrenceUpdate` accesses `data.transactions[0]` unconditionally before length check

**File:** `backend/internal/service/transaction_update.go:736–738`
**Issue:** Inside `handlerRecurrenceUpdate`, the `propagation=current` arm at lines 736–739 directly accesses `data.transactions[0]` and `data.transactions[0].TransactionRecurrence`:
```go
data.previousTransaction.TransactionRecurrenceID = nil
data.previousTransaction.TransactionRecurrence = nil
data.transactions[0].TransactionRecurrenceID = nil   // line 738
data.transactions[0].TransactionRecurrence = nil
```
`fetchRelatedTransactions` is called before `handlerRecurrenceUpdate` and always appends `previousTransaction` first, so `data.transactions` will have at least one entry. However, if `fetchRelatedTransactions` ever changes or a new early-return path is added before it, this will panic. The `normalizeInstallments` function already has an explicit `len(data.transactions) == 0` guard at line 332, which is the correct pattern.

**Fix:**
```go
if len(data.transactions) == 0 {
    return pkgErrors.Internal("no transactions to update", nil)
}
data.previousTransaction.TransactionRecurrenceID = nil
data.previousTransaction.TransactionRecurrence = nil
data.transactions[0].TransactionRecurrenceID = nil
data.transactions[0].TransactionRecurrence = nil
```

---

## Info

### IN-01: Duplicate `GetSourceTransactionIDs` call — `isLinkedTransaction` computed twice for the same transaction

**File:** `backend/internal/service/transaction_update.go:58–59` and `945–957`
**Issue:** `validateUpdateTransactionRequest` calls `s.transactionRepo.GetSourceTransactionIDs(ctx, transaction.ID)` at line 956, and then `Update` calls the same method again for the same transaction at lines 58–59 to set `isLinkedTxEdit`. This results in two identical repository round-trips per update request. The result at line 58 is only used to gate linked-transaction date/description propagation (lines 104–126).

**Fix:** Lift the first call's result into the validation return value or pass `isLinkedTransaction` from validation to the caller. Alternatively, check whether the flag can be derived from `previousTransaction.OriginalUserID != nil && *previousTransaction.OriginalUserID != userID` which is already available without a DB query.

---

### IN-02: Misleading error index in `rebuildTransactions` `SplitHasChanged` branch

**File:** `backend/internal/service/transaction_update.go:531`
**Issue:** In the `SplitHasChanged` path, the error returned at line 531 for an invalid `connectionID` uses `i` (the outer transaction index), not `j` (the split-setting index):
```go
return pkgErrors.ErrSplitSettingInvalidConnectionID(i)
```
The sibling call at line 452 in the `AddedSplit` branch correctly uses `j`. The `ErrSplitSettingInvalidConnectionID` error message says "at index N", which the caller interprets as the position within `SplitSettings`, not within `data.transactions`.

**Fix:**
```go
// in the for _, splitSetting := range data.req.SplitSettings loop, track the split index
for splitIdx, splitSetting := range data.req.SplitSettings {
    if splitSetting.UserConnection == nil {
        return pkgErrors.ErrSplitSettingInvalidConnectionID(splitIdx)
    }
    ...
}
```

---

### IN-03: Test helper `assertTransaction` uses `T().Fatalf` which bypasses deferred cleanup in subtests

**File:** `backend/internal/service/transaction_update_test.go:3095` and `3105`
**Issue:** `assertTransaction` calls `suite.T().Fatalf(...)` on length mismatches for Tags and LinkedTransactions. `Fatalf` calls `runtime.Goexit()` which terminates the goroutine — in a testify sub-suite this is fine, but it silently skips any assertions that follow the length check. The pattern is also asymmetric with the rest of the file which uses `suite.Assert()` (non-fatal) and `suite.Require()` (fatal via testify). Using `suite.Require().Len(...)` or `suite.Require().Equalf(...)` would be idiomatic and would provide a consistent failure message format.

**Fix:**
```go
suite.Require().Equalf(len(expected.Tags), len(actual.Tags),
    "len(expected.Tags) != len(actual.Tags): %d != %d", len(expected.Tags), len(actual.Tags))
// ...
suite.Require().Equalf(len(expected.LinkedTransactions), len(actual.LinkedTransactions),
    "len(expected.LinkedTransactions) != len(actual.LinkedTransactions): %d != %d",
    len(expected.LinkedTransactions), len(actual.LinkedTransactions))
```

---

### IN-04: Inconsistent indentation in several `Create` calls in test file

**File:** `backend/internal/service/transaction_update_test.go:3156–3163`, `3198–3207`, `3242–3252`, and similar
**Issue:** A number of `suite.Services.Transaction.Create(...)` calls have an extra leading tab before `_, err =`, producing inconsistent indentation compared to the rest of the file. This is a formatting artifact that `gofmt` would normally catch but may have slipped through.

**Fix:** Run `gofmt` or `goimports` on the test file.

---

### IN-05: `ServiceErrors.Unwrap()` panics on empty slice

**File:** `backend/pkg/errors/errors.go:163–165`
**Issue:**
```go
func (es ServiceErrors) Unwrap() error {
    return es[0].Err
}
```
If `ServiceErrors` is somehow an empty slice, `es[0]` will panic. `ServiceErrors` is constructed by `pkgErrors.ServiceErrors(errs)` only when `len(errs) > 0` (see lines 27, 48 in `transaction_update.go`), so this is not currently reachable in the normal path. However, `ServiceErrors` is an exported type, and any caller constructing an empty `ServiceErrors` and calling `errors.Unwrap(err)` will get a panic instead of `nil`.

**Fix:**
```go
func (es ServiceErrors) Unwrap() error {
    if len(es) == 0 {
        return nil
    }
    return es[0].Err
}
```

---

_Reviewed: 2026-04-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
