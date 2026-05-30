# Phase 22: Backend Subscription Foundation - Pattern Map

**Mapped:** 2026-05-30
**Files analyzed:** 13 new/modified files
**Analogs found:** 13 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `internal/domain/push_subscription.go` | model | request-response | `internal/domain/charge.go` | exact |
| `internal/entity/push_subscription.go` | model | CRUD | `internal/entity/charge.go` | exact |
| `internal/entity/notification.go` | model | CRUD | `internal/entity/charge.go` | role-match (simpler) |
| `internal/repository/interfaces.go` (modified) | config | — | `internal/repository/interfaces.go` | exact |
| `internal/repository/push_subscription_repository.go` | repository | CRUD | `internal/repository/charge_repository.go` | exact |
| `internal/repository/notification_repository.go` | repository | CRUD (stub) | `internal/repository/user_settings_repository.go` | role-match |
| `internal/service/interfaces.go` (modified) | config | — | `internal/service/interfaces.go` | exact |
| `internal/service/push_subscription_service.go` | service | request-response | `internal/service/charge_service.go` | exact |
| `internal/handler/push_subscription_handler.go` | handler | request-response | `internal/handler/charge_handler.go` | exact |
| `internal/config/config.go` (modified) | config | — | `internal/config/config.go` (JWTConfig/OAuthConfig sub-structs) | exact |
| `migrations/<timestamp>_create_push_subscriptions_table.sql` | migration | CRUD | `migrations/20260414000000_create_charges_table.sql` | exact |
| `migrations/<timestamp>_create_notifications_table.sql` | migration | CRUD | `migrations/20260414000000_create_charges_table.sql` | role-match |
| `cmd/server/main.go` (modified) | config | — | `cmd/server/main.go` (Charge wiring block) | exact |
| `internal/service/push_subscription_service_test.go` | test | CRUD | `internal/service/test_setup_with_db.go` + charge integration tests | exact |
| `internal/service/test_setup_with_db.go` (modified) | test | — | `internal/service/test_setup_with_db.go` | exact |
| `internal/handler/push_subscription_handler_test.go` | test | request-response | `internal/handler/charge_handler_test.go` | exact |

---

## Pattern Assignments

### `internal/domain/push_subscription.go` (model, request-response)

**Analog:** `internal/domain/charge.go`

**Imports pattern** (lines 1-6):
```go
package domain

import (
	"time"
)
```

**Core domain type pattern** (lines 35-89 in charge.go — struct + request types + response types):
```go
// Domain struct — no GORM tags; plain Go struct with json tags for API serialization
type PushSubscription struct {
	ID        int        `json:"id"`
	UserID    int        `json:"user_id"`
	Endpoint  string     `json:"endpoint"`
	P256dh    string     `json:"p256dh"`
	Auth      string     `json:"auth"`
	CreatedAt *time.Time `json:"created_at"`
}

// Request types carry json tags for c.Bind() in the handler
type SubscribePushRequest struct {
	Endpoint string   `json:"endpoint"`
	Keys     PushKeys `json:"keys"`
}

type PushKeys struct {
	P256dh string `json:"p256dh"`
	Auth   string `json:"auth"`
}

// Response types carry json tags for c.JSON()
type PushSubscriptionStatusResponse struct {
	Subscribed bool `json:"subscribed"`
}
```

**Note:** No `ChargeStatus`-style enum needed. No `ValidateTransition` method. Keep domain file minimal.

---

### `internal/entity/push_subscription.go` (model, CRUD)

**Analog:** `internal/entity/charge.go` (lines 1-75)

**Imports pattern** (lines 1-9 of charge.go):
```go
package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)
```

**Core entity struct pattern** (lines 10-25 of charge.go — GORM tags, pointer fields for nullable columns):
```go
// GORM struct — gorm tags drive column behavior; domain types never leak here
type PushSubscription struct {
	ID        int        `gorm:"primaryKey;autoIncrement"`
	UserID    int        `gorm:"not null;index"`
	Endpoint  string     `gorm:"not null;uniqueIndex"`
	P256dh    string     `gorm:"not null"`
	Auth      string     `gorm:"not null"`
	CreatedAt *time.Time
}
```

**Note:** No `BeforeCreate`/`BeforeUpdate` hooks needed (no `updated_at`). No soft delete (`gorm.Model` must NOT be embedded).

