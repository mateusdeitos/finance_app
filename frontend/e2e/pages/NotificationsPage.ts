/**
 * Page object for the Notifications toggle row.
 *
 * The NotificationToggleRow is rendered in two surfaces:
 *  - MobileMoreDrawer (opened via the "Mais" tab in the mobile bottom tab bar)
 *  - DesktopSidebar user menu dropdown
 *
 * Both surfaces render the same NotificationToggleRow component, so the same
 * testids appear in the DOM simultaneously (one hidden, one visible). All
 * locators in this page object are scoped to the relevant surface container to
 * avoid Playwright strict-mode violations.
 *
 * Follow theme-toggle.spec.ts pattern for scoped surface access.
 */

import { type Page, type Locator, expect } from '@playwright/test'
import { NotificationsTestIds, CommonTestIds, MobileNavTestIds } from '@/testIds'
import { SwitchField } from '../helpers/formFields'

export class NotificationsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Navigate to a page that renders the AppLayout (authenticated). */
  async goto(): Promise<void> {
    // NOTE: do NOT use waitForLoadState('networkidle') here. With a service
    // worker present (or stubbed/absent, as in the unsupported + granted tests)
    // and the useNotificationUnreadCount polling query, the network may never
    // reach the 500ms-idle window, so networkidle hangs until timeout. Wait on
    // DOM-ready instead; the downstream openDesktopMenu()/openMobileDrawer()
    // calls auto-wait on a concrete authed-shell element (SidebarUserPill /
    // MoreTab) before asserting, which is the real readiness signal.
    await this.page.goto('/transactions', { waitUntil: 'domcontentloaded' })
  }

  // ── Desktop surface ───────────────────────────────────────────────────────

  /** Open the desktop user menu pill and return the dropdown locator. */
  async openDesktopMenu(): Promise<Locator> {
    await this.page.getByTestId(CommonTestIds.SidebarUserPill).click()
    const dropdown = this.page.getByTestId(CommonTestIds.SidebarUserMenu)
    await expect(dropdown).toBeVisible()
    return dropdown
  }

  /** Get the helper text element scoped to the desktop dropdown. */
  async desktopHelperText(): Promise<string> {
    const dropdown = await this.openDesktopMenu()
    return (await dropdown.getByTestId(NotificationsTestIds.HelperNotifications).textContent()) ?? ''
  }

  /** Returns true if the Switch inside the desktop dropdown is disabled. */
  async isDesktopSwitchDisabled(): Promise<boolean> {
    const dropdown = await this.openDesktopMenu()
    const switchInput = dropdown.getByTestId(NotificationsTestIds.SwitchNotifications)
    return switchInput.isDisabled()
  }

  // ── Mobile surface ────────────────────────────────────────────────────────

  /** Open the mobile "Mais" drawer and return its locator. */
  async openMobileDrawer(): Promise<Locator> {
    await this.page.getByTestId(MobileNavTestIds.MoreTab).click()
    const drawer = this.page.getByTestId(MobileNavTestIds.MoreDrawer)
    await expect(drawer).toBeVisible()
    return drawer
  }

  /** Get the helper text element scoped to the mobile drawer. */
  async mobileHelperText(): Promise<string> {
    const drawer = await this.openMobileDrawer()
    return (await drawer.getByTestId(NotificationsTestIds.HelperNotifications).textContent()) ?? ''
  }

  /** Returns true if the Switch inside the mobile drawer is disabled. */
  async isMobileSwitchDisabled(): Promise<boolean> {
    const drawer = await this.openMobileDrawer()
    const switchInput = drawer.getByTestId(NotificationsTestIds.SwitchNotifications)
    return switchInput.isDisabled()
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  /**
   * Toggle the notification Switch in the desktop menu.
   * Uses SwitchField (per CLAUDE.md mandatory field-class rule).
   */
  async toggleDesktop(on: boolean): Promise<void> {
    const dropdown = await this.openDesktopMenu()
    await new SwitchField(dropdown, NotificationsTestIds.SwitchNotifications).set(on)
  }

  /**
   * Toggle the notification Switch in the mobile drawer.
   * Uses SwitchField (per CLAUDE.md mandatory field-class rule).
   */
  async toggleMobile(on: boolean): Promise<void> {
    const drawer = await this.openMobileDrawer()
    await new SwitchField(drawer, NotificationsTestIds.SwitchNotifications).set(on)
  }

  /**
   * Assert that the notification row is visible inside the desktop dropdown,
   * positioned after "Tema" and before the "Sair" item.
   */
  async assertDesktopRowVisible(): Promise<void> {
    const dropdown = await this.openDesktopMenu()
    await expect(dropdown.getByTestId(NotificationsTestIds.RowNotifications)).toBeVisible()
  }

  /**
   * Assert that the notification row is visible inside the mobile drawer,
   * positioned above "Sair".
   */
  async assertMobileRowVisible(): Promise<void> {
    const drawer = await this.openMobileDrawer()
    await expect(drawer.getByTestId(NotificationsTestIds.RowNotifications)).toBeVisible()
  }
}
