# Phase 22: Backend Subscription Foundation - Research

**Researched:** 2026-05-30
**Domain:** Go Web Push (VAPID), PostgreSQL schema, Echo HTTP layer
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-03 | System persists push subscriptions per user + device (endpoint + keys) and prunes a subscription when the push service reports it expired/invalid (HTTP 404/410) | DB schema, repository upsert+delete-by-endpoint, webpush-go response inspection |
| SUB-04 | System can report whether the current device already has an active push subscription, so the frontend can show the correct enabled/disabled state | GET /api/push-subscriptions endpoint, boolean/exists response shape |
</phase_requirements>

---

## Summary

Phase 22 is the first push-notification phase and is entirely backend. It introduces two new tables (`push_subscriptions` and `notifications`), VAPID key loading in config, and three HTTP endpoints (POST/DELETE/GET on `/api/push-subscriptions`). No actual push delivery happens here — that is Phase 23. This phase must lay the storage and pruning foundation that Phase 23 will call.

The codebase is structured as a strict four-layer Go monolith (Handler → Service → Repository → GORM). Every new resource follows the same file layout that `charge_handler.go` / `charge_service.go` / `charge_repository.go` / `entity/charge.go` demonstrate. That existing path is the exact template to mirror.

The single new external dependency is `github.com/SherClockHolmes/webpush-go v1.4.0`. It provides VAPID key generation used in config bootstrap and will be called for delivery in Phase 23. Its `SendNotification` returns `(*http.Response, error)`, giving the 404/410 status code the pruning logic needs. No other library is required in this phase.

**Primary recommendation:** Add `webpush-go v1.4.0`, a `VAPIDConfig` sub-struct to `config.go`, two Goose SQL migrations (created via `just migrate-create`), a `PushSubscriptionRepository` + `NotificationRepository` in the repository layer, a thin `PushSubscriptionService`, and a `PushSubscriptionHandler` with three endpoints wired under `/api/push-subscriptions`. The pruning capability belongs in the repository layer as `DeleteByEndpoint`; Phase 23 will call it after inspecting the response status.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Push subscription CRUD | API / Backend | Database / Storage | State is server-side; client only triggers via HTTP |
| VAPID key storage | API / Backend | — | Loaded from env at startup; never sent to the DB |
| VAPID public-key exposure to frontend | API / Backend | — | Phase 24 will serve it via a config endpoint; Phase 22 only loads the keys |
| Stale-subscription pruning | API / Backend | Database / Storage | Delete-by-endpoint is a repository method; called by service after 404/410 response |
| Notification persistence | Database / Storage | API / Backend | notifications table written by service during delivery (Phase 23); Phase 22 only creates the table |
| Browser subscription UI | Browser / Client | — | Phase 24 scope; not in this phase |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `github.com/SherClockHolmes/webpush-go` | v1.4.0 | VAPID key generation, Web Push send | Only actively-maintained Go VAPID library (433 stars, last release Jan 2025). Returns `*http.Response` so 404/410 pruning is straightforward. |
| `gorm.io/gorm` | v1.31.1 (already in go.mod) | ORM for push_subscriptions + notifications tables | Already the repo ORM; no new dependency |
| `github.com/pressly/goose/v3` | v3.26.0 (already in go.mod) | SQL migration runner | Already used; migrations are Goose-style `.sql` files |
| `github.com/labstack/echo/v4` | v4.13.4 (already in go.mod) | HTTP routing and handler framework | Already used for all handlers |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `github.com/joho/godotenv` | v1.5.1 (already in go.mod) | Load VAPID keys from `.env` in dev | Existing config loader already uses this; VAPID vars drop in |

**Version verification:** `github.com/SherClockHolmes/webpush-go` v1.4.0 confirmed via `https://proxy.golang.org/github.com/!sher!clock!holmes/webpush-go/@v/list` on 2026-05-30. [VERIFIED: Go module proxy]

