import { test, expect } from '@playwright/test'
import { AccountsPage } from '../pages/AccountsPage'
import { apiCreateAccount, apiDeleteAccount } from '../helpers/api'

test.describe('Accounts Advanced', () => {
  let accountsPage: AccountsPage
  const createdIds: number[] = []

  test.beforeEach(async ({ page }) => {
    accountsPage = new AccountsPage(page)
    await accountsPage.goto()
  })

  test.afterAll(async () => {
    for (const id of createdIds) {
      await apiDeleteAccount(id).catch(() => undefined)
    }
  })

  // ── Reactivate ────────────────────────────────────────────────────────────
  test('reactivate an inactive account moves it back to active section', async ({ page }) => {
    const name = `Conta Reativar ${Date.now()}`
    const account = await apiCreateAccount({ name, initial_balance: 0 })
    createdIds.push(account.id)

    // Deactivate via UI first
    await accountsPage.goto()
    await accountsPage.deactivateAccount(name)
    await page.waitForLoadState('networkidle')

    // Confirm account is in inactive section
    await expect(page.getByTestId('section_inactive').getByText(name)).toBeVisible()

    // Reactivate
    await accountsPage.reactivateAccount(name)
    await page.waitForLoadState('networkidle')

    // Account should now be in active section
    await expect(page.getByTestId('section_active').getByText(name)).toBeVisible({ timeout: 8000 })
    await expect(page.getByTestId('section_inactive').getByText(name)).not.toBeVisible()
  })

  // ── Create with initial balance ───────────────────────────────────────────
  test('create account with non-zero initial balance', async ({ page }) => {
    const name = `Conta Saldo ${Date.now()}`

    await accountsPage.openCreateForm()
    await accountsPage.fillForm(name, 100000) // R$ 1.000,00
    await accountsPage.submitForm()

    // Account appears in the list
    await expect(page.getByText(name)).toBeVisible()
    // Initial balance shows R$ 1.000,00
    const card = page.locator(`[data-account-name="${name}"]`)
    await expect(card.getByText(/1\.000,00/)).toBeVisible()
  })

  // ── Edit preserves other fields ───────────────────────────────────────────
  test('editing account name does not affect other accounts', async ({ page }) => {
    const nameA = `Conta Preservar A ${Date.now()}`
    const nameB = `Conta Preservar B ${Date.now()}`
    const renamedA = `Conta Renomeada A ${Date.now()}`

    const accountA = await apiCreateAccount({ name: nameA, initial_balance: 0 })
    const accountB = await apiCreateAccount({ name: nameB, initial_balance: 0 })
    createdIds.push(accountA.id, accountB.id)

    await accountsPage.goto()
    await expect(page.getByText(nameA)).toBeVisible()
    await expect(page.getByText(nameB)).toBeVisible()

    // Edit accountA
    await accountsPage.editAccount(nameA)
    await accountsPage.fillForm(renamedA)
    await accountsPage.submitForm()

    // AccountA renamed, accountB unchanged
    await expect(page.getByText(renamedA)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(nameA)).not.toBeVisible()
    await expect(page.getByText(nameB)).toBeVisible()
  })

  // ── Multiple deactivations ────────────────────────────────────────────────
  test('multiple accounts can be deactivated independently', async ({ page }) => {
    const nameA = `Conta Desativar A ${Date.now()}`
    const nameB = `Conta Desativar B ${Date.now()}`

    const accountA = await apiCreateAccount({ name: nameA, initial_balance: 0 })
    const accountB = await apiCreateAccount({ name: nameB, initial_balance: 0 })
    createdIds.push(accountA.id, accountB.id)

    await accountsPage.goto()

    // Deactivate A
    await accountsPage.deactivateAccount(nameA)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('section_inactive').getByText(nameA)).toBeVisible()
    // B still active
    await expect(page.getByTestId('section_active').getByText(nameB)).toBeVisible()

    // Deactivate B
    await accountsPage.deactivateAccount(nameB)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('section_inactive').getByText(nameB)).toBeVisible({ timeout: 8000 })
  })
})
