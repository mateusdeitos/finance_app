import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import { apiCreateAccount, apiDeleteAccount, apiDeleteTransaction, apiCreateCategory, apiDeleteCategory } from '../helpers/api'

test.describe('Transactions', () => {
  let transactionsPage: TransactionsPage
  let testAccountId: number
  let testAccountName: string
  let testCategoryId: number
  let testCategoryName: string
  const createdTransactionIds: number[] = []

  test.beforeAll(async () => {
    testAccountName = `Conta Transações ${Date.now()}`
    const account = await apiCreateAccount({ name: testAccountName, initial_balance: 0 })
    testAccountId = account.id

    testCategoryName = `Categoria Teste ${Date.now()}`
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

  // ── 6.2 ──────────────────────────────────────────────────────────────────
  test('create an expense transaction', async () => {
    const description = `Despesa Teste ${Date.now()}`

    await transactionsPage.openCreateForm()
    await transactionsPage.fillExpense(5000, description, testAccountName, testCategoryName)
    await transactionsPage.submitForm()

    await expect(transactionsPage.page.getByText(description)).toBeVisible()
  })

  // ── 6.3 ──────────────────────────────────────────────────────────────────
  test('create an income transaction', async () => {
    const description = `Receita Teste ${Date.now()}`

    await transactionsPage.openCreateForm()
    await transactionsPage.fillIncome(10000, description, testAccountName, testCategoryName)
    await transactionsPage.submitForm()

    await expect(transactionsPage.page.getByText(description)).toBeVisible()
  })

})
