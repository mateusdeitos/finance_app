# Requirements: Recurrence Input Model — current_installment + total_installments

**Defined:** 2026-04-09
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.

## v1 Requirements

### Domain Model

- [ ] **DOM-01**: `RecurrenceSettings` struct accepts `current_installment` (int, required) and `total_installments` (int, required) instead of `repetitions | end_date`
- [ ] **DOM-02**: `RecurrenceFromSettings()` uses `total_installments` to populate `TransactionRecurrence.Installments`
- [ ] **DOM-03**: `end_date` field is removed from `RecurrenceSettings`

### Validation

- [ ] **VAL-01**: Both `current_installment` and `total_installments` are required when recurrence is provided
- [ ] **VAL-02**: `current_installment` must be ≥ 1
- [ ] **VAL-03**: `total_installments` must be ≥ `current_installment`
- [ ] **VAL-04**: `total_installments` must be ≤ 1000
- [ ] **VAL-05**: Existing validation error codes/tags updated or replaced for new fields
- [ ] **VAL-06**: Old validation rules for `end_date` and `repetitions` are removed

### Transaction Create

- [ ] **CRE-01**: When creating a recurring transaction with `current_installment = 3, total_installments = 10`, installments 3–10 are created (8 transactions)
- [ ] **CRE-02**: Each created transaction's `InstallmentNumber` matches its position in the full series (3, 4, 5, …, 10)
- [ ] **CRE-03**: Date offset for each installment is calculated relative to `current_installment` as the base (installment 3 gets the provided date, installment 4 gets date + 1 interval, etc.)
- [ ] **CRE-04**: `TransactionRecurrence.Installments` stores `total_installments` (10), not the count of created transactions (8)
- [ ] **CRE-05**: Linked transactions (splits, transfers) inherit the correct `InstallmentNumber` per installment

### Transaction Update

- [ ] **UPD-01**: Update recurrence validation reuses the same new validation rules (no end_date, requires current_installment + total_installments)

### API / Swagger

- [ ] **API-01**: Handler request structs and Swagger annotations updated to reflect new `RecurrenceSettings` shape
- [ ] **API-02**: Swagger docs regenerated (`just generate-docs`)

### Frontend

- [ ] **FE-01**: `RecurrenceSettings` TypeScript type in `src/types/transactions.ts` updated: replace `repetitions?` and `end_date?` with `current_installment` and `total_installments`
- [ ] **FE-02**: `buildTransactionPayload.ts` sends `current_installment` and `total_installments` instead of `repetitions` / `end_date`
- [ ] **FE-03**: `transactionFormSchema.ts` base fields updated: replace `recurrenceEndDateMode`, `recurrenceEndDate`, `recurrenceRepetitions` with `recurrenceCurrentInstallment` and `recurrenceTotalInstallments`
- [ ] **FE-04**: `RecurrenceFields.tsx` UI replaced: remove end-date toggle and repetitions input; show two number inputs — "Parcela atual" and "Total de parcelas"
- [ ] **FE-05**: Validation in `applySharedRefinements` updated: require both `recurrenceCurrentInstallment` and `recurrenceTotalInstallments`, validate current ≤ total
- [ ] **FE-06**: Import form schema (`importFormSchema.ts`) updated to align with new recurrence fields if it uses recurrence

### Tests

- [ ] **TST-01**: Integration test: create expense with `current_installment=1, total_installments=5` → 5 installments created, numbered 1–5
- [ ] **TST-02**: Integration test: create expense with `current_installment=3, total_installments=10` → 8 installments created, numbered 3–10, `TransactionRecurrence.Installments = 10`
- [ ] **TST-03**: Integration test: date of installment N is `base_date + (N - current_installment) * interval`
- [ ] **TST-04**: Unit test: validation rejects missing `current_installment`
- [ ] **TST-05**: Unit test: validation rejects `current_installment > total_installments`
- [ ] **TST-06**: Unit test: validation rejects `total_installments > 1000`
- [ ] **TST-07**: Existing tests updated to remove `end_date` / `repetitions` inputs
- [ ] **TST-08**: Frontend: form validation rejects `current_installment > total_installments`

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backwards compatibility for old `repetitions \| end_date` format | Breaking change explicitly accepted |
| Creating past installments (1–2 in a 3-of-10 scenario) | Users only need to track from current position forward |
| Migrating existing recurring transaction data | Old records stay as-is; new input model applies only to new transactions |
| Open-ended recurrences (no total count) | Not part of this change; out of scope for fixed-count model |
| `end_date` as recurrence input | Removed; fixed-count only going forward |
| Import CSV recurrence changes | The import flow uses a separate schema; only minimal alignment needed if recurrence fields overlap |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOM-01 | Phase 1 | Pending |
| DOM-02 | Phase 1 | Pending |
| DOM-03 | Phase 1 | Pending |
| VAL-01 | Phase 1 | Pending |
| VAL-02 | Phase 1 | Pending |
| VAL-03 | Phase 1 | Pending |
| VAL-04 | Phase 1 | Pending |
| VAL-05 | Phase 1 | Pending |
| VAL-06 | Phase 1 | Pending |
| CRE-01 | Phase 2 | Pending |
| CRE-02 | Phase 2 | Pending |
| CRE-03 | Phase 2 | Pending |
| CRE-04 | Phase 2 | Pending |
| CRE-05 | Phase 2 | Pending |
| UPD-01 | Phase 2 | Pending |
| API-01 | Phase 2 | Pending |
| API-02 | Phase 2 | Pending |
| FE-01 | Phase 3 | Pending |
| FE-02 | Phase 3 | Pending |
| FE-03 | Phase 3 | Pending |
| FE-04 | Phase 3 | Pending |
| FE-05 | Phase 3 | Pending |
| FE-06 | Phase 3 | Pending |
| TST-01 | Phase 4 | Pending |
| TST-02 | Phase 4 | Pending |
| TST-03 | Phase 4 | Pending |
| TST-04 | Phase 4 | Pending |
| TST-05 | Phase 4 | Pending |
| TST-06 | Phase 4 | Pending |
| TST-07 | Phase 4 | Pending |
| TST-08 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after roadmap creation*