**Installation (new dependency only):**
```bash
cd backend && go get github.com/SherClockHolmes/webpush-go@v1.4.0
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| webpush-go | `github.com/Appboy/webpush-go` (fork) | Appboy fork is unmaintained; SherClockHolmes is the canonical module |
| webpush-go | hand-rolled VAPID JWT + AES-128-GCM | Web Push encryption (RFC 8291) is non-trivial; see "Don't Hand-Roll" |
| `SERIAL` PK | `BIGSERIAL` PK | Existing repo uses `SERIAL` (int) for all tables including charges; stay consistent |

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Phase 24)
    │
    │ POST /api/push-subscriptions  { endpoint, keys: { p256dh, auth } }
    │ DELETE /api/push-subscriptions?endpoint=...
    │ GET /api/push-subscriptions?endpoint=...
    ▼
[Echo AuthMiddleware]  ← JWT / cookie validation → appcontext.GetUserIDFromContext
    │
    ▼
PushSubscriptionHandler
    │  Bind() request body
    │  call service method
    │  HandleServiceError() / c.JSON()
    ▼
PushSubscriptionService
    │  IDOR enforcement (userID from context, never from request body)
    │  business rules (upsert vs insert)
    ▼
PushSubscriptionRepository          NotificationRepository (table only; writes in Phase 23)
    │                                     │
    │  GetTxFromContext(ctx, r.db)         │ (table created now; no reads/writes in Phase 22)
    ▼                                     ▼
PostgreSQL
  push_subscriptions              notifications
  (endpoint UNIQUE index)         (type, entity_type, entity_id, user_id, read, created_at)
```

### Recommended Project Structure

```
backend/
├── internal/
│   ├── config/
│   │   └── config.go           ← add VAPIDConfig sub-struct + 3 env vars
│   ├── domain/
│   │   └── push_subscription.go  ← new: PushSubscription, Notification domain types
│   ├── entity/
│   │   ├── push_subscription.go  ← new: GORM entity + ToDomain/FromDomain
│   │   └── notification.go       ← new: GORM entity
│   ├── repository/
│   │   ├── interfaces.go         ← add PushSubscriptionRepository, NotificationRepository
│   │   ├── push_subscription_repository.go  ← new
│   │   └── notification_repository.go       ← new (stub: table exists, no methods yet)
│   ├── service/
│   │   ├── interfaces.go         ← add PushSubscriptionService
│   │   └── push_subscription_service.go  ← new
│   └── handler/
│       └── push_subscription_handler.go  ← new (3 endpoints)
├── migrations/
│   ├── YYYYMMDDHHMMSS_create_push_subscriptions_table.sql  ← new
│   └── YYYYMMDDHHMMSS_create_notifications_table.sql       ← new
└── cmd/server/main.go           ← wire new repo, service, handler; register routes
```

### Pattern 1: Handler — thin, extract userID from context

```go
// Source: internal/handler/charge_handler.go (verified in codebase)
func (h *PushSubscriptionHandler) Subscribe(c echo.Context) error {
    userID := appcontext.GetUserIDFromContext(c.Request().Context())

    var req domain.SubscribePushRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
    }

    if err := h.pushSubService.Subscribe(c.Request().Context(), userID, &req); err != nil {
        return HandleServiceError(err)
    }
    return c.NoContent(http.StatusNoContent)
}
```

### Pattern 2: Service — business logic, IDOR enforcement

```go
// Source: internal/service/charge_service.go (verified in codebase)
func (s *pushSubscriptionService) Subscribe(ctx context.Context, userID int, req *domain.SubscribePushRequest) error {
    if req.Endpoint == "" {
        return pkgErrors.BadRequest("endpoint is required")
    }
    // Upsert: delete any existing row for this endpoint, then insert
    // (ON CONFLICT DO UPDATE is also valid at the DB level; see migration note)
    return s.pushSubRepo.Upsert(ctx, &domain.PushSubscription{
        UserID:   userID,
        Endpoint: req.Endpoint,
        P256dh:   req.Keys.P256dh,
        Auth:     req.Keys.Auth,
    })
}
```

### Pattern 3: Repository — GetTxFromContext, domain/entity conversion

```go
// Source: internal/repository/charge_repository.go (verified in codebase)
func (r *pushSubscriptionRepository) Upsert(ctx context.Context, sub *domain.PushSubscription) error {
    ent := entity.PushSubscriptionFromDomain(sub)
    return GetTxFromContext(ctx, r.db).
        Where(entity.PushSubscription{Endpoint: ent.Endpoint}).
        Assign(ent).
        FirstOrCreate(ent).Error
    // Alternative: raw SQL with ON CONFLICT (endpoint) DO UPDATE SET ...
}

func (r *pushSubscriptionRepository) DeleteByEndpoint(ctx context.Context, userID int, endpoint string) error {
    return GetTxFromContext(ctx, r.db).
        Where("user_id = ? AND endpoint = ?", userID, endpoint).
        Delete(&entity.PushSubscription{}).Error
}

func (r *pushSubscriptionRepository) ExistsForUser(ctx context.Context, userID int, endpoint string) (bool, error) {
    var count int64
    err := GetTxFromContext(ctx, r.db).
        Model(&entity.PushSubscription{}).
        Where("user_id = ? AND endpoint = ?", userID, endpoint).
        Count(&count).Error
    return count > 0, err
}
```

