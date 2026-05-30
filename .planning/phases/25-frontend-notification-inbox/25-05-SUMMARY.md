---
phase: 25-frontend-notification-inbox
plan: "05"
subsystem: frontend
tags: [notifications, inbox-nav, desktop-sidebar, mobile-tab-bar, mobile-more-drawer, badge, indicator, e2e, playwright, pt-BR]
dependency_graph:
  requires: [Phase 25 plans 02 (useNotificationUnreadCount, testIds), 04 (openNotificationInboxDrawer, NotificationInboxDrawer, /notifications page)]
  provides: [DesktopSidebar /notifications link + blue badge, MobileTabBar Mais-tab Indicator dot, MobileMoreDrawer "Notificações" item, notifications-inbox.spec.ts Playwright spec]
  affects: []
tech_stack:
  added: []
  patterns: [blue Indicator dot on tab bar (OD-4), BLUE badge distinct from RED charges badge (OD-2), openNotificationInboxDrawer fire-and-forget from MoreItem onSelect, Playwright page.route() fulfillment for API mocking, per-test fresh-user isolation]
key_files:
  created:
    - frontend/e2e/tests/notifications-inbox.spec.ts
  modified:
    - frontend/src/components/DesktopSidebar.tsx
    - frontend/src/components/MobileTabBar.tsx
    - frontend/src/components/MobileMoreDrawer.tsx
decisions:
  - "MobileMoreDrawer 'Notificações' item closes MoreDrawer first (close()) then calls openNotificationInboxDrawer() to avoid two drawers being open simultaneously"
  - "e2e spec uses page.route() with URL pattern matching for /api/notifications, /api/notifications/unread-count, /api/charges?**ids**, /api/transactions/by-ids — covers all three surfaces (desktop page, mobile drawer, nav badge) with route-mocked data"
  - "Mais tab Indicator dot is ATTACHED (not toBeVisible) in tests — Mantine renders the indicator element in DOM even when disabled=false; the blue dot becomes visible via CSS when disabled is false"
metrics:
  duration: ~25 minutes
  completed: 2026-05-30
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 3
commits:
  - "eba58fb feat(25-05/task-1-2): wire notification inbox into all three nav surfaces"
  - "f1b04ea feat(25-05/task-3): authored Playwright e2e spec for notification inbox (Docker-gated)"
---

# Phase 25 Plan 05: Nav Wiring + E2E Spec Summary

Wired the notification inbox into all three nav entry points (DesktopSidebar, MobileTabBar, MobileMoreDrawer) and authored the Playwright inbox e2e spec. All INBOX-01/02/03/04 requirements are now observable and surfaced at the correct nav points.

## What Was Built

### Task 1 — DesktopSidebar: /notifications nav link + blue badge

`frontend/src/components/DesktopSidebar.tsx`:
- Added `{ to: '/notifications', label: 'Notificações', icon: IconBell }` to `navLinks` array (after `/charges`)
- Imports `IconBell` from `@tabler/icons-react`, `useNotificationUnreadCount` from `@/hooks/useNotificationUnreadCount`, `NotificationsTestIds` from `@/testIds`
- `unreadCount = unreadQuery.data ?? 0` via `useNotificationUnreadCount((d) => d.count)`
- `showNotifBadge = to === "/notifications" && unreadCount > 0` — blue `Badge size="xs" circle color="blue"`; `{unreadCount > 9 ? "9+" : unreadCount}` (cap 9+)
- `data-testid={NotificationsTestIds.NavBellDesktop}` on the Link element
- `data-testid={CommonTestIds.NavBadge("notifications")}` + `aria-label` on the Badge
- Red Cobranças badge (`showChargesBadge`, `color="red"`) left unchanged

### Task 2 — MobileTabBar: Mais-tab Indicator dot + MobileMoreDrawer: Notificações item

`frontend/src/components/MobileTabBar.tsx`:
- Imports `Indicator` from `@mantine/core`, `useNotificationUnreadCount`, `NotificationsTestIds`
- `unreadCount` from `useNotificationUnreadCount((d) => d.count)`
- Wraps the `<span className={classes.iconWrap}>` in `<Indicator disabled={unreadCount === 0} color="blue" size={8} position="top-end" offset={4} data-testid={NotificationsTestIds.MaisTabIndicator} aria-hidden>`
- `UnstyledButton aria-label={unreadCount > 0 ? \`Mais — ${unreadCount} notificações não lidas\` : 'Mais'}`
- 4 tabs unchanged — no new tab added

