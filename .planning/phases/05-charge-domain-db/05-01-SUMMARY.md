---
phase: 05-charge-domain-db
plan: "01"
subsystem: domain
tags: [domain, entity, gorm, state-machine, charge]
dependency_graph:
  requires: []
  provides: [domain.Charge, domain.ChargeStatus, entity.Charge, domain.Transaction.ChargeID, entity.Transaction.ChargeID]
  affects: [backend/internal/domain/transaction.go, backend/internal/entity/transaction.go]
tech_stack:
  added: []
  patterns: [typed-string-enum, gorm-entity-hooks, tdd-red-green]
key_files:
  created:
    - backend/internal/domain/charge.go
    - backend/internal/domain/charge_test.go
    - backend/internal/entity/charge.go
  modified:
    - backend/internal/domain/transaction.go
    - backend/internal/entity/transaction.go
decisions:
  - "ChargeStatus uses plain errors.New sentinel (not pkg/errors) to keep domain layer free of HTTP dependencies"
  - "ValidateTransition switch only handles pending; all other current states fall through to return ErrInvalidStatusTransition"
  - "entity.Charge follows settlement.go pattern exactly: BeforeCreate/BeforeUpdate hooks, ToDomain, ChargeFromDomain"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-04-14"
  tasks_completed: 3
  files_changed: 5
---

# Phase 05 Plan 01: Charge Domain Model Summary

**One-liner:** ChargeStatus typed-string enum with 4 values and ValidateTransition state machine, entity.Charge GORM struct with hooks, and ChargeID *int added to domain/entity Transaction.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Charge domain model with status enum and state machine (TDD) | 6b43bb4 | backend/internal/domain/charge.go, backend/internal/domain/charge_test.go |
| 2 | Create Charge GORM entity with hooks and domain conversion | c4c4703 | backend/internal/entity/charge.go |
| 3 | Add ChargeID field to Transaction domain and entity | 244cb4d | backend/internal/domain/transaction.go, backend/internal/entity/transaction.go |

## Decisions Made

- Used plain `errors.New("invalid charge status transition")` in domain layer — `pkg/errors` imports Echo HTTP library and must not be used in domain
- `ValidateTransition` switch: only `ChargeStatusPending` case has valid exits; all other states fall through to return error — this is the cleanest Go idiom for terminal-state state machines
- `entity.Charge` follows `entity.Settlement` pattern exactly — `BeforeCreate` sets both timestamps, `BeforeUpdate` sets only `updated_at`
- No `gorm:"column:..."` tags on `ChargeID` in entity.Transaction — GORM derives `charge_id` automatically from the CamelCase field name

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all fields are properly typed and wired. No placeholder values.

## Threat Flags

None — this plan introduces no new network endpoints, auth paths, or trust boundaries. The `ChargeStatus.IsValid()` and `ValidateTransition` mitigations from the threat model (T-05-01, T-05-02, T-05-03) are all implemented.

## Self-Check: PASSED

- backend/internal/domain/charge.go: FOUND
- backend/internal/domain/charge_test.go: FOUND
- backend/internal/entity/charge.go: FOUND
- ChargeID in backend/internal/domain/transaction.go: FOUND
- ChargeID in backend/internal/entity/transaction.go: FOUND
- Commit 6b43bb4: FOUND
- Commit c4c4703: FOUND
- Commit 244cb4d: FOUND
