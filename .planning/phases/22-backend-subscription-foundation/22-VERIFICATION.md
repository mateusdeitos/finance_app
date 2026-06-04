---
phase: 22-backend-subscription-foundation
verified: 2026-05-30T00:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 22: Backend Subscription Foundation Verification Report

**Phase Goal:** The backend can store Web Push subscriptions per device and is configured to send VAPID-signed pushes; stale subscriptions are pruned automatically.
**Verified:** 2026-05-30
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `push_subscriptions` table (user_id, endpoint, p256dh, auth, created_at) AND `notifications` table (type, entity_type, entity_id, user_id, read, created_at) exist as migrations | VERIFIED | `20260530125301_create_push_subscriptions_table.sql` and `20260530125310_create_notifications_table.sql` exist with exact schema: SERIAL PK, TIMESTAMPTZ, REFERENCES users(id) ON DELETE CASCADE, UNIQUE(endpoint), symmetric Down blocks |
| 2 | VAPID public/private/subject keys load from env config; app fails fast at startup when keys (incl. Subject) are absent | VERIFIED | `config.go:70-74` VAPIDConfig struct; `config.go:117-121` Load() wiring; `main.go:49-51` guards all three: `cfg.VAPID.PublicKey == "" \|\| cfg.VAPID.PrivateKey == "" \|\| cfg.VAPID.Subject == ""` → log.Fatalf. No String() method on VAPIDConfig; no key values logged. |
| 3 | POST /api/push-subscriptions stores/upserts a subscription for the authenticated user+endpoint (endpoint-only uniqueness) | VERIFIED | `push_subscription_handler.go:34-46` Subscribe → Bind → service.Subscribe; `push_subscription_service.go:42-61` validates endpoint/keys, calls Upsert; `push_subscription_repository.go:38-48` ON CONFLICT (endpoint) DO UPDATE (reassigns user_id, p256dh, auth; preserves created_at); 8 handler unit tests pass |
| 4 | DELETE /api/push-subscriptions removes the auth user's subscription (IDOR-scoped: user_id AND endpoint) | VERIFIED | `push_subscription_handler.go:59-69` Unsubscribe → QueryParam("endpoint") → service.Unsubscribe; `push_subscription_service.go:64-67` → repo.DeleteByEndpoint; `push_subscription_repository.go:53-57` WHERE "user_id = ? AND endpoint = ?"; no bare r.db. accesses (grep returns 0) |
| 5 | GET /api/push-subscriptions reports active-subscription status for a device endpoint | VERIFIED | `push_subscription_handler.go:83-94` Status → QueryParam("endpoint") → service.Status; `push_subscription_service.go:70-76` → repo.ExistsForUser; `push_subscription_repository.go:72-79` WHERE "user_id = ? AND endpoint = ?", Count-based; returns `{subscribed: bool}` JSON |
| 6 | A repository prune capability (`DeleteByEndpointAdmin`) exists for HTTP 404/410 handling; call-site correctly deferred to Phase 23 | VERIFIED | `push_subscription_repository.go:63-67` DeleteByEndpointAdmin WHERE "endpoint = ?" with no user_id scope; interface documented in `repository/interfaces.go:107-124`; no HTTP handler route exists for it; integration test `Test_DeleteByEndpointAdmin_RemovesWithoutUserCheck` calls it directly on the repository |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/20260530125301_create_push_subscriptions_table.sql` | push_subscriptions DDL | VERIFIED | SERIAL PK, TIMESTAMPTZ, UNIQUE(endpoint), FK users ON DELETE CASCADE, goose Up/Down |
| `backend/migrations/20260530125310_create_notifications_table.sql` | notifications DDL | VERIFIED | type, entity_type, entity_id, read, created_at columns; two indexes; goose Up/Down |
| `backend/internal/config/config.go` | VAPIDConfig sub-struct + Load() wiring | VERIFIED | VAPIDConfig{PublicKey, PrivateKey, Subject} at line 70; VAPID field in Config at line 19; Load() at lines 117-121 |
| `backend/internal/domain/push_subscription.go` | PushSubscription, SubscribePushRequest, PushKeys, PushSubscriptionStatusResponse, Notification | VERIFIED | All five types present with correct json tags |
| `backend/internal/entity/push_subscription.go` | GORM entity with uniqueIndex on Endpoint, no gorm.Model, ToDomain/FromDomain | VERIFIED | uniqueIndex tag present; no gorm.Model; both conversion functions present; CreatedAt intentionally omitted from FromDomain |
| `backend/internal/entity/notification.go` | GORM Notification entity with ToDomain/NotificationFromDomain | VERIFIED | All fields present; both conversion functions implemented |
| `backend/internal/repository/interfaces.go` | PushSubscriptionRepository (4 methods) + NotificationRepository + Repositories fields | VERIFIED | Interface with Upsert/DeleteByEndpoint/DeleteByEndpointAdmin/ExistsForUser; NotificationRepository as empty interface; both fields on Repositories struct |
| `backend/internal/repository/push_subscription_repository.go` | Upsert/DeleteByEndpoint/DeleteByEndpointAdmin/ExistsForUser implementations | VERIFIED | All four methods implemented; GetTxFromContext used on every call; ON CONFLICT upsert; IDOR scoping confirmed |
| `backend/internal/repository/notification_repository.go` | Stub constructor NewNotificationRepository | VERIFIED | Constructor exists; db field pre-wired with comment for Phase 23 |
| `backend/internal/service/interfaces.go` | PushSubscriptionService interface + Services.PushSubscription field | VERIFIED | Interface with Subscribe/Unsubscribe/Status at line 91; Services.PushSubscription field at line 109 |
| `backend/internal/service/push_subscription_service.go` | Subscribe/Unsubscribe/Status with validation + IDOR-safe userID | VERIFIED | All three methods; "endpoint is required" guard; "keys.p256dh is required"; "keys.auth is required"; validateEndpoint() HTTPS check; userID never read from req |
| `backend/internal/service/push_subscription_service_test.go` | Integration test suite (//go:build integration, TestPushSubscriptionServiceWithDB, 8 test cases) | VERIFIED | Build tag present; 8 test methods covering all behaviors: Subscribe stores, Upsert replaces, empty endpoint/p256dh/auth error, Unsubscribe removes, Unsubscribe idempotent, Status true, Status false, DeleteByEndpointAdmin |
| `backend/internal/handler/push_subscription_handler.go` | Subscribe/Unsubscribe/Status handlers with swagger annotations | VERIFIED | All three handlers; GetUserIDFromContext on each; POST uses Bind; DELETE/GET use QueryParam; full swagger annotations with @Router, @Tags push-subscriptions, @Security |
| `backend/internal/handler/push_subscription_handler_test.go` | Handler unit tests (setupPushSubHandlerTest, reuses injectUserCtx) | VERIFIED | 8 unit tests; setupPushSubHandlerTest present; reuses injectUserCtx from same package; all PASS |
| `backend/cmd/server/main.go` | VAPID guard + all DI wiring + 3 routes | VERIFIED | VAPID guard at line 49; PushSubscription+Notification in repos; services.PushSubscription at line 102; pushSubs group POST/DELETE/GET at lines 206-209 |
| `backend/docs/swagger.json` | push-subscriptions paths | VERIFIED | /api/push-subscriptions with GET/POST/DELETE; tags=push-subscriptions on all three |
| `backend/mocks/mock_PushSubscriptionRepository.go` | mockery-generated | VERIFIED | File exists |
| `backend/mocks/mock_PushSubscriptionService.go` | mockery-generated | VERIFIED | File exists |
| `backend/mocks/mock_NotificationRepository.go` | mockery-generated | VERIFIED | File exists |
| `backend/internal/service/test_setup_with_db.go` | Both repos wired + Services.PushSubscription instantiated | VERIFIED | PushSubscriptionRepository + NotificationRepository fields and SetupTest instantiation at lines 105-106; Repos literal at lines 122-123; Services.PushSubscription at line 161 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `config.go` | VAPID env vars | getEnv in Load() | VERIFIED | VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT all present |
| `main.go` | VAPID startup guard | log.Fatalf on empty PublicKey/PrivateKey/Subject | VERIFIED | Line 49: all three keys checked |
| `push_subscription_handler.go` | PushSubscriptionService | GetUserIDFromContext + service call | VERIFIED | All three handlers derive userID from appcontext; call service methods |
| `main.go` | /api/push-subscriptions routes | api.Group + POST/DELETE/GET | VERIFIED | pushSubs := api.Group("/push-subscriptions"); POST/DELETE/GET registered on handler methods |
| `push_subscription_repository.go` | push_subscriptions table | ON CONFLICT (endpoint) | VERIFIED | Raw SQL upsert with ON CONFLICT (endpoint) DO UPDATE |
| `entity.PushSubscription` | `domain.PushSubscription` | ToDomain/PushSubscriptionFromDomain | VERIFIED | Both conversion functions present; CreatedAt correctly omitted from FromDomain |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `push_subscription_handler.go:Status` | `resp *domain.PushSubscriptionStatusResponse` | service.Status → repo.ExistsForUser → GORM Count query | Yes — Count against push_subscriptions WHERE user_id + endpoint | FLOWING |
| `push_subscription_handler.go:Subscribe` | persists to DB | service.Subscribe → repo.Upsert → raw SQL INSERT ON CONFLICT | Yes — raw SQL write to push_subscriptions | FLOWING |
| `push_subscription_handler.go:Unsubscribe` | removes from DB | service.Unsubscribe → repo.DeleteByEndpoint → GORM Delete WHERE | Yes — GORM Delete against push_subscriptions | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend compiles | `go build ./...` | Exit 0, no output | PASS |
| Server binary compiles | `go build ./cmd/server/` | Exit 0, no output | PASS |
| Unit tests pass | `go test -short ./...` | All packages ok | PASS |
| Integration tests compile | `go vet -tags=integration ./internal/...` | VET_OK | PASS |
| Handler unit tests pass | `go test ./internal/handler/ -run TestPushSubHandler -v` | 8/8 PASS | PASS |
| webpush-go v1.4.0 in go.mod | grep check | FOUND | PASS |
| swagger.json contains push-subscriptions | grep + JSON parse | /api/push-subscriptions GET/POST/DELETE | PASS |
| No bare r.db. access in repository | grep count | 0 | PASS |
| No userID read from request in service | grep count | 0 | PASS |
| created_at NOT reset on upsert | grep in repository | Absent from DO UPDATE clause | PASS |
| No gorm.Model in push subscription entity | grep | Absent | PASS |
| No String() method on VAPIDConfig | grep | Absent | PASS |

Note: Integration tests (TestPushSubscriptionServiceWithDB) exist and compile but cannot be executed — Docker/testcontainers unavailable in this environment. Deferred to CI with Docker per plan design.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SUB-03 | 22-01, 22-02, 22-03 | System persists push subscriptions per user+device (endpoint+keys) and prunes a subscription when push service reports 404/410 | SATISFIED | Upsert (persist), DeleteByEndpoint (user-scoped delete), DeleteByEndpointAdmin (prune capability) all implemented; prune call-site deferred to Phase 23 by design |
| SUB-04 | 22-01, 22-02, 22-03 | System can report whether current device has an active push subscription | SATISFIED | GET /api/push-subscriptions → ExistsForUser → {subscribed: bool} fully implemented and tested |

**Orphaned requirement check:** Requirements SUB-01 and SUB-02 are mapped to Phase 24 in REQUIREMENTS.md — correctly not present in Phase 22 plans. No orphaned requirements for this phase.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `notification_repository.go` | 6-10 | `db *gorm.DB` field unused (empty interface) | INFO | Acceptable — pre-wired for Phase 23; documented with comment explaining intent |

No blockers found. The INFO-level item (unused db field in notification_repository.go) is an intentional stub pattern with an explanatory comment. Review finding IN-01 was addressed.

---

### Code Review Findings Resolution

The REVIEW.md identified 8 findings. All were addressed in subsequent fix commits before verification:

| Finding | Severity | Resolution |
|---------|----------|-----------|
| CR-01: created_at overwritten on upsert | Critical | FIXED — commit `83d7ebe`; DO UPDATE clause no longer includes created_at; code comment explains preservation |
| WR-01: VAPID Subject not validated at startup | Warning | FIXED — commit `230ddab`; main.go now guards all three: PublicKey, PrivateKey, Subject |
| WR-02: No endpoint URL validation (SSRF) | Warning | FIXED — commit `431918d`; validateEndpoint() added to Subscribe, rejects non-HTTPS URLs |
| WR-03: Upsert ownership transfer undocumented | Warning | FIXED — commit `a797bec`; extensive design comment in interface and repository documenting intentional behavior |
| WR-04: Round-trip test missing ID/CreatedAt assertions | Warning | FIXED — commit `476c1aa`; test asserts ID and explicitly asserts CreatedAt nil (DB-generated) with explanatory comment |
| IN-01: notification db field unused | Info | FIXED — commit `4812598`; comment added explaining pre-wire for Phase 23 |
| IN-02: FromDomain CreatedAt omission undocumented | Info | FIXED — commit `2af5521`; comment added in PushSubscriptionFromDomain |
| IN-03: Integration test VAPID config empty/undocumented | Info | FIXED — commit `dec297d`; comment added in test_setup_with_db.go |

---

### Human Verification Required

None — all success criteria are verifiable programmatically. Integration tests (TestPushSubscriptionServiceWithDB) need Docker to execute but compile correctly and are structurally sound.

---

## Gaps Summary

No gaps. All 6 ROADMAP success criteria are verified against the actual codebase:

1. Both migration files exist with the correct schema including all required columns and constraints.
2. VAPID config loads from env; startup guard covers all three keys (including Subject, which was added after code review WR-01).
3. POST /api/push-subscriptions fully implemented with ON CONFLICT upsert scoped to authenticated user.
4. DELETE /api/push-subscriptions fully implemented with IDOR-scoped delete (user_id AND endpoint).
5. GET /api/push-subscriptions fully implemented returning `{subscribed: bool}`.
6. `DeleteByEndpointAdmin` exists in repository and interface; no handler exposes it; integration test exercises it directly on the repository; call-site correctly deferred to Phase 23.

The phase goal is achieved: the backend can store Web Push subscriptions per device, is configured for VAPID-signed pushes (keys loaded from env, fail-fast validation), and has the prune infrastructure (`DeleteByEndpointAdmin`) ready for Phase 23 to wire the 404/410 call-site.

---

_Verified: 2026-05-30_
_Verifier: Claude (gsd-verifier)_
