# Phase 23: Backend Notification Events & Inbox API - Research

**Researched:** 2026-05-30
**Domain:** Go notification dispatch (post-commit goroutine), cursor-based pagination, Web Push send, inbox API
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `split_updated` fires only when a partner-initiated edit changes the user's linked side's **amount**, or **adds/removes** the split. Reuse `updateChanges.AddedSplit()` / `RemovedSplit()` from structs.go; add amount-change detection on the linked side.
- **D-02:** Cosmetic edits — category, description, date — do **not** fire a notification.
- **D-03:** Only **partner-initiated** changes notify the other user. A user's edits to their own side never notify themselves.
- **D-04:** When a split is **removed**, the recipient is still notified. Deep-link references the (soft-deleted) linked transaction.
- **D-05:** Push notifications carry rich content: partner display name + formatted BRL amount + short context.
- **D-06:** Push copy is **pt-BR**; backend internal error strings remain English.
- **D-07 (template proposals — Claude discretion):**
  - `charge_received` → `"{partner} te cobrou {amount}: {description}"`
  - `charge_accepted` → `"{partner} aceitou sua cobrança de {amount}"`
  - `split_created` → `"{partner} adicionou uma transação dividida de {amount}"`
  - `split_updated` → `"{partner} atualizou uma transação dividida ({amount})"`
  - bulk summary → `"{partner} adicionou {n} transações divididas"`
- **D-08:** Coalesce by (recipient, notification type) per originating request: persist **one inbox row per affected entity**, send **one summary push** when a request yields multiple notifications of the same type for the same recipient.
- **D-09:** Coalescing rule applies to all event sources (single events, bulk splits, CSV import, bulk update).
- **D-10:** `GET /api/notifications` uses cursor-based pagination, most-recent-first.
- **D-11:** `GET /api/notifications/unread-count` returns the exact integer count.
- **D-12:** Marking read is explicit only — `POST /api/notifications/:id/read` and `POST /api/notifications/read-all`. GETs never mutate state.
- **D-13:** All inbox endpoints are IDOR-scoped to the authenticated user.
- **Dispatch model:** synchronous best-effort in a goroutine that starts after the originating DB transaction commits; a push failure never rolls back or blocks the HTTP request.
- **Library:** `github.com/SherClockHolmes/webpush-go v1.4.0`; prune subscriptions on HTTP 404/410 via `PushSubscriptionRepository.DeleteByEndpointAdmin`.
- **Persistence shape:** every notification persisted with `type` + `entity_type`/`entity_id`; table already exists from Phase 22.

### Claude's Discretion

- Always persist the notification row even when the recipient has no active push subscription.
- Exact dispatcher abstraction (e.g., `NotificationService` that collects events post-commit), goroutine lifecycle/logging, and currency-formatting helper location.
- Push payload JSON shape for the service worker — propose here, coordinate with Phase 24/25.
- Failure observability: log push send failures at an appropriate level (no metrics infra required for v1.6).

### Deferred Ideas (OUT OF SCOPE)

- Notification retention / cleanup job
- Per-notification-type preference toggles
- "99+" unread-count capping (frontend, Phase 25)
- Auto-mark-read on navigate (frontend, Phase 25)
- Aggregate/list deep-link entity type
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-01 | When the partner creates a new charge, the charge recipient receives a push notification | `chargeService.Create` hook; recipient = `otherPartyID`; entity_type="charge", entity_id=charge.ID |
| NOTIF-02 | When the partner accepts a charge, the charge creator receives a push notification | `chargeService.Accept` hook after `s.dbTransaction.Commit`; recipient = original charger |
| NOTIF-03 | When the partner creates a new split transaction, the user whose side receives the linked transaction gets a push notification | `transactionService.Create` hook after commit; recipient = each `lt.UserID != userID` in LinkedTransactions |
| NOTIF-04 | When the partner updates a split transaction in a way that affects the user's linked side, the user receives a push notification | `transactionService.Update` hook; detect via `updateChanges.AddedSplit()`, `RemovedSplit()`, `isLinkedTxEdit && req.Amount != nil`; recipient = partner |
| NOTIF-05 | Each notification is persisted server-side with its type and a deep-link reference | `NotificationRepository.Create`; always persists even without subscriptions |
| NOTIF-06 | Notifications dispatched after DB transaction commits; delivery failure does not roll back originating operation | Post-commit goroutine pattern; detached context; panic-recovery in goroutine |
</phase_requirements>

---

## Summary

Phase 23 wires Web Push delivery and the notification inbox on top of the Phase 22 foundation. The three main workstreams are: (1) filling in `NotificationRepository` with create/list/count/mark-read methods, (2) adding a `NotificationService` that collects notification events from the four event sources and dispatches them in a post-commit goroutine, and (3) four new inbox HTTP endpoints.

The codebase uses a strict four-layer architecture (Handler → Service → Repository → GORM). All four event sources (`chargeService.Create`, `chargeService.Accept`, `transactionService.Create`, `transactionService.Update`) manage their own DB transactions with the `Begin/Commit/Rollback` pattern from `db_transaction.go`. The post-commit goroutine fires **after** `s.dbTransaction.Commit(ctx)` returns without error, using a detached `context.Background()` (not the request context, which is cancelled after the response).

Existing pagination in this codebase is offset-based (transactions, charges). The inbox requires cursor-based pagination to stay stable under concurrent inserts. The recommended cursor is a base64url-encoded `(created_at, id)` composite — the compound WHERE clause is `(created_at, id) < ($cursorCreatedAt, $cursorID)` with `ORDER BY created_at DESC, id DESC LIMIT n`.

**Primary recommendation:** Add `NotificationService` with a `Dispatch(ctx, events)` method. Event sources collect `NotificationEvent` structs after commit and call `go notifService.Dispatch(context.Background(), events)`. The dispatcher persists inbox rows first, then groups by (recipient, type) for push coalescing, then iterates each recipient's subscriptions and calls `webpush.SendNotification`, pruning on 404/410. The handler layer adds four thin notification routes under `/api/notifications`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Notification persistence (inbox) | Database / Storage | API / Backend | Row written by service after commit; queried by inbox endpoints |
| Push dispatch (goroutine) | API / Backend | — | Best-effort side-effect; detached goroutine in service layer |
| Stale-subscription pruning (404/410) | API / Backend | Database / Storage | `DeleteByEndpointAdmin` called from within the dispatch goroutine |
| Inbox list + unread count | API / Backend | Database / Storage | Cursor-paged query with user_id IDOR scope |
| Bulk coalescing (D-08) | API / Backend | — | Service layer groups events by (recipient, type) before push send |
| BRL amount formatting | API / Backend | — | Only needed to build push copy; no frontend localization needed |
| Push payload shape (title/body/data) | API / Backend | — | Proposal in Code Examples section; coordinated with Phase 24/25 SW |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `github.com/SherClockHolmes/webpush-go` | v1.4.0 | Web Push send + VAPID | Already in go.mod from Phase 22; project standard |
| `gorm.io/gorm` | v1.31.1 | Repository queries for notifications | Already in go.mod; project ORM |
| `github.com/labstack/echo/v4` | v4.13.4 | Handler routing | Already in go.mod |

