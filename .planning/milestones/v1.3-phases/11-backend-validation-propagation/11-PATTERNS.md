# Phase 11: Backend Validation & Propagation - Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 3
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/internal/service/transaction_update.go` | service | request-response | `backend/internal/service/transaction_delete.go` + self | exact |
| `backend/pkg/errors/errors.go` | utility | — | self (add new constant) | exact |
| `backend/internal/domain/transaction.go` | model | — | self (possible helper method) | exact |

---

## Pattern Assignments

### `backend/internal/service/transaction_update.go` (service, request-response)

**Analog:** `backend/internal/service/transaction_delete.go` (for `GetSourceTransactionIDs` usage pattern) and the file itself.

#### Existing blanket block to replace (lines 949–952)

```go
sourceIDs, _ := s.transactionRepo.GetSourceTransactionIDs(ctx, transaction.ID)
if len(sourceIDs) > 0 {
    errs = append(errs, pkgErrors.ErrChildTransactionCannotBeUpdated)
}
```

**Decision D-01/D-02/D-03:** Replace this block. Instead of a blanket rejection, check which fields the request is changing. If any disallowed field is non-nil/non-empty, return the single new error `ErrLinkedTransactionDisallowedFieldChanged`. If only allowed fields are set (date, description, category_id, tags, propagation_settings), allow the request through.

Allowed fields in `TransactionUpdateRequest` (domain/transaction.go lines 121–132):
- `Date *time.Time` — allowed
- `Description *string` — allowed
- `CategoryID *int` — allowed
- `Tags []Tag` — allowed (tags field is non-pointer slice; treat non-nil as "set")
- `PropagationSettings TransactionPropagationSettings` — always present, not a disallowed field

Disallowed fields (any non-nil/non-zero value triggers error):
- `Amount *int64`
- `AccountID *int`
- `TransactionType *TransactionType`
- `RecurrenceSettings *RecurrenceSettings`
- `SplitSettings []SplitSettings`
- `DestinationAccountID *int`

**Pattern to follow — nil-check convention (lines 86–96 of transaction_update.go):**

```go
if lo.FromPtr(req.AccountID) > 0 {
    // field is set
}

if req.Amount != nil && *req.Amount > 0 {
    // field is set
}

if req.RecurrenceSettings != nil {
    // field is set
}

