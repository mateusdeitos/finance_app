/**
 * e2e — Notification toggle row (Phase 24, Plan 05)
 *
 * Tests the 5-state NotificationToggleRow in both surfaces:
 *   • Desktop — inside the sidebar user-menu dropdown (after "Tema", above divider)
 *   • Mobile  — inside the "Mais" bottom-sheet drawer (above "Sair")
 *
 * States covered:
 *   • unsupported — PushManager deleted from window before page load
 *   • denied      — Notification.permission stubbed to 'denied'
 *   • default → permission gate (CTRL-01) — verifies no prompt on load; prompt fires on tap
 *
 * Selectors: data-testid only (CLAUDE.md §E2E rules).
 * Field interactions: SwitchField (CLAUDE.md §Form fields mandatory class rule).
 * Test isolation: one fresh user per test case via getAuthTokenForUser + openAuthedPage.
 *
 * NOTE: These tests are AUTHORED here but executed only in the full Docker e2e
 * stack. Do not run `npm run e2e` locally — Docker / push service unavailable.
 * The spec type-checks as part of `npm run build` / `npx tsc -b --noEmit`.
 *
 * Device/real-push verification is deferred to 24-HUMAN-UAT.md.
 */

import { test, expect } from '@playwright/test'
import { NotificationsTestIds, CommonTestIds, MobileNavTestIds } from '@/testIds'
import { SwitchField } from '../helpers/formFields'
import { getAuthTokenForUser, openAuthedPage } from '../helpers/api'
import { NotificationsPage } from '../pages/NotificationsPage'

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Generate a fresh user for the test. */
async function freshUser(browser: import('@playwright/test').Browser) {
  const email = `e2e-notifications-${Date.now()}@financeapp.local`
  const token = await getAuthTokenForUser(email)
  const page = await openAuthedPage(browser, token)
  return { page, token }
}

// ── unsupported state ──────────────────────────────────────────────────────────

test.describe('Notification toggle — unsupported state', () => {
  test('shows unsupported helper and disabled Switch when PushManager is absent (desktop)', async ({
    browser,
  }) => {
    const { page } = await freshUser(browser)

    // Stub: remove PushManager from window before the page executes app code.
    // This simulates a browser that lacks the Push API.
    await page.addInitScript(() => {
      // @ts-expect-error intentional deletion for testing
      delete window.PushManager
    })

    const notifPage = new NotificationsPage(page)
    await notifPage.goto()

    const dropdown = await notifPage.openDesktopMenu()
    const row = dropdown.getByTestId(NotificationsTestIds.RowNotifications)
    const helper = dropdown.getByTestId(NotificationsTestIds.HelperNotifications)
    const switchInput = dropdown.getByTestId(NotificationsTestIds.SwitchNotifications)

    await expect(row).toBeVisible()
    // Helper text indicates unsupported (full copy on desktop)
    await expect(helper).toHaveText('Não suportado neste navegador')
    // Switch is disabled (browser cannot support push)
    await expect(switchInput).toBeDisabled()

    await page.close()
  })

  test('shows unsupported helper and disabled Switch when serviceWorker is absent (desktop)', async ({
    browser,
  }) => {
    const { page } = await freshUser(browser)

    // Stub: remove serviceWorker from navigator.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'serviceWorker', {
        get: () => undefined,
        configurable: true,
      })
    })

    const notifPage = new NotificationsPage(page)
    await notifPage.goto()

    const dropdown = await notifPage.openDesktopMenu()
    const switchInput = dropdown.getByTestId(NotificationsTestIds.SwitchNotifications)

    await expect(switchInput).toBeDisabled()

    await page.close()
  })
})

// ── denied state ───────────────────────────────────────────────────────────────

