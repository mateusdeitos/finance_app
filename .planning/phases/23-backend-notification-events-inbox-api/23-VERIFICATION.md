---
phase: 23-backend-notification-events-inbox-api
verified: 2026-05-30T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Create a charge and confirm the recipient gets a push notification on a real device"
    expected: "Recipient browser receives a pt-BR push reading '{actor} te cobrou R$ X,XX: {description}'"
    why_human: "Network-delivered Web Push to a browser endpoint cannot be verified without a real subscriber and running server."
  - test: "Accept a charge and confirm the charge creator gets a push notification"
    expected: "Initiator browser receives '{actor} aceitou sua cobrança de R$ X,XX'"
    why_human: "Same as above — real push delivery requires a running server and browser subscription."
  - test: "Create a split transaction with a percentage-based split; verify push copy shows the partner's share (not full amount)"
    expected: "Push says R$ 50,00 for a 50% split of R$ 100,00, not R$ 100,00 (CR-02 was fixed)"
    why_human: "Correctness of the percentage calculation in push copy requires observing the actual push message."
  - test: "Cursor pagination stability: rapidly insert notifications and paginate; verify no duplicates across pages"
    expected: "Pages are stable with no overlap or gaps despite concurrent inserts"
    why_human: "Keyset cursor stability under concurrent load cannot be fully verified without running the DB."
---

# Phase 23: Backend Notification Events & Inbox API Verification Report