**Domain conversion pattern** (lines 39-75 of charge.go):
```go
func (e *PushSubscription) ToDomain() *domain.PushSubscription {
	return &domain.PushSubscription{
		ID:        e.ID,
		UserID:    e.UserID,
		Endpoint:  e.Endpoint,
		P256dh:    e.P256dh,
		Auth:      e.Auth,
		CreatedAt: e.CreatedAt,
	}
}

func PushSubscriptionFromDomain(d *domain.PushSubscription) *PushSubscription {
	return &PushSubscription{
		ID:       d.ID,
		UserID:   d.UserID,
		Endpoint: d.Endpoint,
		P256dh:   d.P256dh,
		Auth:     d.Auth,
	}
}
```

---

### `internal/entity/notification.go` (model, CRUD — stub)

**Analog:** `internal/entity/charge.go` (simpler; only the struct + ToDomain/FromDomain needed)

**Core entity struct pattern:**
```go
package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
)

type Notification struct {
	ID         int        `gorm:"primaryKey;autoIncrement"`
	UserID     int        `gorm:"not null;index"`
	Type       string     `gorm:"not null"`
	EntityType string     `gorm:"not null"`
	EntityID   int        `gorm:"not null"`
	Read       bool       `gorm:"not null;default:false"`
	CreatedAt  *time.Time
}
```

**Note:** No `gorm.io/gorm` import needed if no hooks. Domain type (`domain.Notification`) is defined in `internal/domain/push_subscription.go` or a new `internal/domain/notification.go`. Add `ToDomain`/`FromDomain` stubs now to keep the pattern consistent even though Phase 23 fills in the implementations.

---

### `internal/repository/interfaces.go` (modified)

**Analog:** `internal/repository/interfaces.go` — the `ChargeRepository` block (lines 97-120) and the `Repositories` struct (lines 106-120)

**Interface definition pattern** (lines 97-104 of interfaces.go):
```go
// ChargeRepository — copy this block's shape for PushSubscriptionRepository
type ChargeRepository interface {
	Create(ctx context.Context, charge *domain.Charge) (*domain.Charge, error)
	GetByID(ctx context.Context, id int) (*domain.Charge, error)
	Search(ctx context.Context, options domain.ChargeSearchOptions) ([]*domain.Charge, error)
	Update(ctx context.Context, charge *domain.Charge) error
	Count(ctx context.Context, options domain.ChargeSearchOptions) (int64, error)
	ConditionalAccept(ctx context.Context, id int) error
}
```

**New interfaces to add:**
```go
type PushSubscriptionRepository interface {
	Upsert(ctx context.Context, sub *domain.PushSubscription) error
	DeleteByEndpoint(ctx context.Context, userID int, endpoint string) error
	DeleteByEndpointAdmin(ctx context.Context, endpoint string) error
	ExistsForUser(ctx context.Context, userID int, endpoint string) (bool, error)
}

// NotificationRepository — zero methods in Phase 22; add methods in Phase 23
type NotificationRepository interface{}
```

**Repositories struct addition pattern** (lines 106-120 of interfaces.go):
```go
// Repositories contains all repository interfaces
type Repositories struct {
	// ... existing fields unchanged ...
	Charge                ChargeRepository
	// Add these two:
	PushSubscription      PushSubscriptionRepository
	Notification          NotificationRepository
}
```

**After editing:** Run `just generate-mocks` — mockery reads interfaces.go and generates `mocks/MockPushSubscriptionRepository.go` and `mocks/MockNotificationRepository.go`.

---

### `internal/repository/push_subscription_repository.go` (repository, CRUD)

**Analog:** `internal/repository/charge_repository.go` (lines 1-129)

**Imports pattern** (lines 1-11 of charge_repository.go):
```go
package repository

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)
```

**Constructor pattern** (lines 17-23 of charge_repository.go):
```go
type chargeRepository struct {
	db *gorm.DB
}

func NewChargeRepository(db *gorm.DB) ChargeRepository {
	return &chargeRepository{db: db}
}
```

