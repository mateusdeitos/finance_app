---
phase: 27-backend-crud-api
plan: 02
subsystem: api
tags: [go, gorm, idor, transaction-templates, service-layer, validation]

# Dependency graph
requires:
  - phase: 27-backend-crud-api (Plan 01)
    provides: TransactionTemplateRepository (interface + impl), ErrTemplateLimitReached sentinel, TEMPLATE.* error tags/sentinels, TransactionTemplateCreateRequest/UpdateRequest DTOs
provides:
  - TransactionTemplateService interface + impl (List/Create/Update/Delete)
  - IDOR-safe method signatures — userID is always the function argument from auth context, never the request/DTO
  - D-03 validation (name non-empty + max length, type.IsValid(), split-row percentage XOR amount)
  - Duplicate-name 409 pre-check (D-05) wrapped in the same DBTransaction as the capped insert
  - Cap sentinel translation: repository.ErrTemplateLimitReached -> pkgErrors.ErrTemplateLimitReached (409, TEMPLATE.LIMIT_REACHED)
  - ServiceTestWithDBSuite wiring for the new repo/service
  - Generated mock_TransactionTemplateService.go
affects: [27-03-backend-crud-api, 27-04-backend-crud-api]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tx-wrapped duplicate-name pre-check + capped insert in one DBTransaction (category_service.Create skeleton), keeping the two checks race-consistent"
    - "Repository sentinel (errors.New) translated via errors.Is in the service layer (charge_repository.ErrChargeNotPending precedent), not a *ServiceError leaking out of the repo"

key-files:
  created:
    - backend/internal/service/transaction_template_service.go
  modified:
    - backend/internal/service/interfaces.go
    - backend/internal/service/test_setup_with_db.go
    - backend/mocks/mock_TransactionTemplateService.go

key-decisions:
  - "Update's duplicate-name check compares against the user's OTHER templates (e.ID != id) so a no-op rename (same name) doesn't false-positive as a duplicate"
  - "Name length validation reuses ErrTemplateNameRequired for the too-long case rather than inventing a new tag — plan explicitly allowed this ('name-required tag is acceptable')"

patterns-established: []

requirements-completed: [TMPL-02, TMPL-03, TMPL-04, SAFE-01, SAFE-02]

# Metrics
duration: 4min
completed: 2026-07-08
---

# Phase 27 Plan 02: Backend CRUD API — Service Layer Summary

**TransactionTemplateService with IDOR-safe signatures (userID always the function argument), D-03 field/split validation, duplicate-name and cap sentinel translation to tagged 409s, wired into the integration test suite with a regenerated mock.**

## Performance

- **Duration:** ~4 min (task work); commits span 2026-07-08T23:47:38Z → 2026-07-08T23:48:33Z
- **Started:** 2026-07-08T23:47:38Z
- **Completed:** 2026-07-08T23:48:33Z
- **Tasks:** 2/2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Added `TransactionTemplateService` interface (List/Create/Update/Delete) to `service/interfaces.go` and wired `TransactionTemplate` into the `Services` struct
- Implemented `transactionTemplateService`: every method takes `userID` as the function argument from auth context (never from the request/DTO) with the `SECURITY (IDOR)` comment on all four methods
- `Create`/`Update` wrap a case-insensitive duplicate-name pre-check and the write in a single `DBTransaction` (Begin/defer-Rollback/Commit skeleton) so the check stays race-consistent with the actual insert/update
- `Create` translates the repository's `ErrTemplateLimitReached` sentinel via `errors.Is` into `pkgErrors.ErrTemplateLimitReached` (409, `TEMPLATE.LIMIT_REACHED`)
- `validate()` enforces name non-empty + max length (100), `payload.Type.IsValid()`, and split-row percentage XOR amount (+ 1..100 range) using the existing `ErrSplitSetting*` closures — no cross-row sum check, no referential existence checks, per D-03
- `Delete`/repo-level `Update` NotFound (404 on owner mismatch) surfaces unchanged from the repository — not re-wrapped
- Wired the new repo + service into `ServiceTestWithDBSuite` (`test_setup_with_db.go`) and regenerated `mocks/mock_TransactionTemplateService.go` via a real `mockery` run — this time only the new interface's mock file was produced (no unrelated regeneration drift, unlike Plan 01)
- Full module (`go build ./...`) and `go vet ./internal/service/...` both pass; `gofmt -l` clean on all touched files

## Task Commits

Each task was committed atomically:

1. **Task 1: TransactionTemplateService interface + impl** - `4b482c4` (feat)
2. **Task 2 [BLOCKING]: Wire service into the integration suite + regenerate service mock** - `db2e0ab` (chore)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified

- `backend/internal/service/interfaces.go` - Added `TransactionTemplateService` interface + `TransactionTemplate` field on `Services`
- `backend/internal/service/transaction_template_service.go` - New file: `transactionTemplateService` impl (`validate`, `List`, `Create`, `Update`, `Delete`)
- `backend/internal/service/test_setup_with_db.go` - Added `TransactionTemplateRepository` field, `SetupTest` construction, `Repos`/`Services` wiring
- `backend/mocks/mock_TransactionTemplateService.go` - Generated mock for the new service interface

## Decisions Made

- **Update duplicate-name scope:** excludes the row being updated (`e.ID != id`) so renaming a template to its own current name (a no-op save) doesn't falsely trigger `TEMPLATE.DUPLICATE_NAME`.
- **Name-too-long tag reuse:** the plan explicitly allowed reusing `ErrTemplateNameRequired` for the max-length violation instead of adding a dedicated tag; kept the tag surface minimal since the frontend form is expected to enforce the length client-side too.
- Followed the plan's exact `dbTransaction`/`templateRepo` constructor shape and Begin/defer-Rollback/Commit skeleton from `category_service.go`, substituting the cap-check for the parent/sibling check.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance-criteria greps (interface declaration, `Services` struct field, IDOR comment count >= 4, `errors.Is` cap translation, duplicate-name/cap sentinel usage, `payload.Type.IsValid()`, split-row XOR pattern, no `req.UserID`/`payload.UserID` reads, suite wiring, generated mock) all pass verbatim.

## Issues Encountered

- `just`/`mockery` are still not on `PATH` in this container (same as Plan 01). `mockery` was already installed at `$(go env GOPATH)/bin/mockery` from Plan 01's install, so Task 2 ran it directly via `PATH="$PATH:$(go env GOPATH)/bin" mockery` from `backend/` — reproducing exactly what `just generate-mocks` would run. Unlike Plan 01, this regeneration touched only the new `mock_TransactionTemplateService.go` file; no other mock files were incidentally modified.
- Docker was not exercised — no testcontainers integration tests are part of this plan's scope (Task 2 only wires the suite construction; actual `*_test.go` files exercising the DB suite are deferred to a later plan per the phase's scope). `go build ./...` and `go vet` were used to verify correctness as instructed by the environment notes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `TransactionTemplateService` interface + impl are stable and ready for Plan 03 (handler layer) to consume via `services.TransactionTemplate`.
- `MockTransactionTemplateService` is available under `backend/mocks/` for Plan 03/04's handler unit tests.
- `ServiceTestWithDBSuite` now constructs the real template repo + service, ready for integration tests exercising the race-safe cap and duplicate-name paths in a later plan.
- No blockers.

---
*Phase: 27-backend-crud-api*
*Completed: 2026-07-08*
