---
phase: 27-backend-crud-api
plan: 01
subsystem: api
tags: [go, gorm, postgresql, echo, transaction-templates, idor, race-safety]

# Dependency graph
requires:
  - phase: 26-backend-foundation
    provides: transaction_templates table, entity.TransactionTemplate (JSONB Scan/Value), domain.TransactionTemplate/TransactionTemplatePayload types
provides:
  - TEMPLATE.* error tags/sentinels (LIMIT_REACHED, DUPLICATE_NAME, NAME_REQUIRED, INVALID_TYPE) with correct HTTP codes
  - TransactionTemplateCreateRequest/UpdateRequest DTOs (lenient-unmarshal write boundary)
  - TransactionTemplateRepository interface + impl (ListByUserID, Create, GetByIDForUser, Update, Delete)
  - Race-safe capped Create (single conditional INSERT gated by COUNT(*) < 3)
  - IDOR-scoped (id, user_id) reads/writes returning NotFound (404) on owner mismatch
  - Generated mock_TransactionTemplateRepository.go
affects: [27-02-backend-crud-api, 27-03-backend-crud-api]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Race-safe capped INSERT: single INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < 3 RETURNING ..., RowsAffected == 0 -> sentinel error"
    - "Repository-level sentinel error (not ServiceError) translated by the service layer, mirroring ErrChargeNotPending -> AlreadyExists"

key-files:
  created:
    - backend/internal/repository/transaction_template_repository.go
    - backend/mocks/mock_TransactionTemplateRepository.go
  modified:
    - backend/pkg/errors/errors.go
    - backend/internal/domain/transaction_template.go
    - backend/internal/repository/interfaces.go
    - backend/mocks/mock_UserConnectionService.go

key-decisions:
  - "Create uses .Raw(...).Scan(&created) with a RETURNING clause instead of .Rows()+ScanRows() — simpler, and GORM's struct Scan respects the entity's sql.Scanner Value/Scan JSONB implementation; RowsAffected == 0 on the returned *gorm.DB signals the cap was hit"
  - "Cap/duplicate-name error codes use ErrCodeAlreadyExists (409) per D-05/D-09, deliberately NOT following the CATEGORY.DUPLICATE_NAME precedent which incorrectly uses ErrCodeValidation (400)"

patterns-established:
  - "TEMPLATE.* error tag family added following the DOMAIN.WHAT_HAPPENED two-step recipe (const then sentinel var)"

requirements-completed: [TMPL-02, TMPL-03, TMPL-04, SAFE-01, SAFE-02]

# Metrics
duration: 3min
completed: 2026-07-08
---

# Phase 27 Plan 01: Backend CRUD API — Data + Error Foundation Summary

**TransactionTemplateRepository with a single-statement COUNT-gated conditional INSERT for the 3-template cap and (id, user_id)-scoped reads/writes returning 404 (never 403) on owner mismatch, plus the TEMPLATE.* error tag family and create/update request DTOs.**

## Performance

