# Phase 23: Backend Notification Events & Inbox API - Pattern Map

**Mapped:** 2026-05-30
**Files analyzed:** 13 new/modified files
**Analogs found:** 13 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `internal/domain/push_subscription.go` | domain | transform | `internal/domain/push_subscription.go` (existing) | exact — extend in place |
| `internal/repository/interfaces.go` | interface | CRUD | `internal/repository/interfaces.go` — `PushSubscriptionRepository` (lines 106–124) | exact |
| `internal/repository/notification_repository.go` | repository | CRUD | `internal/repository/push_subscription_repository.go` | exact role+data-flow |
| `internal/repository/push_subscription_repository.go` | repository | CRUD | self — add `ListByUserID` following `ExistsForUser` pattern (lines 69–79) | exact |
| `internal/service/interfaces.go` | interface | — | `internal/service/interfaces.go` — `PushSubscriptionService` (lines 91–95) | exact |
| `internal/service/notification_service.go` | service | event-driven + CRUD | `internal/service/push_subscription_service.go` (constructor/field pattern) | role-match |
| `internal/handler/notification_handler.go` | handler | request-response | `internal/handler/push_subscription_handler.go` | exact |
| `internal/service/charge_service.go` | service (modify) | request-response | self — post-commit hook after `chargeRepo.Create` (line 154) | exact |
| `internal/service/charge_accept.go` | service (modify) | request-response | self — post-commit hook after `s.dbTransaction.Commit(txCtx)` (line 234) | exact |
| `internal/service/transaction_create.go` | service (modify) | CRUD | self — post-commit hook after `s.dbTransaction.Commit(ctx)` (line 54) | exact |
| `internal/service/transaction_update.go` | service (modify) | CRUD | self — post-commit hook after `return s.dbTransaction.Commit(ctx)` (line 223) | exact |
| `internal/service/test_setup_with_db.go` | test | — | self — add `services.Notification` after `services.PushSubscription` (line 161) | exact |
| `migrations/YYYYMMDDHHMMSS_add_notification_cursor_index.sql` | migration | — | `migrations/20260530125310_create_notifications_table.sql` | exact |

---

## Pattern Assignments

### `internal/domain/push_subscription.go` (extend — add new domain types)

**Analog:** `internal/domain/push_subscription.go` (the file itself)

**Existing type pattern** (lines 1–36, full file):
```go
package domain

import "time"

type PushSubscription struct {
    ID        int        `json:"id"`
    UserID    int        `json:"user_id"`
    Endpoint  string     `json:"endpoint"`
    P256dh    string     `json:"p256dh"`
    Auth      string     `json:"auth"`
    CreatedAt *time.Time `json:"created_at"`
}
// ... PushKeys, SubscribePushRequest, PushSubscriptionStatusResponse, Notification already here
```

**New types to append** — follow the same package, same JSON tag style, same `*time.Time` pointer pattern for nullable timestamps:

```go
// NotificationEvent is an in-memory struct populated by event sources and
// passed to NotificationService.Dispatch after DB commit. NOT persisted directly.
type NotificationEvent struct {
    RecipientUserID int
    ActorUserID     int    // display-name lookup; all events in one Dispatch share the same actor
    Type            string // NotificationTypeXxx constant
    EntityType      string // "charge" or "transaction"
    EntityID        int
    Amount          int64  // cents — for BRL copy formatting
    Description     string // e.g. charge description
}

// Notification type constants
const (
    NotificationTypeChargeReceived = "charge_received"
    NotificationTypeChargeAccepted = "charge_accepted"
    NotificationTypeSplitCreated   = "split_created"
    NotificationTypeSplitUpdated   = "split_updated"
)

// notificationCursor is used internally by the repository for keyset pagination.
// It is NOT exported to the HTTP layer — callers receive an opaque base64url token.
type notificationCursor struct {
    CreatedAt time.Time `json:"ca"`
    ID        int       `json:"id"`
}

// NotificationFilter is passed to NotificationRepository.List.
type NotificationFilter struct {
    UserID int
    Cursor *notificationCursor // nil = first page
    Limit  int
}

// NotificationListResult is returned by NotificationService.List.
type NotificationListResult struct {
    Items      []*Notification
    NextCursor string // empty = no more pages
    HasMore    bool
}

// NotificationUnreadCountResponse is the HTTP response for GET /api/notifications/unread-count.
type NotificationUnreadCountResponse struct {
    Count int64 `json:"count"`
}
```

**Note:** `notificationCursor` must be lowercase (unexported) so it stays an opaque token at the HTTP boundary. Place cursor encode/decode helpers in `notification_repository.go` (same package), not the domain package.

---

### `internal/repository/interfaces.go` (modify — replace empty NotificationRepository, add ListByUserID to PushSubscriptionRepository)

