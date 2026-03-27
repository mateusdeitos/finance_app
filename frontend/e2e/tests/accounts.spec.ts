import { test, expect } from '@playwright/test'
import { AccountsPage } from '../pages/AccountsPage'
import { apiCreateAccount, apiDeleteAccount } from '../helpers/api'

test.describe('Accounts', () => {
  let accountsPage: AccountsPage
  // IDs of accounts created via API for cleanup
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

  // ── 4.2 ──────────────────────────────────────────────────────────────────
  test('create a new account via UI', async () => {
    const name = `Conta Teste ${Date.now()}`

    await accountsPage.openCreateForm()
    await accountsPage.fillForm(name, 0)
    await accountsPage.submitForm()

    await expect(accountsPage.page.getByText(name)).toBeVisible()
  })

  // ── 4.3 ──────────────────────────────────────────────────────────────────
  test('edit an existing account name', async () => {
    const original = `Conta Editar ${Date.now()}`
    const updated = `Conta Editada ${Date.now()}`
    const account = await apiCreateAccount({ name: original, initial_balance: 0 })
    createdIds.push(account.id)

    await accountsPage.goto()
    const card = accountsPage.page.locator('[class*="mantine-Card"]').filter({ hasText: original })
    await card.getByRole('button').first().click()

    const drawer = accountsPage.page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await drawer.getByLabel('Nome').fill(updated)
    await drawer.getByRole('button', { name: 'Salvar' }).click()
    await expect(drawer).not.toBeVisible({ timeout: 5000 })

    await expect(accountsPage.page.getByText(updated)).toBeVisible()
  })

  // ── 4.4 ──────────────────────────────────────────────────────────────────
  test('deactivate an account', async () => {
    const name = `Conta Desativar ${Date.now()}`
    const account = await apiCreateAccount({ name, initial_balance: 0 })
    createdIds.push(account.id)

    await accountsPage.goto()
    const card = accountsPage.page.locator('[class*="mantine-Card"]').filter({ hasText: name })
    // Last button is the deactivate/delete action
    await card.getByRole('button').last().click()
    await accountsPage.page.waitForLoadState('networkidle')

    // After deactivation the account appears in the "Inativas" section
    const inactiveSection = accountsPage.page.locator('text=Inativas').locator('..').locator('..')
    await expect(inactiveSection.getByText(name)).toBeVisible()
  })

  // ── 4.5 ──────────────────────────────────────────────────────────────────
  test('delete (deactivate) an account and verify it moves to inactive', async () => {
    const name = `Conta Deletar ${Date.now()}`
    const account = await apiCreateAccount({ name, initial_balance: 0 })
    createdIds.push(account.id)

    await accountsPage.goto()
    const card = accountsPage.page.locator('[class*="mantine-Card"]').filter({ hasText: name })
    await card.getByRole('button').last().click()
    await accountsPage.page.waitForLoadState('networkidle')

    // Account should no longer appear in active section
    const activeSection = accountsPage.page.locator('text=Minhas contas').locator('..')
    await expect(activeSection.getByText(name)).not.toBeVisible()
  })
})
