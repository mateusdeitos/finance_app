# Phase 4: Tests — Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Automated test coverage for the new recurrence model: new integration tests for the create service, validation unit tests, update of e2e API seeds that still reference old fields, and new Playwright e2e tests for the recurrence form UI.

No new product features — this phase only adds and updates tests.

</domain>

<decisions>
## Implementation Decisions

### D-01: TST-08 Frontend Validation Test Approach
No vitest/jest is installed — only Playwright (`@playwright/test`) is available for frontend testing.
TST-08 ("frontend form rejects current > total") is **covered by E2E-04** (Playwright test that asserts the inline error appears when "Parcela atual" > "Total de parcelas"). No new frontend unit test framework needed.

### D-02: Backend Integration Test Placement
New integration test cases (TST-01, TST-02, TST-03) go as **new test methods in the existing `transaction_create_test.go`** file.
Consistent with the existing pattern (all create service tests in one file). Test suite: `TransactionServiceCreateTestSuite`.

### D-03: E2E Verification Strategy — By Description + Badge, Not Row Count
E2e tests share the same user/database, so counting transaction rows is unreliable (other tests add rows).

**Verification approach:**
- Create each recurring transaction with a **unique description** (e.g., `"E2E Recurrence Test - monthly 3/10"`)
- Navigate to the relevant month using `TransactionsPage.gotoMonth(month, year)`
- Assert the transaction row exists by locating an element with the unique description
- Assert the installment badge shows the correct indicator (e.g., `"3/10"`, `"4/10"`) via `RecurrenceBadge` which renders `{installment_number}/{total_installments}`
- For E2E-03 (8 months), navigate first month + a few subsequent months — enough to prove the series

### D-04: Backend TST-07 Status (Already Done)
Phase 1 already updated all backend test files to use `CurrentInstallment`/`TotalInstallments`.
**TST-07 for backend is complete** — no changes needed to existing Go test files.
Only **E2E-01** needs updating: `update-transaction.spec.ts` seeds recurring transactions via `repetitions: 3` (old API shape) → must become `current_installment: 1, total_installments: 3`.

### D-05: E2E Unique Descriptions Per Test
Each new e2e test uses a unique description string to avoid cross-test interference:
- E2E-02: `"Parcela 1 de 5 - e2e"` (or similar unique string)
- E2E-03: `"Parcela 3 de 10 - e2e"` (or similar unique string)
- E2E-04: `"Parcela inválida - e2e"` (or similar unique string)

The exact strings are at executor discretion — uniqueness and consistency within the test is what matters.

### D-06: E2E-03 Month Navigation Scope
For E2E-03 (`current_installment=3, total_installments=10`, monthly → 8 installments):
Navigate to the **first 3 months** of the series and assert:
- Month 0 (base month): badge shows `"3/10"`
- Month 1 (base + 1): badge shows `"4/10"`
- Month 2 (base + 2): badge shows `"5/10"`
This is sufficient proof that the series was created with correct installment numbers and date offsets, without visiting all 8 months.

### D-07: E2E New Test File
New Playwright tests go in a **new file**: `frontend/e2e/tests/recurrence.spec.ts`.
Keeps recurrence-specific e2e tests separate from general transaction tests.

### Claude's Discretion
- Exact test method names in Go (should follow existing `TestCreate*` pattern)
- Whether to use `suite.T().Run(...)` sub-tests for TST-01/TST-02/TST-03 grouping
- Exact month/year used in e2e test setup (use a controlled date or current date + offset)
- Whether to clean up test data after e2e tests (follow existing pattern in `transactions.spec.ts`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend Test Files
- `backend/internal/service/transaction_create_test.go` — existing create tests; new tests go here
- `backend/internal/service/transaction_update_test.go` — existing update tests (verify no old fields)
- `backend/internal/service/test_setup_with_db.go` — test suite setup, helper methods

### E2E Files
- `frontend/e2e/tests/update-transaction.spec.ts` — contains `repetitions: 3` seeds to update (E2E-01)
- `frontend/e2e/tests/transactions.spec.ts` — reference for e2e test patterns
- `frontend/e2e/pages/TransactionsPage.ts` — POM with `gotoMonth()`, `clickTransactionRow()` helpers

### Domain & Validation
- `backend/internal/domain/transaction.go` — `RecurrenceSettings` struct (CurrentInstallment, TotalInstallments)
- `backend/internal/service/transaction_create.go` — `validateRecurrenceSettings` function (source of truth for validation rules)

### Frontend
- `frontend/src/components/transactions/RecurrenceBadge.tsx` — renders `{installment_number}/{total}` badge
- `frontend/src/components/transactions/form/transactionFormSchema.ts` — validation rules being tested

### Requirements
- `TST-01` through `TST-08`, `E2E-01` through `E2E-04` in `.planning/REQUIREMENTS.md`

</canonical_refs>

<specifics>
## Specific Implementation Details

**Backend integration test pattern** (from existing tests):
```go
func (suite *TransactionServiceCreateTestSuite) TestCreateRecurringFromCurrentInstallment() {
    // Use suite.createTestUser(), suite.createTestAccount(), suite.createTestCategory()
    // Create with RecurrenceSettings{CurrentInstallment: 3, TotalInstallments: 10, Type: domain.RecurrenceTypeMonthly}
    // Assert len(transactions) == 8
    // Assert transactions[0].InstallmentNumber == ptr(3)
    // Assert transactions[7].InstallmentNumber == ptr(10)
}
```

**E2e installment badge locator pattern:**
```ts
// Look for the badge within the row that has the unique description
await expect(page.getByText('3/10')).toBeVisible();
// Or scoped to the row:
const row = page.locator('[data-description="Parcela 3 de 10 - e2e"]');
await expect(row.getByText('3/10')).toBeVisible();
```

**E2E-01 update in `update-transaction.spec.ts`:**
Change all `recurrence_settings: { type: 'monthly', repetitions: 3 }` to `recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 3 }`.

</specifics>

<deferred>
## Deferred Ideas

None — all requirements are in scope for this phase.

</deferred>

---

*Phase: 04-tests*
*Context gathered: 2026-04-10 via /gsd-discuss-phase*
