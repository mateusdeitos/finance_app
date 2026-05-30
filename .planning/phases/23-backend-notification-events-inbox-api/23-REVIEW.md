---
phase: 23-backend-notification-events-inbox-api
reviewed: 2026-05-30T00:00:00Z
fixed: 2026-05-30T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - backend/cmd/server/main.go
  - backend/internal/domain/push_subscription.go
  - backend/internal/handler/notification_handler.go
  - backend/internal/repository/interfaces.go
  - backend/internal/repository/notification_repository.go
  - backend/internal/repository/push_subscription_repository.go
  - backend/internal/service/interfaces.go
  - backend/internal/service/notification_service.go
  - backend/internal/service/charge_service.go
  - backend/internal/service/charge_accept.go
  - backend/internal/service/transaction_create.go
  - backend/internal/service/transaction_update.go
  - backend/internal/service/notification_service_test.go
  - backend/internal/service/test_setup_with_db.go
  - backend/migrations/20260530152401_add_notification_cursor_index.sql
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
resolved:
  - CR-01  # defer resp.Body.Close() in loop — fixed: immediate close
  - CR-02  # wrong NOTIF-03 push amount for percentage splits — fixed
  - WR-01  # txCtx passed to maybeDispatch — fixed: context.Background()
  - WR-02  # nil OriginalUserID D-03 guard misfire — fixed
  - WR-03  # MarkAllRead raw DB error — fixed: pkgErrors.Internal
  - WR-04  # dead createSplitTransaction helper — fixed: removed
deferred:
  - IN-01  # handler limit upper bound — informational, not fixed
  - IN-02  # cosmetic-edit test assertion quality — informational, not fixed
  - IN-03  # migration CONCURRENT index — informational, not fixed
status: partial_resolved
---

# Phase 23: Code Review Report

**Reviewed:** 2026-05-30T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

This phase adds Web Push notification dispatch (NOTIF-01 through NOTIF-04) and a paginated notification inbox API to the Go backend. The overall design is sound — the persist-before-push ordering is correct, the goroutine panic recovery is present, cursors decode errors into 400s, and IDOR scoping is applied at all inbox endpoints. However two blockers were found: a `defer` inside an inner loop that will accumulate deferred HTTP response body closes until the entire `Dispatch` function returns (causing connection exhaustion under moderate load), and a NOTIF-03 amount bug where percentage-based splits produce a `0` amount in the push payload instead of the calculated split amount. Four additional warnings cover an uncommitted tx context leaking into the `maybeDispatch` call, a dead test helper, weak self-edit guard assumptions when `OriginalUserID` is nil, and a missing `UPDATE` idempotency guard in `MarkAllRead`. Three informational items round out the review.

---

## Critical Issues

### CR-01: `defer resp.Body.Close()` inside a nested loop — connections not closed until Dispatch returns

**File:** `backend/internal/service/notification_service.go:117`

**Issue:** `resp.Body.Close()` is called with `defer` inside the `for _, sub := range subs` inner loop (which itself is inside `for key, evGroup := range groups`). In Go, `defer` is scoped to the enclosing *function*, not the enclosing block or loop iteration. Every HTTP response body from every push-send call across all subscriptions and all groups accumulates in the deferred stack and is not closed until `Dispatch` returns. Under a burst (many recipients × many subscriptions) this holds open a large number of HTTP connections until the function exits, which can exhaust the system's file-descriptor limit or the transport's connection pool. For a 404/410 subscription, the body is deliberately small, but the pattern is still wrong and will eventually bite production.

**Fix:** Close the body immediately after inspecting the status code, not with defer:

```go
for _, sub := range subs {
    resp, sendErr := s.sender.Send(rawPayload, &webpush.Subscription{...}, &webpush.Options{...})
    if sendErr != nil {
        log.Printf("[notification] push send error endpoint=%s err=%v", sub.Endpoint, sendErr)
        continue
    }
    if resp != nil {
        resp.Body.Close() // close immediately, not deferred
        if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
            if pruneErr := s.pushSubRepo.DeleteByEndpointAdmin(ctx, sub.Endpoint); pruneErr != nil {
                log.Printf("[notification] failed to prune stale subscription endpoint=%s err=%v", sub.Endpoint, pruneErr)
            }
        }
    }
}
```

---

### CR-02: NOTIF-03 push payload carries `0` amount for percentage-based splits

**File:** `backend/internal/service/transaction_create.go:76-81`

**Issue:** The NOTIF-03 amount logic in `Create` is:

```go
var notifAmt int64
if ss.Amount != nil && *ss.Amount > 0 {
    notifAmt = *ss.Amount
} else {
    notifAmt = transaction.Amount   // ← uses the FULL transaction amount
}
```