All are **already installed** — no new `go get` required for Phase 23. [VERIFIED: backend/go.mod via codebase]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `encoding/base64` (stdlib) | — | Cursor token encoding (base64url) | In `NotificationRepository.List` for cursor encode/decode |
| `encoding/json` (stdlib) | — | Push payload JSON marshaling | In dispatch goroutine |
| `fmt` (stdlib) | — | BRL currency formatting | In notification copy builder (`fmt.Sprintf("R$ %s", formatBRL(cents))`) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cursor `(created_at, id)` | Offset pagination | Offset is unstable under concurrent inserts; cursor is stable. No existing analog in this codebase — introduce it here. |
| `context.Background()` in goroutine | `context.WithoutCancel(ctx)` (Go 1.21+) | `context.Background()` is simpler and already conventional; both work. `go.mod` requires 1.24.4+ so `WithoutCancel` is available if preferred. |
| Inline push logic in event services | Dedicated `NotificationService` | Dedicated service keeps the event sources thin and keeps the dispatch contract (collect events, fire goroutine once after commit) in one place. |

---

## Architecture Patterns

### System Architecture Diagram

```
HTTP Request
     │
     ▼
[Echo AuthMiddleware]
     │
     ▼
[Event Source Handler]   (charge_handler / transaction_handler)
     │  userID from context
     ▼
[Event Source Service]   (chargeService / transactionService)
     │  Begin tx
     │  ... DB writes ...
     │  Commit tx ──── returns nil on success
     │
     ├── on error → return ServiceError (no notification)
     │
     └── on success:
          │  collect []NotificationEvent (in-memory structs, no DB calls)
          │  go notificationService.Dispatch(context.Background(), events)
          │
          ▼  (goroutine — detached from request lifecycle)
     [NotificationService.Dispatch]
          │  1. persist inbox rows  (NotificationRepository.Create per event)
          │  2. group events by (recipientUserID, notificationType) — D-08
          │  3. for each group:
          │       fetch recipient.Name for copy
          │       fetch push subscriptions for recipient (PushSubscriptionRepository)
          │       if no subscriptions → skip push, inbox row already persisted
          │       build push payload JSON
          │       call webpush.SendNotification for each subscription
          │         → 404/410? call DeleteByEndpointAdmin
          │         → other error? log.Warn, continue
          ▼
     [NotificationRepository]  [PushSubscriptionRepository]
          │                              │
          └──────────────────────────────┘
                        │
                        ▼
                    PostgreSQL
                 (notifications, push_subscriptions)


Inbox API (separate request path):

[Echo AuthMiddleware]
     │
     ▼
[NotificationHandler]
     │
     ▼
[NotificationService]
  List(ctx, userID, cursor, limit)
  UnreadCount(ctx, userID)
  MarkRead(ctx, userID, id)
  MarkAllRead(ctx, userID)
     │
     ▼
[NotificationRepository]
     │
     ▼
PostgreSQL
```

### Recommended Project Structure

```
backend/
├── internal/
│   ├── domain/
│   │   └── push_subscription.go      ← add NotificationEvent, NotificationFilter,
│   │                                    NotificationListResult, cursor types
│   ├── repository/
│   │   ├── interfaces.go             ← replace empty NotificationRepository with
│   │   │                               Create/List/UnreadCount/MarkRead/MarkAllRead
│   │   └── notification_repository.go ← implement the 5 methods
│   ├── service/
│   │   ├── interfaces.go             ← add NotificationService interface
│   │   ├── notification_service.go   ← new: Dispatch + inbox methods
│   │   └── {charge,transaction}_*.go ← hook post-commit goroutine (minimal change)
│   └── handler/
│       └── notification_handler.go   ← new: 4 inbox endpoints
├── mocks/
│   └── mock_NotificationRepository.go ← regenerate after interface update
│   └── mock_NotificationService.go    ← new after service interface added
└── cmd/server/main.go                 ← wire NotificationService; register routes
```

### Pattern 1: Post-commit goroutine dispatch

**What:** After `Commit()` returns nil, collect events and launch a single goroutine. The goroutine uses `context.Background()` (not the request context, which is already cancelled after the response is sent). The goroutine recovers from panics to prevent crashing the server.

**When to use:** Every event source that has a DB transaction — chargeService.Create, chargeService.Accept, transactionService.Create (split path), transactionService.Update (split-affected path).

**Concrete commit boundaries (verified by reading source):**

| Event source | Commit location | How to detect "split event" | Recipient |
|---|---|---|---|
| `chargeService.Create` | Line ~154: `return s.chargeRepo.Create(ctx, charge)` — no explicit tx, single repo.Create | Always fires (NOTIF-01); recipient = `otherPartyID` computed at line ~97 | `otherPartyID` |
| `chargeService.Accept` | Line ~234: `s.dbTransaction.Commit(txCtx)` — explicit commit, returns nil | Always fires (NOTIF-02); recipient = original `charge.ChargerUserID` (before possible role swap; at commit time the in-memory charge has correct roles) | `charge.ChargerUserID` at commit time — the party who did NOT call Accept is the notified one; use `callerUserID != expectedAccepterID` → notify `expectedAccepterID`'s counterpart. Simpler: after commit, notify the non-caller: `recipientID = charge.ChargerUserID if callerUserID == charge.PayerUserID else charge.PayerUserID`. |
| `transactionService.Create` | Line ~54: `s.dbTransaction.Commit(ctx)` | Split path: `len(req.SplitSettings) > 0 && req.SharedAccountConnection == nil && req.TransactionType != Transfer`. Recipient = each `lt.UserID != userID` in `transaction.LinkedTransactions` of the first (main) transaction. | Multiple linked tx users possible (bulk) |
| `transactionService.Update` | Line ~222: `return s.dbTransaction.Commit(ctx)` | See NOTIF-04 section below. | Partner whose linked side changed |

**chargeService.Create has no explicit transaction** — it calls `chargeRepo.Create` directly (no `Begin/Commit`). The notification fires after the method returns without error. No goroutine scoping issue; the method itself is the commit boundary.

```go
// Source: verified codebase pattern — charge_service.go, transaction_create.go
// In chargeService.Create (no explicit tx):
charge, err := s.chargeRepo.Create(ctx, charge)
if err != nil {
    return nil, err
}
// commit happened inside chargeRepo.Create's single INSERT.
// Fire goroutine here — charge.ID is now valid.
events := []domain.NotificationEvent{{
    RecipientUserID: otherPartyID,
    Type:            domain.NotificationTypeChargeReceived,
    EntityType:      "charge",
    EntityID:        charge.ID,
    ActorUserID:     callerUserID,
    Amount:          lo.FromPtr(charge.Amount),
    Description:     lo.FromPtr(&charge.Description),
}}
go s.services.Notification.Dispatch(context.Background(), events)
return charge, nil

// In chargeService.Accept (explicit tx):
if err := s.dbTransaction.Commit(txCtx); err != nil {
    return pkgErrors.Internal("failed to commit accept", err)
}
// txCtx is invalidated after commit — goroutine uses context.Background()
go s.services.Notification.Dispatch(context.Background(), []domain.NotificationEvent{{
    RecipientUserID: /* the caller's counterpart */,
    Type:            domain.NotificationTypeChargeAccepted,
    EntityType:      "charge",
    EntityID:        chargeID,
    ActorUserID:     callerUserID,
    Amount:          amount,
}})
return nil
```

