/**
 * e2e — Notification Inbox (Phase 25, Plan 05)
 *
 * Covers the three nav surfaces + the inbox list itself:
 *   1. Desktop sidebar /notifications link + blue badge
 *   2. Mobile MobileTabBar "Mais" tab blue Indicator dot
 *   3. Mobile MobileMoreDrawer "Notificações" item → opens inbox drawer
 *   4. Inbox list: render rows, unread dot styling, mark-read on tap
 *   5. Mark-all-read: clears badge + hides button
 *   6. Load-more: appended rows; end state when has_more=false
 *   7. Empty state
 *
 * Selectors: data-testid ONLY (CLAUDE.md §E2E rules).
 * Test isolation: one fresh user per test via getAuthTokenForUser + openAuthedPage.
 * API: route-mocked (page.route) — no real notification data required.
 *
 * NOTE: AUTHORED but NOT EXECUTED this phase (Docker e2e stack unavailable).
 * Gate: `npx tsc -b` type-check (the spec must compile cleanly).
 * Execute in CI where Docker is available: `npm run test:e2e`.
 */

import { test, expect, type Page } from '@playwright/test'
import {
  NotificationsTestIds,
  CommonTestIds,
  MobileNavTestIds,
} from '@/testIds'
import { getAuthTokenForUser, openAuthedPage } from '../helpers/api'

// ── Fixture data ────────────────────────────────────────────────────────────────

const now = new Date().toISOString()
const UNREAD_NOTIF_1 = {
  id: 1001,
  type: 'charge_received' as const,
  entity_type: 'charge' as const,
  entity_id: 5001,
  read: false,
  created_at: now,
}
const READ_NOTIF_2 = {
  id: 1002,
  type: 'charge_accepted' as const,
  entity_type: 'charge' as const,
  entity_id: 5002,
  read: true,
  created_at: now,
}
const NOTIF_PAGE_1 = {
  notifications: [UNREAD_NOTIF_1, READ_NOTIF_2],
  next_cursor: 'cursor_page_2',
  has_more: true,
}
const SPLIT_NOTIF_3 = {
  id: 1003,
  type: 'split_created' as const,
  entity_type: 'transaction' as const,
  entity_id: 6001,
  read: true,
  // Persisted description now flows back on the notification row (Part A).
  description: 'Mercado',
  created_at: now,
}
const NOTIF_PAGE_2 = {
  notifications: [SPLIT_NOTIF_3],
  next_cursor: '',
  has_more: false,
}
const NOTIF_PAGE_EMPTY = { notifications: [], next_cursor: '', has_more: false }
const UNREAD_COUNT_2 = { count: 2 }
const UNREAD_COUNT_0 = { count: 0 }

// Charges by-ids response for entity_id 5001 and 5002
const CHARGES_BY_IDS_RESP = {
  charges: [
    { id: 5001, amount: 5000, description: 'Aluguel', status: 'pending', connection_id: 1 },
    { id: 5002, amount: 3000, description: null, status: 'accepted', connection_id: 1 },
  ],
}
// fetchTransactionsByIds returns a BARE ARRAY (Transactions.Transaction[]), not
// an object. The charge_received / charge_accepted rows resolve their amount
// from /api/charges; the split_created row (entity_id 6001) resolves its
// amount + date + description from this transactions response so the row-tap
// test can assert the /transactions month/year/query filter.
const TRANSACTIONS_BY_IDS_RESP: unknown[] = [
  {
    id: 6001,
    user_id: 1,
    type: 'expense',
    account_id: 1,
    amount: 4200,
    operation_type: 'debit',
    date: '2026-03-15T00:00:00-03:00',
    description: 'Mercado',
  },
]

// ── Route-mock helpers ──────────────────────────────────────────────────────────