### Pattern 4: Config — add VAPIDConfig sub-struct

```go
// Source: internal/config/config.go (verified in codebase)
type VAPIDConfig struct {
    PublicKey  string // VAPID_PUBLIC_KEY  — must be base64url-encoded uncompressed EC point
    PrivateKey string // VAPID_PRIVATE_KEY — corresponding private scalar
    Subject    string // VAPID_SUBJECT     — "mailto:admin@example.com" per RFC 8292
}
```

In `Load()`, add:
```go
VAPID: VAPIDConfig{
    PublicKey:  getEnv("VAPID_PUBLIC_KEY", ""),
    PrivateKey: getEnv("VAPID_PRIVATE_KEY", ""),
    Subject:    getEnv("VAPID_SUBJECT", ""),
},
```

Startup validation (in `main.go`, before serving):
```go
if cfg.VAPID.PublicKey == "" || cfg.VAPID.PrivateKey == "" {
    log.Fatalf("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required")
}
```

Keys are generated once with:
```go
privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
```
Run this once locally; store in `.env` and Cloud Run secrets. The public key must be served to the frontend in Phase 24 via a config endpoint.

### Pattern 5: Entity convention (no soft delete for subscriptions)

```go
// Source: entity/charge.go (verified in codebase)
// push_subscriptions are hard-deleted when stale or unsubscribed — no deleted_at column
type PushSubscription struct {
    ID        int        `gorm:"primaryKey;autoIncrement"`
    UserID    int        `gorm:"not null;index"`
    Endpoint  string     `gorm:"not null;uniqueIndex"` // unique across all users
    P256dh    string     `gorm:"not null"`
    Auth      string     `gorm:"not null"`
    CreatedAt *time.Time
}
```

### Anti-Patterns to Avoid

- **Taking userID from the request body for IDOR-sensitive operations:** Always use `appcontext.GetUserIDFromContext(ctx)`. The endpoint is from the client — the userID is never trusted from the body.
- **Soft-deleting subscriptions:** Subscriptions that are stale (404/410) or explicitly removed must be hard-deleted so the same endpoint can be re-registered by a new browser session. No `deleted_at` column.
- **Checking 404/410 in this phase:** Phase 22 only needs `DeleteByEndpoint(ctx, userID, endpoint)` in the repository. The 404/410 detection lives in Phase 23 alongside the actual `webpush.SendNotification` call.
- **Hand-rolling VAPID JWT or Web Push encryption:** `webpush-go` handles RFC 8291 content encryption and RFC 8292 VAPID signing. See "Don't Hand-Roll."
- **Putting VAPID keys in the DB:** Keys are infrastructure secrets; they belong in env/Cloud Run secrets only.
- **Using TIMESTAMP without timezone:** All new columns must use `TIMESTAMPTZ` (the repo migrated all old `TIMESTAMP` columns to `TIMESTAMPTZ` in migration `20260109123226`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VAPID JWT signing (RFC 8292) | Custom `golang-jwt` wrapper with EC key | `webpush.SendNotification` + `webpush.GenerateVAPIDKeys` | VAPID requires a specific `aud` + `exp` JWT profile and base64url-encoded P-256 keys; easy to get wrong |
| Web Push AES-128-GCM encryption (RFC 8291) | Custom ECDH + HKDF + GCM | `webpush.SendNotification` | The encryption derives shared secret via ECDH over P-256 then HKDF-expanded with the `auth` secret; one wrong byte = silent delivery failure |
| Push service HTTP routing | Custom endpoint URL parsing per browser | `webpush.SendNotification` | Firefox (Mozilla), Chrome (FCM), Safari (Apple Push) all use different endpoint hosts but the same protocol; library abstracts this |
| Upsert-by-endpoint | Application-level fetch+delete+insert | `ON CONFLICT (endpoint) DO UPDATE` or GORM `FirstOrCreate` + `Assign` | Race condition if two requests for the same endpoint arrive simultaneously |

**Key insight:** Web Push encryption is a 3-layer protocol (ECDH key agreement, HKDF key derivation, AES-GCM ciphertext construction). Even the reference implementations in other languages had CVEs. Use `webpush-go`.

---

## DB Schema

### push_subscriptions

```sql
-- +goose Up
CREATE TABLE push_subscriptions (
    id         SERIAL PRIMARY KEY,
    user_id    INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT        NOT NULL,
    p256dh     TEXT        NOT NULL,
    auth       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_push_subscriptions_endpoint UNIQUE (endpoint)
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- +goose Down
DROP TABLE IF EXISTS push_subscriptions;
```

**Schema decisions (with rationale):**
- `endpoint UNIQUE` — a browser endpoint is globally unique; if it reappears, it belongs to a possibly-new registration and we upsert.
- No `updated_at` — subscriptions are either created or deleted; there is no update-in-place semantics.
- No soft delete — stale subscriptions must be fully removed so re-registration works.
- `TIMESTAMPTZ` — per repo convention established in migration `20260109123226`. [VERIFIED: codebase]
- `SERIAL` (int) PK — consistent with all other tables (charges, settlements, etc.). [VERIFIED: codebase]
- `p256dh` and `auth` stored as `TEXT` (base64url strings from the browser's `PushSubscription.toJSON()` response) — matches `webpush.Keys{P256dh, Auth}` struct. [CITED: pkg.go.dev/github.com/sherclockholmes/webpush-go]

### notifications

```sql
-- +goose Up
CREATE TABLE notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id   INT         NOT NULL,
    read        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS notifications;
```

**Schema decisions:**
- `type` — notification event type (e.g., `charge.received`, `charge.accepted`, `split.received`). Phase 23 defines the concrete values; Phase 22 only creates the table.
- `entity_type` + `entity_id` — polymorphic reference to the triggering domain object (e.g., `charge`, `transaction`). Two columns preferred over a single jsonb field for index-ability and foreign-key clarity.
- No `updated_at` — only `read` flag changes; it is not worth a full updated_at column. `read` is toggled directly.
- No soft delete — notifications are either read or unread; deletion is not a v1.6 requirement.
- No `message`/`body` column — the frontend deep-links from `entity_type + entity_id`; displayed text is derived in the frontend from type.

---

## Endpoint Contracts

### POST /api/push-subscriptions

**Purpose:** Register (or re-register) a device subscription. Upsert semantics: if the endpoint already exists for any user, replace it for the current user.

**Request body:**
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "<base64url>",
    "auth":   "<base64url>"
  }
}
```

**Response:** `204 No Content` on success.

**Domain type** (`internal/domain/push_subscription.go`):
```go
type SubscribePushRequest struct {
    Endpoint string   `json:"endpoint"`
    Keys     PushKeys `json:"keys"`
}