**Goroutine panic safety:**

```go
// Source: [ASSUMED] — standard Go recover pattern
func (s *notificationService) Dispatch(ctx context.Context, events []domain.NotificationEvent) {
    defer func() {
        if r := recover(); r != nil {
            // applog is request-scoped; use a package-level logger here
            // since this runs outside request context.
            log.Printf("notification dispatch panic: %v", r)
        }
    }()
    // ... dispatch logic
}
```

### Pattern 2: NotificationEvent domain type

**What:** A lightweight in-memory struct that the event source populates and passes to the goroutine. It is NOT persisted directly — the `Dispatch` method converts it to `domain.Notification` rows.

```go
// Source: proposed — place in internal/domain/push_subscription.go alongside Notification
// [ASSUMED] — exact field set is Claude's discretion per CONTEXT.md

type NotificationEvent struct {
    RecipientUserID int
    ActorUserID     int    // user who took the action — for display name lookup
    Type            string // domain constant: NotificationTypeChargeReceived etc.
    EntityType      string // "charge" or "transaction"
    EntityID        int
    Amount          int64  // cents — for BRL copy formatting
    Description     string // e.g., charge description
}

// Notification type constants (define in domain/push_subscription.go or new domain/notification.go)
const (
    NotificationTypeChargeReceived = "charge_received"
    NotificationTypeChargeAccepted = "charge_accepted"
    NotificationTypeSplitCreated   = "split_created"
    NotificationTypeSplitUpdated   = "split_updated"
)
```

### Pattern 3: Cursor-based pagination

**What:** The notifications table has `(created_at TIMESTAMPTZ, id SERIAL)`. Most-recent-first ordering uses `ORDER BY created_at DESC, id DESC`. A keyset cursor encodes the last row's `(created_at, id)` as a base64url JSON blob. The next-page WHERE clause is `(created_at, id) < ($1, $2)`.

**Why (created_at, id) and not just id:** `id` alone works because SERIAL is monotone-increasing, but the composite with `created_at` is self-documenting and makes the query plan use the `idx_notifications_created_at` index directly. [VERIFIED: idx_notifications_created_at exists in migration 20260530125310]

**Cursor encode/decode:**

```go
// Source: [ASSUMED] — standard cursor pattern for this stack
import (
    "encoding/base64"
    "encoding/json"
    "time"
)

type notificationCursor struct {
    CreatedAt time.Time `json:"ca"`
    ID        int       `json:"id"`
}

func encodeCursor(createdAt time.Time, id int) string {
    raw, _ := json.Marshal(notificationCursor{CreatedAt: createdAt, ID: id})
    return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeCursor(token string) (*notificationCursor, error) {
    b, err := base64.RawURLEncoding.DecodeString(token)
    if err != nil {
        return nil, err
    }
    var c notificationCursor
    if err := json.Unmarshal(b, &c); err != nil {
        return nil, err
    }
    return &c, nil
}
```

**GORM query:**

```go
// Source: [ASSUMED] — derived from GORM docs + notifications schema
// In notificationRepository.List:
query := GetTxFromContext(ctx, r.db).
    Model(&entity.Notification{}).
    Where("user_id = ?", filter.UserID).
    Order("created_at DESC, id DESC").
    Limit(filter.Limit + 1) // fetch one extra to detect hasMore

if filter.Cursor != nil {
    query = query.Where(
        "(created_at, id) < (?, ?)",
        filter.Cursor.CreatedAt, filter.Cursor.ID,
    )
}

var ents []entity.Notification
if err := query.Find(&ents).Error; err != nil {
    return nil, err
}

hasMore := len(ents) > filter.Limit
if hasMore {
    ents = ents[:filter.Limit]
}
// encode cursor from last element if hasMore
```

**Domain types for the list response:**

```go
// Source: [ASSUMED] — place in domain/push_subscription.go
type NotificationFilter struct {
    UserID int
    Cursor *notificationCursor // nil = first page
    Limit  int
}

type NotificationListResult struct {
    Items      []*Notification
    NextCursor string // empty string means no more pages
    HasMore    bool
}
```

**Inbox response shape for `GET /api/notifications`:**

```json
{
  "notifications": [
    {
      "id": 42,
      "type": "charge_received",
      "entity_type": "charge",
      "entity_id": 7,
      "read": false,
      "created_at": "2026-05-30T12:34:56Z"
    }
  ],
  "next_cursor": "eyJjYSI6IjIwMjYtMDUtMzBUMTI6MzQ6NTZaIiwiaWQiOjQyfQ",
  "has_more": true
}
```

### Pattern 4: BRL currency formatting

**What:** Format `int64` cents as pt-BR BRL string for push copy. No external library needed — format inline.

```go
// Source: [ASSUMED] — standard Go string formatting
// Place in a helper in internal/service/notification_service.go
// (or a shared pkg/currency package if warranted).
import "fmt"

// formatBRL converts cents to "R$ 1.234,56" (pt-BR decimal notation).
func formatBRL(cents int64) string {
    reais := cents / 100
    centavos := cents % 100
    if centavos < 0 {
        centavos = -centavos
    }
    // format thousands separator (Portuguese: period)
    reaisStr := fmt.Sprintf("%d", reais)
    // insert thousands separators
    n := len(reaisStr)
    var result []byte
    for i, c := range reaisStr {
        if i > 0 && (n-i)%3 == 0 {
            result = append(result, '.')
        }
        result = append(result, byte(c))
    }
    return fmt.Sprintf("R$ %s,%02d", string(result), centavos)
}
// Examples: 123456 → "R$ 1.234,56", 5000 → "R$ 50,00"
```

### Pattern 5: Push payload JSON (proposed — Phase 24/25 contract)

The service worker in Phase 24 will receive this payload from the push event. The `data` object provides the deep-link.

```json
{
  "title": "Finance App",
  "body": "Maria te cobrou R$ 50,00: Jantar",
  "data": {
    "type": "charge_received",
    "entity_type": "charge",
    "entity_id": 7,
    "notification_id": 42
  }
}
```

`notification_id` allows the Phase 25 inbox to mark the notification read when the push is tapped without a separate API call.

**Push send (verified from Phase 22 research, calling webpush.SendNotification):**

```go
// Source: pkg.go.dev/github.com/sherclockholmes/webpush-go [CITED]
// + 22-RESEARCH.md § "Code Examples — webpush-go: send notification"
payload, _ := json.Marshal(pushPayload) // pushPayload is the struct above

resp, sendErr := webpush.SendNotification(payload, &webpush.Subscription{
    Endpoint: sub.Endpoint,
    Keys: webpush.Keys{
        Auth:   sub.Auth,
        P256dh: sub.P256dh,
    },
}, &webpush.Options{
    Subscriber:      s.vapid.Subject,
    VAPIDPublicKey:  s.vapid.PublicKey,
    VAPIDPrivateKey: s.vapid.PrivateKey,
    TTL:             30,
})
if sendErr != nil {
    logger.Warn().Err(sendErr).Str("endpoint", sub.Endpoint).Msg("push send error")
    continue
}
if resp != nil {
    defer resp.Body.Close()
    if resp.StatusCode == 404 || resp.StatusCode == 410 {
        if pruneErr := s.pushSubRepo.DeleteByEndpointAdmin(ctx, sub.Endpoint); pruneErr != nil {
            logger.Warn().Err(pruneErr).Msg("failed to prune stale subscription")
        }
    }
}
```

