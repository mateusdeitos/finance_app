---
phase: 04-tests
reviewed: 2026-04-10T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - backend/internal/service/transaction_create_test.go
  - frontend/e2e/tests/recurrence.spec.ts
  - frontend/e2e/tests/update-transaction.spec.ts
  - frontend/e2e/tests/bulk-delete-transactions.spec.ts
findings:
  critical: 0
  warning: 5
  info: 2
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four test files reviewed for the recurrence model refactor (replacing `repetitions | end_date` with `current_installment + total_installments`). The Go integration/unit tests are well-structured and cover the new domain model thoroughly. The Playwright e2e tests follow consistent patterns.

Two categories of problems were found:

1. **Misleading error message format strings** in the Go tests — the `fmt.Sprintf` format arguments contain incorrect expected values in several cross-user transfer assertions. The assertions themselves are correct, but the printed failure message will say the wrong expected value, making debugging test failures significantly harder.
2. **Unaccented text in e2e assertion** — a validation error assertion in `recurrence.spec.ts` omits the tilde accent on "não", which will cause that test to fail if the UI renders the correct Portuguese text.

No security issues or data loss risks were found.

---

## Warnings

### WR-01: Wrong expected value printed in test failure message — `TestTransferBetweenDifferentUsers`

**File:** `backend/internal/service/transaction_create_test.go:460`

**Issue:** In `TestTransferBetweenDifferentUsers`, the assertion at line 460 verifies that `transactionsUser2[0].Amount == 500`, but the `fmt.Sprintf` format string says `"...Amount should be %d", i, 100`. The format argument is `100`, not `500`. Similarly, line 466 asserts `Amount == 100` but formats `500`. When either assertion fails, the printed message will claim a different expected value than what is actually being tested, making the failure misleading.

```go
// line 460 — assertion is int64(500) but message prints 100
suite.Assert().Equal(int64(500), int64(transactionsUser2[i].Amount),
    fmt.Sprintf("transactionsUser2[%d].Amount should be %d", i, 500)) // was: 100

// line 466 — assertion is int64(100) but message prints 500
suite.Assert().Equal(int64(100), int64(transactionsUser2[i].Amount),
    fmt.Sprintf("transactionsUser2[%d].Amount should be %d", i, 100)) // was: 500
```

**Fix:** Change the format argument at line 460 from `100` to `500`, and at line 466 from `500` to `100` to match the actual expected values in each assertion.

---

### WR-02: Wrong expected value printed in test failure message — `TestRecurringTransferBetweenDifferentUsers`

**File:** `backend/internal/service/transaction_create_test.go:616`

**Issue:** Identical copy-paste issue in `TestRecurringTransferBetweenDifferentUsers`. Line 616 asserts `int64(500)` but the format arg is `100`; line 622 asserts `int64(100)` but the format arg is `500`. The failure messages will print incorrect expected values.

```go
// line 616 — assertion is int64(500) but message prints 100
suite.Assert().Equal(int64(500), int64(transactionsUser2[i].Amount),
    fmt.Sprintf("transactionsUser2[%d].Amount should be %d", i, 500)) // was: 100

// line 622 — assertion is int64(100) but message prints 500
suite.Assert().Equal(int64(100), int64(transactionsUser2[i].Amount),
    fmt.Sprintf("transactionsUser2[%d].Amount should be %d", i, 100)) // was: 500
```

**Fix:** Same as WR-01 — swap the format arguments to match the actual expected values.

---

### WR-03: `NoError` check ordered after assertions that use the query result

**File:** `backend/internal/service/transaction_create_test.go:63`

**Issue:** In `TestCreateExpense` (and identically in `TestCreateIncome` at line 138), the `suite.Assert().NoError(err)` call appears *after* `suite.Assert().Len(transactions, 1)` (line 63). If the `Search` call returns an error, `transactions` will be `nil`, the `Len` assertion will panic or produce an unhelpful "expected length 1, got 0" failure, and the actual error from the repository will only surface later. The same ordering issue appears for the `transactionsUser1` search in `TestTransferBetweenDifferentUsers` (lines 410–412).

**Fix:** Move `NoError` before any use of the result:

```go
transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
    UserID: &user.ID,
})
suite.Assert().NoError(err) // check error first
if err != nil {
    suite.T().FailNow()
}
suite.Assert().Len(transactions, 1)
```

Alternatively, use `suite.Require().NoError(err)` (testify `Require` variant) which immediately stops the test on failure, preventing the cascaded assertions from running on invalid data.

