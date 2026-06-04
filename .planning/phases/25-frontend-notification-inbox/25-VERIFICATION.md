---
phase: 25-frontend-notification-inbox
verified: 2026-05-30T20:25:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
deferred:
human_verification:
---

# Phase 25: Frontend Notification Inbox — Verification Report

**Phase Goal:** Users can view all notifications in an in-app inbox, distinguish unread from read, navigate to the referenced entity, and mark notifications as read.
**Verified:** 2026-05-30T20:25:00Z
**Status:** passed (code-complete; e2e + charge-repo integration test deferred to CI/UAT per environment note)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (INBOX-01..04)

| # | Truth (Requirement) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | INBOX-01 — Open inbox from nav; notifications newest-first with human-readable per-event copy | ✓ VERIFIED | Desktop route `routes/_authenticated.notifications.tsx:4-6` → `NotificationInboxPage` (`pages/NotificationInboxPage.tsx:12-21`); route in generated tree `routeTree.gen.ts:57-58`. Mobile drawer via `openNotificationInboxDrawer()` (`NotificationInboxDrawer.tsx:58-64`) wired from `MobileMoreDrawer.tsx:65` item. `NotificationInboxContent.tsx:72` flattens infinite pages from `useNotificationInbox` (newest-first from API cursor; `useNotificationInbox.ts:7-12`). `describeNotification.ts:37-59` builds pt-BR copy per type. |
| 2 | INBOX-02 — Unread count badge in nav + unread visually distinct in list | ✓ VERIFIED | `DesktopSidebar.tsx:105,123-132` blue Badge capped `9+` when `unreadCount>0` (count from `useNotificationUnreadCount`, line 80). `MobileTabBar.tsx:89-95` Indicator dot `disabled={unreadCount===0}`. `MobileMoreDrawer.tsx:132-139` item badge when unread>0. `NotificationRow.tsx:116,129-136,143,154` unread = 8px `blue.6` dot + colored ThemeIcon + full-contrast text; read = `gray` icon + transparent spacer + `c="dimmed"`; CSS tint in `NotificationRow.module.css`. |
| 3 | INBOX-03 — Tap notification → navigate to related charge/transaction screen AND mark that one read | ✓ VERIFIED | `NotificationRow.tsx:98-114` `handleTap` fires `markRead(notification.id)` (optimistic via `useMarkNotificationRead`) then `router.navigate({to: deriveDeepLink(...)})`. `pushDeepLink.ts:2-5` resolves charge→`/charges`, split/transaction→`/transactions`. `onAfterTap?.()` closes mobile drawer (`NotificationInboxDrawer.tsx:45` passes `close`). Honest note (matches success criteria): lands on LIST page, not entity deep-link — consistent with Phase 24, still "related screen". |
| 4 | INBOX-04 — Mark-all-read in one action → badge disappears, all show read | ✓ VERIFIED | `NotificationInboxContent.tsx:177-191` mark-all button rendered only when `unreadCount>0` → `useMarkAllNotificationsRead.mutate()`. `useMarkAllNotificationsRead.ts:41-56` optimistic: every notification `read:true` + count zeroed. Badges keyed on `unreadCount>0` (Desktop/Mobile/Drawer) so they clear. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `routes/_authenticated.notifications.tsx` | desktop route → page | ✓ VERIFIED | Thin route, delegates to `NotificationInboxPage`; present in `routeTree.gen.ts` |
| `pages/NotificationInboxPage.tsx` | full-page inbox | ✓ VERIFIED | Renders shared `NotificationInboxContent` (no onRowTap) |
| `components/notifications/NotificationInboxContent.tsx` | shared list + states | ✓ VERIFIED | Loading/error/empty/populated states; flatten pages; mark-all; load-more; "Você está em dia" |
| `components/notifications/NotificationRow.tsx` | row: dot, icon, copy, tap | ✓ VERIFIED | Unread styling, describeNotification, optimistic mark-read + navigate |
| `components/notifications/NotificationInboxDrawer.tsx` | mobile bottom-sheet + opener | ✓ VERIFIED | `openNotificationInboxDrawer()` + closes on tap |
| `components/notifications/describeNotification.ts` (+ test) | pt-BR copy per type | ✓ VERIFIED | 4 types + fallback; amountState variants; 15 unit tests |
| `hooks/useNotificationInbox.ts` | infinite cursor query | ✓ VERIFIED | useInfiniteQuery, getNextPageParam from has_more/next_cursor |
| `hooks/useNotificationUnreadCount.ts` | count query + select | ✓ VERIFIED | Polled (60s), select generic |
| `hooks/useResolveNotificationAmounts.ts` (plural) | BULK by-IDs resolver | ✓ VERIFIED | ≤1 charges + ≤1 transactions batched queries; D-25-1 honored |
| `hooks/useMarkNotificationRead.ts` | optimistic single mark-read | ✓ VERIFIED | onMutate flip + count decrement, onError rollback, onSettled count-invalidate, caller onSuccess (D-25-2) |
| `hooks/useMarkAllNotificationsRead.ts` | optimistic mark-all | ✓ VERIFIED | onMutate all read + count zero, onError rollback, onSettled, caller onSuccess (D-25-2) |
| `api/notifications.ts` | inbox/count/read/read-all | ✓ VERIFIED | All 4 endpoints per Phase-23 contract |
| `api/charges.ts` `fetchChargesByIds` | `id[]` batched fetch | ✓ VERIFIED | Appends repeated `id[]`, hits existing `GET /api/charges` |
| `api/transactions.ts` `fetchTransactionsByIds` | `id[]` cross-period fetch | ✓ VERIFIED | Hits `GET /api/transactions/by-ids` |
| `testIds/notifications.ts` | stable testids | ✓ VERIFIED | Row/UnreadDot factories + nav/drawer ids |
| `e2e/tests/notifications-inbox.spec.ts` | e2e coverage | ✓ AUTHORED (deferred to CI) | 10+ tests, 44 test/expect calls; gate = type-check via build |
| backend `domain/charge.go` IDs field | `id[]` filter | ✓ VERIFIED | `charge.go:69` `IDs []int query:"id[]"` |
| backend `repository/charge_repository.go` WHERE id IN | bounded query | ✓ VERIFIED | Line 76-77 `WHERE id IN ?`; IDOR via `options.UserID` gate (57-65) |
| backend `handler/transaction_handler.go` ListByIDs | by-ids handler | ✓ VERIFIED | Lines 332-356; `filter.UserID=&userID` (347) prevents IDOR leak; empty ids → 200 [] |
| backend `cmd/server/main.go` route order | by-ids before /:id | ✓ VERIFIED | Line 257 `/by-ids` registered before `/:id` (258-259) |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| MobileMoreDrawer | inbox drawer | `openNotificationInboxDrawer()` | ✓ WIRED | import L10, call L65 |
| DesktopSidebar | unread badge | `useNotificationUnreadCount((d)=>d.count)` | ✓ WIRED | L80-81, badge L123-132 |
| MobileTabBar | Mais indicator | `useNotificationUnreadCount` | ✓ WIRED | L39-40, Indicator L89-95 |
| NotificationRow tap | router | `router.navigate(deriveDeepLink(...))` | ✓ WIRED | L104-110 |
| NotificationRow tap | mark-read | `markRead(id)` (parent hook) | ✓ WIRED | L99; parent `NotificationInboxContent.tsx:78-99` |
| InboxContent | resolver | `useResolveNotificationAmounts(notifications)` | ✓ WIRED | L75, rendered per-row L195-207 |
| resolver | charges API | `fetchChargesByIds` | ✓ WIRED | hook L44; api appends `id[]` |
| resolver | transactions API | `fetchTransactionsByIds` | ✓ WIRED | hook L52; api `by-ids` |
| charges API | backend repo | `WHERE id IN` + UserID | ✓ WIRED | repo L76-77, IDOR L57-65 |
| transactions by-ids | service Search | `Period{0,0}+filter.UserID` | ✓ WIRED | handler L347-350 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| NotificationInboxContent | `notifications` | `useNotificationInbox` → `GET /api/notifications` (cursor) | Yes — Phase-23 backend live | ✓ FLOWING |
| Nav badges | `unreadCount` | `useNotificationUnreadCount` → `GET /api/notifications/unread-count` | Yes | ✓ FLOWING |
| NotificationRow | `resolved.amount` | resolver → charges `id[]` / transactions `by-ids` | Yes — repo `WHERE id IN`, no static return | ✓ FLOWING |
| Mark-read/all | cache flip | optimistic onMutate + server reconcile onSettled | Yes | ✓ FLOWING |