### Pattern 6: NotificationService interface

```go
// Source: [ASSUMED] — place in internal/service/interfaces.go
type NotificationService interface {
    Dispatch(ctx context.Context, events []domain.NotificationEvent) // called in goroutine
    List(ctx context.Context, userID int, filter domain.NotificationFilter) (*domain.NotificationListResult, error)
    UnreadCount(ctx context.Context, userID int) (int64, error)
    MarkRead(ctx context.Context, userID, notificationID int) error
    MarkAllRead(ctx context.Context, userID int) error
}
```

### Pattern 7: NotificationRepository interface (extends the Phase 22 stub)

```go
// Source: [ASSUMED] — replace empty NotificationRepository in interfaces.go
type NotificationRepository interface {
    Create(ctx context.Context, notification *domain.Notification) (*domain.Notification, error)
    List(ctx context.Context, filter domain.NotificationFilter) (*domain.NotificationListResult, error)
    UnreadCount(ctx context.Context, userID int) (int64, error)
    MarkRead(ctx context.Context, userID, notificationID int) error
    MarkAllRead(ctx context.Context, userID int) error
}
```

After modifying the interface, run `just generate-mocks` (or the underlying `mockery` binary) to regenerate `mocks/mock_NotificationRepository.go`.

### Pattern 8: NOTIF-04 amount-change detection in transaction_update.go

**What:** NOTIF-04 fires when the partner-initiated update affects the partner's linked side by: adding the split, removing the split, or changing the split amount.

**Detection logic (verified from structs.go and transaction_update.go):**

```
// NOTIF-04 fires when ALL of the following hold:
// 1. callerUserID != transaction.OriginalUserID  (partner-initiated, not self-edit)
//    — OR isLinkedTxEdit (partner editing their own linked tx side)
// 2. One of:
//    a. updateChanges.AddedSplit()       — split came into existence
//    b. updateChanges.RemovedSplit()     — split went out of existence
//    c. data.isLinkedTxEdit && req.Amount != nil && *req.Amount > 0
//       — partner edited their own linked tx amount
//       (this is the "amount change on linked side" case; verified at
//        transaction_update.go line ~209: "isLinkedTxEdit && req.Amount != nil")
```

**Recipient resolution for NOTIF-04:**

- `AddedSplit()` / `RemovedSplit()` path: the `data.previousTransaction` is the author's transaction. After `injectUserConnectionsOnSplitSettings`, the partner's userID is `splitSetting.UserConnection.ToUserID` for each new or removed split. For the removed case, iterate `data.previousTransaction.LinkedTransactions` — each `lt.UserID != callerUserID` is a recipient.
- `isLinkedTxEdit && req.Amount != nil` path: the caller IS the partner editing their own linked tx. The source transaction owner (`sourceIDs` → `sourceTx.UserID`) is the recipient. Source IDs are already fetched at update.go line ~31.

**Cosmetic fields that do NOT fire NOTIF-04 (D-02):**
```
category, description, date → these are the only non-amount non-split fields
in TransactionUpdateRequest. The detection above (amount-change OR split-change)
naturally excludes them.
```

### Pattern 9: Recipient display name resolution

The push copy template requires `{partner}` (first name or display name). The `User` domain type has a `Name` field. The `NotificationService.Dispatch` must call `UserRepository.GetByID` for the actor to get their display name. This is a single DB read per dispatch invocation (not per event), since all events in one dispatch share the same actor.

**Important:** `UserRepository` is already wired in `Repositories`. `NotificationService` should hold a `userRepo repository.UserRepository` field for name lookups.

### Anti-Patterns to Avoid

- **Using the request context in the goroutine:** The request context is cancelled as soon as the HTTP response is sent. The goroutine must use `context.Background()`.
- **Firing the goroutine before commit:** If `Commit()` returns an error, the DB write was rolled back. Firing the goroutine before confirming commit would persist ghost notifications for data that doesn't exist.
- **Holding a tx-context in the goroutine:** After `Commit()`, the `txCtx` holds a committed transaction handle — safe to read, unsafe to write against. The goroutine uses `context.Background()` so it never inherits the tx.
- **Nesting the notification persistence inside the originating transaction:** Notifications are a best-effort side-effect. Persisting them inside the same transaction would couple delivery to business logic and violate NOTIF-06.
- **Forgetting to recover from panics in the goroutine:** An unrecovered panic in a goroutine crashes the whole server (Go runtime). Always `defer recover()`.
- **Always fetching display names per-event in bulk dispatch:** If 50 split creations happen in one request (CSV import), each calls `GetByID` 50 times for the same actor. Cache the actor name once per Dispatch call.
- **Sending push before persisting the inbox row:** If push send panics, the row is lost. Always persist first, then push.
- **Using `fmt.Sprintf` with large offset-paginated queries for notifications:** The table grows unboundedly (no cleanup in v1.6). Cursor pagination is mandatory.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VAPID JWT signing + AES-128-GCM encryption | Custom crypto | `webpush.SendNotification` | Already in go.mod; see Phase 22 research |
| Stale subscription pruning | Re-implement delete logic | `pushSubRepo.DeleteByEndpointAdmin` | Already built in Phase 22 |
| Keyset cursor encoding | Custom binary format | `encoding/base64` + `encoding/json` (stdlib) | Opaque token; JSON+base64url is standard, debuggable |
| BRL number formatting | External i18n library | Inline `fmt.Sprintf` helper | Currency format is fixed (pt-BR BRL); one helper function is sufficient |
| Display name resolution | Re-implement user lookup | `UserRepository.GetByID` | Already wired; single call per Dispatch |

---

## Common Pitfalls

### Pitfall 1: Request context cancelled in goroutine

**What goes wrong:** The goroutine calls `GetTxFromContext(requestCtx, db)` — this inherits the GORM DB bound to the (already committed or cancelled) request context. Repository calls may silently use a cancelled context and return `context canceled` errors.
**Why it happens:** `GetTxFromContext` checks for `ctx.Value("tx")`. If `txCtx` is passed, it uses the committed transaction handle; if the plain request context is passed, GORM's `WithContext` uses the (now-cancelled) parent. Either way, DB calls fail.
**How to avoid:** Always pass `context.Background()` (or `context.WithTimeout(context.Background(), 30*time.Second)`) as the goroutine's root context.
**Warning signs:** Push dispatch logs show `context canceled` or `deadline exceeded` errors even when the request succeeded.

### Pitfall 2: chargeService.Create has no explicit transaction boundary

**What goes wrong:** Developer looks for a `Commit()` call in `chargeService.Create` to hook the goroutine, doesn't find one, and either skips the notification or adds incorrect logic.
**Why it happens:** `chargeService.Create` calls `chargeRepo.Create(ctx, charge)` directly — no `Begin/Commit` call (verified in codebase). The repo `Create` issues a single `INSERT` that auto-commits.
**How to avoid:** Treat the non-error return from `chargeRepo.Create` as the commit boundary. Collect the returned `charge` (which now has a valid `charge.ID`) and fire the goroutine immediately after.
**Warning signs:** `charge.ID == 0` at goroutine launch time.