/**
 * Install the standard notification API mocks.
 *
 * The real frontend requests carry query strings the old bare globs could not
 * match (e.g. `GET /api/notifications?limit=20`, `&cursor=...` on page 2, and
 * `/api/charges?id[]=…` URL-encoded as `id%5B%5D`). A bare glob like
 * `**​/api/notifications` also greedily shadows the `/unread-count`,
 * `/read-all`, and `/:id/read` sub-paths. To be robust we match on the URL
 * **pathname** via predicate functions — never on globs/query strings:
 *
 *  - GET  /api/notifications/unread-count         → { count }
 *  - POST /api/notifications/read-all             → 204
 *  - POST /api/notifications/:id/read             → 204
 *  - GET  /api/notifications  (page 1 vs page 2 by `cursor` searchParam)
 *  - GET  /api/charges            (front filters by id[]; full set is fine)    → { charges }
 *  - GET  /api/transactions/by-ids                → bare array []
 */
async function installNotifMocks(page: Page, unreadCount = UNREAD_COUNT_2) {
  // Exact pathname matchers (no query-string coupling). Order is irrelevant
  // because the predicates are mutually exclusive on pathname.

  await page.route(
    (url) => url.pathname === '/api/notifications/unread-count',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(unreadCount),
      }),
  )

  await page.route(
    (url) => url.pathname === '/api/notifications/read-all',
    (route) => route.fulfill({ status: 204, body: '' }),
  )

  await page.route(
    (url) => /^\/api\/notifications\/\d+\/read$/.test(url.pathname),
    (route) => route.fulfill({ status: 204, body: '' }),
  )

  // DELETE /api/notifications/read (bulk delete read) — must be matched BEFORE
  // the /:id matcher so "read" is not captured as an id. Both reply 204.
  await page.route(
    (url) => url.pathname === '/api/notifications/read',
    (route) => route.fulfill({ status: 204, body: '' }),
  )

  // DELETE /api/notifications/:id (single hard delete) → 204.
  await page.route(
    (url) => /^\/api\/notifications\/\d+$/.test(url.pathname),
    (route) => route.fulfill({ status: 204, body: '' }),
  )

  await page.route(
    (url) => url.pathname === '/api/notifications',
    async (route) => {
      const url = new URL(route.request().url())
      const cursor = url.searchParams.get('cursor') ?? ''
      // First page request has no cursor; load-more sends the page-1 cursor.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(cursor ? NOTIF_PAGE_2 : NOTIF_PAGE_1),
      })
    },
  )

  await page.route(
    (url) => url.pathname === '/api/charges',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CHARGES_BY_IDS_RESP),
      }),
  )

  await page.route(
    (url) => url.pathname === '/api/transactions/by-ids',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TRANSACTIONS_BY_IDS_RESP),
      }),
  )
}

/** Fresh authenticated page for each test. */
async function freshAuthedPage(browser: import('@playwright/test').Browser) {
  const email = `e2e-notif-inbox-${Date.now()}@financeapp.local`
  const token = await getAuthTokenForUser(email)
  const page = await openAuthedPage(browser, token)
  return { page, token }
}

// ── 1. Desktop sidebar: /notifications link + blue badge ────────────────────────

test.describe('Desktop: sidebar /notifications link + blue badge', () => {
  test('shows blue badge with capped count when unread > 0', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page, { count: 12 })

    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // The /notifications nav link must be visible (NavBellDesktop testid)
    const navLink = page.getByTestId(NotificationsTestIds.NavBellDesktop)
    await expect(navLink).toBeVisible()

    // Badge must show "9+" for count 12 (cap at 9+)
    const badge = page.getByTestId(CommonTestIds.NavBadge('notifications'))
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText('9+')

    await page.close()
  })

  test('shows exact count (not capped) when unread ≤ 9', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page, { count: 3 })

    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    const badge = page.getByTestId(CommonTestIds.NavBadge('notifications'))
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText('3')

    await page.close()
  })

  test('hides badge when unread count is 0', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page, { count: 0 })

    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    const badge = page.getByTestId(CommonTestIds.NavBadge('notifications'))
    await expect(badge).not.toBeVisible()

    await page.close()
  })

  test('clicking the nav link navigates to /notifications and renders inbox list', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page)

    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Click the nav link
    await page.getByTestId(NotificationsTestIds.NavBellDesktop).click()
    await page.waitForURL('**/notifications')

    // Assert inbox rows rendered (IDs from NOTIF_PAGE_1)
    const row1 = page.getByTestId(NotificationsTestIds.Row(UNREAD_NOTIF_1.id))
    await expect(row1).toBeVisible()

    const row2 = page.getByTestId(NotificationsTestIds.Row(READ_NOTIF_2.id))
    await expect(row2).toBeVisible()

    await page.close()
  })
})

