import { test, expect } from '@playwright/test'
import { AccountsPage } from '../pages/AccountsPage'
import { apiCreateAccount, apiDeleteAccount } from '../helpers/api'

test.describe('Accounts', () => {
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

  test('create a new account via UI', async () => {
    const name = `Conta Teste ${Date.now()}`

    await accountsPage.openCreateForm()
    await accountsPage.fillForm(name, 0)
    await accountsPage.submitForm()

    await expect(accountsPage.page.getByText(name)).toBeVisible()
  })

  test('edit an existing account name', async () => {
    const original = `Conta Editar ${Date.now()}`
    const updated = `Conta Editada ${Date.now()}`
    const account = await apiCreateAccount({ name: original, initial_balance: 0 })
    createdIds.push(account.id)

    await accountsPage.goto()
    await accountsPage.editAccount(original)
    await accountsPage.fillForm(updated)
    await accountsPage.submitForm()

    await expect(accountsPage.page.getByText(updated)).toBeVisible()
  })

  test('deactivate an account', async () => {
    const name = `Conta Desativar ${Date.now()}`
    const account = await apiCreateAccount({ name, initial_balance: 0 })
    createdIds.push(account.id)

    await accountsPage.goto()
    await accountsPage.deactivateAccount(name)
    await accountsPage.page.waitForLoadState('networkidle')

    await expect(accountsPage.page.getByTestId('section_inactive').getByText(name)).toBeVisible()
  })

  test('delete (deactivate) an account and verify it moves to inactive', async () => {
    const name = `Conta Deletar ${Date.now()}`
    const account = await apiCreateAccount({ name, initial_balance: 0 })
    createdIds.push(account.id)

    await accountsPage.goto()
    await accountsPage.deleteAccount(name)
    await accountsPage.page.waitForLoadState('networkidle')

    await expect(accountsPage.page.getByTestId('section_active').getByText(name)).not.toBeVisible()
  })
})