When a split is percentage-based (`ss.Amount == nil`, `ss.Percentage != nil`), the code falls into the `else` branch and uses `transaction.Amount` — the full transaction amount (e.g. 10 000 cents / R$100). The split amount that is *actually* persisted to the partner's linked transaction (computed by `calculateAmount`) is `amount * percentage / 100` (e.g. 5 000 cents for 50%). The push notification therefore says "R$ 100,00" instead of "R$ 50,00", misleading the recipient every time a percentage-based split is used. Because `SplitSettings.Amount` is only set for fixed-amount splits, percentage-based splits — the common case — always produce the wrong figure.

**Fix:** Calculate the split amount exactly as `createTransactions`/`calculateAmount` does:

```go
var notifAmt int64
if ss.Amount != nil && *ss.Amount > 0 {
    notifAmt = *ss.Amount
} else if ss.Percentage != nil {
    notifAmt = int64(float64(transaction.Amount) * float64(*ss.Percentage) / 100)
} else {
    notifAmt = transaction.Amount
}
```

---

## Warnings

### WR-01: `maybeDispatchSplitUpdatedNotification` receives a post-commit `ctx` that still carries the (now-committed/rolled-back) GORM tx

**File:** `backend/internal/service/transaction_update.go:230`

**Issue:** `Update` calls `s.maybeDispatchSplitUpdatedNotification(ctx, ...)` where `ctx` is the `txCtx` produced by `s.dbTransaction.Begin(ctx)`. After `Commit` succeeds, `txCtx` still contains the completed GORM transaction object in its value chain. Inside `maybeDispatchSplitUpdatedNotification`, the `data.isLinkedTxEdit` case uses `context.Background()` directly for its `transactionRepo.SearchOne` call (line 1419), which correctly bypasses the spent tx. However the function signature accepts `ctx` and is called with the tx context, creating a footgun: any future code added to `maybeDispatch` that naively uses `ctx` will silently operate on the committed (no-op) DB session. For the `AddedSplit`/`RemovedSplit` branches the context is not used for DB reads (it is only passed to `Dispatch` which immediately discards it in favour of `context.Background()`), so there is no active bug today. The goroutine dispatch correctly uses `context.Background()`.

**Fix:** Pass a fresh context to `maybeDispatchSplitUpdatedNotification` to make the post-commit boundary explicit and eliminate the footgun:

```go
// After Commit
s.maybeDispatchSplitUpdatedNotification(context.Background(), userID, sourceIDs, data)
```

Remove `ctx` from the function signature if it is not used inside (currently it is passed through only to eventually be shadowed by `context.Background()`).

---

### WR-02: D-03 self-edit guard silently misfires when `OriginalUserID` is nil

**File:** `backend/internal/service/transaction_update.go:1372, 1398`

**Issue:** The D-03 self-edit guard is:

```go
if callerUserID == lo.FromPtr(data.previousTransaction.OriginalUserID) {
    return
}
```

`lo.FromPtr(nil)` returns `0` (the zero value of `int`). If `OriginalUserID` is nil (which should not happen for split transactions, but is a valid DB state for older rows before the column was populated), then `lo.FromPtr` returns `0`, and the guard evaluates to `callerUserID == 0`. Since `callerUserID` is always a positive integer for authenticated requests, this guard will always evaluate to *false* — i.e. it will *never* trigger. That means a nil `OriginalUserID` bypasses the self-edit guard entirely and fires a spurious `split_updated` notification to the partner when the original author edits their own transaction. While the immediate risk is a false notification rather than a security vulnerability, the guard's documented intent (D-03) is silently violated.

**Fix:** Explicitly check for nil before comparing:

```go
if data.previousTransaction.OriginalUserID != nil &&
    callerUserID == *data.previousTransaction.OriginalUserID {
    return
}
```

Apply to both lines 1372 and 1398.

---

### WR-03: `MarkAllRead` in the service layer does not wrap the repository error as a `ServiceError`

**File:** `backend/internal/service/notification_service.go:211-213`

**Issue:** The service layer's `MarkRead` and `MarkAllRead` both directly return the raw repository error without wrapping it in a `ServiceError`:

```go
func (s *notificationService) MarkRead(...) error {
    return s.notifRepo.MarkRead(ctx, userID, notificationID)
}

func (s *notificationService) MarkAllRead(...) error {
    return s.notifRepo.MarkAllRead(ctx, userID)
}
```

For `MarkRead`, the repository already returns `pkgErrors.NotFound("notification")` (a `*ServiceError`) on `RowsAffected == 0`, so the 404 propagates correctly. However, a raw GORM/database error from either method will reach the handler as a non-`ServiceError`, and `HandleServiceError → ToHTTPError` will convert it to a 500 with a potentially verbose database error message exposed to the client. Per `backend/CLAUDE.md`: *"Always return `*ServiceError` from services"*. The consistent pattern used throughout the codebase is `pkgErrors.Internal("...", err)`.