**Analog:** `internal/repository/interfaces.go` lines 106–127 (PushSubscriptionRepository + empty NotificationRepository)

**Current empty stub** (line 127):
```go
// NotificationRepository — zero methods in Phase 22; Phase 23 adds methods.
type NotificationRepository interface{}
```

**Replace with** (follow the `ChargeRepository` style at lines 97–104 — each method on its own line, context first):
```go
type NotificationRepository interface {
    Create(ctx context.Context, notification *domain.Notification) (*domain.Notification, error)
    List(ctx context.Context, filter domain.NotificationFilter) (*domain.NotificationListResult, error)
    UnreadCount(ctx context.Context, userID int) (int64, error)
    MarkRead(ctx context.Context, userID, notificationID int) error
    MarkAllRead(ctx context.Context, userID int) error
}
```

**Also add `ListByUserID` to `PushSubscriptionRepository`** (lines 110–124), after `ExistsForUser`:
```go
// ListByUserID returns all active subscriptions for a recipient user.
// Called from the dispatch goroutine; no IDOR guard needed (internal call only).
ListByUserID(ctx context.Context, userID int) ([]*domain.PushSubscription, error)
```

After both changes, run `just generate-mocks`.

---

### `internal/repository/notification_repository.go` (implement 5 methods)

**Analog:** `internal/repository/push_subscription_repository.go` (full file, 80 lines)

**Struct + constructor pattern** (lines 11–17 of push_subscription_repository.go):
```go
type notificationRepository struct {
    db *gorm.DB
}

func NewNotificationRepository(db *gorm.DB) NotificationRepository {
    return &notificationRepository{db: db}
}
```
The stub already has this — do not change the constructor signature.

**GetTxFromContext pattern** (used in every method of push_subscription_repository.go, e.g. line 38):
```go
GetTxFromContext(ctx, r.db).Where(...).Find(&ents)
```
Every method calls `GetTxFromContext(ctx, r.db)` as the root of the GORM chain — the tx flows in from the caller if active, or uses the bare `r.db` if not.

**Single-row write pattern** — copy from `chargeRepo.Create` (not in push_subscription_repository.go — use charge_repository.go as the Create analog):
```go
func (r *notificationRepository) Create(ctx context.Context, n *domain.Notification) (*domain.Notification, error) {
    ent := entity.NotificationFromDomain(n)
    if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
        return nil, err
    }
    return ent.ToDomain(), nil
}
```
Note: `entity.NotificationFromDomain` drops `CreatedAt` (DB-generated via `DEFAULT NOW()`), matching how the entity is defined in `internal/entity/notification.go` lines 31–40.

**Count pattern** — copy from `push_subscription_repository.go` `ExistsForUser` (lines 71–78) but use `Count` instead of the `> 0` check:
```go
func (r *notificationRepository) UnreadCount(ctx context.Context, userID int) (int64, error) {
    var count int64
    err := GetTxFromContext(ctx, r.db).
        Model(&entity.Notification{}).
        Where("user_id = ? AND read = false", userID).
        Count(&count).Error
    return count, err
}
```

**IDOR-scoped update pattern** — `RowsAffected == 0` → NotFound, following `pkgErrors.NotFound`:
```go
func (r *notificationRepository) MarkRead(ctx context.Context, userID, notificationID int) error {
    result := GetTxFromContext(ctx, r.db).
        Model(&entity.Notification{}).
        Where("id = ? AND user_id = ?", notificationID, userID).
        Update("read", true)
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return pkgErrors.NotFound("notification")
    }
    return nil
}
```

**Bulk update pattern** (MarkAllRead — no RowsAffected check needed since 0 rows is a no-op):
```go
func (r *notificationRepository) MarkAllRead(ctx context.Context, userID int) error {
    return GetTxFromContext(ctx, r.db).
        Model(&entity.Notification{}).
        Where("user_id = ? AND read = false", userID).
        Update("read", true).Error
}
```