**Core repository method pattern** (lines 25-44 of charge_repository.go — `GetTxFromContext` + entity conversion):
```go
// Every method gets tx from context so it automatically joins any active transaction
func (r *chargeRepository) Create(ctx context.Context, charge *domain.Charge) (*domain.Charge, error) {
	ent := entity.ChargeFromDomain(charge)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}
```

**Raw SQL upsert pattern** (RESEARCH.md §GORM upsert — preferred over FirstOrCreate for race-safety):
```go
func (r *pushSubscriptionRepository) Upsert(ctx context.Context, sub *domain.PushSubscription) error {
	ent := entity.PushSubscriptionFromDomain(sub)
	result := GetTxFromContext(ctx, r.db).Exec(`
		INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
		VALUES (?, ?, ?, ?, NOW())
		ON CONFLICT (endpoint) DO UPDATE
			SET user_id    = EXCLUDED.user_id,
			    p256dh     = EXCLUDED.p256dh,
			    auth       = EXCLUDED.auth,
			    created_at = NOW()
	`, ent.UserID, ent.Endpoint, ent.P256dh, ent.Auth)
	return result.Error
}
```

**Scoped delete pattern** (count-check not needed; DELETE WHERE is idempotent):
```go
func (r *pushSubscriptionRepository) DeleteByEndpoint(ctx context.Context, userID int, endpoint string) error {
	return GetTxFromContext(ctx, r.db).
		Where("user_id = ? AND endpoint = ?", userID, endpoint).
		Delete(&entity.PushSubscription{}).Error
}

// DeleteByEndpointAdmin omits userID check — used by Phase 23 pruning after 404/410 response
func (r *pushSubscriptionRepository) DeleteByEndpointAdmin(ctx context.Context, endpoint string) error {
	return GetTxFromContext(ctx, r.db).
		Where("endpoint = ?", endpoint).
		Delete(&entity.PushSubscription{}).Error
}
```

**Count-based exists pattern** (lines 103-109 of charge_repository.go — `Model()` + `Count()`):
```go
func (r *pushSubscriptionRepository) ExistsForUser(ctx context.Context, userID int, endpoint string) (bool, error) {
	var count int64
	err := GetTxFromContext(ctx, r.db).
		Model(&entity.PushSubscription{}).
		Where("user_id = ? AND endpoint = ?", userID, endpoint).
		Count(&count).Error
	return count > 0, err
}
```

---

### `internal/repository/notification_repository.go` (repository, CRUD — stub)

**Analog:** `internal/repository/user_settings_repository.go` (lines 1-38 — smallest real repository)

**Pattern (minimal stub):**
```go
package repository

import "gorm.io/gorm"

type notificationRepository struct {
	db *gorm.DB
}

func NewNotificationRepository(db *gorm.DB) NotificationRepository {
	return &notificationRepository{db: db}
}

// No methods in Phase 22 — add in Phase 23 when signatures are known
```

---

### `internal/service/interfaces.go` (modified)

**Analog:** `internal/service/interfaces.go` — the `ChargeService` block (lines 77-84) and `Services` struct (lines 92-103)

**Interface definition pattern** (lines 77-84 of service/interfaces.go):
```go
// ChargeService — copy this block's shape for PushSubscriptionService
type ChargeService interface {
	Create(ctx context.Context, callerUserID int, req *domain.CreateChargeRequest) (*domain.Charge, error)
	Cancel(ctx context.Context, callerUserID, chargeID int) error
	// ...
}
```

**New interface to add:**
```go
type PushSubscriptionService interface {
	Subscribe(ctx context.Context, userID int, req *domain.SubscribePushRequest) error
	Unsubscribe(ctx context.Context, userID int, endpoint string) error
	Status(ctx context.Context, userID int, endpoint string) (*domain.PushSubscriptionStatusResponse, error)
}
```

**Services struct addition pattern** (lines 92-103 of service/interfaces.go):
```go
// Services contains all service interfaces
type Services struct {
	// ... existing fields unchanged ...
	Charge         ChargeService
	// Add:
	PushSubscription PushSubscriptionService
}
```

**After editing:** Run `just generate-mocks`.

---

### `internal/service/push_subscription_service.go` (service, request-response)

**Analog:** `internal/service/charge_service.go` (lines 1-29)

**Imports pattern** (lines 1-10 of charge_service.go):
```go
package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)
```