### Behavioral Spot-Checks (Runnable Gates)

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Frontend prod build emits dist/sw.js | `npm run build` | built in 8.68s, `dist/sw.js` generated | ✓ PASS |
| Frontend unit tests | `npx vitest run` | 100 passed / 10 files | ✓ PASS |
| Frontend lint | `npm run lint` | 0 errors, 2 pre-existing TransactionsPage warnings (not this phase) | ✓ PASS |
| Backend build | `go build ./...` | exit 0 | ✓ PASS |
| Backend vet (integration tag) | `go vet -tags=integration ./internal/...` | exit 0 | ✓ PASS |
| Backend short tests | `go test -short ./...` | all packages ok | ✓ PASS |

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| INBOX-01 | REQUIREMENTS.md:30 | Open inbox listing notifications, newest first | ✓ SATISFIED | Truth 1 |
| INBOX-02 | REQUIREMENTS.md:31 | Unread count indicator + distinguish unread/read | ✓ SATISFIED | Truth 2 |
| INBOX-03 | REQUIREMENTS.md:32 | Select notification → navigate to related charge/transaction | ✓ SATISFIED | Truth 3 |
| INBOX-04 | REQUIREMENTS.md:33 | Mark read individually + all at once; opening marks read | ✓ SATISFIED | Truth 4 |