**Fix:**

```go
func (s *notificationService) MarkRead(ctx context.Context, userID, notificationID int) error {
    if err := s.notifRepo.MarkRead(ctx, userID, notificationID); err != nil {
        return err // NotFound is already a *ServiceError — pass through
    }
    return nil
}

func (s *notificationService) MarkAllRead(ctx context.Context, userID int) error {
    if err := s.notifRepo.MarkAllRead(ctx, userID); err != nil {
        return pkgErrors.Internal("failed to mark all notifications as read", err)
    }
    return nil
}
```

For `MarkRead`, the repository's `pkgErrors.NotFound` already is a `*ServiceError` and passes through `errors.As` correctly. Only raw DB errors need wrapping in `Internal`.

---

### WR-04: `createSplitTransaction` helper in test file is defined but never called — dead code and incorrect account usage

**File:** `backend/internal/service/notification_service_test.go:83-102`

**Issue:** The helper `createSplitTransaction` is defined at line 83 but never called anywhere in the test file. It is dead code that adds maintenance burden. Additionally, the implementation passes `conn.FromAccountID` (the *shared* connection account) as the transaction's `AccountID`, but `backend/CLAUDE.md` states: *"Split settings are NOT allowed on shared (connection) accounts. The author's main transaction must be on a private account."* The service will reject this with `ErrSplitSettingsNotAllowedOnSharedAccount`. If this helper is ever used in the future, it will always fail. Compare with `TestSplitCreatedNotification` (line 258) which correctly creates a private account first and uses `userAPrivateAcct.ID`.

**Fix:** Remove the dead helper. If it is needed in the future, fix the `AccountID` to use a private account (as done in `TestSplitCreatedNotification`):

```go
// Remove createSplitTransaction entirely, or fix to:
userAPrivateAcct, err := suite.createTestAccount(ctx, &domain.User{ID: userID})
// ...
AccountID: userAPrivateAcct.ID, // not conn.FromAccountID
```

---

## Info

### IN-01: Handler does not enforce an upper bound on the `limit` query parameter

**File:** `backend/internal/handler/notification_handler.go:39-43`

**Issue:** The handler accepts any positive `limit` value from the query string without capping it:

```go
if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
    limit = parsed
}
```

The repository silently clamps values above 100 to 20 (line 56-58 of `notification_repository.go`): `if limit <= 0 || limit > 100 { limit = 20 }`. This means a client that sends `?limit=9999` will get 20 items — correct in outcome, but the silent re-clamping is surprising. The clamping at the repository layer with `limit = 20` (not `limit = 100`) as the default for out-of-range values is also inconsistent: values above 100 are reset to 20, not to 100. A client requesting `?limit=50` would receive 50 items, but `?limit=200` would silently receive 20, which is lower than expected. Consider capping in the handler at 100 and documenting the maximum in the Swagger annotation.

---

### IN-02: The `TestSplitUpdatedCosmeticNoNotification` test does not assert the absence of `split_updated` in the correct way

**File:** `backend/internal/service/notification_service_test.go:519-524`

**Issue:** The cosmetic-edit test asserts `newNotifs == 0` (no new notifications of any type), which is a valid and sufficient assertion. However the comment says "D-02: cosmetic only" but the update request includes both `Description` and `CategoryID` — which by design are cosmetic — while also supplying `SplitSettings`. The presence of unchanged `SplitSettings` in the request does cause `determineTypeUpdateScenario` to evaluate `splitHasChanged`, but because the split membership is identical, `splitHasChanged` stays false and `changes.AddedSplit()` / `changes.RemovedSplit()` both return false. The test therefore relies on this internal invariant remaining true. A more direct test would remove `SplitSettings` from the update request altogether (since it is optional and an absent field means "no change" in the linked-tx-edit path). This is a test quality issue, not a correctness issue.

---

### IN-03: Migration file missing `CONCURRENT` index option for zero-downtime deploy

**File:** `backend/migrations/20260530152401_add_notification_cursor_index.sql`

**Issue:** The index is created as:

```sql
CREATE INDEX idx_notifications_cursor ON notifications(user_id, created_at DESC, id DESC);
```

A plain `CREATE INDEX` acquires an `ACCESS SHARE` lock on the table and blocks concurrent writes during the build. On a busy production table, this will cause write delays for the duration of the index build. On Cloud Run (auto-scaling, rolling deploys), this migration runs during startup, potentially causing write latency spikes visible to users. `CREATE INDEX CONCURRENTLY` avoids the exclusive lock but cannot be run inside a transaction. Since Goose wraps each migration in a transaction by default, using `CONCURRENTLY` requires opting out via `-- +goose NO TRANSACTION`. This is a deploy-time concern, not a code correctness issue, but worth noting for a production service.

---

_Reviewed: 2026-05-30T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