**Constructor pattern** (lines 11-29 of charge_service.go — lowercase struct, interface return):
```go
type pushSubscriptionService struct {
	pushSubRepo  repository.PushSubscriptionRepository
	cfg          config.VAPIDConfig // wired now; used by Phase 23 SendNotification
}

func NewPushSubscriptionService(repos *repository.Repositories, cfg *config.Config) PushSubscriptionService {
	return &pushSubscriptionService{
		pushSubRepo: repos.PushSubscription,
		cfg:         cfg.VAPID,
	}
}
```

**Service method pattern — validation + IDOR enforcement** (lines 52-55 of charge_service.go):
```go
// userID always comes from context (injected by auth middleware), never from request body
func (s *pushSubscriptionService) Subscribe(ctx context.Context, userID int, req *domain.SubscribePushRequest) error {
	if req.Endpoint == "" {
		return pkgErrors.BadRequest("endpoint is required")
	}
	if req.Keys.P256dh == "" {
		return pkgErrors.BadRequest("keys.p256dh is required")
	}
	if req.Keys.Auth == "" {
		return pkgErrors.BadRequest("keys.auth is required")
	}
	return s.pushSubRepo.Upsert(ctx, &domain.PushSubscription{
		UserID:   userID,
		Endpoint: req.Endpoint,
		P256dh:   req.Keys.P256dh,
		Auth:     req.Keys.Auth,
	})
}

func (s *pushSubscriptionService) Unsubscribe(ctx context.Context, userID int, endpoint string) error {
	// Idempotent — no error if row not found; DELETE WHERE is safe
	return s.pushSubRepo.DeleteByEndpoint(ctx, userID, endpoint)
}

func (s *pushSubscriptionService) Status(ctx context.Context, userID int, endpoint string) (*domain.PushSubscriptionStatusResponse, error) {
	exists, err := s.pushSubRepo.ExistsForUser(ctx, userID, endpoint)
	if err != nil {
		return nil, pkgErrors.Internal("failed to check subscription status", err)
	}
	return &domain.PushSubscriptionStatusResponse{Subscribed: exists}, nil
}
```

**Error wrapping pattern** (lines 157-183 of charge_service.go — `pkgErrors.NotFound`, `pkgErrors.Forbidden`, `pkgErrors.Internal`):
```go
// Service returns *pkgErrors.ServiceError; handler calls HandleServiceError(err)
if err != nil {
	return pkgErrors.Internal("failed to check subscription status", err)
}
```

---

### `internal/handler/push_subscription_handler.go` (handler, request-response)

**Analog:** `internal/handler/charge_handler.go` (lines 1-193)

**Imports pattern** (lines 1-11 of charge_handler.go):
```go
package handler

import (
	"net/http"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
)
```

**Constructor pattern** (lines 13-21 of charge_handler.go):
```go
type PushSubscriptionHandler struct {
	pushSubService service.PushSubscriptionService
}

func NewPushSubscriptionHandler(services *service.Services) *PushSubscriptionHandler {
	return &PushSubscriptionHandler{
		pushSubService: services.PushSubscription,
	}
}
```

**POST handler with JSON body** (lines 36-50 of charge_handler.go — Bind + service call + HandleServiceError):
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

**DELETE/GET with query param** (lines 116-129 of charge_handler.go — QueryParam instead of Bind):
```go
// Unsubscribe godoc
// @Summary      Remove a Web Push subscription
// @Tags         push-subscriptions
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        endpoint  query  string  true  "Endpoint URL (url-encoded)"
// @Success      204
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/push-subscriptions [delete]
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

// Status godoc
// @Summary      Check if device has an active push subscription
// @Tags         push-subscriptions
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        endpoint  query  string  true  "Endpoint URL (url-encoded)"
// @Success      200  {object}  domain.PushSubscriptionStatusResponse
// @Failure      400  {object}  middleware.ErrorResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/push-subscriptions [get]
func (h *PushSubscriptionHandler) Status(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	endpoint := c.QueryParam("endpoint")
	if endpoint == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "endpoint is required")
	}
	resp, err := h.pushSubService.Status(c.Request().Context(), userID, endpoint)
	if err != nil {
		return HandleServiceError(err)
	}
	return c.JSON(http.StatusOK, resp)
}
```

---

### `internal/config/config.go` (modified)

