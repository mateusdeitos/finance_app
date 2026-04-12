---
phase: 02-service-api
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - backend/internal/service/transaction_create.go
  - backend/docs/docs.go
  - backend/docs/swagger.json
  - backend/docs/swagger.yaml
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the recurrence loop refactor in `transaction_create.go` and the generated docs artifacts. The core loop logic (`i` starts at `CurrentInstallment`, date offset computed as `i - CurrentInstallment`) is **semantically correct**: installment numbers are preserved as their actual position in the full series, and the date for each installment is correctly offset from the request date by zero for the first emitted installment and by 1, 2, … intervals for subsequent ones.

However, there are four warning-level issues surrounding this logic: a panic-prone unchecked index in `injectUserConnectionsOnSplitSettings`, N-recurrence-rows-per-installment for same-user recurring transfers, a missing `TotalInstallments == 0` guard, and a `createTags` nil-dereference when tag creation fails. Two info-level items were also found. The generated docs files (`docs.go`, `swagger.json`, `swagger.yaml`) are auto-generated artifacts and have no issues of their own beyond what is already expressed by the Go source.

---

## Warnings

### WR-01: Index panic in `injectUserConnectionsOnSplitSettings` when connection IDs do not all exist in DB

**File:** `backend/internal/service/transaction_create.go:311-314`

**Issue:** `conns` is the DB result filtered to IDs that actually exist (and the query uses `FilterMap` which drops `ConnectionID <= 0`). `splitSettings` is sorted by `ConnectionID` ascending. The loop then does `conns[i]` — but if any `ConnectionID` in the request is invalid (does not exist in the DB), `Search` will return fewer rows than the length of `splitSettings`, causing an out-of-bounds panic at `conns[i]`.

The validation in `validateCreateTransactionRequest` only checks `ConnectionID > 0` (line 105); it does not verify the IDs exist. The existence check only happens here, indirectly, via the length mismatch.

```go
// lines 311-314 — panic if len(conns) < len(splitSettings)
for i := range splitSettings {
    conn := conns[i]           // index out of range if a connectionID is not found
    conn.SwapIfNeeded(userID)
    splitSettings[i].UserConnection = conn
}
```

**Fix:** Build a lookup map from connection ID to `*UserConnection`, then match explicitly and return an explicit `ErrSplitSettingInvalidConnectionID` error instead of panicking:

```go
connByID := make(map[int]*domain.UserConnection, len(conns))
for _, c := range conns {
    connByID[c.ID] = c
}
for i := range splitSettings {
    conn, ok := connByID[splitSettings[i].ConnectionID]
    if !ok {
        return pkgErrors.ErrSplitSettingInvalidConnectionID(i).AddTag("connection_not_found")
    }
    conn.SwapIfNeeded(userID)
    splitSettings[i].UserConnection = conn
}
```

---

### WR-02: Recurring same-user transfer creates a new `TransactionRecurrence` row for every installment

**File:** `backend/internal/service/transaction_create.go:358-364`

**Issue:** `injectLinkedTransactions` is called inside the iteration loop over `transactions` (line 222). For a same-user recurring transfer (the `conn == nil` branch, lines 356-384), `createRecurrence` is called on **every iteration** of that loop — once per installment. This produces N `transaction_recurrence` rows for the destination side of the transfer instead of one shared row.

The author-side recurrence is created once before the loop (line 179). The destination-side recurrence should follow the same pattern.

**Fix:** Pre-create the destination-side recurrence before the loop, then pass its ID into the linked transaction:

```go
// Before the installment loop in createTransactions:
var sameUserTransferRecurrenceID *int
if hasRecurrence && req.TransactionType == domain.TransactionTypeTransfer {
    r, err := s.createRecurrence(ctx, userID, *req.RecurrenceSettings)
    if err != nil {
        return 0, err
    }
    sameUserTransferRecurrenceID = &r.ID
}
```

Then pass `sameUserTransferRecurrenceID` through to the same-user branch instead of calling `createRecurrence` inside `injectLinkedTransactions`.

---

### WR-03: Validation does not guard against `TotalInstallments == 0` when `CurrentInstallment == 0`

**File:** `backend/internal/service/transaction_create.go:142-154`