### Pitfall 3: chargeService.Accept role swap changes ChargerUserID before commit

**What goes wrong:** Developer reads `charge.ChargerUserID` AFTER the role swap (line ~124 in charge_accept.go) to determine who to notify, gets the swapped value, and notifies the wrong person.
**Why it happens:** `Accept` may swap ChargerUserID/PayerUserID when the live balance is negative (role swap at line ~124). After the swap, `charge.ChargerUserID` is the original payer, not the original charger.
**How to avoid:** For NOTIF-02 ("charger receives notification when their charge is accepted"), the recipient is always the non-caller. Use: `if callerUserID == charge.PayerUserID { recipientID = charge.ChargerUserID } else { recipientID = charge.PayerUserID }` — or simply store `otherPartyID = initialChargerUserID` before the swap logic runs.
**Warning signs:** Notification delivered to the person who just accepted the charge (the caller) rather than the initiator.

### Pitfall 4: NOTIF-03 fires for shared-account (connection) transactions

**What goes wrong:** Developer hooks the notification at `transactionService.Create` return, without checking the `req.SharedAccountConnection` guard. A transaction on a shared connection account also has a `LinkedTransaction` for the partner, but this path is NOT a split — it is a mirrored transaction and does not warrant a `split_created` notification.
**Why it happens:** `createTransactions` calls `injectLinkedTransactions` for both the shared-account path (`req.SharedAccountConnection != nil`) and the split path. Both produce `LinkedTransactions`.
**How to avoid:** Only fire NOTIF-03 when `req.SharedAccountConnection == nil && len(req.SplitSettings) > 0`. This exactly mirrors the guard at `transaction_create.go:252` that controls settlement creation.
**Warning signs:** Push notifications fired for every mirrored shared-account transaction.

### Pitfall 5: NOTIF-04 fires for the user editing their own side (D-03)

**What goes wrong:** Developer fires NOTIF-04 for all transaction updates where `data.scenario.AddedSplit()` is true, including when `callerUserID == data.previousTransaction.OriginalUserID`.
**Why it happens:** The original author can also add a split (they are the `OriginalUserID`). Only a partner edit should notify.
**How to avoid:** Before firing NOTIF-04, check: the caller is NOT the original author OR the caller is editing a linked tx (isLinkedTxEdit). For the `isLinkedTxEdit` case the caller is the partner by definition. For the non-linked-tx case, only fire when `callerUserID != *data.previousTransaction.OriginalUserID`.

### Pitfall 6: Bulk D-08 coalescing — one push per group but one inbox row per entity

**What goes wrong:** Developer sends one push AND writes one inbox row per group (losing individual deep-links). Or sends one push per entity (flooding the device with N notifications).
**Why it happens:** D-08 says "one summary push when a request produces multiple notifications of the same type for the same recipient" but "one inbox row per entity."
**How to avoid:** In `Dispatch`: (1) call `NotificationRepository.Create` for every event in the batch; (2) after creating all rows, group by `(RecipientUserID, Type)` to produce the push send list; (3) if a group has one event, send the specific copy (D-07 templates); if >1 events, send the bulk summary template.

### Pitfall 7: Forgetting to regenerate mocks after interface change

**What goes wrong:** `NotificationRepository` currently has zero methods. Adding methods to the interface without regenerating mocks causes compile errors in test files that use `MockNotificationRepository`.
**How to avoid:** After adding methods to `NotificationRepository` and `NotificationService` interfaces, run `just generate-mocks` (or `mockery --all --dir ./internal/...`).
**Warning signs:** Compile error: `MockNotificationRepository does not implement NotificationRepository (missing method Create)`.

### Pitfall 8: Inbox cursor — PostgreSQL tuple comparison requires index support

**What goes wrong:** The WHERE clause `(created_at, id) < ($1, $2)` triggers a sequential scan on large tables if there is no suitable composite index.
**Why it happens:** The existing `idx_notifications_created_at` is on `(created_at DESC)` alone. PostgreSQL CAN use a single-column DESC index for the tuple comparison in many cases (depends on query plan), but a composite index `(created_at DESC, id DESC)` is more reliable.
**How to avoid:** Add a migration to create `CREATE INDEX idx_notifications_cursor ON notifications(user_id, created_at DESC, id DESC)` — the three-column composite covers the IDOR scope + sort order in one index scan.
**Warning signs:** Slow inbox queries as the notifications table grows; EXPLAIN shows Seq Scan.

---

## Code Examples

### NotificationService: Dispatch skeleton

```go
// Source: [ASSUMED] — derived from codebase patterns
func (s *notificationService) Dispatch(ctx context.Context, events []domain.NotificationEvent) {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("[notification] dispatch panic: %v", r)
        }
    }()

    if len(events) == 0 {
        return
    }

    // 1. Persist all inbox rows (always — even if no subscriptions exist).
    createdRows := make([]*domain.Notification, 0, len(events))
    for _, ev := range events {
        row, err := s.notifRepo.Create(ctx, &domain.Notification{
            UserID:     ev.RecipientUserID,
            Type:       ev.Type,
            EntityType: ev.EntityType,
            EntityID:   ev.EntityID,
        })
        if err != nil {
            log.Printf("[notification] failed to persist row: %v", err)
            continue // best-effort; don't abort other rows
        }
        createdRows = append(createdRows, row)
    }

    // 2. Resolve actor display name (once per Dispatch call; all events share same actor).
    actor, err := s.userRepo.GetByID(ctx, events[0].ActorUserID)
    actorName := "Parceiro" // fallback if lookup fails
    if err == nil && actor != nil {
        actorName = actor.Name
    }

    // 3. Group by (recipientUserID, type) for push coalescing (D-08).
    type groupKey struct {
        RecipientUserID int
        Type            string
    }
    groups := make(map[groupKey][]domain.NotificationEvent)
    for _, ev := range events {
        k := groupKey{ev.RecipientUserID, ev.Type}
        groups[k] = append(groups[k], ev)
    }

    // 4. Send one push per group.
    for key, evGroup := range groups {
        subs, err := s.pushSubRepo.ListByUserID(ctx, key.RecipientUserID)
        if err != nil || len(subs) == 0 {
            continue // no subscriptions — inbox row already persisted; skip push
        }

        payload := s.buildPayload(actorName, evGroup)
        rawPayload, err := json.Marshal(payload)
        if err != nil {
            continue
        }

        for _, sub := range subs {
            resp, sendErr := webpush.SendNotification(rawPayload, &webpush.Subscription{
                Endpoint: sub.Endpoint,
                Keys:     webpush.Keys{Auth: sub.Auth, P256dh: sub.P256dh},
            }, &webpush.Options{
                Subscriber:      s.vapid.Subject,
                VAPIDPublicKey:  s.vapid.PublicKey,
                VAPIDPrivateKey: s.vapid.PrivateKey,
                TTL:             30,
            })
            if sendErr != nil {
                log.Printf("[notification] push send error endpoint=%s err=%v", sub.Endpoint, sendErr)
                continue
            }
            if resp != nil {
                defer resp.Body.Close()
                if resp.StatusCode == 404 || resp.StatusCode == 410 {
                    _ = s.pushSubRepo.DeleteByEndpointAdmin(ctx, sub.Endpoint)
                }
            }
        }
    }
}
```

