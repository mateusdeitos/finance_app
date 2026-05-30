---
phase: 22-backend-subscription-foundation
plan: "03"
subsystem: api
tags: [go, push-notifications, vapid, echo, service, handler, swagger, mocks, integration-tests]

# Dependency graph
requires:
  - 22-01 (domain.SubscribePushRequest, domain.PushSubscriptionStatusResponse, config.VAPIDConfig)
  - 22-02 (PushSubscriptionRepository interface + impl, mock_PushSubscriptionRepository, ServiceTestWithDBSuite extended)
provides:
  - PushSubscriptionService interface in service/interfaces.go with Subscribe/Unsubscribe/Status + PushSubscription field on Services struct
  - push_subscription_service.go implementation (input validation + IDOR-safe userID handling, no userID from request)
  - push_subscription_service_test.go integration suite (TestPushSubscriptionServiceWithDB — 8 test cases covering SUB-03 + SUB-04)
  - PushSubscriptionHandler with POST/DELETE/GET swagger-annotated endpoints
  - push_subscription_handler_test.go unit tests (MockPushSubscriptionService — 7 test cases)
  - mock_PushSubscriptionService.go (mockery-generated, was already present from Plan 02 run)
  - main.go: VAPID startup guard, PushSubscription+Notification repo wiring, service wiring, handler wiring, 3 routes under authenticated /api group
  - Regenerated docs/swagger.json + swagger.yaml + docs.go with push-subscriptions paths
affects:
  - 23 (NotificationService + SendNotification — consumes cfg.VAPID and DeleteByEndpointAdmin from this phase)
  - frontend Phase 24 (consumes POST/DELETE/GET /api/push-subscriptions contract from swagger)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Service validation before DB write: BadRequest for empty endpoint/keys fields (ASVS V5)
    - IDOR enforcement in service: userID always from function argument (auth context), never from request body
    - Handler endpoint split: POST uses c.Bind for JSON body; DELETE/GET use c.QueryParam("endpoint")
    - VAPID startup guard: log.Fatalf when VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is empty
    - Swagger @Tags push-subscriptions with @Security CookieAuth + BearerAuth on all three handlers
    - Integration test suite embedding ServiceTestWithDBSuite with createTestUser + uniqueEndpoint helpers

key-files:
  created:
    - backend/internal/service/push_subscription_service.go
    - backend/internal/service/push_subscription_service_test.go
    - backend/internal/handler/push_subscription_handler.go
    - backend/internal/handler/push_subscription_handler_test.go
  modified:
    - backend/cmd/server/main.go (VAPID guard + repo/service/handler wiring + 3 routes)
    - backend/docs/swagger.json (regenerated — adds push-subscriptions paths)
    - backend/docs/swagger.yaml (regenerated)
    - backend/docs/docs.go (regenerated)

key-decisions:
  - "IDOR guard at both service and handler: handler gets userID from appcontext, passes as function arg; service never reads userID from request — T-22-IDOR mitigated across two layers"
  - "DELETE and GET use c.QueryParam not Bind — DELETE requests conventionally have no body; using QueryParam avoids RESEARCH Pitfall 4 where empty Bind returns zero struct and silently deletes nothing"
  - "log.Fatalf for missing VAPID keys — prevents silently-degraded production deployment where push delivery would fail on every call; keys are infrastructure secrets that must be present at startup"
  - "Service integration test suite deferred — Docker unavailable in execution environment; tests compile-checked via go vet -tags=integration and will run when Docker is accessible"
  - "mock_PushSubscriptionService.go already existed from Plan 02 mockery run — no regeneration needed; used directly by handler tests"

# Metrics
duration: 20min
completed: 2026-05-30
---

# Phase 22 Plan 03: Service + Handler + main.go Wiring Summary