// ── 2. Mobile "Mais" tab: Indicator dot ─────────────────────────────────────────

test.describe('Mobile: "Mais" tab blue Indicator dot', () => {
  test('shows blue Indicator dot when unread > 0', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page, { count: 2 })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // The Indicator element should exist in the DOM (it may not be "visible" in
    // Playwright's strict sense because Mantine renders an invisible dot when
    // disabled=false — assert presence via data-testid)
    const indicator = page.getByTestId(NotificationsTestIds.MaisTabIndicator)
    await expect(indicator).toBeAttached()

    await page.close()
  })

  test('Mais tab aria-label reflects unread count', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page, { count: 4 })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    const maisTab = page.getByTestId(MobileNavTestIds.MoreTab)
    await expect(maisTab).toHaveAttribute('aria-label', 'Mais — 4 notificações não lidas')

    await page.close()
  })

  test('Mais tab aria-label is "Mais" when unread = 0', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page, { count: 0 })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    const maisTab = page.getByTestId(MobileNavTestIds.MoreTab)
    await expect(maisTab).toHaveAttribute('aria-label', 'Mais')

    await page.close()
  })
})

// ── 3. Mobile MobileMoreDrawer "Notificações" item ──────────────────────────────

test.describe('Mobile: MobileMoreDrawer "Notificações" item', () => {
  test('drawer item visible with blue count badge when unread > 0', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page, { count: 5 })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Open the "Mais" drawer
    await page.getByTestId(MobileNavTestIds.MoreTab).click()
    const drawer = page.getByTestId(MobileNavTestIds.MoreDrawer)
    await expect(drawer).toBeVisible()

    // "Notificações" item must be visible
    const notifItem = drawer.getByTestId(NotificationsTestIds.MoreDrawerNotificationsItem)
    await expect(notifItem).toBeVisible()

    // Blue count badge must be visible and show "5"
    const badge = drawer.getByTestId(CommonTestIds.NavBadge('notifications'))
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText('5')

    await page.close()
  })

  test('drawer item has no badge when unread = 0', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page, { count: 0 })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    await page.getByTestId(MobileNavTestIds.MoreTab).click()
    const drawer = page.getByTestId(MobileNavTestIds.MoreDrawer)
    await expect(drawer).toBeVisible()

    const badge = drawer.getByTestId(CommonTestIds.NavBadge('notifications'))
    await expect(badge).not.toBeVisible()

    await page.close()
  })

  test('tapping "Notificações" closes MoreDrawer and opens inbox drawer', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page)

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Open MoreDrawer
    await page.getByTestId(MobileNavTestIds.MoreTab).click()
    const moreDrawer = page.getByTestId(MobileNavTestIds.MoreDrawer)
    await expect(moreDrawer).toBeVisible()

    // Tap "Notificações"
    await moreDrawer.getByTestId(NotificationsTestIds.MoreDrawerNotificationsItem).click()

    // Inbox drawer must appear
    const inboxDrawer = page.getByTestId(NotificationsTestIds.Drawer)
    await expect(inboxDrawer).toBeVisible({ timeout: 8000 })

    // Inbox rows must render
    const row1 = inboxDrawer.getByTestId(NotificationsTestIds.Row(UNREAD_NOTIF_1.id))
    await expect(row1).toBeVisible()

    await page.close()
  })
})

// ── 4. Inbox list: rows, unread dot, row tap ─────────────────────────────────────