**Cursor List pattern** — new to this codebase; encode/decode helpers live in the same file:
```go
import (
    "encoding/base64"
    "encoding/json"
    "time"
)

func encodeCursor(createdAt time.Time, id int) string {
    raw, _ := json.Marshal(domain.notificationCursor{CreatedAt: createdAt, ID: id})
    return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeCursor(token string) (*domain.notificationCursor, error) {
    b, err := base64.RawURLEncoding.DecodeString(token)
    if err != nil {
        return nil, err
    }
    var c domain.notificationCursor
    return &c, json.Unmarshal(b, &c)
}

func (r *notificationRepository) List(ctx context.Context, filter domain.NotificationFilter) (*domain.NotificationListResult, error) {
    limit := filter.Limit
    if limit <= 0 {
        limit = 20
    }

    query := GetTxFromContext(ctx, r.db).
        Model(&entity.Notification{}).
        Where("user_id = ?", filter.UserID).
        Order("created_at DESC, id DESC").
        Limit(limit + 1) // fetch one extra to detect hasMore

    if filter.Cursor != nil {
        query = query.Where("(created_at, id) < (?, ?)", filter.Cursor.CreatedAt, filter.Cursor.ID)
    }

    var ents []entity.Notification
    if err := query.Find(&ents).Error; err != nil {
        return nil, err
    }

    hasMore := len(ents) > limit
    if hasMore {
        ents = ents[:limit]
    }

    items := make([]*domain.Notification, len(ents))
    for i, ent := range ents {
        e := ent
        items[i] = e.ToDomain()
    }

    var nextCursor string
    if hasMore && len(ents) > 0 {
        last := ents[len(ents)-1]
        nextCursor = encodeCursor(*last.CreatedAt, last.ID)
    }

    return &domain.NotificationListResult{
        Items:      items,
        NextCursor: nextCursor,
        HasMore:    hasMore,
    }, nil
}
```

---

### `internal/repository/push_subscription_repository.go` (modify — add ListByUserID)

**Analog:** `ExistsForUser` method in the same file (lines 69–79):
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

**New method** (append after `ExistsForUser`, before end of file):
```go
// ListByUserID returns all active push subscriptions for a user.
// Called by the notification dispatch goroutine — no IDOR guard needed (internal).
func (r *pushSubscriptionRepository) ListByUserID(ctx context.Context, userID int) ([]*domain.PushSubscription, error) {
    var ents []entity.PushSubscription
    if err := GetTxFromContext(ctx, r.db).
        Where("user_id = ?", userID).
        Find(&ents).Error; err != nil {
        return nil, err
    }
    result := make([]*domain.PushSubscription, len(ents))
    for i, ent := range ents {
        e := ent
        result[i] = e.ToDomain()
    }
    return result, nil
}
```

---

### `internal/service/interfaces.go` (modify — add NotificationService + Notification field to Services)

**Analog:** `PushSubscriptionService` declaration (lines 91–95) and `Services` struct (lines 98–110):

```go
// Existing PushSubscriptionService for reference style:
type PushSubscriptionService interface {
    Subscribe(ctx context.Context, userID int, req *domain.SubscribePushRequest) error
    Unsubscribe(ctx context.Context, userID int, endpoint string) error
    Status(ctx context.Context, userID int, endpoint string) (*domain.PushSubscriptionStatusResponse, error)
}
```

**New interface** (append after `PushSubscriptionService`):
```go
type NotificationService interface {
    // Dispatch persists inbox rows and sends push notifications best-effort.
    // Always called in a goroutine with context.Background() — never the request ctx.
    Dispatch(ctx context.Context, events []domain.NotificationEvent)
    List(ctx context.Context, userID int, filter domain.NotificationFilter) (*domain.NotificationListResult, error)
    UnreadCount(ctx context.Context, userID int) (int64, error)
    MarkRead(ctx context.Context, userID, notificationID int) error
    MarkAllRead(ctx context.Context, userID int) error
}
```

**Services struct** (lines 98–110) — add `Notification NotificationService` after `PushSubscription`:
```go
type Services struct {
    // ... existing fields ...
    PushSubscription PushSubscriptionService
    Notification     NotificationService  // Phase 23 — add here
}
```

---

### `internal/service/notification_service.go` (new file)

**Analog:** `internal/service/push_subscription_service.go` (constructor/field style) + RESEARCH.md Dispatch skeleton

**Constructor pattern** (copy from push_subscription_service.go lines 13–24):
```go
package service

import (
    "context"
    "encoding/json"
    "fmt"
    "log"

    webpush "github.com/SherClockHolmes/webpush-go"
    "github.com/finance_app/backend/internal/config"
    "github.com/finance_app/backend/internal/domain"
    "github.com/finance_app/backend/internal/repository"
    pkgErrors "github.com/finance_app/backend/pkg/errors"
)

type notificationService struct {
    notifRepo   repository.NotificationRepository
    pushSubRepo repository.PushSubscriptionRepository
    userRepo    repository.UserRepository
    vapid       config.VAPIDConfig
    sender      PushSender // injectable for testing
}

func NewNotificationService(repos *repository.Repositories, cfg *config.Config) NotificationService {
    return &notificationService{
        notifRepo:   repos.Notification,
        pushSubRepo: repos.PushSubscription,
        userRepo:    repos.User,
        vapid:       cfg.VAPID,
        sender:      &webPushSender{},
    }
}
```

