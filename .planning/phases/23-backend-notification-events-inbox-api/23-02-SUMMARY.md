---
phase: 23-backend-notification-events-inbox-api
plan: "02"
subsystem: backend/service,backend/handler
tags: [notification, push, inbox, dispatch, goroutine, swagger, mocks]
dependency_graph:
  requires: ["23-01"]
  provides: ["NotificationService.Dispatch", "inbox-api-4-endpoints", "MockNotificationService"]
  affects: ["backend/cmd/server/main.go", "backend/docs/", "backend/mocks/"]
tech_stack:
  added: ["webpush-go v1.4.0 (used for push send via PushSender interface)"]
  patterns:
    - "Post-commit goroutine dispatch (context.Background(), defer recover)"
    - "D-08 coalescing: group by (recipient,type), one push per group"
    - "PushSender injectable interface for testability"
    - "pt-BR BRL formatting via formatBRL helper"
    - "IDOR enforcement: service overrides filter.UserID from auth context"
    - "404/410 stale-subscription pruning via DeleteByEndpointAdmin"
key_files:
  created:
    - backend/internal/service/notification_service.go
    - backend/internal/handler/notification_handler.go
    - backend/mocks/mock_NotificationService.go
    - backend/mocks/mock_PushSender.go
  modified:
    - backend/cmd/server/main.go
    - backend/docs/docs.go
    - backend/docs/swagger.json
    - backend/docs/swagger.yaml
decisions:
  - "PushSender interface with webPushSender as default — enables hand-written test doubles without mockery"
  - "Dispatch uses s.sender.Send (not direct webpush.SendNotification) so tests can inject fakes"
  - "Route ordering: /unread-count and /read-all registered before /:id/read to avoid Echo param shadowing"
  - "formatBRL sign-guards negative amounts; fallback actor name is 'Parceiro' on user lookup failure"
  - "Inbox List: filter.UserID always overridden from auth context (IDOR — T-23-06)"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-05-30"
  tasks_completed: 3
  files_created: 4
  files_modified: 4
---

# Phase 23 Plan 02: NotificationService + Handler + DI + Swagger Summary

NotificationService with panic-safe Dispatch (persist-always + D-08 coalescing + PushSender + 404/410 prune), 4 IDOR-scoped inbox endpoints, DI wiring, swagger regenerated, MockNotificationService added.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | NotificationService interface + implementation | 5cec477 | backend/internal/service/notification_service.go |
| 2 | NotificationHandler (4 endpoints + swagger) | cbcda58 | backend/internal/handler/notification_handler.go |
| 3 | main.go routes + swagger regen + mocks | 08ef8b9 | backend/cmd/server/main.go, backend/docs/, backend/mocks/ |

## What Was Built

### NotificationService (`backend/internal/service/notification_service.go`)

- `PushSender` interface + `webPushSender` concrete impl wrapping `webpush.SendNotification`
- `notificationService` struct with fields: `notifRepo`, `pushSubRepo`, `userRepo`, `vapid`, `sender`
- `NewNotificationService(repos, cfg)` wires all deps with `&webPushSender{}` as default sender
- `Dispatch(ctx, events)`:
  1. `defer recover()` — panic-safe (T-23-10, NOTIF-06)
  2. Early return if empty events
  3. Persist every event as inbox row via `notifRepo.Create` — log+continue on error (NOTIF-05)
  4. Resolve actor name once via `userRepo.GetByID`; fallback to `"Parceiro"` (Open Question 2)
  5. Group by `(RecipientUserID, Type)` — D-08 coalescing
  6. Per group: `pushSubRepo.ListByUserID` → build payload → `s.sender.Send` → prune on 404/410
- `formatBRL(cents int64) string` — pt-BR "R$ 1.234,56" with sign guard and thousands separator
- `buildPayload` with all 5 D-07 templates verbatim (pt-BR, BRL-formatted)
- Inbox methods: `List` (IDOR override), `UnreadCount`, `MarkRead`, `MarkAllRead`

### NotificationHandler (`backend/internal/handler/notification_handler.go`)

- `NotificationHandler{notifService}` struct + `NewNotificationHandler(services)` constructor
- `List`: cursor + limit from query params (default 20); calls `List` with auth userID
- `UnreadCount`: returns `domain.NotificationUnreadCountResponse`
- `MarkRead`: `strconv.Atoi(c.Param("id"))` + `<= 0` guard → 400; maps NotFound → 404
- `MarkAllRead`: no params; returns 204
- All methods: `GetUserIDFromContext` from auth context (T-23-05, T-23-06)
- Swagger annotations on all 4 methods (Tags: notifications; CookieAuth + BearerAuth)

### main.go DI + Routes (`backend/cmd/server/main.go`)

- `services.Notification = service.NewNotificationService(repos, cfg)` after `services.PushSubscription`
- `notifHandler := handler.NewNotificationHandler(services)`
- Route group `/notifications`:
  ```
  GET    ""              → notifHandler.List
  GET    /unread-count   → notifHandler.UnreadCount
  POST   /read-all       → notifHandler.MarkAllRead   (FIXED before /:id)
  POST   /:id/read       → notifHandler.MarkRead
  ```

### Swagger + Mocks

- `swag init -g cmd/server/main.go -o docs` regenerated — 4 `/api/notifications` paths documented
- `mockery` regenerated — added `mock_NotificationService.go` + `mock_PushSender.go`

## Verification

```
go build ./... — PASS
go vet -tags=integration ./internal/... — PASS
grep "te cobrou" + "transações divididas" + "recover()" + "DeleteByEndpointAdmin" — PASS
route order awk gate (read-all < :id/read) — PASS
grep -rq "/api/notifications" docs/ — PASS
```

## Threat Model Compliance

| Threat | Mitigation | Verified |
|--------|-----------|---------|
| T-23-05 IDOR on MarkRead | `user_id` in WHERE clause (repo); GetUserIDFromContext in handler | Yes |
| T-23-06 IDOR on List/UnreadCount | `filter.UserID = userID` override in service.List; scoped repo queries | Yes |
| T-23-07 Cursor tampering + bad limit | Bad cursor → 400 in repo; limit clamped in repo (cap 100); non-int :id → 400 | Yes |
| T-23-08 Push to wrong recipient | `ListByUserID(recipient)` per group; group key includes RecipientUserID | Yes |
| T-23-09 VAPID key leakage | `cfg.VAPID.PrivateKey` only in `webpush.Options`; never logged/returned | Yes |
| T-23-10 Goroutine panic | `defer recover()` in Dispatch | Yes |
| T-23-11 Admin prune via HTTP | `DeleteByEndpointAdmin` only called inside Dispatch; no HTTP route maps to it | Yes |

## Deviations from Plan

None — plan executed exactly as written. All task code was already committed when this executor ran (Tasks 1 and 2 were committed in a prior run); Task 3 (routes + swagger + mocks) completed this run.

## Known Stubs

None — all service methods are fully wired to repository layer.

## Self-Check

- [x] `backend/internal/service/notification_service.go` — exists (commit 5cec477)
- [x] `backend/internal/handler/notification_handler.go` — exists (commit cbcda58)
- [x] `backend/cmd/server/main.go` — routes registered (commit 08ef8b9)
- [x] `backend/mocks/mock_NotificationService.go` — exists (commit 08ef8b9)
- [x] `backend/docs/swagger.json` — references `/api/notifications` x4 (commit 08ef8b9)
- [x] `go build ./...` — PASS
- [x] `go vet -tags=integration ./internal/...` — PASS