if len(req.SplitSettings) > 0 {
    // field is set
}
```

Apply same nil/empty checks for detecting disallowed field presence.

**Pattern to follow — error accumulation in validateUpdateTransactionRequest (lines 938–952):**

```go
func (s *transactionService) validateUpdateTransactionRequest(ctx context.Context, userID int, transaction domain.Transaction, req *domain.TransactionUpdateRequest) []*pkgErrors.ServiceError {
    errs := []*pkgErrors.ServiceError{}

    if transaction.OriginalUserID != nil && *transaction.OriginalUserID != userID {
        errs = append(errs, pkgErrors.ErrParentTransactionBelongsToAnotherUser)
    }
    // ...
    sourceIDs, _ := s.transactionRepo.GetSourceTransactionIDs(ctx, transaction.ID)
    if len(sourceIDs) > 0 {
        errs = append(errs, pkgErrors.ErrChildTransactionCannotBeUpdated) // <-- replace this
    }
    // ...
    return errs
}
```

**New validation block to insert (replaces lines 949–952):**

```go
sourceIDs, _ := s.transactionRepo.GetSourceTransactionIDs(ctx, transaction.ID)
isLinkedTransaction := len(sourceIDs) > 0
if isLinkedTransaction {
    disallowedFieldSet := req.Amount != nil ||
        lo.FromPtr(req.AccountID) > 0 ||
        req.TransactionType != nil ||
        req.RecurrenceSettings != nil ||
        len(req.SplitSettings) > 0 ||
        req.DestinationAccountID != nil
    if disallowedFieldSet {
        errs = append(errs, pkgErrors.ErrLinkedTransactionDisallowedFieldChanged)
    }
}
```

The existing account validation block below (lines 954–963) must also be guarded so it does not run when `isLinkedTransaction` is true — it already has `if len(sourceIDs) > 0` guard; update it to reuse the `isLinkedTransaction` variable:

```go
if lo.FromPtr(req.AccountID) > 0 {
    if isLinkedTransaction {
        errs = append(errs, pkgErrors.ErrAccountCannotBeChangedForSharedTransactions)
    } else {
        _, err := s.services.Account.GetByID(ctx, userID, *req.AccountID)
        if err != nil {
            errs = append(errs, pkgErrors.NotFound("account"))
        }
    }
}
```

#### Propagation loop — "edit my side only" changes (lines 76–119)

**D-09: Date shift must NOT propagate to linked transactions when editing a linked transaction.**

Current code (lines 98–103) shifts dates on linked transactions unconditionally:

```go
if req.Date != nil && !req.Date.IsZero() {
    own.Date = own.Date.AddDate(0, 0, dateDiffDays)

    for i := range own.LinkedTransactions {
        own.LinkedTransactions[i].Date = own.LinkedTransactions[i].Date.AddDate(0, 0, dateDiffDays) // <-- remove when linked edit
    }
}
```

**D-10: Description propagation must NOT copy to linked transactions when editing a linked transaction.**

Current code (lines 106–111) propagates description to all linked transactions:

```go
if req.Description != nil && strings.TrimSpace(*req.Description) != "" {
    own.Description = *req.Description

    for i := range own.LinkedTransactions {
        own.LinkedTransactions[i].Description = *req.Description // <-- remove when linked edit
    }
}
```

**Pattern for detecting linked-transaction context in propagation loop:**

The `data` struct and `own` (the current transaction in the loop) are available. Use `GetSourceTransactionIDs` result already computed during validation — but the propagation loop runs after validation, so the detection must be done within the loop body or passed via `data`. The cleanest approach (consistent with the codebase) is to detect at loop time:

```go
// At top of Update(), after fetchRelatedTransactions, compute once:
sourceIDs, _ := s.transactionRepo.GetSourceTransactionIDs(ctx, data.previousTransaction.ID)
isLinkedTxEdit := len(sourceIDs) > 0
```

Then guard the cross-side propagation:

```go
if req.Date != nil && !req.Date.IsZero() {
    own.Date = own.Date.AddDate(0, 0, dateDiffDays)

    if !isLinkedTxEdit {
        for i := range own.LinkedTransactions {
            own.LinkedTransactions[i].Date = own.LinkedTransactions[i].Date.AddDate(0, 0, dateDiffDays)
        }
    }
}