**Phase Goal:** The backend fires Web Push notifications for all four finance events, persists each notification with a deep-link reference, and exposes an inbox API for listing and marking notifications read.
**Verified:** 2026-05-30T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|----|----|----|
| 1  | Creating a charge fires a charge_received event to the recipient (NOTIF-01) | VERIFIED | `charge_service.go:155-176` — after `chargeRepo.Create` returns, `go s.services.Notification.Dispatch(context.Background(), ...)` fires with `NotificationTypeChargeReceived`, `EntityType:"charge"`, `EntityID:created.ID`, `RecipientUserID:otherPartyID` |
| 2  | Accepting a charge fires a charge_accepted event to the initiator (NOTIF-02) | VERIFIED | `charge_accept.go:239-252` — after `Commit`, recipient is derived from pre-swap copies (`chargerUserIDCopy`/`payerUserIDCopy`); `NotificationTypeChargeAccepted`, `EntityType:"charge"`, `EntityID:chargeID` |
| 3  | Creating a split transaction fires split_created to the partner (NOTIF-03) | VERIFIED | `transaction_create.go:58-97` — guarded by `SharedAccountConnection==nil && TransactionType!=Transfer && len(SplitSettings)>0`; CR-02 fix present: percentage splits use `int64(float64(amount)*float64(*ss.Percentage)/100)` |
| 4  | Updating a split fires split_updated on AddedSplit/RemovedSplit/linked-amount, silent on cosmetic/self edits (NOTIF-04, D-01..D-04) | VERIFIED | `transaction_update.go:1354-1451` — `maybeDispatchSplitUpdatedNotification` switch covers AddedSplit/RemovedSplit/isLinkedTxEdit+Amount; D-03 nil-guarded (`OriginalUserID != nil && callerUserID == *OriginalUserID`); called with `context.Background()` (WR-01 fix); cosmetic edits hit no arm |
| 5  | Dispatch runs after commit in a goroutine; panic-safe; push failure does not roll back (NOTIF-06) | VERIFIED | `notification_service.go:47-51` — `defer recover()` present; all four hooks use `go ...Dispatch(context.Background(), ...)` post-commit; `resp.Body.Close()` is immediate not deferred (CR-01 fix); 404/410 prune via `DeleteByEndpointAdmin` |
| 6  | Inbox API: GET /api/notifications (cursor), GET /api/notifications/unread-count, POST /api/notifications/:id/read, POST /api/notifications/read-all — all IDOR-scoped | VERIFIED | `notification_handler.go` implements all 4 handlers using `GetUserIDFromContext`; routes in `main.go:213-218` with `/unread-count` and `/read-all` registered before `/:id/read` (awk gate passes); service layer overrides `filter.UserID = userID`; MarkRead repo uses `WHERE id=? AND user_id=?` |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `backend/internal/service/notification_service.go` | Dispatch + inbox methods + PushSender | VERIFIED | All methods present and substantive; panic recovery, persist-before-push, D-08 grouping, BRL formatting, 5 pt-BR templates |
| `backend/internal/handler/notification_handler.go` | 4 IDOR-scoped handlers + swagger | VERIFIED | List/UnreadCount/MarkRead/MarkAllRead; all call `GetUserIDFromContext`; swagger annotations present |
| `backend/internal/repository/notification_repository.go` | 5 methods + cursor helpers | VERIFIED | Create/List (keyset cursor)/UnreadCount/MarkRead (IDOR)/MarkAllRead implemented; malformed cursor → 400 |
| `backend/internal/repository/push_subscription_repository.go` | ListByUserID added | VERIFIED | `func (r *pushSubscriptionRepository) ListByUserID` at line 83 |
| `backend/internal/domain/push_subscription.go` | 4 type constants + domain types | VERIFIED | `NotificationTypeChargeReceived/ChargeAccepted/SplitCreated/SplitUpdated`; `NotificationEvent`, `NotificationFilter`, `NotificationListResult`, `NotificationUnreadCountResponse` all present |
| `backend/internal/repository/interfaces.go` | NotificationRepository (5 methods) + PushSubscriptionRepository.ListByUserID | VERIFIED | Both interfaces correct; `Repositories` struct has `.Notification` field |
| `backend/internal/service/interfaces.go` | NotificationService interface + Services.Notification field | VERIFIED | Interface with Dispatch/List/UnreadCount/MarkRead/MarkAllRead; `Services.Notification NotificationService` present |
| `backend/cmd/server/main.go` | DI wiring + 4 routes | VERIFIED | `services.Notification = service.NewNotificationService(repos, cfg)` at line 103; `notifHandler` at 115; 4 routes 213-218 |
| `backend/migrations/20260530152401_add_notification_cursor_index.sql` | Composite cursor index | VERIFIED | `CREATE INDEX idx_notifications_cursor ON notifications(user_id, created_at DESC, id DESC)` with symmetric Down block |
| `backend/internal/service/notification_service_test.go` | Integration suite with 12+ test methods + mockPushSender | VERIFIED | 16 test methods on suite; `//go:build integration`; `mockPushSender` with `injectMockSender`; 410-prune test (`TestPush410PrunesSubscription`); push-failure-no-rollback test (`TestPushFailureDoesNotRollback`) |
| `backend/internal/service/test_setup_with_db.go` | services.Notification wired | VERIFIED | Line 162: `suite.Services.Notification = NewNotificationService(suite.Repos, suite.Config)` |
| `backend/mocks/` | MockNotificationService + MockPushSubscriptionRepository.ListByUserID | VERIFIED | Both mocks generated; `MockNotificationService` has Dispatch/List/UnreadCount/MarkRead/MarkAllRead; `MockPushSubscriptionRepository` has ListByUserID |
| `backend/docs/swagger.yaml` | /api/notifications routes | VERIFIED | swagger.yaml references `/api/notifications`, `/api/notifications/{id}/read`, `/api/notifications/read-all`, `/api/notifications/unread-count` |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `charge_service.go Create` | `Notification.Dispatch` | `go Dispatch(context.Background(), charge_received event)` after chargeRepo.Create | WIRED | Line 167: `NotificationTypeChargeReceived` present; fires after Create returns, not inside tx |
| `charge_accept.go Accept` | `Notification.Dispatch` | `go Dispatch(context.Background(), charge_accepted event)` after Commit | WIRED | Line 244: fires post-commit; uses pre-swap `chargerUserIDCopy`/`payerUserIDCopy` for NOTIF-02 robustness |
| `transaction_create.go Create` | `Notification.Dispatch` | post-commit goroutine guarded by SharedAccountConnection==nil && !Transfer && SplitSettings>0 | WIRED | Lines 61-96: `NotificationTypeSplitCreated`; percentage calculation present (CR-02 fix) |
| `transaction_update.go Update` | `Notification.Dispatch` | `maybeDispatchSplitUpdatedNotification(context.Background(), ...)` after Commit | WIRED | Line 233: called with `context.Background()` (WR-01 fix); helper at 1363 covers all three split-update arms |
| `NotificationHandler` | `NotificationService` | `appcontext.GetUserIDFromContext` to service calls | WIRED | All 4 handlers extract userID from auth context; pass it to service; service overrides filter.UserID |
| `notificationService.Dispatch` | `PushSubscriptionRepository.DeleteByEndpointAdmin` | 404/410 status check on send response | WIRED | Lines 119-122: `status == StatusNotFound || status == StatusGone` → prune call |
| `main.go` | `notifHandler routes` | `/read-all` registered before `/:id/read` | WIRED | Lines 217,218; awk gate confirms ordering |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `notification_handler.go List` | `result *domain.NotificationListResult` | `notifService.List` → `notifRepo.List` → GORM keyset query on notifications table | Yes — GORM query with `WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT n+1` | FLOWING |
| `notification_handler.go UnreadCount` | `count int64` | `notifRepo.UnreadCount` → GORM `COUNT WHERE user_id=? AND read=false` | Yes | FLOWING |
| `notification_service.go Dispatch` | events `[]NotificationEvent` | called from four post-commit goroutines after real DB writes commit | Yes — events carry real entity IDs from DB | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full module compiles | `cd backend && go build ./...` | No output (success) | PASS |
| Integration suite compiles under build tag | `cd backend && go vet -tags=integration ./internal/...` | No output (success) | PASS |
| Short (unit) tests pass | `cd backend && go test -short ./...` | All packages ok | PASS |
| Route ordering: /read-all before /:id/read | awk gate on main.go | `PASS: read-all(217) before :id/read(218)` | PASS |
| CR-01 fix: no deferred body close in loop | grep for `defer resp.Body.Close` | Not found; immediate close at line 118 | PASS |
| CR-02 fix: percentage split amount | grep for `ss.Percentage != nil` in transaction_create.go | Present at line 79 | PASS |
| WR-02 fix: nil OriginalUserID guard | grep for `OriginalUserID != nil` in transaction_update.go | Present at lines 1377, 1406 (both AddedSplit and RemovedSplit arms) | PASS |
| Integration test count ≥ 12 | grep count | 16 test methods | PASS |
| 410-prune test exists | grep for 410/StatusGone | `TestPush410PrunesSubscription` present | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| NOTIF-01 | Plan 03 | Charge created → recipient push + row with type "charge_received" + charge id | SATISFIED | `charge_service.go:155-176`; integration test `TestChargeCreatedNotification` |
| NOTIF-02 | Plan 03 | Charge accepted → creator push + row type "charge_accepted" + charge id | SATISFIED | `charge_accept.go:239-252`; test `TestChargeAcceptedNotification` |
| NOTIF-03 | Plan 03 | Split created → partner push + row type "split_created" + linked tx id | SATISFIED | `transaction_create.go:58-97`; guard for shared-account/transfer; test `TestSplitCreatedNotification` |
| NOTIF-04 | Plan 03 | Split updated on amount/add/remove → partner push + row type "split_updated"; cosmetic/self-edit silent | SATISFIED | `transaction_update.go:1354-1451`; tests `TestSplitUpdatedNotification`, `TestSplitUpdatedCosmeticNoNotification`, `TestSplitUpdatedSelfEditNoNotification` |
| NOTIF-05 | Plans 01, 02, 03 | Notification persisted with type + entity deep-link, even without subscription | SATISFIED | `notification_service.go:57-68` — persist loop runs before push loop; test `TestPersistWithoutSubscription` |
| NOTIF-06 | Plans 02, 03 | Dispatch after commit; push failure does not roll back or block | SATISFIED | All four hooks use `go ...Dispatch(context.Background(), ...)` post-commit; `defer recover()` in Dispatch; test `TestPushFailureDoesNotRollback` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `notification_service.go` | 212-216 | `MarkRead` passes raw repo error through without `pkgErrors.Internal` wrap for DB errors | Info | `pkgErrors.NotFound` from repo is already a ServiceError and passes through correctly; raw DB errors would surface as 500 with a raw message. WR-03 fix was applied to MarkAllRead only; MarkRead still passes through. For MarkRead, the repo already wraps `NotFound` as a `*ServiceError`. Raw DB errors from MarkRead would be wrapped by `HandleServiceError` to a generic 500, which is acceptable per the review decision. Consistent with the review fix that only required MarkAllRead to be wrapped. | 

