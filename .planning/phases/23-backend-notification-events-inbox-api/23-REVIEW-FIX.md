---
phase: 23-backend-notification-events-inbox-api
fixed_at: 2026-05-30T00:00:00Z
review_path: .planning/phases/23-backend-notification-events-inbox-api/23-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-05-30T00:00:00Z
**Source review:** `.planning/phases/23-backend-notification-events-inbox-api/23-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04)
- Fixed: 6
- Skipped: 0 (IN-01, IN-02, IN-03 were out of scope per instructions)

## Fixed Issues

### CR-01: `defer resp.Body.Close()` inside nested loop

**Files modified:** `backend/internal/service/notification_service.go`
**Commit:** cd61dfd (combined with WR-03)
**Applied fix:** Captured the status code into a local variable before calling `resp.Body.Close()` immediately (not via `defer`). This closes each HTTP response body within the loop iteration rather than accumulating defers until `Dispatch` returns. The nil-resp guard was already present via the `if resp != nil` check.

### WR-03: `MarkAllRead` returns raw DB error

**Files modified:** `backend/internal/service/notification_service.go`
**Commit:** cd61dfd (combined with CR-01, same file)
**Applied fix:** Wrapped the repository error in `pkgErrors.Internal("failed to mark all notifications as read", err)` to match the `ServiceError` convention used by `List`, `UnreadCount`, and the `MarkRead` method in the same file.

### CR-02: NOTIF-03 push payload carries `0` amount for percentage-based splits

**Files modified:** `backend/internal/service/transaction_create.go`
**Commit:** 75807b5
**Applied fix:** Added an `else if ss.Percentage != nil` branch that computes `int64(float64(transaction.Amount) * float64(*ss.Percentage) / 100)` — the same formula used by `calculateAmount`. This ensures the push notification amount matches the amount persisted on the partner's linked transaction for percentage-based splits. Requires human verification on the integration test path (logic fix).

### WR-01: `maybeDispatchSplitUpdatedNotification` called with committed txCtx

**Files modified:** `backend/internal/service/transaction_update.go`
**Commit:** 8a10572 (combined with WR-02, same file)
**Applied fix:** Changed the call site at line 230 to pass `context.Background()` instead of `ctx` (the spent txCtx). Added an explanatory comment. The function signature still accepts `ctx context.Context` for future-proofing; the body already used `context.Background()` for all DB reads and the dispatch goroutine.

### WR-02: D-03 self-edit guard misfires for nil `OriginalUserID`

**Files modified:** `backend/internal/service/transaction_update.go`
**Commit:** 8a10572 (combined with WR-01, same file)
**Applied fix:** Replaced `lo.FromPtr(data.previousTransaction.OriginalUserID)` (which returns 0 for nil) with an explicit nil-guard pattern in both the `AddedSplit` branch and the `RemovedSplit` branch:
```go
if data.previousTransaction.OriginalUserID != nil &&
    callerUserID == *data.previousTransaction.OriginalUserID {
    return
}
```
This ensures the guard fires correctly for modern rows (non-nil OriginalUserID) and conservatively skips only when the pointer is non-nil — legacy rows with nil OriginalUserID no longer bypass the guard but also no longer trigger a false positive.

### WR-04: Dead `createSplitTransaction` test helper

**Files modified:** `backend/internal/service/notification_service_test.go`
**Commit:** 9dbec7a
**Applied fix:** Removed the `createSplitTransaction` method entirely. It was never called in the file. The `intPtr` helper directly below it was retained since it is used by multiple test cases. Verified `go vet -tags=integration ./internal/service/...` still passes after removal.

## Skipped Issues

None — all 6 in-scope findings were successfully fixed.

---

_Fixed: 2026-05-30T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
