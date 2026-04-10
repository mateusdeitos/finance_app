# Roadmap: Recurrence Input Model — current_installment + total_installments

**Project:** Couples Finance App — Recurrence Input Redesign
**Milestone:** Replace `repetitions | end_date` with `current_installment + total_installments`
**Granularity:** Standard
**Coverage:** 33/33 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: Domain & Validation** — Redefine `RecurrenceSettings` struct and enforce new validation rules across the backend domain layer
- [ ] **Phase 2: Service & API** — Wire new fields into the create loop, reuse validation in update, and expose the updated shape via handler annotations and Swagger
- [ ] **Phase 3: Frontend** — Replace the recurrence form UI and payload builder to match the new API contract
- [ ] **Phase 4: Tests** — Cover all new behavior with integration and unit tests; update existing tests that reference removed fields

---

## Phase Details

### Phase 1: Domain & Validation
**Goal**: The `RecurrenceSettings` domain struct accepts `current_installment` and `total_installments`, `end_date` is gone, and all validation rules for the new fields are enforced
**Depends on**: Nothing (foundation)
**Requirements**: DOM-01, DOM-02, DOM-03, VAL-01, VAL-02, VAL-03, VAL-04, VAL-05, VAL-06

**Success Criteria** (what must be TRUE):
1. `RecurrenceSettings` compiles with `CurrentInstallment` and `TotalInstallments` fields; `EndDate` and `Repetitions` do not exist in the struct
2. `RecurrenceFromSettings()` populates `TransactionRecurrence.Installments` from `TotalInstallments`
3. Passing a request with missing `current_installment` or `total_installments` returns a validation error with the appropriate error code/tag
4. Passing `current_installment > total_installments` or `total_installments > 1000` returns distinct, tagged validation errors
5. Old validation branches for `end_date` and `repetitions` are absent from the codebase

**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Redefine RecurrenceSettings struct, RecurrenceFromSettings, and error constants
- [x] 01-02-PLAN.md — Rewrite validateRecurrenceSettings with new rules in create and update services
- [x] 01-03-PLAN.md — Fix all compile-breaking callers (tests + seed) to reach go build ./... exit 0

**UI hint**: no

---

### Phase 2: Service & API
**Goal**: The transaction create service produces the correct installment series from the new inputs; the update path reuses the same validation; handler request structs and Swagger docs reflect the new shape
**Depends on**: Phase 1
**Requirements**: CRE-01, CRE-02, CRE-03, CRE-04, CRE-05, UPD-01, API-01, API-02

**Success Criteria** (what must be TRUE):
1. Creating a recurring transaction with `current_installment=3, total_installments=10` produces exactly 8 transaction records in the database
2. Each created transaction has `InstallmentNumber` matching its position in the full series (3, 4, …, 10), not restarted from 1
3. The date of installment N is `base_date + (N - current_installment) * interval` — installment 3 lands on the provided date
4. `TransactionRecurrence.Installments` stores 10 (total), not 8 (count created)
5. Linked transactions (splits, transfers) carry the same per-installment `InstallmentNumber`
6. The update service validates recurrence using the same rules as create (no `end_date`, requires both new fields)
7. The Swagger spec documents `current_installment` and `total_installments`; `repetitions` and `end_date` do not appear

**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md — Fix create loop to honor CurrentInstallment (loop bounds + date offset)
- [x] 02-02-PLAN.md — Regenerate Swagger docs for new RecurrenceSettings shape

**UI hint**: no

---

### Phase 3: Frontend
**Goal**: Users can enter `current_installment` and `total_installments` in the transaction form; the payload sent to the API uses the new field names; old recurrence fields are gone
**Depends on**: Phase 2
**Requirements**: FE-01, FE-02, FE-03, FE-04, FE-05, FE-06

**Success Criteria** (what must be TRUE):
1. The recurrence section of the transaction form shows two number inputs labeled "Parcela atual" and "Total de parcelas"; the end-date toggle and repetitions input are not rendered
2. The `Transactions.RecurrenceSettings` TypeScript type contains `current_installment` and `total_installments`; `repetitions` and `end_date` do not exist in the type
3. `buildTransactionPayload` emits `current_installment` and `total_installments` in the recurrence object sent to the API
4. The form rejects submission when `recurrenceCurrentInstallment > recurrenceTotalInstallments` with an inline validation message
5. The import form schema compiles without reference to removed recurrence fields

**Plans**: TBD
**UI hint**: yes

---