`frontend/src/components/MobileMoreDrawer.tsx`:
- Adds `openNotificationsInbox()` helper: calls `close()` then `openNotificationInboxDrawer()`
- Renders "Notificações" `UnstyledButton` above `NotificationToggleRow` and "Sair": `data-testid={NotificationsTestIds.MoreDrawerNotificationsItem}`
- Blue count badge `{unreadCount > 9 ? '9+' : unreadCount}` when `unreadCount > 0`: `data-testid={CommonTestIds.NavBadge('notifications')}`
- All existing items (Criar Conexão, Importar transações, NotificationToggleRow, Sair) intact

### Task 3 — Playwright e2e spec (Docker-gated, authored)

`frontend/e2e/tests/notifications-inbox.spec.ts`:
- 7 `test.describe` groups; fresh user per test via `getAuthTokenForUser + openAuthedPage`
- All selectors via `getByTestId(NotificationsTestIds.* / CommonTestIds.* / MobileNavTestIds.*)`
- API mocked via `page.route()` + `route.fulfill()` for:
  - `GET /api/notifications/unread-count`
  - `GET /api/notifications` (first page + cursor-based second page)
  - `GET /api/charges?**ids**`
  - `GET /api/transactions/by-ids**`
  - `POST /api/notifications/*/read`
  - `POST /api/notifications/read-all`
- Covers: desktop badge (count, 9+ cap, hidden when 0, navigate to /notifications); mobile Mais-tab aria-label; MoreDrawer item (badge, drawer opens inbox); unread dot vs read row; row tap navigates to entity page; mark-all-read clears badge; load-more button loads page 2; empty state

## Gate Results

| Gate | Result |
|------|--------|
| `npm run build` (tsc -b && vite build) | PASS |
| `npm run test:component` (vitest run) | PASS — 100/100 (10 files, no regressions) |
| `npm run lint` (src/ only) | PASS — 0 errors (2 pre-existing warnings in TransactionsPage.tsx) |
| `npx tsc -b` (includes e2e spec) | PASS |
| No new MobileTabBar tab added (still 4 tabs) | CONFIRMED |
| Blue badge on notifications, red on Cobranças | CONFIRMED |
| No `useEffect` in modified components | CONFIRMED |
| All e2e selectors via getByTestId only | CONFIRMED |

## Deviations from Plan

**None.** Plan executed exactly as written.

Minor implementation note: the MobileMoreDrawer already had all the necessary imports (`Badge`, `IconBell`, `openNotificationInboxDrawer`, `CommonTestIds`, `NotificationsTestIds`, `useNotificationUnreadCount`) added as part of the prior commit wave. The only implementation work was adding the `openNotificationsInbox()` helper and the JSX `UnstyledButton` item for "Notificações".

## Known Stubs

None. All three nav surfaces consume the live `useNotificationUnreadCount` hook and the live `openNotificationInboxDrawer` helper from Plan 04.

## E2E Spec Status

`frontend/e2e/tests/notifications-inbox.spec.ts` — AUTHORED AND DEFERRED TO CI.
The spec type-checks cleanly under `npx tsc -b`. Execution requires the Docker e2e stack (`npm run test:e2e`) — not available this phase.

## Threat Surface Scan

No new server surface introduced. T-25-14 and T-25-15 (from plan threat model) are addressed:
- T-25-14: count badge reads from the IDOR-scoped `unread-count` endpoint; no entity data exposed in badge
- T-25-15: MoreDrawer "Notificações" onClick calls `openNotificationInboxDrawer()` — opens a local React drawer, no URL navigation, no user-supplied URLs

---

## Self-Check: PASSED

All 3 tasks committed (eba58fb, f1b04ea); all 4 files exist; all gates green.

Verified:
- `frontend/src/components/DesktopSidebar.tsx` — contains `/notifications`, `color="blue"`, `NavBellDesktop` testId
- `frontend/src/components/MobileTabBar.tsx` — contains `Indicator`, `MaisTabIndicator` testId, exactly 4 tabs
- `frontend/src/components/MobileMoreDrawer.tsx` — contains `openNotificationInboxDrawer`, `MoreDrawerNotificationsItem` testId, `color="blue"` badge
- `frontend/e2e/tests/notifications-inbox.spec.ts` — exists, contains `getByTestId`, compiles under tsc -b
