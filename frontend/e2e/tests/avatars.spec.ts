import { test, expect } from '@playwright/test'
import { AccountsPage } from '../pages/AccountsPage'
import { TransactionsPage } from '../pages/TransactionsPage'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateTransaction,
  apiDeleteTransaction,
  apiCreateCategory,
  apiDeleteCategory,
} from '../helpers/api'

test.describe('Avatar System', () => {
  const createdAccountIds: number[] = []
  const createdTransactionIds: number[] = []
  let categoryId: number

  test.beforeAll(async () => {
    const cat = await apiCreateCategory({ name: `Avatar Cat ${Date.now()}` })
    categoryId = cat.id
  })

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined)
    }
    for (const id of createdAccountIds) {
      await apiDeleteAccount(id).catch(() => undefined)
    }
    await apiDeleteCategory(categoryId).catch(() => undefined)
  })

  // ── AVA-02: Header avatar ────────────────────────────────────────────────
  test('header shows UserAvatar component (initials fallback for test user)', async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // The header should contain a Mantine Avatar (rendered as .mantine-Avatar-root)
    // Test user has no OAuth photo, so it should show initials
    const headerAvatar = page.locator('header .mantine-Avatar-root').first()
    await expect(headerAvatar).toBeVisible()

    // Avatar should contain initials text (placeholder text inside the avatar)
    const placeholder = headerAvatar.locator('.mantine-Avatar-placeholder')
    await expect(placeholder).toBeVisible()
    const text = await placeholder.textContent()
    // Should have at least 1 character (initials)
    expect(text?.trim().length).toBeGreaterThan(0)
  })

  // ── AVA-05: Non-transfer transaction row shows avatar with tooltip ───────
  test('transaction row shows account avatar with tooltip', async ({ page }) => {
    const accountName = `Avatar Acc ${Date.now()}`
    const account = await apiCreateAccount({ name: accountName, initial_balance: 0 })
    createdAccountIds.push(account.id)

    const today = new Date().toISOString().slice(0, 10)
    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: account.id,
      category_id: categoryId,
      amount: 1000,
      date: today,
      description: `Avatar Test Tx ${Date.now()}`,
    })
    createdTransactionIds.push(tx.id)

    const txPage = new TransactionsPage(page)
    await txPage.goto()

    // Find the transaction row
    const row = page.locator(`[data-transaction-id="${tx.id}"]`)
    await expect(row).toBeVisible()

    // Row should contain an Avatar (AccountAvatar renders a Mantine Avatar)
    const avatar = row.locator('.mantine-Avatar-root').first()
    await expect(avatar).toBeVisible()

    // Hover to trigger tooltip with account name
    await avatar.locator('..').hover() // hover the span wrapper
    await expect(page.getByRole('tooltip', { name: accountName })).toBeVisible({ timeout: 3000 })
  })

  // ── AVA-04: Transfer rows show avatar pair with arrow ────────────────────
  test('transfer row shows source and destination avatars with arrow', async ({ page }) => {
    const sourceName = `Src Avatar ${Date.now()}`
    const destName = `Dst Avatar ${Date.now()}`
    const source = await apiCreateAccount({ name: sourceName, initial_balance: 0 })
    const dest = await apiCreateAccount({ name: destName, initial_balance: 0 })
    createdAccountIds.push(source.id, dest.id)

    const today = new Date().toISOString().slice(0, 10)
    const tx = await apiCreateTransaction({
      transaction_type: 'transfer',
      account_id: source.id,
      destination_account_id: dest.id,
      amount: 5000,
      date: today,
      description: `Transfer Avatar ${Date.now()}`,
    })
    createdTransactionIds.push(tx.id)

    const txPage = new TransactionsPage(page)
    await txPage.goto()

    // Find the debit side of the transfer (the one we created)
    const row = page.locator(`[data-transaction-id="${tx.id}"]`)
    await expect(row).toBeVisible()

    // Transfer row should have 2 avatars (source + dest)
    const avatars = row.locator('.mantine-Avatar-root')
    await expect(avatars).toHaveCount(2)

    // Should have an arrow icon between them (IconArrowRight renders as svg)
    const arrow = row.locator('svg.tabler-icon-arrow-right')
    await expect(arrow).toBeVisible()
  })

  // ── AVA-07: Account card shows avatar ────────────────────────────────────
  test('account card shows AccountAvatar with initials', async ({ page }) => {
    const accountName = `Card Avatar ${Date.now()}`
    const account = await apiCreateAccount({
      name: accountName,
      initial_balance: 0,
      avatar_background_color: '#e63946',
    })
    createdAccountIds.push(account.id)

    const accountsPage = new AccountsPage(page)
    await accountsPage.goto()

    const card = page.locator(`[data-account-name="${accountName}"]`)
    await expect(card).toBeVisible()

    // Card should have an Avatar
    const avatar = card.locator('.mantine-Avatar-root').first()
    await expect(avatar).toBeVisible()

    // Avatar should show initials
    const placeholder = avatar.locator('.mantine-Avatar-placeholder')
    await expect(placeholder).toBeVisible()
    const initials = await placeholder.textContent()
    // "Card Avatar" -> "CA"
    expect(initials).toBe('CA')
  })

  // ── AVA-06: Color picker in account form ─────────────────────────────────
  test('account form shows color picker with 12 swatches', async ({ page }) => {
    const accountsPage = new AccountsPage(page)
    await accountsPage.goto()
    await accountsPage.openCreateForm()

    // Color picker label
    await expect(page.getByText('Cor do avatar')).toBeVisible()

    // 12 color swatches
    const swatches = page.locator('[aria-label^="Selecionar cor"]')
    await expect(swatches).toHaveCount(12)
  })

  // ── AVA-06: Color picker selection persists through save ─────────────────
  test('selected avatar color persists after save and reopen', async ({ page }) => {
    const accountName = `Color Persist ${Date.now()}`
    const targetColor = '#e63946' // red — first swatch

    const accountsPage = new AccountsPage(page)
    await accountsPage.goto()

    // Create account with non-default color
    await accountsPage.openCreateForm()
    await accountsPage.fillForm(accountName, 0)

    // Click the red swatch
    await page.locator(`[aria-label="Selecionar cor ${targetColor}"]`).click()

    // Verify the red swatch has the selection ring (box-shadow)
    const redSwatch = page.locator(`[aria-label="Selecionar cor ${targetColor}"]`)
    await expect(redSwatch).toHaveCSS('box-shadow', /2px/)

    await accountsPage.submitForm()
    await expect(page.getByText(accountName)).toBeVisible()

    // Find account ID for cleanup
    const card = page.locator(`[data-account-name="${accountName}"]`)
    await expect(card).toBeVisible()

    // The avatar on the card should have the red background color
    const avatar = card.locator('.mantine-Avatar-root').first()
    const bgColor = await avatar.locator('.mantine-Avatar-placeholder').evaluate(
      (el) => getComputedStyle(el).backgroundColor
    )
    // #e63946 = rgb(230, 57, 70)
    expect(bgColor).toBe('rgb(230, 57, 70)')

    // Edit the account and verify color is pre-selected
    await accountsPage.editAccount(accountName)

    // The red swatch should still have the selection ring
    const editRedSwatch = page.locator(`[aria-label="Selecionar cor ${targetColor}"]`)
    await expect(editRedSwatch).toHaveCSS('box-shadow', /2px/)

    // Close the form
    await page.keyboard.press('Escape')
  })

  // ── AVA-06: Default color is steel blue ──────────────────────────────────
  test('new account defaults to steel blue avatar color', async ({ page }) => {
    const accountName = `Default Color ${Date.now()}`
    const defaultColor = '#457b9d'

    const accountsPage = new AccountsPage(page)
    await accountsPage.goto()
    await accountsPage.openCreateForm()

    // Default swatch should be selected
    const defaultSwatch = page.locator(`[aria-label="Selecionar cor ${defaultColor}"]`)
    await expect(defaultSwatch).toHaveCSS('box-shadow', /2px/)

    // Save with default
    await accountsPage.fillForm(accountName, 0)
    await accountsPage.submitForm()

    // Verify avatar has default color
    const card = page.locator(`[data-account-name="${accountName}"]`)
    await expect(card).toBeVisible()
    const avatar = card.locator('.mantine-Avatar-root .mantine-Avatar-placeholder').first()
    const bgColor = await avatar.evaluate((el) => getComputedStyle(el).backgroundColor)
    // #457b9d = rgb(69, 123, 157)
    expect(bgColor).toBe('rgb(69, 123, 157)')
  })
})