**Analog:** `internal/config/config.go` — `JWTConfig` sub-struct (lines 40-47) and `OAuthConfig` sub-struct (lines 49-59); wiring in `Load()` (lines 86-90)

**Existing sub-struct pattern** (lines 40-47):
```go
type JWTConfig struct {
	Secret          string
	ExpirationHours int
}
```

**New sub-struct to add** (after `OAuthConfig`):
```go
type VAPIDConfig struct {
	PublicKey  string // VAPID_PUBLIC_KEY  — base64url-encoded uncompressed EC P-256 point
	PrivateKey string // VAPID_PRIVATE_KEY — corresponding private scalar
	Subject    string // VAPID_SUBJECT     — "mailto:..." per RFC 8292
}
```

**Config struct field to add** (line 18 of config.go — after `App AppConfig`):
```go
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	OAuth    OAuthConfig
	App      AppConfig
	VAPID    VAPIDConfig   // add this
}
```

**Load() wiring pattern** (lines 86-90 of config.go — `getEnv` with empty-string default):
```go
VAPID: VAPIDConfig{
	PublicKey:  getEnv("VAPID_PUBLIC_KEY", ""),
	PrivateKey: getEnv("VAPID_PRIVATE_KEY", ""),
	Subject:    getEnv("VAPID_SUBJECT", ""),
},
```

---

### `migrations/<timestamp>_create_push_subscriptions_table.sql` (migration)

**Analog:** `migrations/20260414000000_create_charges_table.sql` (lines 1-23)

**Migration file pattern** (full file):
```sql
-- +goose Up
CREATE TABLE charges (
    id                  SERIAL PRIMARY KEY,
    charger_user_id     INT NOT NULL REFERENCES users(id),
    -- ...
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ
);
CREATE INDEX idx_charges_charger_user_id ON charges(charger_user_id);
-- ...

-- +goose Down
DROP TABLE IF EXISTS charges;
```

**Key conventions verified in this analog:**
- `SERIAL PRIMARY KEY` (not `BIGSERIAL`)
- `TIMESTAMPTZ` (not `TIMESTAMP`)
- `INT NOT NULL REFERENCES users(id) ON DELETE CASCADE` for FK to users
- Symmetric `-- +goose Down` block with `DROP TABLE IF EXISTS`
- One `CREATE INDEX` per filterable column

**New migration content:**
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

**Create with:** `just migrate-create create_push_subscriptions_table` — never create the file manually.

---

### `migrations/<timestamp>_create_notifications_table.sql` (migration)

**Analog:** `migrations/20260414000000_create_charges_table.sql` (same conventions)

**New migration content:**
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

CREATE INDEX idx_notifications_user_id    ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS notifications;
```

**Create with:** `just migrate-create create_notifications_table` (run as a second, separate migration).

---

### `cmd/server/main.go` (modified — DI wiring + route registration)

**Analog:** `cmd/server/main.go` — the Charge wiring block (lines 76, 92, 102-103, 189-193)

**Repository instantiation pattern** (lines 65-78):
```go
repos := &repository.Repositories{
	// ... existing repos ...
	Charge:   repository.NewChargeRepository(db),
	// Add:
	PushSubscription: repository.NewPushSubscriptionRepository(db),
	Notification:     repository.NewNotificationRepository(db),
}
```

**Service instantiation pattern** (lines 92-93 — services that do NOT need the Services struct):
```go
// NewChargeService takes repos + services (cross-service dep)
// NewPushSubscriptionService takes repos + cfg (needs cfg.VAPID for Phase 23)
services.Charge = service.NewChargeService(repos, services)
// Add (same position, after the Services struct is partially wired):
services.PushSubscription = service.NewPushSubscriptionService(repos, cfg)
```

**Handler instantiation pattern** (lines 96-103):
```go
chargeHandler := handler.NewChargeHandler(services)
// Add:
pushSubHandler := handler.NewPushSubscriptionHandler(services)
```

**Route registration pattern** (lines 188-193 — subgroup on `api`):
```go
// Charges
charges := api.Group("/charges")
charges.GET("/pending-count", chargeHandler.PendingCount)
charges.POST("", chargeHandler.Create)
// ...