### PushSubscriptionRepository: add ListByUserID

The Dispatch goroutine needs to fetch all subscriptions for a recipient. `PushSubscriptionRepository` needs a new method `ListByUserID(ctx, userID) ([]*domain.PushSubscription, error)`. Add it to the interface and implement it.

```go
// Source: [ASSUMED] — derived from existing ExistsForUser pattern
func (r *pushSubscriptionRepository) ListByUserID(ctx context.Context, userID int) ([]*domain.PushSubscription, error) {
    var ents []entity.PushSubscription
    if err := GetTxFromContext(ctx, r.db).
        Where("user_id = ?", userID).
        Find(&ents).Error; err != nil {
        return nil, err
    }
    result := make([]*domain.PushSubscription, len(ents))
    for i, ent := range ents {
        result[i] = ent.ToDomain()
    }
    return result, nil
}
```

Note: `ListByUserID` must also be added to `PushSubscriptionRepository` interface in `interfaces.go` and mocks regenerated.

### NotificationRepository: Create implementation

```go
// Source: [ASSUMED] — derived from charge_repository.go Create pattern
func (r *notificationRepository) Create(ctx context.Context, n *domain.Notification) (*domain.Notification, error) {
    ent := entity.NotificationFromDomain(n)
    if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
        return nil, err
    }
    return ent.ToDomain(), nil
}
```

### NotificationRepository: UnreadCount

```go
// Source: [ASSUMED]
func (r *notificationRepository) UnreadCount(ctx context.Context, userID int) (int64, error) {
    var count int64
    err := GetTxFromContext(ctx, r.db).
        Model(&entity.Notification{}).
        Where("user_id = ? AND read = false", userID).
        Count(&count).Error
    return count, err
}
```

### NotificationRepository: MarkRead (IDOR-scoped)

```go
// Source: [ASSUMED]
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

### NotificationRepository: MarkAllRead

```go
// Source: [ASSUMED]
func (r *notificationRepository) MarkAllRead(ctx context.Context, userID int) error {
    return GetTxFromContext(ctx, r.db).
        Model(&entity.Notification{}).
        Where("user_id = ? AND read = false", userID).
        Update("read", true).Error
}
```

### Swagger annotations for notification endpoints

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

// UnreadCount godoc
// @Summary      Get unread notification count
// @Tags         notifications
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {object}  domain.NotificationUnreadCountResponse
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/notifications/unread-count [get]

// MarkRead godoc
// @Summary      Mark a notification as read
// @Tags         notifications
// @Security     CookieAuth
// @Security     BearerAuth
// @Param        id  path  int  true  "Notification ID"
// @Success      204
// @Failure      401  {object}  middleware.ErrorResponse
// @Failure      404  {object}  middleware.ErrorResponse
// @Router       /api/notifications/{id}/read [post]

// MarkAllRead godoc
// @Summary      Mark all notifications as read
// @Tags         notifications
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      204
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/notifications/read-all [post]
```

---

## NOTIF-04 Integration Point — Detailed

`transactionService.Update` is the most complex event source. Here is the precise hook location and detection logic:

**File:** `backend/internal/service/transaction_update.go`

**Hook location:** After `s.dbTransaction.Commit(ctx)` at line ~222 (the final line of `Update`).

**Detection — verified field names from structs.go and transaction_update.go:**

```
// data.scenario.AddedSplit() → true when:
//   scenarios: EXPENSE_WITHOUT_SPLIT_TO_EXPENSE_WITH_SPLIT,
//              EXPENSE_WITHOUT_SPLIT_TO_INCOME_WITH_SPLIT,
//              INCOME_WITHOUT_SPLIT_TO_EXPENSE_WITH_SPLIT,
//              INCOME_WITHOUT_SPLIT_TO_INCOME_WITH_SPLIT,
//              TRANSFER_TO_EXPENSE_WITH_SPLIT,
//              TRANSFER_TO_INCOME_WITH_SPLIT

// data.scenario.RemovedSplit() → true when:
//   scenarios: EXPENSE_WITH_SPLIT_TO_EXPENSE_WITHOUT_SPLIT, ...

// isLinkedTxEdit && req.Amount != nil → partner changed their own linked tx amount

// Amount-change-on-linked-side detection:
//   data.isLinkedTxEdit is already computed on line ~36 of Update
//   req.Amount is *int64; non-nil means amount was included in the request
```

**Recipient for each case:**

| Case | How to identify recipient(s) |
|------|-------------------------------|
| `AddedSplit()` | For each `splitSetting` in `data.req.SplitSettings`, recipient = `splitSetting.UserConnection.ToUserID` |
| `RemovedSplit()` | For each `lt` in `data.previousTransaction.LinkedTransactions` where `lt.UserID != callerUserID`, recipient = `lt.UserID`. If the linked tx was soft-deleted by `transactionRepo.Delete`, the entity_id still references it (D-04). |
| `isLinkedTxEdit && req.Amount != nil` | Caller IS the partner (linked tx owner). Recipient = source transaction's owner. Source owner: `sourceTx.UserID` where `sourceIDs` is already computed (line ~31). |
| `data.scenario.SplitHasChanged` AND neither AddedSplit nor RemovedSplit | Connection swapped mid-update: this is equivalent to remove+add — treat as split_updated on the new and removed partners. |

**Partner-initiated check (D-03):**
- Non-linked-tx path: fire only when `callerUserID != *data.previousTransaction.OriginalUserID`.
- `isLinkedTxEdit` path: caller IS the partner by definition → always fire.

---

## DI Wiring (main.go additions)

```go
// After existing service instantiation in cmd/server/main.go:

// NotificationService needs: notifRepo, pushSubRepo, userRepo, vapid config
services.Notification = service.NewNotificationService(repos, cfg)

// NotificationHandler:
notifHandler := handler.NewNotificationHandler(services)

// Routes (under api group, behind RequireAuth):
notifications := api.Group("/notifications")
notifications.GET("", notifHandler.List)
notifications.GET("/unread-count", notifHandler.UnreadCount)
notifications.POST("/:id/read", notifHandler.MarkRead)
notifications.POST("/read-all", notifHandler.MarkAllRead)
```

**NotificationService constructor signature:**

```go
func NewNotificationService(repos *repository.Repositories, cfg *config.Config) NotificationService {
    return &notificationService{
        notifRepo:   repos.Notification,
        pushSubRepo: repos.PushSubscription,
        userRepo:    repos.User,
        vapid:       cfg.VAPID,
    }
}
```

The `Services` struct needs a `Notification NotificationService` field added to `service/interfaces.go`.

The event source services (`chargeService`, `transactionService`) access `NotificationService` via `s.services.Notification.Dispatch(...)` — consistent with how `chargeService` calls `s.services.Transaction.GetBalance`.

---

## Migration Required

**One new migration:** Add a composite index for efficient cursor pagination.

```sql
-- +goose Up
CREATE INDEX idx_notifications_cursor ON notifications(user_id, created_at DESC, id DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_notifications_cursor;
```

Create with: `just migrate-create add_notification_cursor_index`
(or `$(go env GOPATH)/bin/goose create add_notification_cursor_index sql` from `backend/migrations/`)

