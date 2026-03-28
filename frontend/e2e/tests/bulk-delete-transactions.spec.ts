import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategory,
  apiDeleteCategory,
  apiCreateTransaction,
  apiDeleteTransaction,
} from '../helpers/api'

test.describe('Bulk Delete Transactions', () => {
  let transactionsPage: TransactionsPage
  let testAccountId: number
  let testCategoryId: number
  let testCategoryName: string
  const createdTransactionIds: number[] = []

  test.beforeAll(async () => {
    const account = await apiCreateAccount({ name: `Conta Bulk Delete ${Date.now()}`, initial_balance: 0 })
    testAccountId = account.id

    testCategoryName = `Cat Bulk ${Date.now()}`
    const category = await apiCreateCategory({ name: testCategoryName })
    testCategoryId = category.id
  })

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined)
    }
    await apiDeleteAccount(testAccountId).catch(() => undefined)
    await apiDeleteCategory(testCategoryId).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    transactionsPage = new TransactionsPage(page)
    await transactionsPage.goto()
  })

  // ── 6.3 ──────────────────────────────────────────────────────────────────
  test('bulk delete two non-recurring transactions', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const desc1 = `Bulk Del A ${Date.now()}`
    const desc2 = `Bulk Del B ${Date.now()}`

    const tx1 = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 100,
      date: today,
      description: desc1,
    })
    const tx2 = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 200,
      date: today,
      description: desc2,
    })
    createdTransactionIds.push(tx1.id, tx2.id)

    // Reload so the new transactions appear
    await transactionsPage.goto()
    await expect(transactionsPage.page.getByText(desc1)).toBeVisible()
    await expect(transactionsPage.page.getByText(desc2)).toBeVisible()

    // Select both
    await transactionsPage.selectTransaction(tx1.id)
    await transactionsPage.selectTransaction(tx2.id)
    expect(await transactionsPage.getSelectedCount()).toBe(2)

    // Delete and verify success
    await transactionsPage.confirmBulkDelete()

    await expect(transactionsPage.page.getByText(desc1)).not.toBeVisible({ timeout: 10000 })
    await expect(transactionsPage.page.getByText(desc2)).not.toBeVisible({ timeout: 10000 })
  })

  // ── 6.4 ──────────────────────────────────────────────────────────────────
  test('bulk delete a recurring transaction with propagation setting', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const desc = `Bulk Recur ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 500,
      date: today,
      description: desc,
      recurrence_settings: { type: 'monthly', repetitions: 3 },
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(transactionsPage.page.getByText(desc).first()).toBeVisible()

    // Select the transaction
    await transactionsPage.selectTransaction(tx.id)
    expect(await transactionsPage.getSelectedCount()).toBeGreaterThanOrEqual(1)

    // Tap delete — propagation drawer should appear
    await transactionsPage.page.getByTestId('btn_bulk_delete').click()
    await expect(transactionsPage.page.getByTestId('propagation_drawer_body')).toBeVisible()

    // Choose "Somente esta" and confirm
    await transactionsPage.selectPropagation('Somente esta')

    await transactionsPage.closeBulkDeleteDrawer()
    await transactionsPage.goto()
  })
})