---

### WR-04: Validation error text assertion uses incorrect Portuguese string (missing accent)

**File:** `frontend/e2e/tests/recurrence.spec.ts:121`

**Issue:** The assertion checks for the text `'Parcela atual nao pode ser maior que o total'` but the correct Portuguese word is `não` (with a tilde). If the UI renders `não` (which it should for any properly written Portuguese UI), this `toBeVisible` assertion will never match and the test will always fail with a timeout.

```typescript
// line 121 — wrong
await expect(page.getByText('Parcela atual nao pode ser maior que o total')).toBeVisible()
```

**Fix:**
```typescript
await expect(page.getByText('Parcela atual não pode ser maior que o total')).toBeVisible()
```

If there is uncertainty about the exact string rendered by the UI, use a partial match with a regex:
```typescript
await expect(page.getByText(/Parcela atual n.o pode ser maior/)).toBeVisible()
```

---

### WR-05: Cross-month badge assertions not scoped to the created transaction's row

**File:** `frontend/e2e/tests/recurrence.spec.ts:95`

**Issue:** The badge assertions for months after the base month use `page.getByText('4/10')` and `page.getByText('5/10')` without scoping to the specific transaction that was created (identified by `tx.id`). If any other transaction on the page happens to display a string containing `4/10` or `5/10` (e.g. in an amount formatted as "R$ 4,10" or "R$ 5,10" or a badge from a different recurrence), the assertion will produce a false positive.

```typescript
// line 94-99 — unscoped text search
await transactionsPage.gotoMonth(baseMonth + 1, baseYear)
await expect(page.getByText('4/10')).toBeVisible()

await transactionsPage.gotoMonth(baseMonth + 2, baseYear)
await expect(page.getByText('5/10')).toBeVisible()
```

**Fix:** Scope the assertion to the transaction row, consistent with how the base-month check is done at line 89:

```typescript
// Month 1 (base + 1): badge shows "4/10"
await transactionsPage.gotoMonth(baseMonth + 1, baseYear)
const rowM1 = page.locator(`[data-transaction-id="${tx.id}"]`)
await expect(rowM1).toBeVisible()
await expect(rowM1.getByText('4/10')).toBeVisible()

// Month 2 (base + 2): badge shows "5/10"
await transactionsPage.gotoMonth(baseMonth + 2, baseYear)
const rowM2 = page.locator(`[data-transaction-id="${tx.id}"]`)
await expect(rowM2).toBeVisible()
await expect(rowM2.getByText('5/10')).toBeVisible()
```

---

## Info

### IN-01: Recurring transaction cleanup in `bulk-delete` suite uses missing propagation argument

**File:** `frontend/e2e/tests/bulk-delete-transactions.spec.ts:30`

**Issue:** The `afterAll` cleanup calls `apiDeleteTransaction(id)` without a propagation scope (no `'all'` argument). The suite creates at least one recurring transaction (test 6.4, line 94) with 3 installments. Without propagation `'all'`, the cleanup may only delete the specific installment rather than all generated installments, leaving orphaned test data in the database. This does not break the test suite because errors are swallowed with `.catch(() => undefined)`, but it degrades test isolation over time.

**Fix:** Pass `'all'` to `apiDeleteTransaction` in `afterAll` to match the pattern used in `recurrence.spec.ts` and `update-transaction.spec.ts`:

```typescript
for (const id of createdTransactionIds) {
  await apiDeleteTransaction(id, 'all').catch(() => undefined)
}
```

---

### IN-02: `suite.Assert().NoError(err)` after successful Fatalf-guarded error check (redundant assertion)

**File:** `backend/internal/service/transaction_create_test.go:211`

**Issue:** In `TestTransferBetweenDifferentUsers`, the `transactionsUser1` search result is already fully guarded by a `suite.T().Fatalf` at line 407 if `err != nil`. The subsequent `suite.Assert().NoError(err)` at line 412 is redundant — the test would have stopped before reaching it on error. The same pattern appears in `TestRecurringTransferBetweenDifferentUsers` at line 568/569. This is harmless but adds noise and is inconsistent with the earlier tests that use *only* `Assert().NoError`.

**Fix:** Remove the redundant `suite.Assert().NoError(err)` lines that appear after a `Fatalf`-guarded error check, or (preferable) consolidate all error handling to use `suite.Require().NoError(err)` everywhere and drop the `Fatalf` pattern entirely for consistency.

---

_Reviewed: 2026-04-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