// Push subscriptions (add after charges block)
pushSubs := api.Group("/push-subscriptions")
pushSubs.POST("", pushSubHandler.Subscribe)
pushSubs.DELETE("", pushSubHandler.Unsubscribe)
pushSubs.GET("", pushSubHandler.Status)
```

**VAPID startup validation pattern** (add after `config.Load()` call, lines 43-45):
```go
cfg, err := config.Load()
if err != nil {
	log.Fatalf("Failed to load config: %v", err)
}
// Add immediately after:
if cfg.VAPID.PublicKey == "" || cfg.VAPID.PrivateKey == "" {
	log.Fatalf("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required")
}
```

---

### `internal/service/push_subscription_service_test.go` (test, integration)

**Analog:** `internal/service/test_setup_with_db.go` (full file) + charge integration test pattern

**File header + build tag pattern:**
```go
//go:build integration

package service
```

**Suite embedding pattern** (lines 33-64 of test_setup_with_db.go):
```go
type PushSubscriptionServiceTestSuite struct {
	ServiceTestWithDBSuite
}

func TestPushSubscriptionServiceWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test")
	}
	suite.Run(t, new(PushSubscriptionServiceTestSuite))
}
```

**Test method pattern — randomized data, no truncate** (lines 154-160 of test_setup_with_db.go):
```go
func (suite *PushSubscriptionServiceTestSuite) Test_Subscribe_StoresInDB() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	endpoint := fmt.Sprintf("https://fcm.googleapis.com/fcm/send/test-%d", rand.Int64())
	req := &domain.SubscribePushRequest{
		Endpoint: endpoint,
		Keys: domain.PushKeys{
			P256dh: "fake-p256dh",
			Auth:   "fake-auth",
		},
	}

	err = suite.Services.PushSubscription.Subscribe(ctx, user.ID, req)
	suite.Require().NoError(err)

	resp, err := suite.Services.PushSubscription.Status(ctx, user.ID, endpoint)
	suite.Require().NoError(err)
	suite.True(resp.Subscribed)
}
```

---

### `internal/service/test_setup_with_db.go` (modified)

**Analog:** `internal/service/test_setup_with_db.go` (lines 52-64 — field declarations; lines 90-118 — SetupTest instantiation)

**Fields to add** (after `ChargeRepository repository.ChargeRepository` at line 63):
```go
// In ServiceTestWithDBSuite struct:
PushSubscriptionRepository repository.PushSubscriptionRepository
NotificationRepository      repository.NotificationRepository
```

**SetupTest instantiation to add** (after `suite.ChargeRepository = repository.NewChargeRepository(suite.DB)` at line 102):
```go
suite.PushSubscriptionRepository = repository.NewPushSubscriptionRepository(suite.DB)
suite.NotificationRepository = repository.NewNotificationRepository(suite.DB)
```

**Repos struct assignment to add** (after `Charge: suite.ChargeRepository` at line 117):
```go
PushSubscription: suite.PushSubscriptionRepository,
Notification:     suite.NotificationRepository,
```

**Services instantiation to add** (after `suite.Services.Charge = NewChargeService(suite.Repos, suite.Services)` at line 151):
```go
suite.Services.PushSubscription = NewPushSubscriptionService(suite.Repos, suite.Config)
```

**Note on Config:** `suite.Config` only has `JWT` populated today. `NewPushSubscriptionService` receives `cfg.VAPID`, which will have empty strings in the test environment — this is acceptable for Phase 22 (no actual SendNotification calls). Add `VAPID: config.VAPIDConfig{PublicKey: "test-pub", PrivateKey: "test-priv", Subject: "mailto:test@test.com"}` to the test config block if Phase 23 tests require key presence.

---

### `internal/handler/push_subscription_handler_test.go` (test, request-response)

**Analog:** `internal/handler/charge_handler_test.go` (lines 1-129)

**Test file pattern** (lines 1-35 of charge_handler_test.go — setup helper + inject user ctx):
```go
package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/mocks"
	"github.com/finance_app/backend/pkg/appcontext"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func setupPushSubHandlerTest(t *testing.T) (*echo.Echo, *mocks.MockPushSubscriptionService, *PushSubscriptionHandler) {
	t.Helper()
	mockSvc := mocks.NewMockPushSubscriptionService(t)
	services := &service.Services{PushSubscription: mockSvc}
	h := NewPushSubscriptionHandler(services)
	e := echo.New()
	return e, mockSvc, h
}
```

**Handler test case pattern** (lines 36-52 of charge_handler_test.go — httptest.NewRequestWithContext + echo Context):
```go
func TestPushSubHandler_Subscribe_Success(t *testing.T) {
	e, mockSvc, h := setupPushSubHandlerTest(t)
	mockSvc.EXPECT().Subscribe(mock.Anything, 42, mock.AnythingOfType("*domain.SubscribePushRequest")).Return(nil).Once()

	body := `{"endpoint":"https://fcm.example.com/send/abc","keys":{"p256dh":"abc","auth":"def"}}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/push-subscriptions", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Subscribe(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}
```

**Note:** `injectUserCtx` is already defined in `charge_handler_test.go` in the same package — reuse it directly (same `package handler`).

---

## Shared Patterns

### Authentication / UserID extraction
**Source:** `internal/handler/charge_handler.go` lines 37, 67, 93 — every handler method, first line
```go
userID := appcontext.GetUserIDFromContext(c.Request().Context())
```
**Apply to:** All three handler methods in `push_subscription_handler.go`. UserID is NEVER taken from the request body.

### Error conversion at handler boundary
**Source:** `internal/handler/errors.go` lines 7-13
```go
func HandleServiceError(err error) error {
	if err == nil {
		return nil
	}
	return apperrors.ToHTTPError(err)
}
```
**Apply to:** Every `if err != nil` block in handler methods — return `HandleServiceError(err)`, never `echo.NewHTTPError(...)` for service errors.

### Error construction in services
**Source:** `internal/service/charge_service.go` — `pkgErrors.BadRequest`, `pkgErrors.Internal`, `pkgErrors.NotFound`, `pkgErrors.Forbidden`
```go
pkgErrors.BadRequest("endpoint is required")
pkgErrors.Internal("failed to check subscription status", err)
```
**Apply to:** All service methods in `push_subscription_service.go`. Never return raw `error` from a service — always wrap in `*pkgErrors.ServiceError`.

### Repository context-transaction passthrough
**Source:** `internal/repository/charge_repository.go` lines 27, 34, 43 — every DB call
```go
GetTxFromContext(ctx, r.db).Create(ent)
GetTxFromContext(ctx, r.db).Where(...).Delete(...)
```
**Apply to:** Every GORM call in `push_subscription_repository.go` and `notification_repository.go`. Never access `r.db` directly.

### Goose migration file convention
**Source:** `migrations/20260414000000_create_charges_table.sql` lines 1-23
- `SERIAL PRIMARY KEY` (not `BIGSERIAL`)
- `TIMESTAMPTZ` (not `TIMESTAMP`)
- `-- +goose Up` / `-- +goose Down` blocks both present
- Symmetric `DROP TABLE IF EXISTS` in Down block
**Apply to:** Both new migration files.

### Domain ↔ Entity conversion
**Source:** `internal/entity/charge.go` lines 39-75 — `ToDomain()` method + `ChargeFromDomain()` function
```go
func (c *Charge) ToDomain() *domain.Charge { ... }
func ChargeFromDomain(d *domain.Charge) *Charge { ... }
```
**Apply to:** `entity/push_subscription.go` and `entity/notification.go`. GORM types must never appear in domain layer.

### Config sub-struct + getEnv wiring
**Source:** `internal/config/config.go` lines 40-47 (JWTConfig) + lines 86-90 (Load wiring)
```go
type JWTConfig struct {
	Secret          string
	ExpirationHours int
}
// In Load():
JWT: JWTConfig{
	Secret:          getEnv("JWT_SECRET", "change-me-in-production"),
	ExpirationHours: getEnvAsInt("JWT_EXPIRATION_HOURS", 24),
},
```
**Apply to:** `VAPIDConfig` sub-struct and its `Load()` wiring. Use empty-string defaults (not "change-me" defaults) for VAPID keys — startup validation in `main.go` guards against missing values.

---

## No Analog Found

All files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `backend/internal/{handler,service,repository,entity,domain,config}/`, `backend/cmd/server/`, `backend/migrations/`, `backend/internal/service/test_setup*.go`
**Files scanned:** 14 source files read directly
**Pattern extraction date:** 2026-05-30