### Locked-Decision Compliance

| Decision | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| D-25-1 | BULK by-IDs resolution (≤2 requests/page); NO per-id design | ✓ HONORED | Plural `useResolveNotificationAmounts` fires ≤1 charges + ≤1 transactions query (hook L42-55). Charges via existing `GET /api/charges?id[]=` (domain IDs field, repo `WHERE id IN`, IDOR `options.UserID=userID`). Transactions via dedicated `GET /api/transactions/by-ids` (route before `/:id`, `filter.UserID=&userID`, no IDOR leak). Negative grep: NO `fetchChargeById`/`useChargeById`/singular `useResolveNotificationAmount` anywhere in src/ or e2e/. |
| D-25-2 | mark-read optimistic onMutate/onError/onSettled(unread-count) in-hook; inbox-list invalidation via caller onSuccess | ✓ HONORED | `useMarkNotificationRead.ts:31-104` and `useMarkAllNotificationsRead.ts:30-87`: in-hook onMutate/onError/onSettled scoped to unread-count; `onSuccess` delegates to caller. Caller wires `onSuccess: invalidateInbox` (`NotificationInboxContent.tsx:78-83`). |
| UI-SPEC §"Data Fetching Strategy" | SUPERSEDED per-id design must NOT be implemented | ✓ HONORED | Confirmed absent (see D-25-1 negative grep). |

### Anti-Patterns Found

None blocking. The 2 ESLint warnings are in `TransactionsPage.tsx` (pre-existing, explicitly out of scope per environment note). No TODO/FIXME/placeholder, no stub handlers, no hollow props in phase-25 files. Empty-array returns in `fetchChargesByIds`/`fetchTransactionsByIds` are correct short-circuits for empty id sets (not stubs).

### Deferred to CI / UAT (NOT gaps)

Per the environment note (Docker unavailable; no e2e/push stack), these are legitimately authored-but-deferred. Their compile/type-check gate is covered by `npm run build` + `go vet` (both pass):

1. **Playwright e2e** — `frontend/e2e/tests/notifications-inbox.spec.ts` (10+ tests, 44 assertions/test-calls). Authored; runs in CI with the e2e stack.
2. **Charge-repo `id IN` integration test** — runs under `go test -tags=integration` against testcontainers Postgres. Authored; runs in CI.

### Human Verification Required

None required for verdict — all four success criteria are confirmed code-complete with file:line evidence, all runnable gates pass, and locked decisions are honored. Visual/interaction confirmation (badge appearance, drawer animation, row tint contrast) will be exercised by the deferred Playwright suite in CI and final UAT.

### Gaps Summary

No gaps. All 4 requirement IDs (INBOX-01..04) map to substantive, wired, data-flowing implementations. Both locked decisions (D-25-1 bulk by-IDs with IDOR scoping; D-25-2 mark-read invalidation placement) are honored, and the superseded per-id design is confirmed absent. All six runnable gates pass. The only un-run items (Playwright e2e + charge-repo integration test) are explicitly deferred to CI per the environment note and gated by type-check/compile, which pass.

---

_Verified: 2026-05-30T20:25:00Z_
_Verifier: Claude (gsd-verifier)_