type PushKeys struct {
    P256dh string `json:"p256dh"`
    Auth   string `json:"auth"`
}

type PushSubscription struct {
    ID        int
    UserID    int
    Endpoint  string
    P256dh    string
    Auth      string
    CreatedAt *time.Time
}
```

**Upsert behavior:** The DB `UNIQUE (endpoint)` constraint enforces one row per endpoint. The service calls `repo.Upsert` which uses `ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, created_at=NOW()`. This handles the edge case where a user logs out, another user logs in on the same device, and re-subscribes with the same endpoint.

### DELETE /api/push-subscriptions

**Purpose:** Remove the authenticated user's subscription for a given endpoint (unsubscribe device).

**Query param:** `?endpoint=<url-encoded endpoint>`

**Response:** `204 No Content` even if no row was found (idempotent).

**Handler pattern:**
```go
func (h *PushSubscriptionHandler) Unsubscribe(c echo.Context) error {
    userID := appcontext.GetUserIDFromContext(c.Request().Context())
    endpoint := c.QueryParam("endpoint")
    if endpoint == "" {
        return echo.NewHTTPError(http.StatusBadRequest, "endpoint is required")
    }
    if err := h.pushSubService.Unsubscribe(c.Request().Context(), userID, endpoint); err != nil {
        return HandleServiceError(err)
    }
    return c.NoContent(http.StatusNoContent)
}
```

### GET /api/push-subscriptions

**Purpose:** Report whether the authenticated user has an active subscription for the given endpoint (for frontend enable/disable toggle).

**Query param:** `?endpoint=<url-encoded endpoint>`

**Response:**
```json
{ "subscribed": true }
```

**Response type** (`internal/domain/push_subscription.go`):
```go
type PushSubscriptionStatusResponse struct {
    Subscribed bool `json:"subscribed"`
}
```

### Route registration (in `cmd/server/main.go`)

```go
pushSubs := api.Group("/push-subscriptions")
pushSubs.POST("", pushSubHandler.Subscribe)
pushSubs.DELETE("", pushSubHandler.Unsubscribe)
pushSubs.GET("", pushSubHandler.Status)
```

All three endpoints are under the `api` group which already uses `authMiddleware.RequireAuth`. [VERIFIED: codebase cmd/server/main.go]

---

## VAPID Key Configuration

### Where to add (verified file path)

File: `backend/internal/config/config.go` [VERIFIED: codebase]

Add a `VAPIDConfig` struct and wire it into `Config`:

```go
type VAPIDConfig struct {
    PublicKey  string // VAPID_PUBLIC_KEY
    PrivateKey string // VAPID_PRIVATE_KEY
    Subject    string // VAPID_SUBJECT — must be "mailto:..." per RFC 8292
}
```

In `Load()`, add to the returned `Config`:
```go
VAPID: VAPIDConfig{
    PublicKey:  getEnv("VAPID_PUBLIC_KEY", ""),
    PrivateKey: getEnv("VAPID_PRIVATE_KEY", ""),
    Subject:    getEnv("VAPID_SUBJECT", ""),
},
```

### Env var names

| Env Var | Example Value | Notes |
|---------|---------------|-------|
| `VAPID_PUBLIC_KEY` | `BLc2...` (base64url) | Exposed to frontend in Phase 24 |
| `VAPID_PRIVATE_KEY` | `abc...` (base64url) | Never exposed to frontend or DB |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Required by RFC 8292; used as JWT `sub` claim |

### Key generation (one-time, dev bootstrap only)

```go
privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
// store in .env:
// VAPID_PUBLIC_KEY=<publicKey>
// VAPID_PRIVATE_KEY=<privateKey>
```

`webpush.GenerateVAPIDKeys()` returns `(privateKey string, publicKey string, err error)`. [VERIFIED: pkg.go.dev/github.com/sherclockholmes/webpush-go]

### DI wiring

The `PushSubscriptionService` (and Phase 23's notification sender) receive `cfg.VAPID` through constructor injection, consistent with how `AuthService` receives `cfg.JWT`. [VERIFIED: codebase, service/auth_service.go pattern]

---

## Pruning on 404/410 — What Goes Where

### Phase 22 responsibility

Provide the **repository method** `DeleteByEndpoint(ctx context.Context, userID int, endpoint string) error` on `PushSubscriptionRepository`. This is the building block for pruning.

Also expose `DeleteByEndpointAdmin(ctx context.Context, endpoint string) error` (no userID check) — Phase 23 needs to prune by endpoint regardless of which user owns the subscription when the push service rejects it.

### Phase 23 responsibility (out of scope here)

After calling `webpush.SendNotification(payload, sub, opts)`:
```go
resp, err := webpush.SendNotification(payload, sub, opts)
if err == nil && (resp.StatusCode == 404 || resp.StatusCode == 410) {
    _ = pushSubRepo.DeleteByEndpointAdmin(ctx, sub.Endpoint)
}
```

`webpush.SendNotification` returns `(*http.Response, error)`. The `StatusCode` field on the response is the raw HTTP status from the push service. [VERIFIED: pkg.go.dev/github.com/sherclockholmes/webpush-go]

### Summary: what Phase 22 must deliver

| Item | Phase |
|------|-------|
| `push_subscriptions` table migration | 22 |
| `notifications` table migration | 22 |
| `PushSubscriptionRepository` interface + impl | 22 |
| `PushSubscriptionRepository.DeleteByEndpointAdmin` method | 22 |
| `NotificationRepository` interface (stub; no methods yet) | 22 |
| `PushSubscriptionService` + 3 endpoint handlers | 22 |
| VAPID config loading + startup validation | 22 |
| webpush-go added to go.mod | 22 |
| Actual `SendNotification` call | 23 |
| 404/410 pruning call-site | 23 |

---

## Layered Wiring — Closest Analog

Use `charge` as the template. Exact file-to-file mapping:

| New File | Mirrors |
|----------|---------|
| `internal/domain/push_subscription.go` | `internal/domain/charge.go` |
| `internal/entity/push_subscription.go` | `internal/entity/charge.go` |
| `internal/entity/notification.go` | `internal/entity/charge.go` (simple) |
| `internal/repository/push_subscription_repository.go` | `internal/repository/charge_repository.go` |
| `internal/repository/notification_repository.go` | `internal/repository/user_settings_repository.go` (simple stub) |
| `internal/service/push_subscription_service.go` | `internal/service/charge_service.go` |
| `internal/handler/push_subscription_handler.go` | `internal/handler/charge_handler.go` |

**Dependency injection (in `cmd/server/main.go`):**
1. Add `PushSubscription PushSubscriptionRepository` and `Notification NotificationRepository` to `repository.Repositories`.
2. Instantiate `repository.NewPushSubscriptionRepository(db)` and `repository.NewNotificationRepository(db)` in the repos initializer.
3. Add `PushSubscription PushSubscriptionService` to `service.Services`.
4. Instantiate `service.NewPushSubscriptionService(repos, cfg)` (needs `cfg.VAPID` for future Phase 23 use; wire it now).
5. Create `pushSubHandler := handler.NewPushSubscriptionHandler(services)`.
6. Register routes on the `api` group.

[VERIFIED: codebase — cmd/server/main.go wiring pattern confirmed]

---

## Common Pitfalls

### Pitfall 1: endpoint uniqueness scope

**What goes wrong:** Making the unique index on `(user_id, endpoint)` instead of just `endpoint`. Then if user A has a subscription for an endpoint and logs out, and user B logs in on the same device, the upsert fails or creates a second row for the same endpoint. Different push service instances receive duplicate notifications.
**Why it happens:** Feels natural to scope data per user.
**How to avoid:** Unique constraint is on `endpoint` alone. The upsert updates `user_id` when the same endpoint reappears.
**Warning signs:** Two rows in `push_subscriptions` with the same `endpoint` value.

### Pitfall 2: VAPID keys base64 encoding mismatch

**What goes wrong:** App starts with keys but `SendNotification` returns 401 from the push service. Root cause: keys stored without padding or with standard base64 instead of base64url.
**Why it happens:** Go's `encoding/base64` has both `StdEncoding` (+ and /) and `URLEncoding` (- and _). VAPID requires URL encoding without padding.
**How to avoid:** `webpush.GenerateVAPIDKeys()` returns correctly encoded strings. Store them verbatim. Do not run through `base64.StdEncoding.EncodeToString`.
**Warning signs:** 401 responses from the push service; VAPID JWT validation errors.

### Pitfall 3: startup without VAPID keys

**What goes wrong:** App starts in production without env vars set; Phase 23 panics or silently skips delivery.
**Why it happens:** Config struct has zero-value defaults; `getEnv("VAPID_PUBLIC_KEY", "")` returns empty string without error.
**How to avoid:** Add a startup validation block in `main.go` that `log.Fatalf` if keys are empty.
**Warning signs:** Notifications silently not delivered in production.

### Pitfall 4: handler reads endpoint from request body for DELETE

**What goes wrong:** `c.Bind(&req)` on a DELETE endpoint with no body — Echo returns an empty struct. Then `DeleteByEndpoint` with empty endpoint deletes nothing or everything.
**Why it happens:** DELETE requests conventionally have no body; the endpoint should be a query param.
**How to avoid:** Use `c.QueryParam("endpoint")` for DELETE and GET. Use `c.Bind(&req)` only for POST (which has a JSON body).
**Warning signs:** DELETE returns 204 but subscription still exists.

### Pitfall 5: TIMESTAMP vs TIMESTAMPTZ in new migrations

**What goes wrong:** New table created with `TIMESTAMP` columns. The repo ran a mass migration to `TIMESTAMPTZ` for existing tables but new tables are not automatically covered.
**Why it happens:** Copy-pasting old migration templates.
**How to avoid:** Always use `TIMESTAMPTZ` in new migration files. The `20260109123226_timestamp_with_timezone.sql` migration is the canonical reference.
**Warning signs:** `psql \d push_subscriptions` shows `timestamp without time zone`.

---

## Code Examples

### webpush-go: VAPID key generation

```go
// Source: pkg.go.dev/github.com/sherclockholmes/webpush-go
privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
if err != nil {
    log.Fatal(err)
}
fmt.Printf("VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\n", publicKey, privateKey)
```

### webpush-go: send notification with 404/410 check (Phase 23 preview)

```go
// Source: pkg.go.dev/github.com/sherclockholmes/webpush-go
resp, err := webpush.SendNotification(payload, &webpush.Subscription{
    Endpoint: sub.Endpoint,
    Keys: webpush.Keys{
        Auth:   sub.Auth,
        P256dh: sub.P256dh,
    },
}, &webpush.Options{
    Subscriber:      cfg.VAPID.Subject,
    VAPIDPublicKey:  cfg.VAPID.PublicKey,
    VAPIDPrivateKey: cfg.VAPID.PrivateKey,
    TTL:             30,
})
if err == nil && (resp.StatusCode == 404 || resp.StatusCode == 410) {
    // prune stale subscription
    _ = pushSubRepo.DeleteByEndpointAdmin(ctx, sub.Endpoint)
}
```

### GORM upsert by endpoint (raw SQL path, safest)

```go
// Source: pattern derived from charge_repository.go + gorm.io/gorm v1.31.1 docs
result := GetTxFromContext(ctx, r.db).Exec(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
    VALUES (?, ?, ?, ?, NOW())
    ON CONFLICT (endpoint) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            p256dh  = EXCLUDED.p256dh,
            auth    = EXCLUDED.auth,
            created_at = NOW()
`, ent.UserID, ent.Endpoint, ent.P256dh, ent.Auth)
return result.Error
```

### Swagger annotations for POST /api/push-subscriptions

```go
// Subscribe godoc
// @Summary      Register a Web Push subscription
// @Description  Upserts a push subscription for the authenticated user's device
// @Tags         push-subscriptions
// @Accept       json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        subscription  body  domain.SubscribePushRequest  true  "Push subscription"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/push-subscriptions [post]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FCM/GCM server key (Firebase Cloud Messaging V1 legacy) | VAPID (RFC 8292) | 2023 (Chrome dropped legacy GCM) | webpush-go v1.x uses VAPID by default; `LegacyGCMAuthorization` field exists but is not needed |
| VAPID JWT with custom crypto | `webpush.GenerateVAPIDKeys()` + `SendNotification` | 2017+ | Library handles P-256 ECDH and AES-128-GCM |

**Deprecated/outdated:**
- GCM server key auth: Chrome removed support. Not relevant for this project.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 23 will call `DeleteByEndpointAdmin` after a 404/410 response from `SendNotification`. Phase 22 needs to expose this method so Phase 23 can call it. | Pruning section | Low — the method is trivial to add in Phase 23 if omitted from 22, but having it now is cleaner |
| A2 | Soft deletes are NOT appropriate for push subscriptions (hard delete instead) | DB Schema | Low — subscriptions are re-registerable; a soft-deleted row with the same endpoint would violate the UNIQUE constraint if re-inserted |
| A3 | `VAPID_SUBJECT` is a required startup parameter | Config section | Low — `webpush-go` treats it as the JWT `sub` claim; push services log it but do not enforce it in all browsers; failing fast is safe |

**All other claims were verified against the codebase or official sources.**

---

## Open Questions

1. **Startup behavior when VAPID keys are absent**
   - What we know: Config has empty-string defaults; nothing in the codebase today enforces required fields.
   - What's unclear: Should the app start in a "degraded" mode (push disabled) or hard-fail?
   - Recommendation: Hard-fail with `log.Fatalf` — consistent with how missing `JWT_SECRET` would silently produce an insecure app. VAPID keys are production secrets that must be present.

2. **`NotificationRepository` methods needed in Phase 22**
   - What we know: `notifications` table must exist now; actual writes happen in Phase 23.
   - What's unclear: Should Phase 22 stub out any `NotificationRepository` interface methods to satisfy mockery?
   - Recommendation: Define the interface with zero methods in Phase 22 (empty interface is valid Go); add methods in Phase 23 when their exact signatures are known.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Go toolchain | Building backend | Yes | 1.24.7 (go.mod requires 1.24.4+) | — |
| Docker | testcontainers integration tests | Installed | 29.3.1 | Docker daemon not confirmed running; integration tests require daemon |
| PostgreSQL (direct) | DB access outside containers | Not reachable | — | Use testcontainers (already the project pattern) |
| `webpush-go v1.4.0` | New dependency | Not yet in go.mod | — | `go get` during Wave 0 |
| `goose` CLI | Migration creation/run | Available via `just` | v3.26.0 (in go.mod) | — |
| VAPID keys | App startup | Not set (new) | — | Generate with `webpush.GenerateVAPIDKeys()` in a one-time script |

**Missing dependencies with no fallback:**
- VAPID key env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) — must be generated and added to `.env` before the app starts.

**Missing dependencies with fallback:**
- Docker daemon for integration tests — if daemon is not running, `just test-integration` will fail; tests can be deferred to a machine with Docker running.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `testify/suite` v1.11.1 + testcontainers-go v0.40.0 |
| Config file | None — test tags: `//go:build integration` (`-tags=integration`) |
| Quick run command | `just test-unit` (unit tests, no DB) |
| Full suite command | `just test-integration` (requires Docker) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUB-03 | POST /api/push-subscriptions stores subscription in DB | integration | `go test -tags=integration ./internal/service/ -run TestPushSubscriptionServiceWithDB` | No — Wave 0 |
| SUB-03 | POST /api/push-subscriptions upserts when endpoint already exists | integration | same | No — Wave 0 |
| SUB-03 | `DeleteByEndpoint` removes the correct row | integration | same | No — Wave 0 |
| SUB-03 | `DeleteByEndpointAdmin` removes row without userID check | integration | same | No — Wave 0 |
| SUB-04 | GET returns `{"subscribed":true}` when subscription exists | integration | same | No — Wave 0 |
| SUB-04 | GET returns `{"subscribed":false}` when subscription absent | integration | same | No — Wave 0 |
| SUB-03 | DELETE removes subscription; GET then returns false | integration | same | No — Wave 0 |
| SUB-03 | App starts successfully with VAPID keys present | unit/build | `go build ./cmd/server/` | No — verified by build |

### Sampling Rate

- **Per task commit:** `just test-unit` (service unit tests with mocks)
- **Per wave merge:** `just test-integration` (integration tests with real DB via testcontainers)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `internal/service/push_subscription_service_test.go` — covers SUB-03, SUB-04 (integration suite embedding `ServiceTestWithDBSuite`)
- [ ] `ServiceTestWithDBSuite.SetupTest` in `test_setup_with_db.go` must be extended to include `PushSubscriptionRepository` and `NotificationRepository` fields

*(Both new test files follow the existing `ServiceTestWithDBSuite` pattern — no new test framework needed.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT validated by existing `RequireAuth` middleware; no new auth logic |
| V3 Session Management | no | Stateless API; session handled by existing JWT middleware |
| V4 Access Control | yes | IDOR: `userID` from `appcontext`, never from request body; DELETE scoped to `user_id = ? AND endpoint = ?` |
| V5 Input Validation | yes | Endpoint non-empty check in service; `p256dh` and `auth` treated as opaque strings (no parsing in Phase 22) |
| V6 Cryptography | yes | VAPID keys are secrets — never logged, never returned in API responses, never stored in DB |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User A deletes User B's subscription via DELETE endpoint | Tampering / IDOR | `WHERE user_id = ? AND endpoint = ?` — scoped DELETE; user_id from context |
| Endpoint enumeration / brute-force GET to discover subscriptions | Information Disclosure | Endpoint is a full URL (128+ chars); impractical to guess; rate limiting is out of scope |
| VAPID private key leakage in logs | Information Disclosure | Never log `cfg.VAPID.PrivateKey`; config sub-struct should have no `String()` method |
| Push payload injection (Phase 23 concern) | Tampering | JSON payload is constructed server-side from the DB record; no user-controlled fields in the push body |

---

## Sources

### Primary (HIGH confidence)

- Go module proxy `proxy.golang.org/github.com/!sher!clock!holmes/webpush-go/@v/list` — confirmed v1.4.0 as latest
- `pkg.go.dev/github.com/sherclockholmes/webpush-go` — exported API: `SendNotification(*http.Response, error)`, `GenerateVAPIDKeys()`, `Options` struct, `Keys` struct
- Codebase (verified by direct file reads):
  - `backend/internal/config/config.go` — Config struct pattern, env loading
  - `backend/internal/handler/charge_handler.go` — handler pattern
  - `backend/internal/service/charge_service.go` — service pattern
  - `backend/internal/repository/charge_repository.go` — repository pattern
  - `backend/internal/entity/charge.go` — entity/domain split pattern
  - `backend/cmd/server/main.go` — DI wiring + route registration
  - `backend/migrations/20260414000000_create_charges_table.sql` — migration pattern (TIMESTAMPTZ, SERIAL)
  - `backend/migrations/20260109123226_timestamp_with_timezone.sql` — TIMESTAMPTZ convention
  - `backend/internal/service/test_setup_with_db.go` — integration test suite pattern
  - `backend/go.mod` — current dependencies

### Secondary (MEDIUM confidence)

- `github.com/SherClockHolmes/webpush-go` GitHub page — maintenance status (last release Jan 2025, 433 stars)
- `github.com/topics/webpush?l=go` — ecosystem survey confirming webpush-go as dominant Go VAPID library

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — webpush-go version verified via module proxy; all other dependencies are already in go.mod
- Architecture: HIGH — patterns verified by reading actual codebase files
- DB schema: HIGH — schema conventions verified against migration history
- Pitfalls: HIGH — derived from code reading + RFC awareness of VAPID encoding requirements

**Research date:** 2026-05-30
**Valid until:** 2026-08-30 (webpush-go is stable; Go ecosystem changes slowly)
