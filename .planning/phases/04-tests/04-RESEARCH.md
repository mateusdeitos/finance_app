# Phase 4: Tests - Research

**Researched:** 2026-04-10
**Domain:** Go integration tests, Go validation unit tests, Playwright e2e tests
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (TST-08 approach):** No vitest/jest installed. TST-08 covered by E2E-04 (Playwright asserts inline error when "Parcela atual" > "Total de parcelas"). No new frontend unit test framework needed.
- **D-02 (backend test placement):** New integration test cases (TST-01, TST-02, TST-03) go as new test methods in the existing `transaction_create_test.go` file. Suite: `TransactionCreateWithDBTestSuite`.
- **D-03 (e2e verification strategy):** Use unique description strings + `RecurrenceBadge` text assertion (`"3/10"` pattern). Navigate with `TransactionsPage.gotoMonth(month, year)`. Do NOT rely on row count.
- **D-04 (TST-07 backend status):** Backend test files already use `CurrentInstallment`/`TotalInstallments` — no changes needed. Only E2E-01 needs updating: `update-transaction.spec.ts` has three occurrences of `repetitions: 3` to replace with `current_installment: 1, total_installments: 3`.
- **D-05 (e2e unique descriptions):** Each test uses unique descriptions per test (exact strings at executor discretion).
- **D-06 (E2E-03 scope):** Navigate months 0, 1, 2 of the series; assert badges `"3/10"`, `"4/10"`, `"5/10"`.
- **D-07 (new e2e file):** New Playwright tests go in `frontend/e2e/tests/recurrence.spec.ts`.

### Claude's Discretion
- Exact test method names in Go (should follow existing `TestCreate*` pattern)
- Whether to use `suite.T().Run(...)` sub-tests for TST-01/TST-02/TST-03 grouping
- Exact month/year used in e2e test setup
- Whether to clean up test data after e2e tests (follow existing pattern)

### Deferred Ideas (OUT OF SCOPE)
None — all requirements are in scope for this phase.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TST-01 | Integration test: `current_installment=1, total_installments=5` → 5 installments, numbered 1–5 | Existing `TestRecurringCreateTransfer` pattern in `transaction_create_test.go` shows how to create and assert installment numbers |
| TST-02 | Integration test: `current_installment=3, total_installments=10` → 8 installments, numbered 3–10, `Installments=10` | Same pattern; assert `len==8`, first `InstallmentNumber==3`, last `==10`, `TransactionRecurrence.Installments==10` |
| TST-03 | Integration test: date of installment N is `base_date + (N - current_installment) * interval` | Loop formula `i - req.RecurrenceSettings.CurrentInstallment` already in production code; test mirrors the same math |
| TST-04 | Unit test: validation rejects missing `current_installment` (value < 1 means zero-value int) | `validateRecurrenceSettings` checks `CurrentInstallment < 1`; unit test calls `Create` with `CurrentInstallment=0`, asserts `ErrRecurrenceCurrentInstallmentMustBeAtLeastOne` |
| TST-05 | Unit test: validation rejects `current_installment > total_installments` | `validateRecurrenceSettings` checks `TotalInstallments < CurrentInstallment`; use `ServiceTestSuite` (mocked repos) |
| TST-06 | Unit test: validation rejects `total_installments > 1000` | `validateRecurrenceSettings` checks `TotalInstallments > 1000`; use `ServiceTestSuite` |
| TST-07 | Existing tests updated — no old field refs | Already complete per D-04. Zero action for backend. |
| TST-08 | Frontend form rejects `current > total` | Covered by E2E-04 per D-01 |
| E2E-01 | Update `update-transaction.spec.ts` seeds (`repetitions: 3` → `current_installment: 1, total_installments: 3`) | 3 occurrences confirmed at lines 225, 251, 286 |
| E2E-02 | E2E: create recurring expense `current=1, total=5`, verify 5 transactions appear (badge "1/5") | Pattern: `apiCreateTransaction` in `beforeEach`/test, navigate, `page.getByText('1/5')` scoped to row |
| E2E-03 | E2E: create recurring expense `current=3, total=10`, verify 8 created, first labeled "3/10"; navigate 3 months | Pattern same as E2E-02, plus `gotoMonth` calls for months+1, +2 |
| E2E-04 | E2E: "Parcela atual" > "Total de parcelas" shows inline validation error, cannot submit | Open create drawer, enable recurrence switch, fill fields in wrong order, assert error text visible and form does not submit |
</phase_requirements>