**PushSender interface** (define in the same file — single-method interface, no mockery needed; a hand-written test double suffices per RESEARCH.md):
```go
// PushSender abstracts webpush.SendNotification for testing.
type PushSender interface {
    Send(payload []byte, sub *webpush.Subscription, opts *webpush.Options) (*http.Response, error)
}

type webPushSender struct{}

func (w *webPushSender) Send(payload []byte, sub *webpush.Subscription, opts *webpush.Options) (*http.Response, error) {
    return webpush.SendNotification(payload, sub, opts)
}
```

**Dispatch method** — goroutine panic safety pattern from RESEARCH.md Pattern 1:
```go
func (s *notificationService) Dispatch(ctx context.Context, events []domain.NotificationEvent) {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("[notification] dispatch panic: %v", r)
        }
    }()
    if len(events) == 0 {
        return
    }
    // 1. Persist all inbox rows first (always — even if no subscriptions).
    // 2. Resolve actor display name once for the whole batch.
    // 3. Group by (recipientUserID, type) for D-08 push coalescing.
    // 4. Per group: fetch subs → build payload → call s.sender.Send → prune on 404/410.
    // See RESEARCH.md "NotificationService: Dispatch skeleton" for the full body.
}
```

**BRL formatter** (private helper in the same file):
```go
// formatBRL converts cents int64 to "R$ 1.234,56" (pt-BR).
func formatBRL(cents int64) string {
    sign := ""
    if cents < 0 {
        sign = "-"
        cents = -cents
    }
    reais := cents / 100
    centavos := cents % 100
    reaisStr := fmt.Sprintf("%d", reais)
    n := len(reaisStr)
    var result []byte
    for i, c := range reaisStr {
        if i > 0 && (n-i)%3 == 0 {
            result = append(result, '.')
        }
        result = append(result, byte(c))
    }
    return fmt.Sprintf("%sR$ %s,%02d", sign, string(result), centavos)
}
```

**Push copy builder** — private helper, uses D-07 pt-BR templates and D-08 coalescing:
```go
type pushPayload struct {
    Title string          `json:"title"`
    Body  string          `json:"body"`
    Data  pushPayloadData `json:"data"`
}

type pushPayloadData struct {
    Type           string `json:"type"`
    EntityType     string `json:"entity_type"`
    EntityID       int    `json:"entity_id"`
    NotificationID int    `json:"notification_id,omitempty"`
}

func (s *notificationService) buildPayload(actorName string, evGroup []domain.NotificationEvent) pushPayload {
    first := evGroup[0]
    var body string
    switch {
    case len(evGroup) > 1 && first.Type == domain.NotificationTypeSplitCreated:
        body = fmt.Sprintf("%s adicionou %d transações divididas", actorName, len(evGroup))
    case first.Type == domain.NotificationTypeChargeReceived:
        body = fmt.Sprintf("%s te cobrou %s: %s", actorName, formatBRL(first.Amount), first.Description)
    case first.Type == domain.NotificationTypeChargeAccepted:
        body = fmt.Sprintf("%s aceitou sua cobrança de %s", actorName, formatBRL(first.Amount))
    case first.Type == domain.NotificationTypeSplitCreated:
        body = fmt.Sprintf("%s adicionou uma transação dividida de %s", actorName, formatBRL(first.Amount))
    case first.Type == domain.NotificationTypeSplitUpdated:
        body = fmt.Sprintf("%s atualizou uma transação dividida (%s)", actorName, formatBRL(first.Amount))
    default:
        body = fmt.Sprintf("%s enviou uma notificação", actorName)
    }
    return pushPayload{
        Title: "Finance App",
        Body:  body,
        Data: pushPayloadData{
            Type:       first.Type,
            EntityType: first.EntityType,
            EntityID:   first.EntityID,
        },
    }
}
```

**Inbox service methods** (delegate to repo, wrap errors with pkgErrors — copy from `push_subscription_service.go` lines 65–76):
```go
func (s *notificationService) List(ctx context.Context, userID int, filter domain.NotificationFilter) (*domain.NotificationListResult, error) {
    filter.UserID = userID // IDOR: always override with authenticated userID
    result, err := s.notifRepo.List(ctx, filter)
    if err != nil {
        return nil, pkgErrors.Internal("failed to list notifications", err)
    }
    return result, nil
}

func (s *notificationService) UnreadCount(ctx context.Context, userID int) (int64, error) {
    count, err := s.notifRepo.UnreadCount(ctx, userID)
    if err != nil {
        return 0, pkgErrors.Internal("failed to count unread notifications", err)
    }
    return count, nil
}

func (s *notificationService) MarkRead(ctx context.Context, userID, notificationID int) error {
    return s.notifRepo.MarkRead(ctx, userID, notificationID)
}

func (s *notificationService) MarkAllRead(ctx context.Context, userID int) error {
    return s.notifRepo.MarkAllRead(ctx, userID)
}
```

---

### `internal/handler/notification_handler.go` (new file)

