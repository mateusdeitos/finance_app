---
phase: 23-backend-notification-events-inbox-api
plan: "01"
subsystem: backend
tags:
  - notification
  - repository
  - cursor-pagination
  - data-layer
  - mocks
dependency_graph:
  requires:
    - "Phase 22 Plan 01 (push_subscriptions + notifications table migration)"
    - "Phase 22 Plan 02 (PushSubscriptionRepository stub + NotificationRepository stub)"
  provides:
    - "NotificationRepository with 5 concrete methods (Create, List, UnreadCount, MarkRead, MarkAllRead)"
    - "PushSubscriptionRepository.ListByUserID"
    - "Domain types: NotificationEvent, NotificationFilter, NotificationListResult, NotificationUnreadCountResponse"
    - "Notification type constants (charge_received, charge_accepted, split_created, split_updated)"
    - "Composite cursor index migration idx_notifications_cursor"
    - "Regenerated mocks for NotificationRepository and PushSubscriptionRepository"
  affects:
    - "Plan 23-02 (notification service) — consumes these repository contracts"
    - "Plan 23-03 (event hooks) — consumes NotificationEvent domain type"
tech_stack:
  added: []
  patterns:
    - "Keyset cursor pagination: base64url-encoded (created_at, id) composite token; GORM tuple comparison (created_at, id) < (?, ?)"
    - "IDOR-scoped MarkRead: WHERE id = ? AND user_id = ? with RowsAffected == 0 check"
    - "GetTxFromContext pattern in all 5 repository methods"
key_files:
  created:
    - "backend/migrations/20260530152401_add_notification_cursor_index.sql"
  modified:
    - "backend/internal/domain/push_subscription.go"
    - "backend/internal/repository/interfaces.go"
    - "backend/internal/repository/notification_repository.go"
    - "backend/internal/repository/push_subscription_repository.go"
    - "backend/mocks/mock_NotificationRepository.go"
    - "backend/mocks/mock_PushSubscriptionRepository.go"
decisions:
  - "Cursor struct is unexported in repository package (not domain) — NotificationFilter.Cursor is a plain string token; encode/decode helpers owned by notification_repository.go"
  - "Malformed cursor token returns pkgErrors.BadRequest (400) per T-23-03 threat mitigation"
  - "Migration uses goose create to generate correct timestamp (not hand-written)"
metrics:
  duration: "~10 minutes (Tasks 1-2 pre-committed; Task 3 executed in this session)"
  completed_date: "2026-05-30"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 6
---

# Phase 23 Plan 01: Notification Data Layer Summary

**One-liner:** NotificationRepository with cursor-paginated List + IDOR MarkRead + 4 other methods; domain types; composite keyset index migration; regenerated mocks.

## What Was Built

### Task 1: Domain types + constants + interface definitions (pre-committed: 2a9c268)

Appended to `backend/internal/domain/push_subscription.go`:
- `NotificationEvent` — in-memory struct for post-commit goroutine dispatch (NOT persisted directly)
- 4 type constants: `NotificationTypeChargeReceived`, `NotificationTypeChargeAccepted`, `NotificationTypeSplitCreated`, `NotificationTypeSplitUpdated`
- `NotificationFilter` — filter for `NotificationRepository.List`; `Cursor` field is an opaque base64url string token
- `NotificationListResult` — HTTP response shape for `GET /api/notifications`
- `NotificationUnreadCountResponse` — HTTP response shape for `GET /api/notifications/unread-count`

Replaced empty `NotificationRepository interface{}` stub in `backend/internal/repository/interfaces.go` with 5-method interface. Added `ListByUserID` to `PushSubscriptionRepository`.

### Task 2: Repository implementations (pre-committed: c78ba3b)