- **Duration:** ~3 min (task work); commits span 2026-07-08T23:41:15Z → 2026-07-08T23:43:03Z
- **Started:** 2026-07-08T23:41:15Z
- **Completed:** 2026-07-08T23:43:03Z
- **Tasks:** 3/3 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Added four `TEMPLATE.*` error tags/sentinels with correct HTTP codes: cap and duplicate-name are 409 (`ErrCodeAlreadyExists`), validation errors are 400 (`ErrCodeBadRequest`)
- Added `TransactionTemplateCreateRequest`/`TransactionTemplateUpdateRequest` DTOs co-located in the Phase 26 domain file
- Implemented `TransactionTemplateRepository` (interface + impl): `ListByUserID` (created_at ASC), race-safe capped `Create`, `GetByIDForUser`/`Update`/`Delete` scoped by `(id, user_id)`
- Regenerated all repository/service mocks via a real `mockery` run (installed locally since `just`/`mockery` weren't pre-installed in this environment), producing `mock_TransactionTemplateRepository.go`
- Full module (`go build ./...`) and targeted `go vet` both pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add TEMPLATE.\* error tags/sentinels and the request DTOs** - `5a1cabc` (feat)
2. **Task 2: TransactionTemplateRepository interface + impl (race-safe cap + IDOR scoping)** - `7acecb3` (feat)
3. **Task 3 [BLOCKING]: Regenerate repository mock** - `4dafab0` (chore)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified

- `backend/pkg/errors/errors.go` - Added `ErrorTagTemplateLimitReached`/`DuplicateName`/`NameRequired`/`InvalidType` consts + matching sentinel `*ServiceError` vars
- `backend/internal/domain/transaction_template.go` - Added `TransactionTemplateCreateRequest`/`TransactionTemplateUpdateRequest` DTOs
- `backend/internal/repository/interfaces.go` - Added `TransactionTemplateRepository` interface (doc-commented with SAFE-01/SAFE-02 rationale) and `TransactionTemplate` field on `Repositories`
- `backend/internal/repository/transaction_template_repository.go` - New file: `transactionTemplateRepository` impl, `ErrTemplateLimitReached` sentinel, all five methods
- `backend/mocks/mock_TransactionTemplateRepository.go` - Generated mock for the new interface
- `backend/mocks/mock_UserConnectionService.go` - Regenerated as a side effect of running `mockery` across the whole module (see Deviations)

## Decisions Made

- **Create SQL shape:** Used `.Raw(INSERT...RETURNING...).Scan(&created)` rather than the plan's suggested `.Rows()` + `ScanRows()` fallback. `.Scan()` into a struct still respects the entity's `sql.Scanner`/`driver.Valuer` JSONB implementation and populates `RowsAffected` on the returned `*gorm.DB`, giving the same race-safe `RowsAffected == 0 -> ErrTemplateLimitReached` signal with less code. This matches the plan's explicit allowance: "either shape is acceptable so long as it stays a SINGLE conditional INSERT gated by the COUNT subquery."
- Followed CONTEXT.md D-05/D-09 exactly: cap and duplicate-name sentinels use `ErrCodeAlreadyExists` (409), not the `CATEGORY.DUPLICATE_NAME` precedent's `ErrCodeValidation` (400), per the discrepancy flagged in 27-PATTERNS.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed mockery locally (not pre-installed)**
- **Found during:** Task 3 (Regenerate repository mock)
- **Issue:** `just` and `mockery` were not available on PATH in this container; the plan's `just generate-mocks` recipe could not run directly.
- **Fix:** Ran the recipe's underlying fallback manually — `go install github.com/vektra/mockery/v2@latest`, then invoked `mockery` directly from `backend/` with `.mockery.yaml` already present in the repo. This reproduces exactly what `just generate-mocks` would have done.
- **Files modified:** `backend/mocks/mock_TransactionTemplateRepository.go` (new), `backend/mocks/mock_UserConnectionService.go` (regenerated)
- **Verification:** `test -f backend/mocks/mock_TransactionTemplateRepository.go`, `grep -c MockTransactionTemplateRepository` >= 1, `go build ./...` exits 0
- **Committed in:** `4dafab0` (Task 3 commit)

**2. [Incidental] mock_UserConnectionService.go picked up an unrelated formatting change**
- **Found during:** Task 3 (full-suite `mockery` regeneration)
- **Issue:** Regenerating "all" mocks (mockery config has no filter for a single interface) touched `mock_UserConnectionService.go`'s `UpdateSettings` `Run` callback — removed a defensive nil-check the older mockery version generated for a `*int` argument. No interface signature change; purely a mockery-version codegen difference.
- **Fix:** Committed as-is (mechanical regeneration output); no interface or behavior change.
- **Files modified:** `backend/mocks/mock_UserConnectionService.go`
- **Verification:** `go build ./...` and `go vet` both pass with no callers affected
- **Committed in:** `4dafab0` (Task 3 commit)

---

**Total deviations:** 2 (1 blocking-fix, 1 incidental mechanical side effect)
**Impact on plan:** No scope creep — both are direct, unavoidable consequences of running the plan's mandated `just generate-mocks` equivalent in an environment without `just`/`mockery` pre-installed.

## Issues Encountered

- Docker was available but not exercised (no testcontainers integration tests are part of this plan — repository unit/integration test coverage is deferred to Plan 02's service tests per the plan's scope). `go build ./...` and `go vet` were used to verify correctness as instructed by the environment notes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `TransactionTemplateRepository` interface + impl are stable and ready for Plan 02 (service layer) to consume.
- `MockTransactionTemplateRepository` is available under `backend/mocks/` for Plan 02's service unit tests.
- `TEMPLATE.*` error tags/sentinels and request DTOs are in place for the service/handler layers.
- No blockers.

---
*Phase: 27-backend-crud-api*
*Completed: 2026-07-08*