The existing single-column indexes (`idx_notifications_user_id`, `idx_notifications_created_at`) can remain — the new composite is an additive optimization.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Offset pagination for all lists | Cursor-based for notification inbox | Phase 23 (first use) | Stable under concurrent inserts; no drift as rows are added |
| Push after same-tx commit | Post-commit goroutine (best-effort) | Phase 23 | Delivery failure does not roll back finance operations (NOTIF-06) |

**Deprecated/outdated:**
- Empty `NotificationRepository` interface (Phase 22 stub): replaced in Phase 23 with 5 concrete methods.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `context.Background()` is the correct detached context for the dispatch goroutine | Pattern 1 | Low — `context.Background()` never cancels; `context.WithoutCancel` is equivalent but noisier |
| A2 | The dispatch goroutine uses `log.Printf` (package-level logger) rather than the per-request `applog.FromContext` logger, since the goroutine runs outside the request lifecycle | Pattern 1 / Pattern 4 | Low — observability degraded (no request_id) but server will not panic |
| A3 | `formatBRL` can be implemented inline without a third-party i18n library for the two-decimal comma+period pt-BR format | Code Examples | Low — the format is fixed; edge cases (negative amounts) should be guarded |
| A4 | `PushSubscriptionRepository.ListByUserID` does not exist yet and must be added alongside the Phase 23 NotificationService | Architecture Patterns | Low — verified ExistsForUser pattern; ListByUserID is a trivial extension; if it already exists in a branch not on disk, just reuse it |
| A5 | The dispatch goroutine logs failures at `warn` level (not `error`) because push delivery is best-effort — a failed push is not a service error | Pattern 5 | Low — logging level choice is Claude's discretion per CONTEXT.md |
| A6 | The composite cursor index `(user_id, created_at DESC, id DESC)` is not yet present and must be added in a new migration | Migration Required | Medium — without it, inbox queries on large tables will be slow; the single-column indexes exist but may not be used for the composite keyset filter |
| A7 | `transactionService.Update` calls `s.services.Notification.Dispatch` — this requires `transactionService` to hold a reference to `services.Notification`, which means `Notification` must be in `Services` before `transactionService` is instantiated, OR `transactionService` receives `notificationService` as a direct dependency | DI Wiring | Medium — the current `Services` struct is circular (chargeService holds `*Services`); the same pattern works for `transactionService`. The planner must order service instantiation correctly in `main.go` |

---

## Open Questions