---

## Summary

Phase 4 is a pure test-writing phase. All production code from Phases 1–3 is complete and correct. The work splits into two tracks: (1) Go tests — one new integration test suite method group for create behavior (TST-01/02/03) plus two new unit-level validation methods (TST-04/05/06), and (2) Playwright e2e — one seed fix (E2E-01) and one new spec file covering three new tests (E2E-02/03/04).

No new library installation is required. The backend already has `ServiceTestWithDBSuite` (for integration) and `ServiceTestSuite` (for mocked-repo unit tests). The frontend already has `@playwright/test` with helpers, a POM, and an established pattern of unique-description + API seed + badge assertion.

**Primary recommendation:** Write backend tests first in Wave 1 (fast, no UI dependency). Write e2e tests in Wave 2 (slower, requires running app). E2E-01 (seed fix) can be done in either wave — pair it with the e2e wave for locality.

---

## Standard Stack

### Backend Tests
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `github.com/stretchr/testify/suite` | already present | Suite lifecycle (`SetupTest`, per-method isolation) | All existing test suites use it |
| `github.com/stretchr/testify/assert` | already present | Assertion calls via `suite.Assert()` | Project standard |
| `testcontainers-go` (via `pkg/tests`) | already present | Real PostgreSQL for integration tests | Abstracted behind `tests.NewTestDatabase` |

### Frontend Tests
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | already present | E2E browser automation | Only test framework in the frontend |

No installation needed for any test dependency.

---

## Architecture Patterns

### Go Integration Test Pattern (TST-01, TST-02, TST-03)

New methods are added to `TransactionCreateWithDBTestSuite` in `transaction_create_test.go`. Each method:

1. Creates isolated test data with `createTestUser`, `createTestAccount`, `createTestCategory`.
2. Builds a `domain.TransactionCreateRequest` with `RecurrenceSettings`.
3. Calls `suite.Services.Transaction.Create(ctx, user.ID, &transaction)`.
4. Queries back with `suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &user.ID, SortBy: ...})`.
5. Asserts count, individual `InstallmentNumber`, `TransactionRecurrence.Installments`, and dates.

The suite uses a real shared PostgreSQL instance via `sync.Once`. Each test creates a fresh user, so transactions don't interfere across tests.

**Existing reference pattern** (`TestRecurringCreateTransfer` at line 249) shows the full structure. TST-01/02/03 follow the same shape for `TransactionTypeExpense` instead of `TransactionTypeTransfer`.

```go
// Source: [VERIFIED: backend/internal/service/transaction_create_test.go, lines 249-339]
func (suite *TransactionCreateWithDBTestSuite) TestRecurringCreateTransfer() {
    // Creates user, accounts, tags
    // Sets RecurrenceSettings{Type: monthly, CurrentInstallment: 1, TotalInstallments: 3}
    // Creates → searches → asserts len==6 (3 debit + 3 credit for transfer)
    // Asserts InstallmentNumber 1,2,3 on debit side
    // Asserts date offsets: transaction.Date.AddDate(0, i, 0) for each i
}
```

**For expense (TST-01, TST-02):** No `DestinationAccountID`, no credit side — simpler than the transfer test. Search returns exactly `TotalInstallments - CurrentInstallment + 1` rows.

**Date offset assertion (TST-03):**
```go
// Source: [VERIFIED: backend/internal/service/transaction_create.go, line 189]
// Production code: s.incrementInstallmentDate(req.Date, type, i-req.RecurrenceSettings.CurrentInstallment)
// Test math for expense starting at current=3, total=10, monthly:
// installment[0] (i=3): base_date + (3-3)*1mo = base_date
// installment[1] (i=4): base_date + (4-3)*1mo = base_date+1mo
// installment[7] (i=10): base_date + (10-3)*1mo = base_date+7mo
suite.Assert().Equal(baseDate.AddDate(0, 0, 0), transactions[0].Date)   // i=3
suite.Assert().Equal(baseDate.AddDate(0, 7, 0), transactions[7].Date)   // i=10
```