test.describe('Inbox list: unread styling + row tap', () => {
  test('unread row shows UnreadDot; read row does not', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page)

    await page.goto('/notifications')
    await page.waitForLoadState('networkidle')

    // Unread row (id=1001): UnreadDot must be visible
    const unreadDot = page.getByTestId(NotificationsTestIds.UnreadDot(UNREAD_NOTIF_1.id))
    await expect(unreadDot).toBeVisible()

    // Read row (id=1002): UnreadDot must not be visible (transparent spacer)
    const readDot = page.getByTestId(NotificationsTestIds.UnreadDot(READ_NOTIF_2.id))
    await expect(readDot).not.toBeVisible()

    await page.close()
  })

  test('tapping a row navigates to the entity page', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page)

    await page.goto('/notifications')
    await page.waitForLoadState('networkidle')

    // Tap the unread charge_received row → should navigate to /charges
    await page.getByTestId(NotificationsTestIds.Row(UNREAD_NOTIF_1.id)).click()
    await page.waitForURL(/\/(charges|transactions)/, { timeout: 5000 })

    await page.close()
  })

  test('tapping a transaction row navigates to /transactions filtered by its month/year/query', async ({
    browser,
  }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page)

    await page.goto('/notifications')
    await page.waitForLoadState('networkidle')

    // Reveal the page-2 split_created/transaction row (entity_id 6001).
    await page.getByTestId(NotificationsTestIds.BtnLoadMore).click()
    const splitRow = page.getByTestId(NotificationsTestIds.Row(SPLIT_NOTIF_3.id))
    await expect(splitRow).toBeVisible({ timeout: 5000 })

    // Tap it → /transactions filtered by the resolved transaction's date
    // (2026-03-15 → month=3, year=2026) and description (query=Mercado).
    await splitRow.click()
    await page.waitForURL(
      (url) =>
        url.pathname === '/transactions' &&
        url.searchParams.get('month') === '3' &&
        url.searchParams.get('year') === '2026' &&
        url.searchParams.get('query') === 'Mercado',
      { timeout: 5000 },
    )

    await page.close()
  })
})

// ── 5. Mark-all-read: clears badge + hides button ───────────────────────────────

test.describe('Mark-all-read', () => {
  test('BtnMarkAllRead visible when unread > 0; clicking it clears the badge', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page, UNREAD_COUNT_2)

    // After mark-all-read, unread-count endpoint returns 0.
    // These re-registrations take precedence over installNotifMocks because
    // Playwright tries the most-recently-registered route first.
    let markAllCalled = false
    await page.route(
      (url) => url.pathname === '/api/notifications/read-all',
      async (route) => {
        markAllCalled = true
        await route.fulfill({ status: 204, body: '' })
      },
    )
    // Override unread-count to return 0 once mark-all is called
    await page.route(
      (url) => url.pathname === '/api/notifications/unread-count',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(markAllCalled ? UNREAD_COUNT_0 : UNREAD_COUNT_2),
        })
      },
    )

    await page.goto('/notifications')
    await page.waitForLoadState('networkidle')

    // BtnMarkAllRead must be visible (unread > 0)
    const btnMarkAll = page.getByTestId(NotificationsTestIds.BtnMarkAllRead)
    await expect(btnMarkAll).toBeVisible()

    // Click mark-all
    await btnMarkAll.click()

    // Badge on nav link should disappear (optimistic + refetch)
    const badge = page.getByTestId(CommonTestIds.NavBadge('notifications'))
    await expect(badge).not.toBeVisible({ timeout: 5000 })

    await page.close()
  })
})

// ── 6. Load-more ──────────────────────────────────────────────────────────────────

test.describe('Load-more button', () => {
  test('BtnLoadMore visible on first page (has_more=true); loads more rows on click', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page)

    await page.goto('/notifications')
    await page.waitForLoadState('networkidle')

    // Load-more button must be visible (has_more=true on first page)
    const btnLoad = page.getByTestId(NotificationsTestIds.BtnLoadMore)
    await expect(btnLoad).toBeVisible()

    // Click it — should load second page rows
    await btnLoad.click()

    // Row from page 2 must appear
    const row3 = page.getByTestId(NotificationsTestIds.Row(1003))
    await expect(row3).toBeVisible({ timeout: 5000 })

    // After page 2 (has_more=false), load-more should disappear
    await expect(btnLoad).not.toBeVisible({ timeout: 5000 })

    await page.close()
  })
})

