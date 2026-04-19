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
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-04-18
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

This phase implements validation and propagation rules for editing linked (partner-side) transactions in a recurring shared-expense context. The implementation in `transaction_update.go` is large and complex; the new test coverage is comprehensive and well-structured.

Two critical issues were found: a nil-pointer dereference that crashes when a `transfer`-type transaction is updated without providing `DestinationAccountID`, and a panic-on-empty-slice in `ServiceErrors.Unwrap`. Three warnings cover a wrong error-index variable, redundant double-call to `GetSourceTransactionIDs`, and a `nil` transaction guard placed after the pointer is already dereferenced. Two informational items round out the report.

---

## Critical Issues

### CR-01: Nil-pointer dereference in `determineTypeUpdateScenario` when `DestinationAccountID` is nil

**File:** `backend/internal/service/transaction_update.go:199,231,271`

**Issue:** `checkIsTransferToSameUser` is called with `*data.req.DestinationAccountID` on lines 199, 231, and 271 — three separate branches inside `determineTypeUpdateScenario`. The call happens *before* validation runs (validation is at line 26, but `determineTypeUpdateScenario` is called at line 42 after validation). However, the validation at line 1014–1016 only rejects `nil` `DestinationAccountID` when the *incoming* `req.TransactionType` is `transfer`; it does not guard the case where `previousTransaction.Type` is already `transfer` and the caller omits `DestinationAccountID` from the update request (e.g., they only want to change the description). In that branch (`case domain.TransactionTypeTransfer → case domain.TransactionTypeTransfer`, line 271) the code dereferences `data.req.DestinationAccountID` unconditionally, causing a nil-pointer panic.

Additionally, the `case domain.TransactionTypeExpense/Income → case domain.TransactionTypeTransfer` branches (lines 199 and 231) will panic if a caller passes `TransactionType: transfer` but omits `DestinationAccountID` — the validator catches the missing field but the scenario function runs before the error is returned (it is actually called *after* validation at line 42, so those two are safe). However, the `transfer → transfer` branch at line 271 is reached even when `DestinationAccountID` is nil and the previous type was already `transfer`, because the validator only fires on `lo.FromPtr(req.TransactionType) == transfer` (line 1014), which is false when `req.TransactionType` is nil.

**Fix:**
```go
// In determineTypeUpdateScenario, guard the transfer→transfer branch:
case domain.TransactionTypeTransfer:
    // Use the existing account as destination when none is specified.
    destAccountID := data.previousTransaction.AccountID // fallback
    if data.req.DestinationAccountID != nil {
        destAccountID = *data.req.DestinationAccountID
    }
    isTransferToSameUser, err := checkIsTransferToSameUser(destAccountID, data.userID)
    ...
```

Or, extend `validateUpdateTransactionRequest` to require `DestinationAccountID` whenever the *existing* transaction type is transfer and the caller does not provide a new type:

```go
if previousTransaction.Type == domain.TransactionTypeTransfer &&
    (req.TransactionType == nil || *req.TransactionType == domain.TransactionTypeTransfer) &&
    req.DestinationAccountID == nil {
    errs = append(errs, pkgErrors.ErrMissingDestinationAccount)
}
```

---

### CR-02: `ServiceErrors.Unwrap` panics on an empty slice

**File:** `backend/pkg/errors/errors.go:163-165`

**Issue:** `ServiceErrors.Unwrap()` unconditionally accesses `es[0]` without a length check. A `ServiceErrors` value with zero elements will panic. While callers today append before wrapping, the type is exported and any future consumer (or a race on the error path) could produce an empty slice, then call `errors.Unwrap` or `errors.As` on it, triggering an index out-of-range panic.

```go
func (es ServiceErrors) Unwrap() error {
    return es[0].Err  // panics if len(es) == 0
}
```

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

## Warnings

### WR-01: Wrong loop variable used as error index in `rebuildTransactions` (split-changed branch)

**File:** `backend/internal/service/transaction_update.go:531`

**Issue:** In the `SplitHasChanged` branch of `rebuildTransactions`, when a new split-setting has no associated `UserConnection`, the error is created with index `i` (the outer transaction loop variable) instead of the index of the problematic `splitSetting` inside the inner `for _, splitSetting := range data.req.SplitSettings` loop. This means the reported index is wrong — it points to the transaction position, not the split-setting position — making it impossible for the client to identify which split entry is invalid.

Contrast with line 453 in the `AddedSplit` branch, which correctly passes index `j`.

```go
// line 530-533
for _, splitSetting := range data.req.SplitSettings {
    if splitSetting.UserConnection == nil {
        return pkgErrors.ErrSplitSettingInvalidConnectionID(i)  // BUG: should be the split index, not i
    }
```