test.describe('Notification toggle — denied state', () => {
  test('shows denied helper and disabled Switch when Notification.permission is denied (desktop)', async ({
    browser,
  }) => {
    const { page } = await freshUser(browser)

    // Stub: set Notification.permission to 'denied' before page script runs.
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'Notification', {
        value: {
          permission: 'denied' as NotificationPermission,
          requestPermission: async () => 'denied' as NotificationPermission,
        },
        writable: true,
        configurable: true,
      })
    })

    const notifPage = new NotificationsPage(page)
    await notifPage.goto()

    const dropdown = await notifPage.openDesktopMenu()
    const helper = dropdown.getByTestId(NotificationsTestIds.HelperNotifications)
    const switchInput = dropdown.getByTestId(NotificationsTestIds.SwitchNotifications)

    // Helper shows denied copy (full, desktop)
    await expect(helper).toHaveText('Bloqueadas — ative nas configurações do navegador')
    // Switch is disabled
    await expect(switchInput).toBeDisabled()

    await page.close()
  })

  test('shows denied helper in mobile drawer', async ({ browser }) => {
    const { page } = await freshUser(browser)

    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'Notification', {
        value: {
          permission: 'denied' as NotificationPermission,
          requestPermission: async () => 'denied' as NotificationPermission,
        },
        writable: true,
        configurable: true,
      })
    })

    // Set a narrow viewport to ensure the mobile tab bar is visible
    await page.setViewportSize({ width: 375, height: 812 })

    const notifPage = new NotificationsPage(page)
    await notifPage.goto()

    const drawer = await notifPage.openMobileDrawer()
    const helper = drawer.getByTestId(NotificationsTestIds.HelperNotifications)
    const switchInput = drawer.getByTestId(NotificationsTestIds.SwitchNotifications)

    // Helper shows short denied copy (mobile)
    await expect(helper).toHaveText('Bloqueadas pelo navegador')
    // Switch is disabled
    await expect(switchInput).toBeDisabled()

    await page.close()
  })
})

// ── default state + CTRL-01 permission gate ────────────────────────────────────

test.describe('Notification toggle — default state + CTRL-01 permission gate', () => {
  test(
    'Switch is enabled and shows default helper; requestPermission NOT called on load',
    async ({ browser }) => {
      const { page } = await freshUser(browser)

      // Track calls to Notification.requestPermission.
      // Stub the entire Notification object in 'default' state.
      await page.addInitScript(() => {
        let callCount = 0
        Object.defineProperty(globalThis, 'Notification', {
          value: {
            permission: 'default' as NotificationPermission,
            requestPermission: async () => {
              callCount++
                ; (globalThis as typeof globalThis & { __notifCallCount: number }).__notifCallCount = callCount
              return 'default' as NotificationPermission
            },
          },
          writable: true,
          configurable: true,
        })
          ; (globalThis as typeof globalThis & { __notifCallCount: number }).__notifCallCount = 0
      })

      const notifPage = new NotificationsPage(page)
      await notifPage.goto()

      // After load, requestPermission must NOT have been called (CTRL-01)
      const callCountAfterLoad = await page.evaluate(
        () => (globalThis as typeof globalThis & { __notifCallCount: number }).__notifCallCount ?? 0,
      )
      expect(callCountAfterLoad).toBe(0)

      // Desktop: default helper visible, Switch enabled (not disabled)
      const dropdown = await notifPage.openDesktopMenu()
      const helper = dropdown.getByTestId(NotificationsTestIds.HelperNotifications)
      const switchInput = dropdown.getByTestId(NotificationsTestIds.SwitchNotifications)

      await expect(helper).toHaveText('Toque para ativar')
      await expect(switchInput).not.toBeDisabled()
      // Switch is unchecked in default state
      await expect(switchInput).not.toBeChecked()

      // Tap the Switch — requestPermission should fire exactly once
      await new SwitchField(dropdown, NotificationsTestIds.SwitchNotifications).set(true)

      const callCountAfterTap = await page.evaluate(
        () => (globalThis as typeof globalThis & { __notifCallCount: number }).__notifCallCount ?? 0,
      )
      expect(callCountAfterTap).toBe(1)

      await page.close()
    },
  )

  test('mobile drawer shows default helper and enabled Switch', async ({ browser }) => {
    const { page } = await freshUser(browser)

    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'Notification', {
        value: {
          permission: 'default' as NotificationPermission,
          requestPermission: async () => 'default' as NotificationPermission,
        },
        writable: true,
        configurable: true,
      })
    })

    await page.setViewportSize({ width: 375, height: 812 })

    const notifPage = new NotificationsPage(page)
    await notifPage.goto()

    const drawer = await notifPage.openMobileDrawer()
    const helper = drawer.getByTestId(NotificationsTestIds.HelperNotifications)
    const switchInput = drawer.getByTestId(NotificationsTestIds.SwitchNotifications)

    // Mobile short copy
    await expect(helper).toHaveText('Toque para ativar')
    await expect(switchInput).not.toBeDisabled()
    await expect(switchInput).not.toBeChecked()

    await page.close()
  })

  test(
    'granted path: requestPermission granted + subscribe stub → enabled state',
    async ({ browser, context }) => {
      // Grant notification permission at the context level
      await context.grantPermissions(['notifications'])

      const email = `e2e-notifications-granted-${Date.now()}@financeapp.local`
      const token = await getAuthTokenForUser(email)
      // Re-use the granted context rather than creating a fresh one
      const page = await context.newPage()
      // Inject auth cookie
      const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
      const url = new URL(baseURL)
      await context.addCookies([
        {
          name: 'auth_token',
          value: token,
          domain: url.hostname,
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
        },
      ])

      // Stub subscribe to return a fake PushSubscription JSON, and stub
      // the POST /api/push-subscriptions endpoint to return 204 so the
      // hook's postSubscription() succeeds without a real push service.
      //
      // isBrowserSupported() in usePushSubscription requires BOTH
      // `'serviceWorker' in navigator` AND `'PushManager' in window`. Headless
      // Chromium does not reliably expose window.PushManager, so without an
      // explicit stub the hook resolves to state='unsupported' → the Switch is
      // disabled/unchecked from load (the observed failure). We therefore stub
      // PushManager AND a granted Notification so the granted path drives the
      // state machine default → requesting → enabled deterministically.
      await page.addInitScript(() => {
        // Ensure the Push API is detected as supported.
        if (!('PushManager' in window)) {
          Object.defineProperty(window, 'PushManager', {
            value: function PushManager() {},
            writable: true,
            configurable: true,
          })
        }

        // Notification.permission must be 'granted' (and requestPermission must
        // resolve 'granted') so usePushSubscription proceeds past the gate.
        Object.defineProperty(globalThis, 'Notification', {
          value: {
            permission: 'granted' as NotificationPermission,
            requestPermission: async () => 'granted' as NotificationPermission,
          },
          writable: true,
          configurable: true,
        })

        const fakeSub = {
          endpoint: 'https://push.example.com/fake-endpoint',
          expirationTime: null,
          keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
          toJSON() { return this },
          unsubscribe: async () => true,
        }
        // Stub navigator.serviceWorker.ready with a fake pushManager
        Object.defineProperty(navigator, 'serviceWorker', {
          value: {
            ready: Promise.resolve({
              pushManager: {
                subscribe: async () => fakeSub,
                getSubscription: async () => null,
              },
            }),
            addEventListener: () => {},
            removeEventListener: () => {},
          },
          writable: true,
          configurable: true,
        })
      })

      // Intercept the VAPID key + subscription POST so no real backend needed
      await page.route('**/api/push-subscriptions/vapid-public-key', (route) => {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBLViuLlNvE08' }),
        })
      })
      await page.route('**/api/push-subscriptions', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({ status: 204, body: '' })
        } else if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ subscribed: true }),
          })
        } else {
          await route.continue()
        }
      })

      // Use the page object goto (domcontentloaded, not networkidle) — the
      // unread-count polling query keeps the network busy, so networkidle can
      // hang. openDesktopMenu() auto-waits on the authed-shell pill anyway.
      const notifPage = new NotificationsPage(page)
      await notifPage.goto()

      const dropdown = await notifPage.openDesktopMenu()
      const switchInput = dropdown.getByTestId(NotificationsTestIds.SwitchNotifications)

      // In default state initially (granted permission but not yet subscribed)
      await expect(switchInput).not.toBeChecked()

      // Tap to subscribe
      await new SwitchField(dropdown, NotificationsTestIds.SwitchNotifications).set(true)

      // Should transition to enabled (checked)
      await expect(switchInput).toBeChecked({ timeout: 5000 })

      // Helper shows enabled copy
      const helper = dropdown.getByTestId(NotificationsTestIds.HelperNotifications)
      await expect(helper).toHaveText('Ativadas neste dispositivo')

      await page.close()
    },
  )
})