No blockers or warnings found. All critical (CR-01, CR-02) and warning (WR-01, WR-02, WR-03, WR-04) findings from the code review are confirmed fixed in the codebase.

### Human Verification Required

#### 1. Real Web Push Delivery (charge_received)

**Test:** Subscribe a browser to push notifications, then have the partner create a charge. Observe the push notification on the recipient device.
**Expected:** Lock-screen/notification showing "{partner name} te cobrou R$ X,XX: {description}" with title "Finance App"
**Why human:** Network-delivered Web Push requires a running server with valid VAPID credentials, a real browser subscription endpoint, and a device to receive the notification. Cannot be verified via code inspection or curl.

#### 2. Real Web Push Delivery (charge_accepted)

**Test:** Accept a pending charge as the non-initiating party. Observe the push received by the charge initiator.
**Expected:** "{partner name} aceitou sua cobrança de R$ X,XX"
**Why human:** Same as above — live push delivery to a real browser endpoint.

#### 3. Percentage-split push amount accuracy (CR-02 regression)

**Test:** Create a split transaction for R$ 100,00 with a 50% percentage split. Observe the push message received by the partner.
**Expected:** Push body says "R$ 50,00" (the partner's share), not "R$ 100,00" (the full amount). Confirms the CR-02 fix is correct end-to-end.
**Why human:** The code fix is present and correct by inspection, but verifying the exact string in the push payload on a real device closes the regression loop.

#### 4. Cursor pagination stability under concurrent inserts

**Test:** Insert 25+ notifications rapidly (e.g. via a script), then paginate with limit=10. Verify no duplicates appear across page 1 → page 2 → page 3.
**Expected:** 25 distinct items across 3 pages; cursor advances correctly; `has_more: false` on the last page.
**Why human:** Keyset cursor stability under concurrent writes cannot be fully verified without a running PostgreSQL instance and concurrent load.

### Gaps Summary

No gaps found. All 6 roadmap success criteria are verified in the codebase:

- All four event hooks (NOTIF-01..04) fire goroutines post-commit with correct recipient, entity type, and entity ID.
- The NOTIF-03 percentage-split amount bug (CR-02) was fixed and is present.
- The NOTIF-04 nil-OriginalUserID self-edit guard (WR-02) was fixed and is present in both switch arms.
- The Dispatch function is panic-safe and closes HTTP response bodies immediately (CR-01 fix).
- The inbox API has all 4 endpoints with correct IDOR scoping and route ordering.
- The integration test suite has 16 test methods covering all required behaviors including 410-prune and push-failure-no-rollback.
- `go build ./...`, `go vet -tags=integration ./internal/...`, and `go test -short ./...` all pass.

The 4 human verification items cover behaviors that require a live Web Push delivery infrastructure (real VAPID keys, browser subscription, network) or concurrent DB load — these cannot be automated in a code-only verification environment.

---

_Verified: 2026-05-30T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
