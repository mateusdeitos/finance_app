import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import { apiCreateAccount, apiDeleteAccount, apiCreateTransaction, apiDeleteTransaction } from '../helpers/api'

test.describe('Transfer Transactions', () => {
  let transactionsPage: TransactionsPage
  let sourceAccountId: number
  let sourceAccountName: string
  let destAccountId: number
  let destAccountName: string
  const createdTransactionIds: number[] = []

  test.beforeAll(async () => {
    sourceAccountName = `Origem Transfer ${Date.now()}`
    const source = await apiCreateAccount({ name: sourceAccountName, initial_balance: 0 })
    sourceAccountId = source.id

    destAccountName = `Destino Transfer ${Date.now()}`
    const dest = await apiCreateAccount({ name: destAccountName, initial_balance: 0 })
    destAccountId = dest.id
  })

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined)
    }
    await apiDeleteAccount(sourceAccountId).catch(() => undefined)
    await apiDeleteAccount(destAccountId).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    transactionsPage = new TransactionsPage(page)
    await transactionsPage.goto()
  })

  test('create a transfer transaction', async ({ page }) => {
    const description = `Transferência Teste ${Date.now()}`

    await transactionsPage.openCreateForm()
    await transactionsPage.fillTransfer(20000, description, sourceAccountName, destAccountName)
    await transactionsPage.submitForm()

    // A transfer creates two rows (debit + credit) with the same description
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 8000 })
  })

  test('transfer form shows source and destination account selects', async ({ page }) => {
    await transactionsPage.openCreateForm()
    await transactionsPage.selectType('transfer')

    await expect(page.getByTestId('select_account')).toBeVisible()
    await expect(page.getByTestId('select_destination_account')).toBeVisible()
    // Category selector must NOT appear for transfers
    await expect(page.getByTestId('select_category')).not.toBeVisible()
  })

  test('update transfer description', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const originalDesc = `Transfer Update Orig ${Date.now()}`
    const updatedDesc = `Transfer Update New ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'transfer',
      account_id: sourceAccountId,
      destination_account_id: destAccountId,
      amount: 5000,
      date: today,
      description: originalDesc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    // Transfer creates two rows with the same description
    await expect(page.getByText(originalDesc).first()).toBeVisible()

    // Click the description text within the specific row to reliably open the edit drawer.
    // Clicking the row center is not reliable for transfers since the layout differs.
    await page.locator(`[data-transaction-id="${tx.id}"]`).getByText(originalDesc).click()
    await transactionsPage.waitForUpdateDrawer()
    await transactionsPage.clearAndFillDescription(updatedDesc)
    await transactionsPage.submitUpdate()

    await expect(page.getByText(updatedDesc).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(originalDesc).first()).not.toBeVisible()
  })
})
