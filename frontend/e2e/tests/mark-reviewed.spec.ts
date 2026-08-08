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
import { TransactionsTestIds } from '@/testIds'

test.describe('Mark transactions as reviewed', () => {
  let transactionsPage: TransactionsPage
  let testAccountId: number
  let testCategoryId: number
  const createdTransactionIds: number[] = []

  test.beforeAll(async () => {
    const account = await apiCreateAccount({ name: `Conta Reviewed ${Date.now()}`, initial_balance: 0 })
    testAccountId = account.id
    const category = await apiCreateCategory({ name: `Cat Reviewed ${Date.now()}` })
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

  test('bulk mark as reviewed then filter by review status', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const desc1 = `Reviewed A ${Date.now()}`
    const desc2 = `Reviewed B ${Date.now()}`

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

    await transactionsPage.goto()
    await expect(transactionsPage.page.getByText(desc1)).toBeVisible()
    await expect(transactionsPage.page.getByText(desc2)).toBeVisible()

    // Select both and mark them as reviewed.
    await transactionsPage.selectTransaction(tx1.id)
    await transactionsPage.selectTransaction(tx2.id)
    expect(await transactionsPage.getSelectedCount()).toBe(2)
    await transactionsPage.bulkSetReviewed(true)

    // "Apenas revisadas" → both stay visible.
    await transactionsPage.openAdvancedFilters()
    await transactionsPage.toggleAdvancedFilterSwitch(TransactionsTestIds.SwitchReviewed)
    await expect(transactionsPage.page.getByText(desc1)).toBeVisible()
    await expect(transactionsPage.page.getByText(desc2)).toBeVisible()

    // "Apenas não revisadas" (mutually exclusive) → both disappear.
    await transactionsPage.toggleAdvancedFilterSwitch(TransactionsTestIds.SwitchUnreviewed)
    await expect(transactionsPage.page.getByText(desc1)).not.toBeVisible({ timeout: 10000 })
    await expect(transactionsPage.page.getByText(desc2)).not.toBeVisible({ timeout: 10000 })
  })
})
