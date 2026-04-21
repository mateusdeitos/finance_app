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

    // Test user has no OAuth photo, so UserAvatar shows initials via Mantine's
    // placeholder element. The placeholder is the child of the Avatar root
    // (which has data-testid="avatar_user"); we drill with native descendant
    // class narrowing as a last resort since Mantine does not expose the
    // placeholder separately.
    const headerAvatar = page.locator('header').getByTestId('avatar_user').first()
    await expect(headerAvatar).toBeVisible()

    const placeholder = headerAvatar.locator('.mantine-Avatar-placeholder')
    await expect(placeholder).toBeVisible()
    const text = await placeholder.textContent()
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

    const row = page.locator(`[data-transaction-id="${tx.id}"]`)
    await expect(row).toBeVisible()

    const avatar = row.getByTestId('avatar_account').first()
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

    const row = page.locator(`[data-transaction-id="${tx.id}"]`)
    await expect(row).toBeVisible()

    // Transfer rows wrap both avatars in a group with its own testid.
    const group = row.getByTestId('transfer_avatar_group')
    await expect(group).toBeVisible()
    await expect(group.getByTestId('avatar_account')).toHaveCount(2)
    await expect(group.getByTestId('icon_transfer_arrow')).toBeVisible()
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

    const avatar = card.getByTestId('avatar_account').first()
    await expect(avatar).toBeVisible()

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

    const picker = page.getByTestId('color_swatch_picker')
    await expect(picker).toBeVisible()

    const swatches = picker.locator('[data-testid^="swatch_color_"]')
    await expect(swatches).toHaveCount(12)
  })

  // ── AVA-06: Color picker selection persists through save ─────────────────
  test('selected avatar color persists after save and reopen', async ({ page }) => {
    const accountName = `Color Persist ${Date.now()}`
    const targetSwatch = 'swatch_color_e63946' // red — first swatch

    const accountsPage = new AccountsPage(page)
    await accountsPage.goto()

    // Create account with non-default color
    await accountsPage.openCreateForm()
    await accountsPage.fillForm(accountName, 0)

    await page.getByTestId(targetSwatch).click()

    // Selection state is exposed via data-selected="true"
    await expect(page.getByTestId(targetSwatch)).toHaveAttribute('data-selected', 'true')

    await accountsPage.submitForm()
    await expect(page.getByText(accountName)).toBeVisible()

    const card = page.locator(`[data-account-name="${accountName}"]`)
    await expect(card).toBeVisible()

    // The avatar on the card should have the red background color
    const avatar = card.getByTestId('avatar_account').first()
    const bgColor = await avatar
      .locator('.mantine-Avatar-placeholder')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    // #e63946 = rgb(230, 57, 70)
    expect(bgColor).toBe('rgb(230, 57, 70)')

    // Edit the account and verify color is pre-selected
    await accountsPage.editAccount(accountName)
    await expect(page.getByTestId(targetSwatch)).toHaveAttribute('data-selected', 'true')

    await page.keyboard.press('Escape')
  })

  // ── AVA-06: Default color is steel blue ──────────────────────────────────
  test('new account defaults to steel blue avatar color', async ({ page }) => {
    const accountName = `Default Color ${Date.now()}`
    const defaultSwatch = 'swatch_color_457b9d'

    const accountsPage = new AccountsPage(page)
    await accountsPage.goto()
    await accountsPage.openCreateForm()

    await expect(page.getByTestId(defaultSwatch)).toHaveAttribute('data-selected', 'true')

    await accountsPage.fillForm(accountName, 0)
    await accountsPage.submitForm()

    const card = page.locator(`[data-account-name="${accountName}"]`)
    await expect(card).toBeVisible()
    const avatar = card.getByTestId('avatar_account').first()
    const bgColor = await avatar
      .locator('.mantine-Avatar-placeholder')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    // #457b9d = rgb(69, 123, 157)
    expect(bgColor).toBe('rgb(69, 123, 157)')
  })
})