1. **Circular service dependency order in main.go**
   - What we know: `chargeService` and `transactionService` both receive `*Services` in their constructors. `NotificationService` is added to `Services`. The notification service is instantiated AFTER `transactionService` and `chargeService` (since it doesn't depend on them). This means `services.Notification` must be assigned before chargeService/transactionService can call it — but they already hold a `*Services` pointer, so as long as `services.Notification` is assigned before the first request is processed (not before constructor runs), there is no problem.
   - Recommendation: Assign `services.Notification = service.NewNotificationService(repos, cfg)` right after `services.Charge` in main.go. The `*Services` pointer is already shared; late assignment is safe because no request can arrive during the single-threaded startup sequence.

2. **Handling a notification dispatch when the actor user is deleted**
   - What we know: `userRepo.GetByID` returns `NOT_FOUND` error if the user no longer exists.
   - Recommendation: Fall back to `"Parceiro"` as the display name and continue. Do not abort dispatch.

3. **NOTIF-03: recurrence path creates N linked transactions (one per installment)**
   - What we know: `createTransactions` loops and creates all installments. Each call to `injectLinkedTransactions` adds linked transactions for the partner. D-08 coalescing handles this: all `split_created` events for the same recipient in the same request are coalesced into one push.
   - Recommendation: After `createTransactions` returns, collect all `lt.UserID != userID` from the returned first transaction + its linked transactions. The transaction service already returns only `firstID`, not the full list — the notification hook needs to capture linked transaction user IDs from the in-memory `transactions` slice before commit, or re-query after commit. Simpler: collect recipient IDs from the `SplitSettings.UserConnection.ToUserID` list (available before commit, no re-query needed).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Go toolchain | Building backend | Yes | 1.24.7 (go.mod requires 1.24.4+) | — |
| `webpush-go v1.4.0` | Push send | Yes — in go.mod | v1.4.0 | — |
| Docker | testcontainers integration tests | Installed (v29.3.1) | Daemon status unconfirmed | Compile-check only if daemon not running |
| `mockery` (via `just generate-mocks`) | Mock regeneration after interface change | Available via `just` | v2.53.6 (seen in mock headers) | Run `$(go env GOPATH)/bin/mockery --all` directly |
| `swag` (via `just generate-docs`) | Swagger regeneration | Available via `just` | — | Run `$(go env GOPATH)/bin/swag init` from backend/ |
| VAPID keys in .env | Startup (enforced by main.go guard) | Yes — set from Phase 22 | — | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `testify/suite` v1.11.1 + testcontainers-go v0.40.0 |
| Config file | None — build tag `//go:build integration` |
| Quick run command | `go test -short ./internal/service/...` |
| Full suite command | `go test -tags=integration ./internal/service/...` (requires Docker) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-01 | `chargeService.Create` fires goroutine with correct recipient + entity_id | integration | `go test -tags=integration ./internal/service/ -run TestNotificationServiceWithDB/TestChargeCreatedNotification` | No — Wave 0 |
| NOTIF-02 | `chargeService.Accept` fires goroutine with correct recipient after commit | integration | `go test -tags=integration ./internal/service/ -run TestNotificationServiceWithDB/TestChargeAcceptedNotification` | No — Wave 0 |
| NOTIF-03 | `transactionService.Create` (split path) fires goroutine for each linked-tx partner | integration | `go test -tags=integration ./internal/service/ -run TestNotificationServiceWithDB/TestSplitCreatedNotification` | No — Wave 0 |
| NOTIF-04 | `transactionService.Update` fires on AddedSplit, RemovedSplit, linked-tx amount change | integration | `go test -tags=integration ./internal/service/ -run TestNotificationServiceWithDB/TestSplitUpdatedNotification` | No — Wave 0 |
| NOTIF-04 | Cosmetic edits (category, description, date) do NOT fire notification | integration | same suite, `TestSplitUpdatedCosmeticNoNotification` | No — Wave 0 |
| NOTIF-04 | Self-edits do NOT fire notification (D-03) | integration | same suite, `TestSplitUpdatedSelfEditNoNotification` | No — Wave 0 |
| NOTIF-05 | Inbox row persisted even when recipient has no subscriptions | integration | `go test -tags=integration ./internal/service/ -run TestNotificationServiceWithDB/TestPersistWithoutSubscription` | No — Wave 0 |
| NOTIF-06 | Push send failure does not roll back the charge/transaction | integration | same suite, mock push sender returns error, verify charge committed | No — Wave 0 |
| Inbox | `GET /api/notifications` returns cursor-paged list IDOR-scoped | integration | `go test -tags=integration ./internal/service/ -run TestNotificationServiceWithDB/TestInboxList` | No — Wave 0 |
| Inbox | `GET /api/notifications/unread-count` returns exact count | integration | same suite, `TestUnreadCount` | No — Wave 0 |
| Inbox | `POST /api/notifications/:id/read` marks row read, rejects wrong user (IDOR) | integration | same suite, `TestMarkRead`, `TestMarkReadIDOR` | No — Wave 0 |
| Inbox | `POST /api/notifications/read-all` marks all rows read for that user only | integration | same suite, `TestMarkAllRead` | No — Wave 0 |
| Inbox | Cursor pagination returns stable next_cursor, has_more | integration | same suite, `TestCursorPagination` | No — Wave 0 |

### Testing Strategy for Push Dispatch (NOTIF-06)

Push delivery must be testable without a live push service. **Approach:** extract the send logic into a `PushSender` interface:

```go
// Place in internal/service/notification_service.go or a new pkg/pushsender
type PushSender interface {
    Send(payload []byte, sub *webpush.Subscription, opts *webpush.Options) (*http.Response, error)
}

// Real implementation (wraps webpush.SendNotification):
type webPushSender struct{}
func (w *webPushSender) Send(payload []byte, sub *webpush.Subscription, opts *webpush.Options) (*http.Response, error) {
    return webpush.SendNotification(payload, sub, opts)
}
```

`NotificationService` holds a `PushSender` field. In tests, inject a mock sender that returns configurable responses (success, 404, error). This allows testing 404/410 pruning and error logging without network calls.

The mock can be a simple struct (no mockery needed for this interface since it's straightforward):

```go
type mockPushSender struct {
    status int
    err    error
}
func (m *mockPushSender) Send(_, _, _) (*http.Response, error) {
    if m.err != nil { return nil, m.err }
    return &http.Response{StatusCode: m.status, Body: io.NopCloser(strings.NewReader(""))}, nil
}
```

### Sampling Rate

- **Per task commit:** `go test -short ./internal/service/ -run TestNotification` (unit with mocks)
- **Per wave merge:** `go test -tags=integration ./internal/service/ -run TestNotificationServiceWithDB` (Docker needed)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `internal/service/notification_service_test.go` — covers NOTIF-01..06 + Inbox integration tests; embeds `ServiceTestWithDBSuite`
- [ ] `ServiceTestWithDBSuite.SetupTest` in `test_setup_with_db.go` — add `services.Notification = service.NewNotificationService(suite.Repos, suite.Config)` after Charge service instantiation
- [ ] Migration: `just migrate-create add_notification_cursor_index` — composite index for cursor pagination

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT validated by existing `RequireAuth` middleware; all 4 inbox endpoints require auth |
| V3 Session Management | no | Stateless API; existing JWT middleware |
| V4 Access Control | yes | IDOR: `user_id` filter on all repo queries; `MarkRead` verifies `user_id = ? AND id = ?`; `MarkAllRead` scoped to `user_id = ?` |
| V5 Input Validation | yes | Cursor token: parse error → return 400; notification ID path param: `strconv.Atoi` → 400 on non-int |
| V6 Cryptography | yes | VAPID keys never logged; `cfg.VAPID.PrivateKey` only used in `webpush.Options`; not returned in any API response |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User A marks User B's notification as read via `POST /notifications/:id/read` | IDOR / Tampering | `WHERE id = ? AND user_id = ?` — scoped to caller's userID; `RowsAffected == 0` → 404 |
| Cursor token tampering (crafted `created_at`/`id`) | Tampering | `base64.RawURLEncoding.DecodeString` + `json.Unmarshal` validate format; malformed cursor → 400; valid-but-crafted cursor just returns a different page — no data leak since user_id filter remains |
| Push payload injection via `Description` field | Tampering | Payload JSON is constructed server-side; `Description` is the charge description stored in the DB (not user-controllable at push-send time); safe to include verbatim in push copy |
| Push endpoint SSRF | Spoofing | `validateEndpoint` already enforces HTTPS in Phase 22 push subscription; `webpush.SendNotification` sends to the stored endpoint — SSRF protection relies on Phase 22's endpoint validation |
| VAPID private key leakage | Information Disclosure | Never logged; never returned in API; held only in `notificationService.vapid` struct field |

---

## Sources

### Primary (HIGH confidence)

- Codebase (verified by direct file reads):
  - `backend/internal/service/charge_service.go` — Create has no explicit tx; Accept has explicit Begin/Commit; otherPartyID computation; role-swap logic
  - `backend/internal/service/charge_accept.go` — exact Commit location (line ~234); role swap sequence
  - `backend/internal/service/transaction_create.go` — Create's Begin/Commit; split path guard (`req.SharedAccountConnection == nil && len(req.SplitSettings) > 0`); injectLinkedTransactions
  - `backend/internal/service/transaction_update.go` — Update's Begin/Commit (line ~222); isLinkedTxEdit; `req.Amount != nil` recompute for linked-tx edits
  - `backend/internal/service/structs.go` — `updateChanges`, `AddedSplit()`, `RemovedSplit()`, all updateScenario constants
  - `backend/internal/entity/notification.go` — Notification entity; `NotificationFromDomain` drops CreatedAt (DB-generated)
  - `backend/internal/domain/push_subscription.go` — `Notification` domain type; `PushSubscription` domain type
  - `backend/internal/repository/interfaces.go` — empty `NotificationRepository`; `PushSubscriptionRepository` with `DeleteByEndpointAdmin`
  - `backend/internal/repository/notification_repository.go` — stub with pre-wired `db` field
  - `backend/internal/repository/push_subscription_repository.go` — Upsert, DeleteByEndpointAdmin, ExistsForUser patterns
  - `backend/internal/repository/charge_repository.go` — Search with offset pagination (baseline for comparison)
  - `backend/internal/repository/db_transaction.go` — GetTxFromContext; Begin/Commit/Rollback implementation
  - `backend/internal/service/test_setup_with_db.go` — integration suite; ServiceTestWithDBSuite; `PushSubscriptionRepository` + `NotificationRepository` already wired
  - `backend/cmd/server/main.go` — DI wiring pattern; VAPID guard; route registration
  - `backend/migrations/20260530125310_create_notifications_table.sql` — confirmed schema (no composite cursor index)
- `backend/internal/service/interfaces.go` — `PushSubscriptionService`; `Services` struct; `ChargeService` + `TransactionService` signatures [VERIFIED: codebase]
- Phase 22 RESEARCH.md — `webpush.SendNotification` signature, 404/410 prune pattern, VAPID config [VERIFIED: earlier research]

### Secondary (MEDIUM confidence)

- `pkg.go.dev/github.com/sherclockholmes/webpush-go` — `SendNotification(*http.Response, error)`, `Options.TTL`, `Keys` struct [CITED: pkg.go.dev]

### Tertiary (LOW confidence)

- None — all critical claims verified against codebase or cited from official docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in go.mod; no new dependencies
- Architecture: HIGH — patterns verified by reading every relevant source file
- Pitfalls: HIGH — derived from direct code reading (commit boundaries, role swap, shared-account guard)
- Cursor pagination: MEDIUM — pattern is standard SQL keyset; cursor index migration is ASSUMED (not verified as existing)
- BRL formatting helper: MEDIUM — format is fixed; edge case coverage (negative amounts) is ASSUMED

**Research date:** 2026-05-30
**Valid until:** 2026-08-30 (stable Go ecosystem; webpush-go v1.4.0 is locked)