**Fix:** Use a separate counter for the split index:
```go
for splitIdx, splitSetting := range data.req.SplitSettings {
    if splitSetting.UserConnection == nil {
        return pkgErrors.ErrSplitSettingInvalidConnectionID(splitIdx)
    }
    ...
}
```

---

### WR-02: `GetSourceTransactionIDs` called twice for the same transaction in `Update`

**File:** `backend/internal/service/transaction_update.go:58-59` and `backend/internal/service/transaction_update.go:956-957`

**Issue:** `GetSourceTransactionIDs` is called inside `validateUpdateTransactionRequest` (line 956) and again immediately after validation returns in `Update` (line 58). Both calls pass the same `transaction.ID` / `id`, hitting the database twice within the same DB transaction. The result at line 58–59 is used to set `isLinkedTxEdit`, while the one inside validation is used for the disallowed-field guard. Because validation already performs this check, the second call is redundant.

**Fix:** Return or propagate the `isLinkedTransaction` flag from `validateUpdateTransactionRequest` so the caller does not need a second round-trip, or cache the result by passing it as an `out` parameter:
```go
// option A: extend the return from the validator
func (s *transactionService) validateUpdateTransactionRequest(
    ctx context.Context, userID int,
    transaction domain.Transaction,
    req *domain.TransactionUpdateRequest,
) ([]*pkgErrors.ServiceError, bool /*isLinkedTx*/) { ... }
```

---

### WR-03: Nil guard for `own` placed after the pointer is already dereferenced

**File:** `backend/internal/service/transaction_update.go:84-87`

**Issue:** At line 80, `s.shouldUpdateTransactionBasedOnPropagationSettings(data.transactions[i], data)` passes `data.transactions[i]` (a pointer dereference) to the function. At line 84, `own` is assigned `data.transactions[i]`. Then at line 85–87 the code checks `if own == nil` and returns an internal error. Because `data.transactions` is a `[]*domain.Transaction` slice and was already indexed at line 80 without a nil check, if the pointer really were nil the runtime would have already panicked at line 80. The `own == nil` guard at line 85 can therefore never protect against a nil dereference and conveys false safety.

```go
for i := range data.transactions {
    if !s.shouldUpdateTransactionBasedOnPropagationSettings(data.transactions[i], data) { // line 80 — nil deref here if nil
        continue
    }
    own := data.transactions[i]  // line 84
    if own == nil {              // line 85 — unreachable guard
        return pkgErrors.Internal(...)
    }
```

**Fix:** Either move the nil guard before line 80 or, more idiomatically, rely on the invariant that `fetchRelatedTransactions` never appends nil pointers (add a comment stating this). Remove the dead guard:
```go
for i := range data.transactions {
    own := data.transactions[i]
    if own == nil {
        return pkgErrors.Internal(fmt.Sprintf("ownTransactions index %d not found", i), nil)
    }
    if !s.shouldUpdateTransactionBasedOnPropagationSettings(own, data) {
        continue
    }
    // ... rest of loop
```

---

## Info

### IN-01: Duplicate test function names for different scenarios

**File:** `backend/internal/service/transaction_update_test.go:905,1075`

**Issue:** Both `TestScenario6_OwnExpenseWithLinkedTransactionsToOwnTransfer` (line 905) and `TestScenario6_OwnExpenseWithLinkedTransactionsToTransferToDifferentUser` (line 1075) share the prefix `TestScenario6_`. Similarly `TestScenario8_OwnTransferToOwnExpense` and `TestScenario8_OwnTransferToOwnIncome` both start with `TestScenario8_`. While Go does not prohibit this (they are different method names), the scenario numbering implies a conflict and makes it harder to correlate test names with the scenario matrix in comments. Future additions may accidentally reuse a number.

**Fix:** Renumber or use suffixes that clearly distinguish them (e.g., `TestScenario6a_...`, `TestScenario6b_...` or `TestScenario6_SameUser`, `TestScenario6_DifferentUser`).

---

### IN-02: Indentation inconsistency in test file

**File:** `backend/internal/service/transaction_update_test.go:3156,3198`

**Issue:** Two `suite.Services.Transaction.Create` calls (lines 3156 and 3198) have an extra leading tab before the `_` variable, inconsistent with the rest of the file:
```go
	_, err = suite.Services.Transaction.Create(...)   // correct
		_, err = suite.Services.Transaction.Create(...)  // extra tab — lines 3156, 3198
```
This is a cosmetic issue that `gofmt` would catch but does not affect correctness.

**Fix:** Run `gofmt` or correct the indentation manually.

---

_Reviewed: 2026-04-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
