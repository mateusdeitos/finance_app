---
phase: 22-backend-subscription-foundation
reviewed: 2026-05-30T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - backend/cmd/server/main.go
  - backend/internal/config/config.go
  - backend/internal/domain/push_subscription.go
  - backend/internal/entity/push_subscription.go
  - backend/internal/entity/notification.go
  - backend/internal/repository/interfaces.go
  - backend/internal/repository/push_subscription_repository.go
  - backend/internal/repository/notification_repository.go
  - backend/internal/service/interfaces.go
  - backend/internal/service/push_subscription_service.go
  - backend/internal/service/test_setup_with_db.go
  - backend/internal/handler/push_subscription_handler.go
  - backend/migrations/20260530125301_create_push_subscriptions_table.sql
  - backend/migrations/20260530125310_create_notifications_table.sql
  - backend/internal/entity/push_subscription_test.go
  - backend/internal/service/push_subscription_service_test.go
  - backend/internal/handler/push_subscription_handler_test.go
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-05-30
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

This phase adds the push-subscription and notification database foundations: two new migrations, entity/domain/repository/service/handler layers for push subscriptions, and an empty notification repository scaffolding for Phase 23. The overall structure follows project conventions well. IDOR scoping is correctly applied throughout the user-facing path. `DeleteByEndpointAdmin` is cleanly separated from the service interface and has no handler route. VAPID private key is stored only in a struct field and is not logged or returned in any response. SQL parameters are positionally bound via GORM's `Exec` (preventing injection).

One critical finding: `created_at` is unconditionally reset to `NOW()` on every upsert conflict, destroying the original subscription timestamp. Four warnings cover missing VAPID Subject validation, a SSRF-readiness gap, a semantic data-loss issue in the upsert, and a test coverage gap on the round-trip conversion.

---

## Critical Issues

### CR-01: `created_at` overwritten on every upsert conflict — data loss

**File:** `backend/internal/repository/push_subscription_repository.go:24-33`

**Issue:** The `ON CONFLICT (endpoint) DO UPDATE` clause unconditionally sets `created_at = NOW()`. When a browser re-registers an existing subscription (e.g., after a service-worker update), the original subscription timestamp is silently erased. `created_at` is semantically "when was this subscription first established" — overwriting it on every re-registration makes auditing and TTL-based pruning unreliable in Phase 23 (the pruner would see every subscription as freshly created).

**Fix:** Preserve the original `created_at` on conflict; only update the mutable device-key fields:

```sql
ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        p256dh  = EXCLUDED.p256dh,
        auth    = EXCLUDED.auth
    -- created_at intentionally omitted: preserve original timestamp
```

If a "last-seen" timestamp is needed for pruning, add a separate `updated_at` column rather than reusing `created_at`.

---

## Warnings

### WR-01: VAPID `Subject` not validated at startup — silent misconfiguration

**File:** `backend/cmd/server/main.go:49-51`

**Issue:** The startup guard checks `PublicKey` and `PrivateKey` but not `Subject`. Per RFC 8292, the VAPID JWT must carry a `sub` claim (a `mailto:` or HTTPS contact URI). Push services (FCM, Mozilla) reject requests without it. An empty `Subject` will silently cause all push deliveries to fail in Phase 23 with no startup-time warning.

**Fix:**
```go
if cfg.VAPID.PublicKey == "" || cfg.VAPID.PrivateKey == "" || cfg.VAPID.Subject == "" {
    log.Fatalf("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT are required")
}
```

---

### WR-02: No endpoint URL validation — SSRF readiness gap for Phase 23

**File:** `backend/internal/service/push_subscription_service.go:26-41`

**Issue:** The `endpoint` field is accepted verbatim from the request body and stored without any URL validation. In Phase 23 the server will issue HTTP requests to these stored endpoints to deliver push payloads. An attacker who can authenticate can store an arbitrary URL (e.g., `http://169.254.169.254/latest/meta-data/`) and trigger server-side requests to internal infrastructure when the push delivery loop runs. The validation gap exists now (at data ingestion time), and fixing it after Phase 23 is wired up requires a data-cleanup migration.

**Fix:** Validate the endpoint is a well-formed HTTPS URL in `Subscribe` before persisting:

```go
import "net/url"

func validateEndpoint(endpoint string) error {
    u, err := url.Parse(endpoint)
    if err != nil || u.Scheme != "https" || u.Host == "" {
        return pkgErrors.BadRequest("endpoint must be a valid HTTPS URL")
    }
    return nil
}
```