**PushSubscriptionService with IDOR-safe validation, three swagger-annotated handler endpoints (POST/DELETE/GET /api/push-subscriptions), VAPID startup guard, full DI wiring in main.go, and regenerated swagger spec**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-30T13:05:00Z
- **Completed:** 2026-05-30T13:20:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Implemented `PushSubscriptionService` with full input validation (endpoint/p256dh/auth non-empty checks returning BadRequest) and IDOR-safe userID handling (userID is always the function argument from auth context, never read from the request body)
- Created integration test suite (`push_subscription_service_test.go`, `//go:build integration`) embedding `ServiceTestWithDBSuite` — 8 test cases covering SUB-03 and SUB-04: Subscribe stores + upserts, EmptyEndpoint/P256dh/Auth errors, Unsubscribe removes + idempotent, Status true/false, DeleteByEndpointAdmin admin prune
- Implemented `PushSubscriptionHandler` with three fully swagger-annotated endpoints: Subscribe (POST, c.Bind), Unsubscribe (DELETE, c.QueryParam), Status (GET, c.QueryParam); all derive userID from appcontext; errors handled via HandleServiceError
- Created handler unit test suite (7 test cases) reusing `injectUserCtx` from charge_handler_test.go; all pass
- Added VAPID startup guard (`log.Fatalf` when VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY empty) in main.go immediately after config.Load()
- Wired PushSubscription and Notification repositories, PushSubscription service, and PushSubscriptionHandler into main.go; registered POST/DELETE/GET routes on api.Group("/push-subscriptions") behind RequireAuth
- Regenerated swagger: `docs/swagger.json` now includes all three `/api/push-subscriptions` paths with correct tags, security schemes, and request/response schemas

## Task Commits

1. **Task 1: PushSubscriptionService + integration tests** — `4a40e38` (feat) — already committed before this execution session
2. **Task 2: PushSubscriptionHandler + unit tests** — `5347493` (feat)
3. **Task 3: main.go DI wiring + routes + VAPID guard + swagger** — `08e1428` (feat)

## Files Created/Modified

- `backend/internal/service/push_subscription_service.go` — pushSubscriptionService struct, NewPushSubscriptionService constructor, Subscribe/Unsubscribe/Status implementations with IDOR-safe userID and validation
- `backend/internal/service/push_subscription_service_test.go` — `//go:build integration`, PushSubscriptionServiceTestSuite embedding ServiceTestWithDBSuite, TestPushSubscriptionServiceWithDB runner, 8 test methods
- `backend/internal/handler/push_subscription_handler.go` — PushSubscriptionHandler struct, NewPushSubscriptionHandler, Subscribe/Unsubscribe/Status with full swagger annotations
- `backend/internal/handler/push_subscription_handler_test.go` — setupPushSubHandlerTest helper, 7 test functions reusing injectUserCtx
- `backend/cmd/server/main.go` — VAPID startup guard, PushSubscription+Notification in repos literal, services.PushSubscription wiring, pushSubHandler construction, 3 routes on pushSubs group
- `backend/docs/swagger.json` — regenerated by swag init; includes push-subscriptions paths
- `backend/docs/swagger.yaml` — regenerated
- `backend/docs/docs.go` — regenerated

## Decisions Made

- **IDOR double-enforcement**: The handler passes userID from appcontext to service; the service accepts it as a function argument and never accesses `req.UserID`. This layered approach ensures correctness even if future handlers are written incorrectly — the service never trusts the request body for identity.
- **QueryParam for DELETE/GET**: Using `c.QueryParam("endpoint")` instead of `c.Bind` prevents the RESEARCH Pitfall 4 edge case where a DELETE with no body produces an empty endpoint and silently succeeds or deletes all rows. The empty-check guard also added.
- **log.Fatalf for VAPID keys**: Hard failure on startup prevents silent production degradation. The log message names env var names but never prints key values (T-22-KEY). Consistent with how missing JWT_SECRET would produce an insecure app.
- **Service mock reuse**: `mock_PushSubscriptionService.go` was already generated by Plan 02's mockery run (because the interface was in `service/interfaces.go`). No re-generation needed.