### Phase 4: Tests
**Goal**: All new behavior is verified by automated tests; no existing test refers to removed fields (`end_date`, `repetitions`); Playwright e2e suite updated and passing
**Depends on**: Phase 3
**Requirements**: TST-01, TST-02, TST-03, TST-04, TST-05, TST-06, TST-07, TST-08, E2E-01, E2E-02, E2E-03, E2E-04

**Success Criteria** (what must be TRUE):
1. Integration test suite passes with a case for `current_installment=1, total_installments=5` (5 transactions, numbered 1–5)
2. Integration test suite passes with a case for `current_installment=3, total_installments=10` (8 transactions, numbered 3–10, `TransactionRecurrence.Installments = 10`)
3. Integration test asserts date of each installment equals `base_date + (N - current_installment) * interval`
4. Unit tests assert that missing `current_installment`, `current_installment > total_installments`, and `total_installments > 1000` each return distinct validation errors
5. All previously-passing tests compile and pass without referencing `end_date` or `repetitions`
6. Frontend: form-level Zod validation test rejects `current_installment > total_installments`
7. Existing Playwright e2e tests that seed recurring transactions (in `update-transaction.spec.ts`) updated to use `current_installment: 1, total_installments: N`
8. New Playwright e2e test: user fills "Parcela atual = 3, Total = 10" in the create form, transaction list shows 8 items starting at installment 3
9. New Playwright e2e test: inline error appears when "Parcela atual" > "Total de parcelas"

**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Domain & Validation | 3/3 | Complete | 2026-04-09 |
| 2. Service & API | 0/2 | Planned | - |
| 3. Frontend | 0/? | Not started | - |
| 4. Tests | 0/? | Not started | - |

---

## Requirement Coverage

| Requirement | Phase | Description |
|-------------|-------|-------------|
| DOM-01 | Phase 1 | RecurrenceSettings struct: current_installment + total_installments |
| DOM-02 | Phase 1 | RecurrenceFromSettings uses total_installments |
| DOM-03 | Phase 1 | end_date removed from RecurrenceSettings |
| VAL-01 | Phase 1 | Both fields required when recurrence provided |
| VAL-02 | Phase 1 | current_installment >= 1 |
| VAL-03 | Phase 1 | total_installments >= current_installment |
| VAL-04 | Phase 1 | total_installments <= 1000 |
| VAL-05 | Phase 1 | Error codes/tags updated for new fields |
| VAL-06 | Phase 1 | Old end_date and repetitions validation removed |
| CRE-01 | Phase 2 | Create loop: installments 3–10 when current=3 total=10 |
| CRE-02 | Phase 2 | InstallmentNumber matches series position |
| CRE-03 | Phase 2 | Date offset relative to current_installment |
| CRE-04 | Phase 2 | TransactionRecurrence.Installments stores total |
| CRE-05 | Phase 2 | Linked transactions inherit correct InstallmentNumber |
| UPD-01 | Phase 2 | Update reuses new validation rules |
| API-01 | Phase 2 | Handler/Swagger updated for new shape |
| API-02 | Phase 2 | Swagger docs regenerated |
| FE-01 | Phase 3 | TypeScript type updated |
| FE-02 | Phase 3 | buildTransactionPayload sends new fields |
| FE-03 | Phase 3 | transactionFormSchema base fields updated |
| FE-04 | Phase 3 | RecurrenceFields UI replaced |
| FE-05 | Phase 3 | applySharedRefinements updated |
| FE-06 | Phase 3 | importFormSchema aligned |
| TST-01 | Phase 4 | Integration: current=1 total=5 |
| TST-02 | Phase 4 | Integration: current=3 total=10 |
| TST-03 | Phase 4 | Integration: date offset formula |
| TST-04 | Phase 4 | Unit: missing current_installment rejected |
| TST-05 | Phase 4 | Unit: current > total rejected |
| TST-06 | Phase 4 | Unit: total > 1000 rejected |
| TST-07 | Phase 4 | Existing tests updated (no end_date/repetitions) |
| TST-08 | Phase 4 | Frontend: form rejects current > total |
| E2E-01 | Phase 4 | Existing Playwright tests updated to new API shape |
| E2E-02 | Phase 4 | E2E: create recurring from installment 1 of 5 |
| E2E-03 | Phase 4 | E2E: create recurring from installment 3 of 10 |
| E2E-04 | Phase 4 | E2E: inline error when current > total |

**Total mapped:** 33/33 v1 requirements

---

*Roadmap created: 2026-04-09*