Call `validateEndpoint(req.Endpoint)` at the top of `Subscribe`, before the `Upsert` call.

---

### WR-03: Upsert reassigns endpoint ownership silently — IDOR-adjacent information leak

**File:** `backend/internal/repository/push_subscription_repository.go:22-33`

**Issue:** The `ON CONFLICT DO UPDATE` replaces `user_id` with the new caller's `user_id`. This is the documented intentional behaviour (device re-registration). However, it creates a covert side-channel: user A can learn that a specific endpoint previously belonged to user B by subscribing with that endpoint and observing that `Status` for user B returns `false`. In a shared-device scenario an attacker can also silently hijack another user's push channel by subscribing with a known endpoint, causing that device to receive the attacker's notifications instead of the original owner's. This is not blocked by the service or handler layers.

This is acknowledged as intentional design (the integration test `Test_Subscribe_Upsert_ReplacesRow` explicitly tests it), but the risk is not documented anywhere in the interface comment or the service comment.

**Fix (minimum):** Add a code comment to `PushSubscriptionRepository.Upsert` and `pushSubscriptionService.Subscribe` explicitly documenting that endpoint ownership transfer is intentional and the accepted risk. If the threat model does not allow silent takeover, the upsert should reject conflicts where `user_id != EXCLUDED.user_id` (returning a distinct error the client can handle by unsubscribing first).

---

### WR-04: `TestPushSubscriptionRoundTrip` does not assert `ID` round-trip — silent regression risk

**File:** `backend/internal/entity/push_subscription_test.go:11-28`

**Issue:** `PushSubscriptionFromDomain` sets `ID: d.ID` (line 31 of `push_subscription.go`) but the round-trip test never asserts `got.ID == d.ID`. If a future refactor accidentally drops the `ID` assignment (e.g., when wiring auto-increment behaviour differently), the test passes silently. Similarly, `CreatedAt` is not round-trip asserted even though it is included in `ToDomain()`.

**Fix:** Extend the test assertions:

```go
assert.Equal(t, d.ID, got.ID)
assert.Equal(t, d.CreatedAt, got.CreatedAt)
```

---

## Info

### IN-01: `notificationRepository` holds a `db` field it can never use

**File:** `backend/internal/repository/notification_repository.go:5-12`

**Issue:** `notificationRepository` declares a `db *gorm.DB` field but `NotificationRepository` is an empty interface. The `db` field is allocated, held in memory, and never referenced. When Phase 23 adds methods, the struct will be extended correctly, but until then the field is dead weight and could mislead reviewers into thinking the repository has behaviour.

**Fix:** Either remove the `db` field from the struct and only re-add it when the first method is implemented, or add a `//nolint:unused` comment explaining it is pre-wired for Phase 23.

---

### IN-02: `PushSubscriptionFromDomain` intentionally zeroes `CreatedAt` but this is not commented

**File:** `backend/internal/entity/push_subscription.go:29-37`

**Issue:** `PushSubscriptionFromDomain` does not copy `CreatedAt` from the domain object (unlike `ToDomain()` which does). This is correct — the `created_at` column defaults to `NOW()` in the DB and is not caller-supplied. But the asymmetry is undocumented and may surprise the next developer who expects a symmetric pair.

**Fix:** Add a brief comment:

```go
// CreatedAt is intentionally omitted; the database DEFAULT NOW() applies on insert.
```

---

### IN-03: Integration service test wires `PushSubscriptionService` with empty VAPID config

**File:** `backend/internal/service/test_setup_with_db.go:127-158`

**Issue:** `suite.Config` is constructed with only a `JWT` sub-struct; `VAPID` fields are zero-valued. `NewPushSubscriptionService` stores this empty config for future use. The current Phase 22 tests pass because no code path reads the VAPID keys, but if a Phase 23 test accidentally runs in the same suite without patching the config, it will silently send empty VAPID credentials. There is no comment warning that the config fixture is intentionally incomplete.

**Fix:** Add a comment in `test_setup_with_db.go` noting that `VAPID` is intentionally unpopulated for Phase 22 and must be filled before any Phase 23 send-path integration tests run:

```go
// VAPID is intentionally empty: Phase 22 tests do not exercise send paths.
// Phase 23 integration tests must supply valid VAPID keys via suite.Config.VAPID.
```

---

_Reviewed: 2026-05-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
