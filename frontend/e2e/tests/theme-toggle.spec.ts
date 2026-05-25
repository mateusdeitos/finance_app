import { test, expect } from '@playwright/test'
import { CommonTestIds } from '@/testIds'

test.describe('Theme toggle', () => {
  test('cycles color scheme and persists across reload', async ({ page }) => {
    await page.goto('/accounts')

    // On desktop the toggle lives inside the sidebar user pill's menu
    // dropdown; open it first so the toggle becomes visible.
    await page.getByTestId(CommonTestIds.SidebarUserPill).click()

    const toggle = page.getByTestId(CommonTestIds.ThemeToggle)
    const html = page.locator('html')

    await expect(toggle).toBeVisible()

    // Toggle cycles light -> dark -> auto. Click until we land on dark.
    while ((await toggle.getAttribute('data-color-scheme')) !== 'dark') {
      await toggle.click()
    }
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark')

    // Preference persists across a full reload (localStorage).
    await page.reload()
    await page.getByTestId(CommonTestIds.SidebarUserPill).click()
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark')
    await expect(toggle).toHaveAttribute('data-color-scheme', 'dark')

    // Continue cycling until light.
    while ((await toggle.getAttribute('data-color-scheme')) !== 'light') {
      await toggle.click()
    }
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light')
  })
})