### Go Validation Unit Test Pattern (TST-04, TST-05, TST-06)

`validateRecurrenceSettings` is a private method on `transactionService`. It is called inside `validateCreateTransactionRequest`, which is called inside `Create`. The practical way to test it without exporting it is to call `Create` with a deliberately invalid `RecurrenceSettings` and assert the error code returned.

The `ServiceTestSuite` (mocked repos) is appropriate here — no real DB needed because validation fires before any repository call.

```go
// Source: [VERIFIED: backend/internal/service/test_setup.go, lines 28-143]
// Source: [VERIFIED: backend/internal/service/transaction_delete_test.go, lines 25-29 — shows ServiceTestSuite usage]
type TransactionValidationTestSuite struct {
    ServiceTestSuite
}

func (suite *TransactionValidationTestSuite) TestValidationRejectsMissingCurrentInstallment() {
    req := &domain.TransactionCreateRequest{
        TransactionType:    domain.TransactionTypeExpense,
        AccountID:          1,
        CategoryID:         1,
        Amount:             100,
        Date:               time.Now(),
        Description:        "test",
        RecurrenceSettings: &domain.RecurrenceSettings{
            Type:               domain.RecurrenceTypeMonthly,
            CurrentInstallment: 0,   // violates >= 1
            TotalInstallments:  5,
        },
    }
    _, err := suite.Services.Transaction.Create(context.Background(), 1, req)
    suite.Error(err)
    // Assert error contains the correct tag
    // pkgErrors.ErrRecurrenceCurrentInstallmentMustBeAtLeastOne
}
```

**Important:** `ServiceTestSuite` uses mock repositories. Validation fires before any mock call, so no `EXPECT()` setup is needed for validation tests — the error is returned before any repo interaction. The mock framework will not complain because `Maybe()` is set on transaction-related mocks by default (see `defaultMockTx`).

**Error constants to assert against:**
- `pkgErrors.ErrRecurrenceCurrentInstallmentMustBeAtLeastOne` (for TST-04)
- `pkgErrors.ErrRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent` (for TST-05)
- `pkgErrors.ErrRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo(1000)` (for TST-06)

**Caveat:** `pkgErrors.ServiceErrors(errs)` wraps a slice of `*ServiceError` into a single error. The exact equality check depends on how the wrapped error compares. Check whether existing tests (e.g. `TestInvalidPropagationSettings`) use `suite.Equal(singleErr, err)` or check the error message/code string. For multi-error wrapping, a string `Contains` check or unwrapping may be needed. [ASSUMED: the wrapped error type preserves individual `ServiceError` tags for string comparison — verify against `pkg/errors/errors.go` ServiceErrors implementation]

### Playwright E2E Pattern

**File location:** `frontend/e2e/tests/recurrence.spec.ts` (new file per D-07)
**Import pattern:** (from `update-transaction.spec.ts` and `transactions.spec.ts`)

```ts
// Source: [VERIFIED: frontend/e2e/tests/update-transaction.spec.ts lines 1-10]
import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import {
  apiCreateAccount, apiDeleteAccount,
  apiCreateCategory, apiDeleteCategory,
  apiCreateTransaction, apiDeleteTransaction,
} from '../helpers/api'
```

**Suite structure:** `test.describe` with `beforeAll`/`afterAll` for account+category, `beforeEach` for `TransactionsPage` instantiation and navigation.

**Seed shape for recurring transactions (after E2E-01 fix applies to this file too):**
```ts
// Source: [VERIFIED: frontend/src/types/transactions.ts lines 140-144]
recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 5 }
```

**Badge locator:** `RecurrenceBadge` renders `{tx.installment_number}/{tx.transaction_recurrence.installments}` as a `<Text>` element inside a `<Tooltip>` group.
```ts
// Source: [VERIFIED: frontend/src/components/transactions/RecurrenceBadge.tsx lines 16-19]
// DOM output: <text size="xs">{installment_number}/{installments}</text>
// Locator: page.getByText('3/10')
// Or scoped to a row by description:
const row = page.locator('[data-transaction-id="..."]')
await expect(row.getByText('3/10')).toBeVisible()
```