if req.Description != nil && strings.TrimSpace(*req.Description) != "" {
    own.Description = *req.Description

    if !isLinkedTxEdit {
        for i := range own.LinkedTransactions {
            own.LinkedTransactions[i].Description = *req.Description
        }
    }
}
```

**D-04: Category propagation must be user-specific (same as tags, line 90).**

The existing category assignment (line 90) already only sets `own.CategoryID` — it does NOT loop over `own.LinkedTransactions` to copy category. This is already correct; no change needed for category cross-propagation.

**D-07: Tag propagation already correct (lines 114–118).**

```go
own.Tags = req.Tags
for i := range own.LinkedTransactions {
    if own.LinkedTransactions[i].UserID == userID {  // already user-filtered
        own.LinkedTransactions[i].Tags = req.Tags
    }
}
```

No changes needed for tags.

---

### `backend/pkg/errors/errors.go` (utility — add new error constant)

**Analog:** existing `ErrChildTransactionCannotBeUpdated` pattern at line 124 and `ErrorTagChildTransactionCannotBeUpdated` at line 59.

**New ErrorTag constant** (add alongside line 59):

```go
ErrorTagLinkedTransactionDisallowedFieldChanged ErrorTag = "TRANSACTION.LINKED_TRANSACTION_DISALLOWED_FIELD_CHANGED"
```

**New error variable** (add alongside line 124):

```go
ErrLinkedTransactionDisallowedFieldChanged = NewWithTag(
    ErrCodeBadRequest,
    []string{string(ErrorTagLinkedTransactionDisallowedFieldChanged)},
    "linked transactions can only edit date, description, category, and tags",
)
```

Pattern to copy from (lines 122–124):

```go
ErrParentTransactionBelongsToAnotherUser       = NewWithTag(ErrCodeForbidden, []string{string(ErrorTagParentTransactionBelongsToAnotherUser)}, "parent transaction belongs to another user")
ErrAccountCannotBeChangedForSharedTransactions = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagAccountCannotBeChangedForSharedTransactions)}, "account cannot be changed for shared transactions")
ErrChildTransactionCannotBeUpdated             = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagChildTransactionCannotBeUpdated)}, "child transaction cannot be updated")
```

---

### `backend/internal/domain/transaction.go` (model — possible helper)

**Decision:** Whether to add a helper on `TransactionUpdateRequest` is left to Claude's discretion (CONTEXT.md). The inline nil-check approach in `validateUpdateTransactionRequest` (shown above) is sufficient and consistent with the existing style.

If a helper is added, follow the pattern of `TransactionType.IsValid()` (line 28) — a receiver method returning bool:

```go
// HasDisallowedFieldsForLinkedEdit returns true if any field that cannot be
// changed on a linked transaction is set in the request.
func (r *TransactionUpdateRequest) HasDisallowedFieldsForLinkedEdit() bool {
    return r.Amount != nil ||
        r.AccountID != nil ||
        r.TransactionType != nil ||
        r.RecurrenceSettings != nil ||
        len(r.SplitSettings) > 0 ||
        r.DestinationAccountID != nil
}
```

---

## Shared Patterns

### Error construction
**Source:** `backend/pkg/errors/errors.go` lines 73–125
**Apply to:** new `ErrLinkedTransactionDisallowedFieldChanged`

Pattern: `NewWithTag(ErrorCode, []string{string(ErrorTag)}, "human message")`

All transaction-domain error tags use the `TRANSACTION.` prefix.

### Nil/zero field detection
**Source:** `backend/internal/service/transaction_update.go` lines 86–96
**Apply to:** disallowed-field detection in `validateUpdateTransactionRequest`

Pattern: `lo.FromPtr(req.AccountID) > 0` for pointer-to-int; `req.Amount != nil` for pointer-to-value; `len(req.SplitSettings) > 0` for slices.

### Error accumulation
**Source:** `backend/internal/service/transaction_update.go` lines 938–1033
**Apply to:** new validation block inside `validateUpdateTransactionRequest`

Pattern: append `*pkgErrors.ServiceError` to `errs` slice, return at end. Single call to `pkgErrors.ServiceErrors(errs)` in caller.

### Integration test suite
**Source:** `backend/internal/service/transaction_update_test.go` lines 1–12
**Apply to:** new test cases for linked-transaction validation

```go
type TransactionUpdateWithDBTestSuite struct {
    ServiceTestWithDBSuite
}

func TestTransactionUpdate(t *testing.T) {
    suite.Run(t, new(TransactionUpdateWithDBTestSuite))
}
```

Each test method: create users + accounts + connection via `createTestUser`, `createTestAccount`, `createAcceptedTestUserConnection`; create a split expense via `Services.Transaction.Create`; update the linked (partner-side) transaction; assert error tag or assert field unchanged.

---

## No Analog Found

None — all three files have direct analogs in the codebase.

---

## Metadata

**Analog search scope:** `backend/internal/service/`, `backend/pkg/errors/`, `backend/internal/domain/`
**Files scanned:** 5 (transaction_update.go, transaction_delete.go, errors.go, domain/transaction.go, transaction_update_test.go)
**Pattern extraction date:** 2026-04-18