**Analog:** `internal/handler/push_subscription_handler.go` (full file, 95 lines)

**Struct + constructor pattern** (lines 12–20 of push_subscription_handler.go):
```go
package handler

import (
    "net/http"
    "strconv"

    "github.com/finance_app/backend/internal/domain"
    "github.com/finance_app/backend/internal/service"
    "github.com/finance_app/backend/pkg/appcontext"
    pkgErrors "github.com/finance_app/backend/pkg/errors"
    "github.com/labstack/echo/v4"
)

type NotificationHandler struct {
    notifService service.NotificationService
}

func NewNotificationHandler(services *service.Services) *NotificationHandler {
    return &NotificationHandler{
        notifService: services.Notification,
    }
}
```

**Handler method skeleton** — copy the 6-step handler recipe from CLAUDE.md, matching push_subscription_handler.go style:
1. `userID := appcontext.GetUserIDFromContext(c.Request().Context())`
2. Bind/parse params (cursor from query, id from path via `strconv.Atoi`)
3. Call service with `c.Request().Context()`
4. On error: `return HandleServiceError(err)`
5. On success: `return c.JSON(http.StatusOK, resp)` or `return c.NoContent(http.StatusNoContent)`

**Swagger annotation pattern** (copy `// Subscribe godoc` block from push_subscription_handler.go lines 23–33, adapt tags/params/responses):
```go
// List godoc
// @Summary      List notifications
// @Description  Returns paginated notifications for the authenticated user, newest first
// @Tags         notifications
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        cursor  query  string  false  "Pagination cursor"
// @Param        limit   query  int     false  "Page size (default 20)"
// @Success      200  {object}  domain.NotificationListResult
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/notifications [get]
func (h *NotificationHandler) List(c echo.Context) error {
    userID := appcontext.GetUserIDFromContext(c.Request().Context())
    cursorToken := c.QueryParam("cursor")
    // parse limit from query, default 20
    filter := domain.NotificationFilter{Limit: 20}
    // decode cursor if present — bad cursor → 400
    if cursorToken != "" {
        // pass token into filter; repository decodes it
        // store as opaque string in filter or decode here; either works
    }
    result, err := h.notifService.List(c.Request().Context(), userID, filter)
    if err != nil {
        return HandleServiceError(err)
    }
    return c.JSON(http.StatusOK, result)
}
```

**Path-param + IDOR pattern** (copy from charge_handler.go lines 36–49):
```go
func (h *NotificationHandler) MarkRead(c echo.Context) error {
    userID := appcontext.GetUserIDFromContext(c.Request().Context())
    id, err := strconv.Atoi(c.Param("id"))
    if err != nil || id <= 0 {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid notification id")
    }
    if err := h.notifService.MarkRead(c.Request().Context(), userID, id); err != nil {
        return HandleServiceError(err)
    }
    return c.NoContent(http.StatusNoContent)
}
```

**No-param POST** (copy `Unsubscribe` shape from push_subscription_handler.go lines 59–69):
```go
func (h *NotificationHandler) MarkAllRead(c echo.Context) error {
    userID := appcontext.GetUserIDFromContext(c.Request().Context())
    if err := h.notifService.MarkAllRead(c.Request().Context(), userID); err != nil {
        return HandleServiceError(err)
    }
    return c.NoContent(http.StatusNoContent)
}
```

**UnreadCount** returns a typed response struct:
```go
func (h *NotificationHandler) UnreadCount(c echo.Context) error {
    userID := appcontext.GetUserIDFromContext(c.Request().Context())
    count, err := h.notifService.UnreadCount(c.Request().Context(), userID)
    if err != nil {
        return HandleServiceError(err)
    }
    return c.JSON(http.StatusOK, domain.NotificationUnreadCountResponse{Count: count})
}
```

---

### `internal/service/charge_service.go` (modify — hook NOTIF-01 after chargeRepo.Create)

**Analog:** same file — the commit boundary is the non-error return of `s.chargeRepo.Create` at line 154.

**Current final lines of `Create`** (lines 153–155):
```go
    return s.chargeRepo.Create(ctx, charge)
}
```

**Replace with** (no tx scoping change needed — chargeRepo.Create auto-commits):
```go
    charge, err = s.chargeRepo.Create(ctx, charge)
    if err != nil {
        return nil, err
    }
    // NOTIF-01: charge.ID is now valid; fire post-commit goroutine.
    amount := int64(0)
    if charge.Amount != nil {
        amount = *charge.Amount
    }
    go s.services.Notification.Dispatch(context.Background(), []domain.NotificationEvent{{
        RecipientUserID: otherPartyID,
        ActorUserID:     callerUserID,
        Type:            domain.NotificationTypeChargeReceived,
        EntityType:      "charge",
        EntityID:        charge.ID,
        Amount:          amount,
        Description:     charge.Description,
    }})
    return charge, nil
```