**Issue:** The guard at line 142 rejects `CurrentInstallment < 1`. However, if a client sends `current_installment: 0` and `total_installments: 0`, the validation at line 146 (`TotalInstallments < CurrentInstallment`) evaluates `0 < 0` which is `false`, so no error is returned for `total_installments`. Separately, a client sending `current_installment: 1, total_installments: 0` would fail line 146 correctly. But a client sending `current_installment: 0, total_installments: 0` gets two validation errors piled on, which is fine — however, a client sending `current_installment: 1, total_installments: 1` with a zero-value `Type` will only hit the type check. The actual gap is: `TotalInstallments` has no independent lower-bound check (it is only checked relative to `CurrentInstallment`). A request with `current_installment: 1, total_installments: 1` and a valid type is accepted — meaning a "recurrence" with a single installment starting at installment 1 is created, which is semantically a non-recurring transaction with unnecessary overhead. This is more a business rule than a crash, but it should be validated.

**Fix:** Add an explicit minimum-two-installments guard or at minimum document that `TotalInstallments == CurrentInstallment` (a single installment left) is an intentional support case:

```go
if recurrenceSettings.TotalInstallments < 2 {
    errs = append(errs, pkgErrors.NewWithTag(ErrCodeBadRequest, ..., "total_installments must be at least 2"))
}
```

Or if single-remaining-installment is a valid use case (e.g., creating the last installment of an existing series), add a comment to that effect.

---

### WR-04: `createTags` silently dereferences nil tag pointer on error path

**File:** `backend/internal/service/transaction_create.go:504-512`

**Issue:** When `s.services.Tag.Create` fails (line 505), `t` may be `nil`. The code appends an error to `errs` but then falls through to `tags[i] = *t` on line 510, which dereferences a nil pointer and panics.

```go
for i, tag := range tags {
    t, err := s.services.Tag.Create(ctx, userID, &tag)
    if err != nil {
        errs = append(errs, pkgErrors.ErrFailedToCreateTag(i))
    }
    tags[i] = *t   // panics if t == nil (i.e., err != nil above)
}
```

**Fix:** Add a `continue` after the error append:

```go
for i, tag := range tags {
    t, err := s.services.Tag.Create(ctx, userID, &tag)
    if err != nil {
        errs = append(errs, pkgErrors.ErrFailedToCreateTag(i))
        continue
    }
    tags[i] = *t
}
```

---

## Info

### IN-01: Swagger docs missing field descriptions and constraints for `RecurrenceSettings`

**File:** `backend/docs/swagger.json:1932-1942`, `backend/docs/swagger.yaml:130-137`

**Issue:** The generated `domain.RecurrenceSettings` schema exposes `current_installment` and `total_installments` as bare `integer` types with no `minimum`, `maximum`, or `description` annotations. API consumers have no way to know from the docs that `current_installment >= 1`, `total_installments >= current_installment`, or `total_installments <= 1000`. This is a documentation gap, not a runtime bug.

**Fix:** Add Swagger annotations to the `RecurrenceSettings` struct fields in `internal/domain/transaction.go`, then regenerate docs with `just generate-docs`:

```go
type RecurrenceSettings struct {
    Type               RecurrenceType `json:"type"`
    // minimum: 1
    CurrentInstallment int `json:"current_installment" minimum:"1"`
    // minimum: 1, maximum: 1000
    TotalInstallments  int `json:"total_installments"  minimum:"1" maximum:"1000"`
}
```

---

### IN-02: Loop variable `firstID` uses slice index `i == 0` but `i` iterates over `transactions` slice, not the original request installment range

**File:** `backend/internal/service/transaction_create.go:219-244`

**Issue:** After the refactor, the `transactions` slice is built from `CurrentInstallment` to `TotalInstallments`. The first element in the slice (`i == 0`) corresponds to installment `CurrentInstallment`, which may not be installment 1. The returned `firstID` is therefore the ID of the first **created** installment, not necessarily installment 1 of the series. This is probably intentional (callers want the ID of the installment they just created), but the variable name `firstID` is ambiguous — it could be read as "first installment of the series". Consider renaming to `createdFirstID` or `leadInstallmentID` to make the intent clear.

**Fix:** Rename for clarity:

```go
leadInstallmentID := 0
// ...
if i == 0 {
    leadInstallmentID = t.ID
}
// ...
return leadInstallmentID, nil
```

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