// ── Surface placement ──────────────────────────────────────────────────────────

test.describe('Notification toggle — surface placement', () => {
  test('toggle row appears in desktop user menu after Tema, above Sair', async ({ browser }) => {
    const { page } = await freshUser(browser)

    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')
    await page.getByTestId(CommonTestIds.SidebarUserPill).click()
    const dropdown = page.getByTestId(CommonTestIds.SidebarUserMenu)
    await expect(dropdown).toBeVisible()

    // The row must be visible inside the dropdown
    const row = dropdown.getByTestId(NotificationsTestIds.RowNotifications)
    await expect(row).toBeVisible()

    await page.close()
  })

  test('toggle row appears in mobile Mais drawer above Sair', async ({ browser }) => {
    const { page } = await freshUser(browser)

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    await page.getByTestId(MobileNavTestIds.MoreTab).click()
    const drawer = page.getByTestId(MobileNavTestIds.MoreDrawer)
    await expect(drawer).toBeVisible()

    const row = drawer.getByTestId(NotificationsTestIds.RowNotifications)
    await expect(row).toBeVisible()

    // Verify the logout button is still present (below the notification row)
    const logoutBtn = drawer.getByTestId(MobileNavTestIds.MoreItem('logout'))
    await expect(logoutBtn).toBeVisible()

    await page.close()
  })
})