Filled in `backend/internal/repository/notification_repository.go` with:
- `notificationCursor` unexported struct + `encodeCursor`/`decodeCursor` helpers using `encoding/base64` + `encoding/json`
- `Create` — `entity.NotificationFromDomain` → GORM Create → `ent.ToDomain()`
- `List` — keyset cursor pagination: `ORDER BY created_at DESC, id DESC`, `LIMIT n+1` for hasMore detection, `(created_at, id) < (?, ?)` tuple comparison when cursor present; malformed cursor → `pkgErrors.BadRequest`
- `UnreadCount` — `WHERE user_id = ? AND read = false` COUNT
- `MarkRead` — IDOR-scoped `WHERE id = ? AND user_id = ?` UPDATE + `RowsAffected == 0` → `pkgErrors.NotFound`
- `MarkAllRead` — `WHERE user_id = ? AND read = false` UPDATE (no RowsAffected check; 0 rows is a no-op)

Added `ListByUserID` to `backend/internal/repository/push_subscription_repository.go`.

### Task 3: Migration + mock regeneration (committed: 86855d4)

Created `backend/migrations/20260530152401_add_notification_cursor_index.sql` via `goose create` with:
```sql
-- +goose Up
CREATE INDEX idx_notifications_cursor ON notifications(user_id, created_at DESC, id DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_notifications_cursor;
```

Ran `/root/go/bin/mockery` from `backend/` — regenerated `mocks/mock_NotificationRepository.go` (now has Create/List/UnreadCount/MarkRead/MarkAllRead + Expecter methods) and `mocks/mock_PushSubscriptionRepository.go` (now has ListByUserID).

## Verification Results

- `go build ./...` — PASS
- `go vet -tags=integration ./internal/...` — PASS
- `go test -short ./...` — PASS (all packages)
- grep checks: all pass (NotificationTypeChargeReceived, ListByUserID, MarkAllRead, keyset query pattern, IDOR MarkRead pattern, migration file, idx_notifications_cursor, MarkAllRead in mocks, ListByUserID in mocks)
- Integration test execution deferred (Docker unavailable); compile-checked via `go vet -tags=integration`

## Deviations from Plan

### Intentional Design Choice: Cursor struct location

The PATTERNS.md showed `domain.notificationCursor` as the cursor struct, but since unexported types cannot be referenced cross-package, the cursor struct stays in the `repository` package. `NotificationFilter.Cursor` is a plain `string` opaque token. The plan's action block already documented this as "DEVIATION FROM PATTERNS.md (intentional)."

### Tasks 1 and 2 pre-committed

Tasks 1 and 2 were already implemented and committed (2a9c268 and c78ba3b) before this executor session. This session executed Task 3 only, then created SUMMARY.md.

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 | 2a9c268 | feat(23-01): add domain types, constants, and extend repository interfaces |
| Task 2 | c78ba3b | feat(23-01): implement notificationRepository (5 methods + cursor helpers) and ListByUserID |
| Task 3 | 86855d4 | chore(23-01): add cursor index migration and regenerate mocks |

## Threat Surface Scan

No new network endpoints or auth paths introduced in this plan. All changes are internal data-layer contracts. The threat model items from the plan are properly mitigated:
- T-23-01 (IDOR MarkRead): `WHERE id = ? AND user_id = ?` + `RowsAffected == 0` → 404
- T-23-02 (Info Disclosure List/UnreadCount): every query has `WHERE user_id = ?`
- T-23-03 (Cursor tampering): malformed cursor → `pkgErrors.BadRequest`; valid-but-crafted cursor only changes page within same user_id scope
- T-23-04 (ListByUserID unscoped): intentionally internal; no HTTP route in this plan

## Known Stubs

None. All implemented methods are functional implementations, not stubs.

## Self-Check: PASSED

Files exist:
- backend/migrations/20260530152401_add_notification_cursor_index.sql: FOUND
- backend/internal/repository/notification_repository.go: FOUND (implemented, not stub)
- backend/mocks/mock_NotificationRepository.go: FOUND (MarkAllRead present)
- backend/mocks/mock_PushSubscriptionRepository.go: FOUND (ListByUserID present)

Commits verified:
- 2a9c268: FOUND
- c78ba3b: FOUND
- 86855d4: FOUND
