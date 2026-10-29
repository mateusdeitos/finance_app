---
phase: 26-backend-foundation
plan: "02"
subsystem: database
tags: [go, gorm, jsonb, entity, postgres]

# Dependency graph
requires:
  - phase: 26-01
    provides: domain.TransactionTemplate and domain.TransactionTemplatePayload types with SplitSettings reuse
provides:
  - entity.TransactionTemplate GORM entity with typed JSONB Scan/Value on payload column
  - TransactionTemplateFromDomain / ToDomain converters for domain<->entity round-trip
  - BeforeCreate/BeforeUpdate GORM hooks for timestamp management
  - Unit tests proving converter and JSONB driver round-trip fidelity including both split modes (TMPL-05)
affects: [26-03, phase-27-repository, phase-27-service, phase-27-handler]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Typed JSONB column via driver.Valuer/sql.Scanner on a type alias of domain struct (vs untyped map[string]interface{})"
    - "entity.XxxFromDomain(d) + (e *Xxx) ToDomain() converter convention"
    - "GORM BeforeCreate/BeforeUpdate hooks for created_at/updated_at management"

key-files:
  created:
    - backend/internal/entity/transaction_template.go
    - backend/internal/entity/transaction_template_test.go
  modified: []

key-decisions:
  - "TransactionTemplatePayload entity type is a type alias of domain.TransactionTemplatePayload — avoids struct duplication and makes cast-based converters trivial"
  - "Typed Scan/Value on entity payload rather than untyped JSONB map — enforces payload schema at the Go type level"
  - "Entity isolated from all existing financial queries (Search, GetBalance, FindOrphanedSettlementTransactions) — no repository or service references"

patterns-established:
  - "Typed JSONB column: define a type alias of the domain payload struct, implement Value()/GormDataType()/Scan() on it — no untyped map indirection"
  - "Converter casts: FromDomain uses TransactionTemplatePayload(d.Payload) and ToDomain uses domain.TransactionTemplatePayload(e.Payload) — zero-cost type cast between alias types"

requirements-completed: [TMPL-01, TMPL-05]

# Metrics
duration: 15min
completed: 2026-06-14
---

# Phase 26 Plan 02: Entity Layer Summary

**GORM entity.TransactionTemplate with typed JSONB Scan/Value on payload, BeforeCreate/BeforeUpdate hooks, domain converters, and passing round-trip unit tests covering both split modes (TMPL-05)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-14T12:00:00Z
- **Completed:** 2026-06-14T12:15:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Implemented `entity.TransactionTemplate` with typed JSONB payload column via `Value()`/`GormDataType()`/`Scan()` on a type alias of `domain.TransactionTemplatePayload`
- Added `TransactionTemplateFromDomain` and `(e *TransactionTemplate) ToDomain()` converters following the project's `entity.XxxFromDomain(d)` + `(e *Xxx) ToDomain()` naming convention
- Added `BeforeCreate`/`BeforeUpdate` GORM hooks setting `created_at`/`updated_at` to match the codebase pattern (charge.go, user_settings.go)
- Wrote two unit tests: converter round-trip and JSONB driver round-trip, both asserting percentage and fixed-amount split modes survive intact (TMPL-05)
- Entity is completely isolated: no references in `internal/service/` or `internal/repository/` — isolation deliverable met

## Task Commits

Each task was committed atomically:

1. **Task 1: Create entity.TransactionTemplate with JSONB Scan/Value, converters, and hooks** - `4e1b380` (feat)
2. **Task 2: Prove domain<->entity converter round-trip (incl. both split modes)** - `a05a442` (test)

## Files Created/Modified

- `backend/internal/entity/transaction_template.go` — GORM entity with typed JSONB column, BeforeCreate/BeforeUpdate hooks, TransactionTemplateFromDomain and ToDomain converters
- `backend/internal/entity/transaction_template_test.go` — TestTransactionTemplateConverterRoundTrip and TestTransactionTemplateJSONBRoundTrip unit tests

## Decisions Made

- Used a type alias (`type TransactionTemplatePayload domain.TransactionTemplatePayload`) for the entity payload type rather than an embedded struct or separate struct. This makes the cast-based converters trivial (`TransactionTemplatePayload(d.Payload)` / `domain.TransactionTemplatePayload(e.Payload)`) and avoids any field duplication.
- The `Scan()` implementation silently no-ops on `nil` or non-`[]byte` values, matching the `user_settings.go` and `account.go` precedents (T-26-05 accepted).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Entity layer complete; repository layer (Phase 27) can proceed with `entity.TransactionTemplate` as the persistence target
- JSONB round-trip proof means the payload will faithfully survive DB read/write cycles for all three transaction types and both split modes
- No existing financial query is touched; isolation is verified

---
*Phase: 26-backend-foundation*
*Completed: 2026-06-14*