Import: add `"context"` to the import block (it is already present in other service files; check charge_service.go imports first — it currently does not import `"context"` directly since all ctx parameters flow through, but `context.Background()` requires the import).

---

### `internal/service/charge_accept.go` (modify — hook NOTIF-02 after Commit)

**Analog:** same file — the commit is at line 234:
```go
    if err := s.dbTransaction.Commit(txCtx); err != nil {
        return pkgErrors.Internal("failed to commit accept", err)
    }
    return nil
```

**Replace `return nil`** with:
```go
    // NOTIF-02: notify the non-caller (the charge initiator).
    // The caller is expectedAccepterID (validated above). Recipient = the other party.
    recipientID := charge.ChargerUserID
    if callerUserID == charge.ChargerUserID {
        recipientID = charge.PayerUserID
    }
    notifAmount := int64(0)
    // amount is already computed above in the settlement resolution block
    notifAmount = amount
    go s.services.Notification.Dispatch(context.Background(), []domain.NotificationEvent{{
        RecipientUserID: recipientID,
        ActorUserID:     callerUserID,
        Type:            domain.NotificationTypeChargeAccepted,
        EntityType:      "charge",
        EntityID:        chargeID,
        Amount:          notifAmount,
    }})
    return nil
```

**Key pitfall (Pitfall 3):** `charge.ChargerUserID` may have been swapped by the role-inversion block (line 124). To identify the correct recipient, use the `callerUserID == expectedAccepterID` invariant (proven above) and pick the non-caller. The `expectedAccepterID` local variable is set before the role swap and remains valid.

---

### `internal/service/transaction_create.go` (modify — hook NOTIF-03 after Commit)

**Analog:** same file — the commit is at line 54:
```go
    if err := s.dbTransaction.Commit(ctx); err != nil {
        return 0, pkgErrors.Internal("failed to commit transaction", err)
    }
    return id, nil
```

**Replace `return id, nil`** with (only when split path — guard matches existing guard at line 252 of createTransactions):
```go
    // NOTIF-03: fire for each partner affected by a split (D-09, Pitfall 4).
    // Only when NOT a shared-account connection path.
    if transaction.SharedAccountConnection == nil && len(transaction.SplitSettings) > 0 &&
        transaction.TransactionType != domain.TransactionTypeTransfer {
        var events []domain.NotificationEvent
        for _, splitSetting := range transaction.SplitSettings {
            if splitSetting.UserConnection == nil {
                continue
            }
            recipientID := splitSetting.UserConnection.ToUserID
            if recipientID == userID {
                recipientID = splitSetting.UserConnection.FromUserID
            }
            if recipientID == userID {
                continue // skip self
            }
            events = append(events, domain.NotificationEvent{
                RecipientUserID: recipientID,
                ActorUserID:     userID,
                Type:            domain.NotificationTypeSplitCreated,
                EntityType:      "transaction",
                EntityID:        id,
                Amount:          splitSetting.Amount,
            })
        }
        if len(events) > 0 {
            go s.services.Notification.Dispatch(context.Background(), events)
        }
    }
    return id, nil
```

**Note on recipient resolution:** `SplitSettings[i].UserConnection` is injected by `injectUserConnectionsOnSplitSettings` before commit. The partner's user ID is obtained by picking the `ToUserID` or `FromUserID` that is not the caller. If `splitSetting.Amount` is 0 (percentage-based without resolved amount), use the transaction amount proportioned by percentage — or just pass the full transaction amount and let the copy builder format it. Research notes that cents are always available at this point via `transaction.Amount` and split percentage.

---

### `internal/service/transaction_update.go` (modify — hook NOTIF-04 after Commit)

**Analog:** same file — the commit is at line 223:
```go
    return s.dbTransaction.Commit(ctx)
```

**Replace with** (NOTIF-04 detection, D-01/D-02/D-03 guards):
```go
    if err := s.dbTransaction.Commit(ctx); err != nil {
        return err
    }
    // NOTIF-04: fire when partner-initiated edit affects linked side amount or split existence.
    s.maybeDispatchSplitUpdatedNotification(ctx, userID, sourceIDs, data, updateChanges)
    return nil
```

**Extract to private method** `maybeDispatchSplitUpdatedNotification` — keeps `Update` readable and keeps the detection logic adjacent to the helper methods for `updateChanges`:

```go
func (s *transactionService) maybeDispatchSplitUpdatedNotification(
    ctx context.Context,
    callerUserID int,
    sourceIDs []int,
    data *transactionUpdateData,
    changes updateChanges,
) {
    var events []domain.NotificationEvent

    switch {
    case changes.AddedSplit():
        // D-03: only fire when partner-initiated
        if callerUserID == lo.FromPtr(data.previousTransaction.OriginalUserID) {
            return
        }
        for _, ss := range data.req.SplitSettings {
            if ss.UserConnection == nil {
                continue
            }
            recipientID := ss.UserConnection.ToUserID
            if recipientID == callerUserID {
                recipientID = ss.UserConnection.FromUserID
            }
            if recipientID == callerUserID {
                continue
            }
            events = append(events, domain.NotificationEvent{
                RecipientUserID: recipientID,
                ActorUserID:     callerUserID,
                Type:            domain.NotificationTypeSplitUpdated,
                EntityType:      "transaction",
                EntityID:        data.previousTransaction.ID,
                Amount:          lo.FromPtr(data.req.Amount),
            })
        }

    case changes.RemovedSplit():
        // D-03: only fire when partner-initiated (D-04: still notify on removal)
        if callerUserID == lo.FromPtr(data.previousTransaction.OriginalUserID) {
            return
        }
        for _, lt := range data.previousTransaction.LinkedTransactions {
            if lt.UserID == callerUserID {
                continue
            }
            events = append(events, domain.NotificationEvent{
                RecipientUserID: lt.UserID,
                ActorUserID:     callerUserID,
                Type:            domain.NotificationTypeSplitUpdated,
                EntityType:      "transaction",
                EntityID:        lt.ID, // deep-link to the (soft-deleted) linked tx (D-04)
                Amount:          lt.Amount,
            })
        }

    case data.isLinkedTxEdit && data.req.Amount != nil && *data.req.Amount > 0:
        // Caller IS the partner editing their linked tx amount. Recipient = source owner.
        for _, srcID := range sourceIDs {
            sourceTx, err := s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{IDs: []int{srcID}})
            if err != nil || sourceTx == nil {
                continue
            }
            if sourceTx.UserID == callerUserID {
                continue // should not happen, but guard anyway
            }
            events = append(events, domain.NotificationEvent{
                RecipientUserID: sourceTx.UserID,
                ActorUserID:     callerUserID,
                Type:            domain.NotificationTypeSplitUpdated,
                EntityType:      "transaction",
                EntityID:        srcID,
                Amount:          *data.req.Amount,
            })
        }
    }

    if len(events) > 0 {
        go s.services.Notification.Dispatch(context.Background(), events)
    }
}
```

**CRITICAL:** The `sourceIDs` slice and `data.isLinkedTxEdit` are already computed at the top of `Update` (lines 33–36). Pass them into the helper. Do NOT re-query inside the helper — use what was already fetched (exception: the `isLinkedTxEdit && req.Amount != nil` path uses `s.transactionRepo.SearchOne` with a fresh `context.Background()` since the tx is already committed — or pass the source TX as a parameter if already in scope).

---

### `internal/service/test_setup_with_db.go` (modify — wire services.Notification)

**Analog:** Same file, line 161:
```go
    suite.Services.PushSubscription = NewPushSubscriptionService(suite.Repos, suite.Config)
```

**Add immediately after** (line 162):
```go
    suite.Services.Notification = NewNotificationService(suite.Repos, suite.Config)
```

The `suite.Config.VAPID` fields remain empty for most tests (as noted in the comment at line 127–130). Tests that exercise push delivery must set `suite.Config.VAPID` or inject a mock `PushSender`. In most integration tests, VAPID being empty is fine because push delivery is best-effort and failures are only logged.

---

### `migrations/YYYYMMDDHHMMSS_add_notification_cursor_index.sql` (new migration)

**Analog:** `migrations/20260530125310_create_notifications_table.sql` (exact pattern — goose Up/Down blocks):
```sql
-- +goose Up
CREATE INDEX idx_notifications_cursor ON notifications(user_id, created_at DESC, id DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_notifications_cursor;
```

**Creation command:** `just migrate-create add_notification_cursor_index` — do NOT hand-write the timestamp or filename.

The existing single-column indexes (`idx_notifications_user_id`, `idx_notifications_created_at`) remain; the new composite index is additive. PostgreSQL will use `idx_notifications_cursor` for the IDOR-scoped keyset query `WHERE user_id = ? AND (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC` because the index covers `user_id` (for the IDOR filter) then the two ordering columns.

---

### `cmd/server/main.go` (modify — DI wiring + route registration)

**Analog:** Lines 98–113 of main.go (service instantiation + handler construction):
```go
services.UserConnection = service.NewUserConnectionService(repos, services)
services.Transaction = service.NewTransactionService(repos, services)
services.Charge = service.NewChargeService(repos, services)
services.Onboarding = service.NewOnboardingService(repos)
services.PushSubscription = service.NewPushSubscriptionService(repos, cfg)
```