## Deviations from Plan

### Environment Substitutions (not deviations — documented per plan instructions)

**1. `just generate-docs` → direct swag command**
- `just` not installed in execution environment
- Substituted: `export PATH="$PATH:$(go env GOPATH)/bin" && swag init -g cmd/server/main.go --output docs --parseInternal`
- Produces identical output; verified `docs/swagger.json` contains `push-subscriptions`

**2. `just generate-mocks` → not run (mock already present)**
- `mock_PushSubscriptionService.go` was generated during Plan 02's execution (mockery runs on the full interfaces.go, which already had `PushSubscriptionService` from Plan 02's update)
- No regeneration needed; handler tests confirm mock compiles and works correctly

**3. Integration tests written + compile-checked, NOT executed**
- Docker daemon unavailable in this environment; testcontainers require Docker
- `push_subscription_service_test.go` written with `//go:build integration` tag
- Verified: `go vet -tags=integration ./internal/...` exits 0 (all integration test files compile)
- Integration run deferred: `go test -tags=integration ./internal/service/ -run TestPushSubscriptionServiceWithDB` must be run in an environment with Docker

**4. Task 1 was pre-committed**
- `push_subscription_service.go` and `push_subscription_service_test.go` were already committed as `4a40e38` when this execution session began (committed by a prior agent run)
- Verified contents match plan specification; no re-commit needed

## Threat Mitigations Applied

| Threat ID | Status |
|-----------|--------|
| T-22-IDOR | Mitigated — handler derives userID from `appcontext.GetUserIDFromContext`, passes as function arg; service never reads from request body. Grep `grep -c 'req.UserID\|req\.userID' push_subscription_service.go` returns 0. |
| T-22-KEY | Mitigated — VAPID keys named in startup log message but value never printed; `cfg.VAPID.PrivateKey` appears only in the empty-check comparison in main.go |
| T-22-VALIDATION | Mitigated — Service rejects empty endpoint/p256dh/auth with BadRequest before any DB write |
| T-22-STARTUP | Mitigated — `log.Fatalf("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required")` in main.go prevents silent degraded start |

## Known Stubs

None — all three handler methods are fully wired to the service; service methods are fully implemented and wired to the repository. The notification_repository.go remains a stub (empty interface, no methods) but this is intentional per Plan 01/02 decisions — Phase 23 adds the concrete write signatures.

## Threat Flags

One new network surface introduced:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-endpoints | backend/internal/handler/push_subscription_handler.go | Three new authenticated HTTP endpoints at /api/push-subscriptions (POST/DELETE/GET). All are behind RequireAuth middleware; userID is extracted from auth context only. Threat register entries T-22-IDOR and T-22-VALIDATION cover the input surface. |

---
*Phase: 22-backend-subscription-foundation*
*Completed: 2026-05-30*

## Self-Check: PASSED

Files verified:
- `backend/internal/service/push_subscription_service.go` — FOUND
- `backend/internal/service/push_subscription_service_test.go` — FOUND
- `backend/internal/handler/push_subscription_handler.go` — FOUND
- `backend/internal/handler/push_subscription_handler_test.go` — FOUND
- `backend/mocks/mock_PushSubscriptionService.go` — FOUND
- `backend/docs/swagger.json` — FOUND

Commits verified:
- `4a40e38` — FOUND (Task 1: PushSubscriptionService + integration tests)
- `5347493` — FOUND (Task 2: PushSubscriptionHandler + unit tests)
- `08e1428` — FOUND (Task 3: main.go wiring + routes + VAPID guard + swagger)

Build verification:
- `go build ./...` — PASS
- `go build ./cmd/server/` — PASS
- `go test -short ./...` — all packages pass
- `go vet -tags=integration ./internal/...` — PASS (integration test files compile-checked)