**Month navigation:**
```ts
// Source: [VERIFIED: frontend/e2e/pages/TransactionsPage.ts lines 19-22]
await transactionsPage.gotoMonth(month, year)  // navigates /transactions?month=M&year=Y
```

**E2E-04 — Inline validation error for "Parcela atual > Total":**

The "Recorrência" switch has no `data-testid`. Locator approach:
```ts
// Source: [VERIFIED: frontend/src/components/transactions/form/TransactionForm.tsx lines 353-359]
// Switch label is "Recorrência" — locate via getByLabel or getByText
await page.getByLabel('Recorrência').click()  // toggle the switch
// Then fill "Parcela atual" and "Total de parcelas":
// Source: [VERIFIED: frontend/src/components/transactions/form/RecurrenceFields.tsx lines 67-88]
await page.getByLabel('Parcela atual').fill('5')
await page.getByLabel('Total de parcelas').fill('3')
// Submit and assert error:
// Source: [VERIFIED: frontend/src/components/transactions/form/transactionFormSchema.ts line 93]
// Error message: "Parcela atual nao pode ser maior que o total"
await page.getByTestId('btn_save_transaction').click()
await expect(page.getByText('Parcela atual nao pode ser maior que o total')).toBeVisible()
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DB isolation per test | Global `sync.Once` + per-test fresh users | Existing `ServiceTestWithDBSuite` | Already implemented; adding a second DB init would be wasteful |
| Recurrence date math in tests | Compute expected dates independently | Mirror production `AddDate(0, N, 0)` formula exactly | Tests that re-implement the math in a different way risk matching bugs, not behavior |
| Auth in e2e | Manual login in each test | Existing `storageState.json` in global setup | All existing specs rely on this — new spec does too |

---

## Common Pitfalls

### Pitfall 1: Querying all transactions without user scoping
**What goes wrong:** `suite.Repos.Transaction.Search` without `UserID` filter returns transactions from ALL tests in the shared DB, causing flaky length assertions.
**Why it happens:** The DB is shared (`sync.Once`), so previous test methods leave rows.
**How to avoid:** Always pass `UserID: &user.ID` in the filter. Each test creates its own unique user — this is the isolation mechanism.
**Warning signs:** Assertion `Len(transactions, N)` passes in isolation but fails in the full suite run.

### Pitfall 2: Forgetting `TransactionRecurrence` is not loaded by default
**What goes wrong:** Asserting `transactions[0].TransactionRecurrence.Installments == 10` panics with nil pointer.
**Why it happens:** `Search` may not eager-load the recurrence record unless explicitly requested or the ORM preloads it.
**How to avoid:** Either search via `Repos.TransactionRecurrence` to assert the recurrence record separately, or verify whether `Search` preloads recurrences. [ASSUMED: check the existing `TestRecurringCreateTransfer` test — it does NOT assert `TransactionRecurrence.Installments` directly, only `TransactionRecurrenceID` and `InstallmentNumber`. TST-02 requires asserting `Installments=10`, so a separate recurrence lookup may be needed.]
**Verification:** Check if the `Transaction.TransactionRecurrence` field is populated after `Search`, or use `Repos.TransactionRecurrence` to fetch by recurrence ID.

### Pitfall 3: ServiceTestSuite mock expectations for validation tests
**What goes wrong:** Mock framework reports "unexpected call" on `Begin`/`Commit`/`Rollback` even though validation fires before the DB transaction starts.
**Why it happens:** If `Create` calls `s.dbTransaction.Begin` before calling `validateCreateTransactionRequest`, the mock would need an `EXPECT()`. Check the call order.
**How to avoid:** Review `transaction_create.go` line 14–47: `validateCreateTransactionRequest` is called FIRST (line 15), before `s.dbTransaction.Begin` (line 20). So validation errors exit early with no mock interaction needed. The `defaultMockTx()` in `ServiceTestSuite` already sets `.Maybe()` on Begin/Commit/Rollback, so no extra setup is needed.
**Warning signs:** Test fails with "mock: I]I" unexpected call error.

### Pitfall 4: E2E badge assertion without waiting for list to load
**What goes wrong:** `page.getByText('3/10')` times out because the transaction list hasn't rendered yet.
**Why it happens:** `gotoMonth` uses `waitForLoadState('networkidle')` but the badge renders only after data fetches complete.
**How to avoid:** Use `await expect(page.getByText('3/10')).toBeVisible()` with default timeout (Playwright retries assertions). Alternatively scope to a known row via `data-transaction-id` which is confirmed present in `TransactionsPage.clickTransactionRow`.

### Pitfall 5: E2E-01 seed fix breaks update tests that rely on installment count
**What goes wrong:** Tests in `update-transaction.spec.ts` that assert "next month shows original description" use `repetitions: 3` seeds. After fix to `current_installment: 1, total_installments: 3`, the behavior is identical (3 installments from installment 1). No functional regression expected.
**How to avoid:** Confirm the 3 occurrences (lines 225, 251, 286) all use `current_installment=1` semantics — they do, since the old `repetitions: 3` created 3 installments starting at 1, which is exactly `current_installment: 1, total_installments: 3`.

### Pitfall 6: Recurrence switch has no `data-testid`
**What goes wrong:** `page.getByTestId('switch_recurrence')` finds nothing.
**Why it happens:** The `Switch` in `TransactionForm.tsx` has no testid.
**How to avoid:** Use `page.getByLabel('Recorrência')` or `page.getByRole('checkbox', { name: 'Recorrência' })`. Mantine Switch renders as a `<input type="checkbox">` with the label.
**Warning signs:** Locator finds zero elements.

---

## Code Examples

### TST-01 Integration Test Skeleton
```go
// Source: [VERIFIED: backend/internal/service/transaction_create_test.go, pattern lines 249-339]
func (suite *TransactionCreateWithDBTestSuite) TestCreateRecurringExpenseFrom1of5() {
    ctx := context.Background()
    user, _ := suite.createTestUser(ctx)
    account, _ := suite.createTestAccount(ctx, user)
    category, _ := suite.createTestCategory(ctx, user)

    baseDate := now()
    req := domain.TransactionCreateRequest{
        AccountID:       account.ID,
        TransactionType: domain.TransactionTypeExpense,
        CategoryID:      category.ID,
        Amount:          1000,
        Date:            baseDate,
        Description:     "TST-01 recurring expense",
        RecurrenceSettings: &domain.RecurrenceSettings{
            Type:               domain.RecurrenceTypeMonthly,
            CurrentInstallment: 1,
            TotalInstallments:  5,
        },
    }

    _, err := suite.Services.Transaction.Create(ctx, user.ID, &req)
    suite.Require().NoError(err)

    transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
        UserID: &user.ID,
        SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
    })
    suite.Require().NoError(err)
    suite.Assert().Len(transactions, 5)

    for i, tx := range transactions {
        suite.Assert().Equal(i+1, lo.FromPtr(tx.InstallmentNumber))
    }
    // TST-03: date offset
    suite.Assert().Equal(baseDate, transactions[0].Date)
    suite.Assert().Equal(baseDate.AddDate(0, 4, 0), transactions[4].Date)
}
```

### TST-02 Skeleton (current=3, total=10)
```go
// 8 transactions created, numbered 3–10
// Source: [VERIFIED: domain/transaction.go line 141 — RecurrenceFromSettings stores TotalInstallments as Installments]
suite.Assert().Len(transactions, 8)
suite.Assert().Equal(3, lo.FromPtr(transactions[0].InstallmentNumber))
suite.Assert().Equal(10, lo.FromPtr(transactions[7].InstallmentNumber))
// Verify recurrence record stores total=10, not count=8:
// Fetch via: suite.Repos.TransactionRecurrence or check transactions[0].TransactionRecurrenceID
// then load the recurrence record — may require a separate Search call
```

### TST-04 Unit Test Skeleton (ServiceTestSuite, no DB)
```go
// Source: [VERIFIED: backend/pkg/errors/errors.go line 92]
// Source: [VERIFIED: backend/internal/service/transaction_create.go lines 14-17 — validation before Begin]
func (suite *TransactionValidationTestSuite) TestValidationRejectsMissingCurrentInstallment() {
    req := &domain.TransactionCreateRequest{
        TransactionType: domain.TransactionTypeExpense,
        AccountID:       1,
        CategoryID:      1,
        Amount:          100,
        Date:            time.Now(),
        Description:     "test",
        RecurrenceSettings: &domain.RecurrenceSettings{
            Type:               domain.RecurrenceTypeMonthly,
            CurrentInstallment: 0,  // zero value = missing
            TotalInstallments:  5,
        },
    }
    _, err := suite.Services.Transaction.Create(context.Background(), suite.UserID, req)
    suite.Error(err)
    // Assert specific error — check ServiceErrors wrapping behavior before finalizing assertion
}
```

### E2E-01 Fix
```ts
// In: frontend/e2e/tests/update-transaction.spec.ts (lines 225, 251, 286)
// Before: recurrence_settings: { type: 'monthly', repetitions: 3 }
// After:
recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 3 }
```

### E2E-02 New Test Skeleton
```ts
// Source: [VERIFIED: frontend/e2e/tests/update-transaction.spec.ts — seed pattern]
// Source: [VERIFIED: frontend/e2e/pages/TransactionsPage.ts — gotoMonth]
// Source: [VERIFIED: frontend/src/components/transactions/RecurrenceBadge.tsx — badge text]
test('creates recurring expense starting at 1 of 5 — shows badge 1/5', async ({ page }) => {
    const desc = `Parcela 1 de 5 - e2e ${Date.now()}`
    const tx = await apiCreateTransaction({
        transaction_type: 'expense',
        account_id: testAccountId,
        category_id: testCategoryId,
        amount: 1000,
        date: today,
        description: desc,
        recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 5 },
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    // Find row by description, then assert badge
    const row = page.locator(`[data-transaction-id="${tx.id}"]`)
    await expect(row).toBeVisible()
    await expect(row.getByText('1/5')).toBeVisible()
})
```

### E2E-04 Validation Error Test Skeleton
```ts
// Source: [VERIFIED: frontend/src/components/transactions/form/TransactionForm.tsx — Switch label "Recorrência"]
// Source: [VERIFIED: frontend/src/components/transactions/form/RecurrenceFields.tsx — labels "Parcela atual", "Total de parcelas"]
// Source: [VERIFIED: frontend/src/components/transactions/form/transactionFormSchema.ts line 93 — error message]
test('shows validation error when parcela atual > total de parcelas', async ({ page }) => {
    await transactionsPage.openCreateForm()

    // Enable recurrence
    await page.getByLabel('Recorrência').click()

    // Fill invalid values (current > total)
    await page.getByLabel('Parcela atual').fill('5')
    await page.getByLabel('Total de parcelas').fill('3')

    // Attempt submit
    await page.getByTestId('btn_save_transaction').click()

    // Assert inline error visible
    await expect(page.getByText('Parcela atual nao pode ser maior que o total')).toBeVisible()
})
```

---

## Wave / Plan Split Recommendation

**Wave 1 — Backend tests (Go)**
- TST-04, TST-05, TST-06: New validation unit test suite using `ServiceTestSuite` (no DB required, fast)
- TST-01, TST-02, TST-03: New integration tests appended to `TransactionCreateWithDBTestSuite`
- Run: `go test ./internal/service/ -run TestTransactionCreate -tags=integration` for integration; `go test ./internal/service/ -run TestTransactionValidation -short` for unit

**Wave 2 — E2E tests (Playwright)**
- E2E-01: Fix 3 seed occurrences in `update-transaction.spec.ts`
- E2E-02, E2E-03, E2E-04: New `recurrence.spec.ts`
- Run: `npx playwright test e2e/tests/update-transaction.spec.ts` (regression) + `npx playwright test e2e/tests/recurrence.spec.ts`

**Rationale for sequential waves:** Backend tests run in < 30 seconds (with testcontainer spin-up ~10–15s first run). E2E tests require a live app + browser — substantially slower and different toolchain. Separating them avoids blocking the simpler backend work on app availability.

**Can they be parallelized?** Yes, if the running app is already available. The two work streams are fully independent in terms of files touched.

---

## Open Questions

1. **`TransactionRecurrence.Installments` assertion in TST-02**
   - What we know: `RecurrenceFromSettings` stores `TotalInstallments` as `Installments` (line 141 of `domain/transaction.go`). The `Search` filter on `TransactionFilter` returns `*Transaction` slices. `Transaction.TransactionRecurrence` is populated only if the ORM preloads it.
   - What's unclear: Does `Repos.Transaction.Search` eagerly load `TransactionRecurrence`? The existing test `TestRecurringCreateTransfer` does NOT assert `TransactionRecurrence.Installments` — it only asserts `TransactionRecurrenceID != nil`. This may mean the field is nil after `Search`.
   - Recommendation: Either (a) load transactions with `WithSettlements: true` to see if that triggers recurrence preload, or (b) use `Repos.TransactionRecurrence` directly with the recurrence ID from `transactions[0].TransactionRecurrenceID`. Option (b) is safer and matches the separation of concerns pattern.

2. **`ServiceErrors` wrapping and equality assertion**
   - What we know: Validation returns `pkgErrors.ServiceErrors(errs)` which wraps multiple `*ServiceError` into one error value. The delete test uses `suite.Equal(pkgErrors.ErrInvalidPropagationSettings(...), err)` for single-error validation.
   - What's unclear: For recurrence validation that returns a single error wrapped in `ServiceErrors`, does `suite.Equal(pkgErrors.ErrRecurrenceCurrentInstallmentMustBeAtLeastOne, err)` work? Or does the wrapping change the value?
   - Recommendation: Check the `ServiceErrors` implementation in `pkg/errors/errors.go`. If it wraps into a different type, use `errors.Is`, check `.Error()` string contains the tag, or compare by unwrapping. The executor should verify before writing assertions.

---

## Environment Availability

Step 2.6: All dependencies are already present in the repo. No new tools required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Go + testify | TST-01–06 | Already in use | (project Go version) | — |
| testcontainers (via `pkg/tests`) | TST-01–03 integration | Already in use | — | — |
| `@playwright/test` | E2E-01–04 | Already installed | (project version) | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend framework | `testify/suite` v1.x |
| Backend config | No config file; `go test -tags=integration` for integration, `-short` to skip |
| Backend quick run | `go test ./internal/service/ -run TestTransactionValidation -short` |
| Backend full run | `go test ./internal/service/ -run TestTransactionCreate -tags=integration` |
| Frontend framework | `@playwright/test` |
| Frontend config | `frontend/playwright.config.ts` |
| Frontend quick run | `npx playwright test e2e/tests/recurrence.spec.ts` |
| Frontend full run | `npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TST-01 | `current=1, total=5` creates 5 installments numbered 1–5 | integration | `go test ./internal/service/ -run TestTransactionCreateWithDB/TestCreate.*1of5 -tags=integration` | ❌ Wave 1 |
| TST-02 | `current=3, total=10` creates 8 installments, `Installments=10` | integration | `go test ./internal/service/ -run TestTransactionCreateWithDB/TestCreate.*3of10 -tags=integration` | ❌ Wave 1 |
| TST-03 | Date offset formula correct | integration | Covered by TST-01/02 tests | ❌ Wave 1 |
| TST-04 | Reject `current_installment=0` | unit | `go test ./internal/service/ -run TestTransactionValidation -short` | ❌ Wave 1 |
| TST-05 | Reject `current > total` | unit | `go test ./internal/service/ -run TestTransactionValidation -short` | ❌ Wave 1 |
| TST-06 | Reject `total > 1000` | unit | `go test ./internal/service/ -run TestTransactionValidation -short` | ❌ Wave 1 |
| TST-07 | No old field refs in existing Go tests | — | Already complete — verify with `grep -r "repetitions\|end_date" backend/internal/service/` | ✅ Done |
| TST-08 | Frontend form rejects current > total | e2e | Covered by E2E-04 | ❌ Wave 2 |
| E2E-01 | Fix 3 seed occurrences in update-transaction.spec.ts | e2e | `npx playwright test e2e/tests/update-transaction.spec.ts` | ✅ (needs edit) |
| E2E-02 | Create recurring expense `1/5`, verify badge | e2e | `npx playwright test e2e/tests/recurrence.spec.ts` | ❌ Wave 2 |
| E2E-03 | Create recurring expense `3/10`, navigate 3 months | e2e | `npx playwright test e2e/tests/recurrence.spec.ts` | ❌ Wave 2 |
| E2E-04 | Inline validation error for current > total | e2e | `npx playwright test e2e/tests/recurrence.spec.ts` | ❌ Wave 2 |

### Wave 0 Gaps
- [ ] `backend/internal/service/transaction_validation_test.go` (or new methods in `transaction_create_test.go`) — covers TST-04, TST-05, TST-06
- [ ] `frontend/e2e/tests/recurrence.spec.ts` — covers E2E-02, E2E-03, E2E-04

*(Existing test infrastructure covers all other requirements — no new config needed)*

---

## Security Domain

This phase adds only tests. No new network endpoints, auth paths, or data handling introduced. Security domain: not applicable.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ServiceErrors` wraps a slice into a single error that does NOT equal a single `*ServiceError` by value — equality assertion may need `errors.Is` or string check | Code Examples (TST-04/05/06) | Unit tests assert wrong thing; they pass vacuously or panic |
| A2 | `suite.Repos.Transaction.Search` does NOT preload `TransactionRecurrence` — asserting `transactions[0].TransactionRecurrence.Installments` may panic | Open Questions #1 | TST-02 assertion approach is wrong; executor must use a separate recurrence fetch |
| A3 | `page.getByLabel('Recorrência')` correctly targets the Switch's checkbox input | Code Examples (E2E-04) | Locator finds nothing or wrong element; e2e test times out |

---

## Sources

### Primary (HIGH confidence)
- `[VERIFIED: backend/internal/service/transaction_create_test.go]` — existing integration test patterns, `TransactionCreateWithDBTestSuite`, `now()` helper
- `[VERIFIED: backend/internal/service/test_setup.go]` — `ServiceTestSuite` (mocked) pattern
- `[VERIFIED: backend/internal/service/test_setup_with_db.go]` — `ServiceTestWithDBSuite` (real DB) pattern
- `[VERIFIED: backend/internal/service/transaction_create.go]` — `validateRecurrenceSettings` implementation, create loop formula
- `[VERIFIED: backend/pkg/errors/errors.go]` — error constants: `ErrRecurrenceCurrentInstallmentMustBeAtLeastOne`, `ErrRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent`, `ErrRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo`
- `[VERIFIED: backend/internal/domain/transaction.go]` — `RecurrenceSettings` struct, `RecurrenceFromSettings`
- `[VERIFIED: frontend/e2e/tests/update-transaction.spec.ts]` — 3 occurrences of `repetitions: 3` at lines 225, 251, 286; full e2e suite pattern
- `[VERIFIED: frontend/e2e/pages/TransactionsPage.ts]` — `gotoMonth`, `clickTransactionRow`, `openCreateForm` helpers
- `[VERIFIED: frontend/e2e/helpers/api.ts]` — `apiCreateTransaction` uses `Transactions.CreateTransactionPayload` type
- `[VERIFIED: frontend/src/types/transactions.ts]` — `RecurrenceSettings` interface: `current_installment`, `total_installments`
- `[VERIFIED: frontend/src/components/transactions/RecurrenceBadge.tsx]` — badge renders `{installment_number}/{installments}`
- `[VERIFIED: frontend/src/components/transactions/form/TransactionForm.tsx]` — Switch label "Recorrência", no testid
- `[VERIFIED: frontend/src/components/transactions/form/RecurrenceFields.tsx]` — labels "Parcela atual", "Total de parcelas"
- `[VERIFIED: frontend/src/components/transactions/form/transactionFormSchema.ts]` — error message "Parcela atual nao pode ser maior que o total"

### Secondary (MEDIUM confidence)
- `[VERIFIED: backend/internal/service/transaction_delete_test.go]` — demonstrates `ServiceTestSuite` usage for validation-path tests

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — patterns verified directly from existing test files
- Pitfalls: HIGH (verified) / MEDIUM (A1, A2, A3 tagged as ASSUMED)
- E2E selectors: MEDIUM — Switch locator `getByLabel('Recorrência')` unverified by running test; confirm in Wave 2 task 0

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable codebase, no fast-moving dependencies)
