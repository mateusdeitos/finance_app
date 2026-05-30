---
phase: 22-backend-subscription-foundation
plan: "02"
subsystem: api
tags: [go, postgres, gorm, repository, mocks, push-subscriptions, testify]

# Dependency graph
requires:
  - 22-01 (domain.PushSubscription, entity.PushSubscription, entity.PushSubscriptionFromDomain)
provides:
  - PushSubscriptionRepository interface (Upsert, DeleteByEndpoint, DeleteByEndpointAdmin, ExistsForUser) in repository/interfaces.go
  - NotificationRepository interface (zero methods) in repository/interfaces.go
  - PushSubscription + Notification fields on repository.Repositories struct
  - push_subscription_repository.go implementation (ON CONFLICT upsert, IDOR-scoped deletes, exists check)
  - notification_repository.go stub constructor
  - mock_PushSubscriptionRepository.go (mockery-generated)
  - mock_NotificationRepository.go (mockery-generated)
  - ServiceTestWithDBSuite extended with PushSubscriptionRepository + NotificationRepository fields + SetupTest instantiation + Repos literal assignments
affects:
  - 22-03 (service/handler layer consumes PushSubscriptionRepository, can depend on ServiceTestWithDBSuite extension)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Raw SQL ON CONFLICT upsert (race-safe, preferred over GORM FirstOrCreate)
    - IDOR-scoped repository queries (user_id + endpoint in WHERE clause)
    - Admin-prune unscoped delete (server-side only, documented with comment)
    - Count-based ExistsForUser (Model + Where + Count)
    - GetTxFromContext on every GORM call (transaction passthrough)

key-files:
  created:
    - backend/internal/repository/push_subscription_repository.go
    - backend/internal/repository/notification_repository.go
    - backend/mocks/mock_PushSubscriptionRepository.go
    - backend/mocks/mock_NotificationRepository.go
  modified:
    - backend/internal/repository/interfaces.go (PushSubscriptionRepository + NotificationRepository interfaces + Repositories struct fields)
    - backend/internal/service/test_setup_with_db.go (struct fields + SetupTest instantiation + Repos literal)

key-decisions:
  - "ON CONFLICT (endpoint) raw SQL for Upsert — race-safe; GORM FirstOrCreate would not be atomic under concurrent requests"
  - "DeleteByEndpoint scoped with user_id + endpoint — IDOR guard (T-22-IDOR mitigation); DeleteByEndpointAdmin intentionally unscoped for server-side prune only"
  - "NotificationRepository left as empty interface — Phase 23 adds methods when delivery signatures are finalized"
  - "Integration test suite wires repos only (no NewPushSubscriptionService) — service constructor does not exist until Plan 03"

# Metrics
duration: 15min
completed: 2026-05-30
---

# Phase 22 Plan 02: Repository Layer Summary

**PushSubscriptionRepository implemented with ON CONFLICT upsert, IDOR-scoped queries, and admin prune delete; NotificationRepository stub created; mocks regenerated; integration test suite extended with both new repositories**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-30
- **Completed:** 2026-05-30
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Registered `PushSubscriptionRepository` and `NotificationRepository` interfaces in `repository/interfaces.go`; added `PushSubscription` and `Notification` fields to `Repositories` struct
- Implemented `push_subscription_repository.go` with four methods: `Upsert` (raw SQL `ON CONFLICT (endpoint) DO UPDATE`, race-safe), `DeleteByEndpoint` (IDOR-scoped: `user_id = ? AND endpoint = ?`), `DeleteByEndpointAdmin` (unscoped prune, server-side only), `ExistsForUser` (count-based IDOR-scoped query); every GORM call uses `GetTxFromContext(ctx, r.db)`, zero bare `r.db.` accesses
- Created `notification_repository.go` stub constructor (`NewNotificationRepository`) with no methods (Phase 23 adds concrete writes)
- Regenerated mocks via `mockery`: `mock_PushSubscriptionRepository.go` (all four interface methods) and `mock_NotificationRepository.go` (empty interface mock)
- Extended `ServiceTestWithDBSuite` in `test_setup_with_db.go` with `PushSubscriptionRepository` and `NotificationRepository` struct fields, `SetupTest` instantiation via `repository.NewPushSubscriptionRepository` / `repository.NewNotificationRepository`, and Repos literal assignments

## Task Commits

1. **Task 1: Repository interfaces + implementations + mocks** — `91c6f11` (feat) — previously committed before this execution session
2. **Task 2: Wire repos into integration test suite** — `34a25e1` (feat)

