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

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('Recurrence current installment disabled state', () => {
  let transactionsPage: TransactionsPage
  let testAccountId: number
  let testCategoryId: number
  let testAccountName: string
  let testCategoryName: string
  const createdTransactionIds: number[] = []

  const today = new Date().toISOString().slice(0, 10)

  test.beforeAll(async () => {
    testAccountName = `Conta InstDisable ${Date.now()}`
    testCategoryName = `Cat InstDisable ${Date.now()}`

    const account = await apiCreateAccount({ name: testAccountName, initial_balance: 0 })
    testAccountId = account.id

    const category = await apiCreateCategory({ name: testCategoryName })
    testCategoryId = category.id
  })

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id, 'all').catch(() => undefined)
    }
    await apiDeleteAccount(testAccountId).catch(() => undefined)
    await apiDeleteCategory(testCategoryId).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    transactionsPage = new TransactionsPage(page)
  })

  // ── Test 1: Recurring transaction disables current installment input ───────
  test('disables current installment input when editing a recurring transaction', async ({ page }) => {
    const desc = `Recur Disable Inst ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 5000,
      date: today,
      description: desc,
      recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 5 },
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible()

    await transactionsPage.clickTransactionRow(tx.id)
    await expect(transactionsPage.updateDrawer).toBeVisible()

    const currentInstallmentInput = transactionsPage.updateDrawer.getByLabel('Parcela atual')
    await expect(currentInstallmentInput).toBeDisabled()
  })

  // ── Test 2: Non-recurring transaction allows editing current installment ───
  test('enables current installment input when adding recurrence to a non-recurring transaction', async ({ page }) => {
    const desc = `NonRecur Enable Inst ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 3000,
      date: today,
      description: desc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc)).toBeVisible()

    await transactionsPage.clickTransactionRow(tx.id)
    await expect(transactionsPage.updateDrawer).toBeVisible()

    // Enable recurrence toggle
    await transactionsPage.updateDrawer.locator('label', { hasText: 'Recorrência' }).click()

    const currentInstallmentInput = transactionsPage.updateDrawer.getByLabel('Parcela atual')
    await expect(currentInstallmentInput).toBeEnabled()
  })
})
