---
phase: 22-backend-subscription-foundation
plan: "01"
subsystem: api
tags: [webpush, vapid, go, postgres, gorm, goose]

# Dependency graph
requires: []
provides:
  - webpush-go v1.4.0 dependency in go.mod
  - VAPIDConfig sub-struct loaded from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT env vars
  - push_subscriptions Goose migration (SERIAL PK, TIMESTAMPTZ, UNIQUE(endpoint), FK users ON DELETE CASCADE)
  - notifications Goose migration (SERIAL PK, TIMESTAMPTZ, FK users ON DELETE CASCADE)
  - domain.PushSubscription, domain.SubscribePushRequest, domain.PushKeys, domain.PushSubscriptionStatusResponse, domain.Notification types
  - entity.PushSubscription GORM entity with uniqueIndex on endpoint, no gorm.Model (hard deletes)
  - entity.Notification GORM entity with ToDomain/NotificationFromDomain stubs
  - PushSubscriptionFromDomain / ToDomain round-trip conversion
affects:
  - 22-02 (repository layer — consumes domain/entity contracts)
  - 22-03 (service/handler layer — consumes domain types, config.VAPIDConfig)

# Tech tracking
tech-stack:
  added:
    - github.com/SherClockHolmes/webpush-go v1.4.0
  patterns:
    - VAPIDConfig sub-struct with empty-string defaults (startup validation in Plan 03 main.go)
    - GORM entity with no gorm.Model for hard-delete resources (PushSubscription)
    - Domain/entity split: no GORM tags in domain layer, no json tags in entity layer
    - Goose migration via CLI (never hand-created timestamp filenames)

key-files:
  created:
    - backend/internal/domain/push_subscription.go
    - backend/internal/entity/push_subscription.go
    - backend/internal/entity/notification.go
    - backend/migrations/20260530125301_create_push_subscriptions_table.sql
    - backend/migrations/20260530125310_create_notifications_table.sql
  modified:
    - backend/internal/config/config.go (VAPIDConfig sub-struct + VAPID field in Config + Load() wiring)
    - backend/go.mod (webpush-go v1.4.0)
    - backend/go.sum

key-decisions:
  - "UNIQUE constraint on endpoint alone (not composite user_id+endpoint) — endpoint is globally unique; upsert reassigns user_id when same endpoint reappears (RESEARCH Pitfall 1)"
  - "Empty-string defaults for VAPID keys (not 'change-me') — startup validation via log.Fatalf in Plan 03 guards missing values in production"
  - "No gorm.Model on PushSubscription entity — hard deletes required so re-registration with same endpoint works after logout/pruning"
  - "NotificationRepository left as empty interface in Phase 22 — actual methods added in Phase 23 when signatures are known"
  - "webpush-go v1.4.0 chosen as the only actively-maintained Go VAPID library"

patterns-established:
  - "VAPIDConfig: sub-struct pattern matching JWTConfig/OAuthConfig; no String() method to prevent key leakage"
  - "Hard-delete entity: no gorm.Model, no deleted_at, no BeforeCreate/BeforeUpdate hooks"
  - "Goose migration: SERIAL PRIMARY KEY, TIMESTAMPTZ, ON DELETE CASCADE FK to users, symmetric Down block"
  - "TDD commit sequence: test(failing) → feat(implementation) per task"

requirements-completed: [SUB-03, SUB-04]

# Metrics
duration: 25min
completed: 2026-05-30
---

# Phase 22 Plan 01: Backend Subscription Foundation Summary

**webpush-go v1.4.0 added, VAPIDConfig wired from env, push_subscriptions + notifications Goose migrations created, and PushSubscription/Notification domain + GORM entity types defined with round-trip conversion**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-30T13:00:00Z
- **Completed:** 2026-05-30T13:25:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- webpush-go v1.4.0 registered as dependency (go.mod + go.sum); VAPIDConfig sub-struct added to config.go with three env vars (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) using empty-string defaults
- Two Goose SQL migrations created via `goose -dir migrations create` CLI: push_subscriptions (endpoint-only UNIQUE constraint, TIMESTAMPTZ, SERIAL PK, FK users ON DELETE CASCADE) and notifications (TIMESTAMPTZ, SERIAL PK, FK users ON DELETE CASCADE, two indexes)
- Domain types (PushSubscription, SubscribePushRequest, PushKeys, PushSubscriptionStatusResponse, Notification) and GORM entities (entity.PushSubscription with uniqueIndex/no gorm.Model, entity.Notification) created with full round-trip conversion; all compile and unit tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add webpush-go dependency and VAPID config** - `cc17d85` (feat)
2. **Task 2: Create push_subscriptions and notifications migrations** - `b6656a6` (feat)
3. **Task 3 RED: Failing entity round-trip tests** - `f492a8a` (test)
4. **Task 3 GREEN: Define domain types and GORM entities** - `2377cf4` (feat)