// ── 7. Empty state ────────────────────────────────────────────────────────────────

test.describe('Empty state', () => {
  test('EmptyState visible when notifications list is empty', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)

    // Mock empty notifications + 0 unread (pathname predicates — the bare
    // `/api/notifications` carries `?limit=20`, and the unread-count matcher
    // must not be shadowed by the list matcher).
    await page.route(
      (url) => url.pathname === '/api/notifications/unread-count',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(UNREAD_COUNT_0),
        }),
    )
    await page.route(
      (url) => url.pathname === '/api/notifications',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(NOTIF_PAGE_EMPTY),
        }),
    )

    await page.goto('/notifications')
    await page.waitForLoadState('networkidle')

    const emptyState = page.getByTestId(NotificationsTestIds.EmptyState)
    await expect(emptyState).toBeVisible()

    // Badge must not exist
    const badge = page.getByTestId(CommonTestIds.NavBadge('notifications'))
    await expect(badge).not.toBeVisible()

    await page.close()
  })
})

// ── 8. Delete actions: per-row delete, per-row mark-read, bulk "Remover lidas" ──

test.describe('Delete actions', () => {
  test('per-row delete (trash) removes the row without confirmation', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page)

    await page.goto('/notifications')
    await page.waitForLoadState('networkidle')

    const row = page.getByTestId(NotificationsTestIds.Row(UNREAD_NOTIF_1.id))
    await expect(row).toBeVisible()

    // Click the per-row trash button → optimistic removal, no confirm drawer.
    await page.getByTestId(NotificationsTestIds.RowBtnDelete(UNREAD_NOTIF_1.id)).click()

    await expect(row).not.toBeVisible({ timeout: 5000 })

    await page.close()
  })

  test('per-row "marcar como lida" flips the row to read (unread dot disappears)', async ({
    browser,
  }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page)

    await page.goto('/notifications')
    await page.waitForLoadState('networkidle')

    // The unread row shows its mark-read button and the unread dot.
    const unreadDot = page.getByTestId(NotificationsTestIds.UnreadDot(UNREAD_NOTIF_1.id))
    await expect(unreadDot).toBeVisible()

    await page.getByTestId(NotificationsTestIds.RowBtnMarkRead(UNREAD_NOTIF_1.id)).click()

    // Optimistic flip → row is read → unread dot and mark-read button gone.
    await expect(unreadDot).not.toBeVisible({ timeout: 5000 })
    await expect(
      page.getByTestId(NotificationsTestIds.RowBtnMarkRead(UNREAD_NOTIF_1.id)),
    ).not.toBeVisible({ timeout: 5000 })

    await page.close()
  })

  test('"Remover lidas" requires confirmation, then removes read rows', async ({ browser }) => {
    const { page } = await freshAuthedPage(browser)
    await installNotifMocks(page)

    await page.goto('/notifications')
    await page.waitForLoadState('networkidle')

    // A read row is present (id=1002) → "Remover lidas" is shown.
    const readRow = page.getByTestId(NotificationsTestIds.Row(READ_NOTIF_2.id))
    await expect(readRow).toBeVisible()

    const btnDeleteRead = page.getByTestId(NotificationsTestIds.BtnDeleteRead)
    await expect(btnDeleteRead).toBeVisible()
    await btnDeleteRead.click()

    // Confirmation drawer appears; confirm the mass action.
    const confirmDrawer = page.getByTestId(NotificationsTestIds.ConfirmDeleteReadDrawer)
    await expect(confirmDrawer).toBeVisible({ timeout: 5000 })
    await page.getByTestId(NotificationsTestIds.ConfirmDeleteReadConfirm).click()

    // Read row removed; the unread row remains.
    await expect(readRow).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId(NotificationsTestIds.Row(UNREAD_NOTIF_1.id))).toBeVisible()

    await page.close()
  })
})