## Files Created/Modified

- `backend/internal/repository/interfaces.go` — `PushSubscriptionRepository` interface (4 methods with IDOR/security commentary), `NotificationRepository` interface (empty), `PushSubscription` + `Notification` fields on `Repositories` struct
- `backend/internal/repository/push_subscription_repository.go` — full implementation: ON CONFLICT upsert, scoped delete, admin delete, count exists; all using `GetTxFromContext`
- `backend/internal/repository/notification_repository.go` — stub with `NewNotificationRepository` constructor only
- `backend/mocks/mock_PushSubscriptionRepository.go` — auto-generated by mockery v2.53.6
- `backend/mocks/mock_NotificationRepository.go` — auto-generated by mockery v2.53.6
- `backend/internal/service/test_setup_with_db.go` — struct fields + SetupTest instantiation + Repos literal for both new repos

## Decisions Made

- **Raw SQL ON CONFLICT for Upsert**: GORM's `FirstOrCreate` + `Assign` is not atomic under concurrent requests for the same endpoint; the raw SQL `INSERT ... ON CONFLICT (endpoint) DO UPDATE` is the race-safe path verified in PATTERNS.md
- **IDOR scope on DeleteByEndpoint and ExistsForUser**: Both methods include `user_id = ? AND endpoint = ?` in the WHERE clause; `userID` arrives as a caller argument derived from auth context upstream — this enforces the T-22-IDOR mitigation at the data layer
- **DeleteByEndpointAdmin intentionally unscoped**: Documented in interface comment and code comment; only callable by server-side Phase 23 pruning logic after 404/410 push response, never from a client handler
- **SetupTest wires repos only, not service**: `NewPushSubscriptionService` does not exist until Plan 03, so the test suite only instantiates repository-layer objects here; Plan 03 adds the service instantiation

## Deviations from Plan

None — plan executed exactly as written.

Task 1 was already committed as `91c6f11` when this execution session began. Task 2 (`test_setup_with_db.go` wiring) had the code modifications in place but was not yet committed; this session verified correctness and committed it as `34a25e1`.

## Environment Substitutions

- `just generate-mocks` (not installed) was replaced by: `export PATH="$PATH:$(go env GOPATH)/bin" && cd backend && mockery` — produces identical output
- Docker/testcontainers unavailable in this environment — integration tests in `test_setup_with_db.go` were written and verified to compile (`go vet -tags=integration ./internal/...` exits 0) but were NOT executed. Integration test run is deferred to when Docker is available.

## Threat Mitigations Applied

| Threat ID | Status |
|-----------|--------|
| T-22-IDOR | Mitigated — `DeleteByEndpoint` and `ExistsForUser` both scope queries with `user_id = ? AND endpoint = ?`; confirmed via grep (`grep -q 'user_id = ? AND endpoint = ?'` exits 0) |
| T-22-ADMIN-PRUNE | Accepted — `DeleteByEndpointAdmin` is intentionally unscoped; documented with code comments; not exposed via any HTTP handler |
| T-22-DUP | Mitigated — `ON CONFLICT (endpoint) DO UPDATE` is atomic and prevents duplicate rows for the same endpoint |

## Known Stubs

- `notification_repository.go` has no methods — intentional stub; Phase 23 adds concrete write signatures (e.g., Create). The notifications table exists from Plan 01 migration. No UI or service consumer depends on notification writes in Phase 22.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced in this plan. Repository layer only.

---
*Phase: 22-backend-subscription-foundation*
*Completed: 2026-05-30*

## Self-Check: PASSED

Files verified:
- `backend/internal/repository/push_subscription_repository.go` — FOUND
- `backend/internal/repository/notification_repository.go` — FOUND
- `backend/mocks/mock_PushSubscriptionRepository.go` — FOUND
- `backend/mocks/mock_NotificationRepository.go` — FOUND
- `backend/internal/service/test_setup_with_db.go` — FOUND (modified)
- `backend/internal/repository/interfaces.go` — FOUND (modified)

Commits verified:
- `91c6f11` — FOUND (Task 1: repository interfaces + implementations + mocks)
- `34a25e1` — FOUND (Task 2: integration test suite wiring)

Build verification:
- `go build ./internal/repository/ ./mocks/` — PASS
- `go build ./...` — PASS
- `go test -short ./...` — all packages pass
- `go vet -tags=integration ./internal/...` — PASS (integration test files compile-checked)