**Plan metadata:** (docs commit follows)

_Note: Task 3 was TDD — two commits (test → feat) per the TDD protocol._

## Files Created/Modified

- `backend/internal/config/config.go` — Added VAPIDConfig sub-struct and VAPID field in Config struct; Load() wires VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT with empty-string defaults
- `backend/go.mod` — webpush-go v1.4.0 added
- `backend/go.sum` — webpush-go checksum added
- `backend/migrations/20260530125301_create_push_subscriptions_table.sql` — push_subscriptions DDL with CONSTRAINT uq_push_subscriptions_endpoint UNIQUE (endpoint)
- `backend/migrations/20260530125310_create_notifications_table.sql` — notifications DDL with type, entity_type, entity_id, read columns
- `backend/internal/domain/push_subscription.go` — PushSubscription, SubscribePushRequest, PushKeys, PushSubscriptionStatusResponse, Notification domain types
- `backend/internal/entity/push_subscription.go` — GORM PushSubscription entity (uniqueIndex on Endpoint, index on UserID, no gorm.Model); ToDomain + PushSubscriptionFromDomain
- `backend/internal/entity/notification.go` — GORM Notification entity; ToDomain + NotificationFromDomain stubs

## Decisions Made

- **endpoint-only UNIQUE constraint**: Unique on `endpoint` alone (not composite `user_id, endpoint`) so that when a device re-registers with the same endpoint (e.g., user logs out and another logs in), the upsert correctly reassigns `user_id` rather than violating the constraint or creating a duplicate
- **Empty-string VAPID defaults**: VAPID keys use empty-string defaults in config (not "change-me" placeholders) because Plan 03's `main.go` will add `log.Fatalf` startup validation; keeping empty strings avoids misleading defaults
- **No gorm.Model on PushSubscription**: Subscriptions require hard deletes — a soft-deleted row with the same endpoint would violate the UNIQUE constraint on re-registration; no `deleted_at` column
- **Empty NotificationRepository interface**: No methods needed in Phase 22; Phase 23 defines concrete write signatures when actual delivery is implemented

## Deviations from Plan

None — plan executed exactly as written.

Tasks 1 and 2 were already committed prior to this execution session (commits `cc17d85` and `b6656a6`). Task 3 was executed fresh in this session following the TDD protocol (RED then GREEN).

## Environment Substitutions

- `just migrate-create <name>` was unavailable (`just` not installed). Substituted with: `export PATH="$PATH:$(go env GOPATH)/bin" && goose -dir migrations create <name> sql` from `backend/`. Produced identical timestamped migration files.
- Docker daemon unavailable — migrations created and verified syntactically only; `goose up` was not run. This is acceptable per plan (Plan 03 will run migrations against a test DB via testcontainers).

## Threat Mitigations Applied

| Threat ID | Mitigation Status |
|-----------|------------------|
| T-22-KEY | VAPIDConfig has no String() method; VAPID_PRIVATE_KEY is never logged; keys never stored in DB (env only). Verified via acceptance criterion grep. |
| T-22-SCHEMA | UNIQUE constraint on `endpoint` alone (not composite) — prevents duplicate rows per device. |
| T-22-TZ | TIMESTAMPTZ enforced in both migrations; grep confirms no bare TIMESTAMP. |

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required for this plan. VAPID key generation and `.env` setup will be documented in Plan 03 when startup validation is added.

## Next Phase Readiness

- Plan 02 (repository layer) can now import `domain.PushSubscription` and `entity.PushSubscription` — contracts are stable
- Plan 03 (service/handler layer) can import `config.VAPIDConfig` and all domain types
- Migration files are ready to be applied when a PostgreSQL instance is available
- Full backend build passes: `go build ./...`

---
*Phase: 22-backend-subscription-foundation*
*Completed: 2026-05-30*

## TDD Gate Compliance

- RED gate commit: `f492a8a` — `test(22-01): add failing tests for PushSubscription entity round-trip`
- GREEN gate commit: `2377cf4` — `feat(22-01): define domain types and GORM entities for push subscriptions`
- REFACTOR gate: not needed (implementation was clean on first pass)

## Self-Check: PASSED

Files verified:
- `backend/internal/domain/push_subscription.go` — FOUND
- `backend/internal/entity/push_subscription.go` — FOUND
- `backend/internal/entity/notification.go` — FOUND
- `backend/migrations/20260530125301_create_push_subscriptions_table.sql` — FOUND
- `backend/migrations/20260530125310_create_notifications_table.sql` — FOUND

Commits verified:
- `cc17d85` — FOUND (Task 1)
- `b6656a6` — FOUND (Task 2)
- `f492a8a` — FOUND (Task 3 RED)
- `2377cf4` — FOUND (Task 3 GREEN)