**Add after `services.PushSubscription`** (line 103):
```go
services.Notification = service.NewNotificationService(repos, cfg)
```

**Ordering note (see RESEARCH.md Open Question 1):** `chargeService` and `transactionService` hold a `*Services` pointer already captured at constructor time (lines 99–100). `services.Notification` is assigned after construction but before any request arrives. Go's single-threaded startup sequence guarantees the field is set before the first goroutine fires Dispatch. No circular dependency issue.

**Handler construction** (copy from lines 113 of main.go):
```go
notifHandler := handler.NewNotificationHandler(services)
```

**Route registration** (copy from push-subscriptions block at lines 206–209):
```go
// Notifications
notifications := api.Group("/notifications")
notifications.GET("", notifHandler.List)
notifications.GET("/unread-count", notifHandler.UnreadCount)
notifications.POST("/:id/read", notifHandler.MarkRead)
notifications.POST("/read-all", notifHandler.MarkAllRead)
```

**Route ordering note:** `/unread-count` and `/read-all` must be registered BEFORE `/:id/read` and any `:id`-based route. Echo matches routes in registration order for ambiguous patterns. Register fixed-string routes first.

---

## Shared Patterns

### Authentication / IDOR Guard
**Source:** All handler files — `appcontext.GetUserIDFromContext(c.Request().Context())` (e.g. push_subscription_handler.go line 35)
**Apply to:** All four `NotificationHandler` methods
**Pattern:** userID is always extracted from auth context, never from request body or query params.
```go
userID := appcontext.GetUserIDFromContext(c.Request().Context())
```
IDOR scope is enforced at the repository layer by including `user_id = ?` in every WHERE clause.

### Error Handling — Handler Layer
**Source:** `internal/handler/errors.go` lines 7–13 + usage in push_subscription_handler.go line 43
**Apply to:** All `NotificationHandler` methods
```go
if err != nil {
    return HandleServiceError(err)  // converts *ServiceError → echo HTTP error
}
```

### Error Handling — Service Layer
**Source:** `pkg/errors` + usage in push_subscription_service.go lines 72–74
**Apply to:** `notificationService` inbox methods (List, UnreadCount)
```go
return nil, pkgErrors.Internal("failed to list notifications", err)
return nil, pkgErrors.NotFound("notification") // MarkRead when RowsAffected == 0
```

### GetTxFromContext
**Source:** Every repository method in push_subscription_repository.go and charge_repository.go
**Apply to:** All five `notificationRepository` methods
```go
GetTxFromContext(ctx, r.db).Model(&entity.Notification{}).Where(...)
```
This is how transactions flow via context — never call `r.db` directly.

### Post-Commit Goroutine
**Source:** Pattern described in RESEARCH.md; commit boundaries verified in charge_accept.go line 234, transaction_create.go line 54, transaction_update.go line 223
**Apply to:** All four event source modifications
```go
// After successful commit only — never inside the tx or before commit:
go s.services.Notification.Dispatch(context.Background(), events)
```
Key rules: use `context.Background()` (not request ctx), call after commit returns nil, handle nil/empty events in Dispatch with an early return.

### Mock Regeneration
**Source:** CLAUDE.md `just generate-mocks` + RESEARCH.md Pitfall 7
**Apply to:** After modifying `NotificationRepository` interface and `PushSubscriptionRepository` interface (adding `ListByUserID`), and after adding `NotificationService` interface
**Command:** `just generate-mocks`

### Swagger Regeneration
**Source:** CLAUDE.md + push_subscription_handler.go annotation style
**Apply to:** After writing `notification_handler.go` godoc annotations
**Command:** `just generate-docs`

---

## No Analog Found

All files have close analogs in the codebase. The only genuinely novel pattern in this phase is cursor-based pagination — no existing List method uses keyset cursors; all existing lists use offset pagination (charges, transactions). The cursor encode/decode helpers and the `(created_at, id) < (?, ?)` GORM WHERE clause are new, but the GORM `Find` + entity slice + `ToDomain` loop pattern is unchanged.

| File | Novel Element | Guidance |
|---|---|---|
| `notification_repository.go` `List` method | Keyset cursor pagination | Use stdlib `encoding/base64` + `encoding/json`; GORM tuple comparison `(col1, col2) < (?, ?)` is standard PostgreSQL syntax; fetch `limit+1` rows to detect `hasMore` |
| `notification_service.go` `Dispatch` method | Post-commit goroutine + push send + 404/410 pruning | Pattern 1 + Pattern 5 in RESEARCH.md are fully specified; all code is assumed but derived from verified codebase patterns |

---

## Metadata

**Analog search scope:** `backend/internal/{handler,service,repository,entity,domain}`, `backend/cmd/server`, `backend/migrations`
**Files scanned:** 15
**Pattern extraction date:** 2026-05-30
