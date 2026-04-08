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

const today = new Date().toISOString().slice(0, 10)

test.describe('Transaction Filters', () => {
  let transactionsPage: TransactionsPage
  let accountAId: number
  let accountAName: string
  let accountBId: number
  let accountBName: string
  let categoryAId: number
  let categoryAName: string
  let categoryBId: number
  let categoryBName: string
  const createdTransactionIds: number[] = []

  test.beforeAll(async () => {
    accountAName = `Filtro Conta A ${Date.now()}`
    const accountA = await apiCreateAccount({ name: accountAName, initial_balance: 0 })
    accountAId = accountA.id

    accountBName = `Filtro Conta B ${Date.now()}`
    const accountB = await apiCreateAccount({ name: accountBName, initial_balance: 0 })
    accountBId = accountB.id

    categoryAName = `Filtro Cat A ${Date.now()}`
    const categoryA = await apiCreateCategory({ name: categoryAName })
    categoryAId = categoryA.id

    categoryBName = `Filtro Cat B ${Date.now()}`
    const categoryB = await apiCreateCategory({ name: categoryBName })
    categoryBId = categoryB.id
  })

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined)
    }
    await apiDeleteAccount(accountAId).catch(() => undefined)
    await apiDeleteAccount(accountBId).catch(() => undefined)
    await apiDeleteCategory(categoryAId).catch(() => undefined)
    await apiDeleteCategory(categoryBId).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    transactionsPage = new TransactionsPage(page)
    await transactionsPage.goto()
  })

  // ── Text search ───────────────────────────────────────────────────────────
  test('text search filters transactions by description', async ({ page }) => {
    const uniqueDesc = `BuscaUnica${Date.now()}`
    const otherDesc = `OutraDesc${Date.now()}`

    const tx1 = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: uniqueDesc,
    })
    const tx2 = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountAId,
      category_id: categoryAId,
      amount: 2000,
      date: today,
      description: otherDesc,
    })
    createdTransactionIds.push(tx1.id, tx2.id)

    await transactionsPage.goto()
    await expect(page.getByText(uniqueDesc)).toBeVisible()
    await expect(page.getByText(otherDesc)).toBeVisible()

    // Type in search box
    const searchInput = page.getByTestId('input_text_search')
    await searchInput.fill(uniqueDesc)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(uniqueDesc)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(otherDesc)).not.toBeVisible({ timeout: 8000 })
  })

  // ── Account filter ────────────────────────────────────────────────────────
  test('account filter shows only transactions from selected account', async ({ page }) => {
    const descA = `ContaA Tx ${Date.now()}`
    const descB = `ContaB Tx ${Date.now()}`

    const txA = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1500,
      date: today,
      description: descA,
    })
    const txB = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountBId,
      category_id: categoryAId,
      amount: 2500,
      date: today,
      description: descB,
    })
    createdTransactionIds.push(txA.id, txB.id)

    await transactionsPage.goto()
    await expect(page.getByText(descA)).toBeVisible()
    await expect(page.getByText(descB)).toBeVisible()

    // Open account filter popover and select accountA
    await page.getByRole('button', { name: /Contas/ }).click()
    await page.getByLabel(accountAName).check()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(descA)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(descB)).not.toBeVisible({ timeout: 8000 })
  })

  // ── Category filter ───────────────────────────────────────────────────────
  test('category filter shows only transactions from selected category', async ({ page }) => {
    const descA = `CatA Tx ${Date.now()}`
    const descB = `CatB Tx ${Date.now()}`

    const txA = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountAId,
      category_id: categoryAId,
      amount: 3000,
      date: today,
      description: descA,
    })
    const txB = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountAId,
      category_id: categoryBId,
      amount: 4000,
      date: today,
      description: descB,
    })
    createdTransactionIds.push(txA.id, txB.id)

    await transactionsPage.goto()
    await expect(page.getByText(descA)).toBeVisible()
    await expect(page.getByText(descB)).toBeVisible()

    // Open category filter popover and select categoryA
    await page.getByRole('button', { name: /Categorias/ }).click()
    await page.getByLabel(categoryAName).check()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(descA)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(descB)).not.toBeVisible({ timeout: 8000 })
  })

  // ── Type filter (advanced) ────────────────────────────────────────────────
  test('type filter shows only expenses when expense filter is active', async ({ page }) => {
    const expenseDesc = `TypeFilter Despesa ${Date.now()}`
    const incomeDesc = `TypeFilter Receita ${Date.now()}`

    const expenseTx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: expenseDesc,
    })
    const incomeTx = await apiCreateTransaction({
      transaction_type: 'income',
      account_id: accountAId,
      category_id: categoryAId,
      amount: 2000,
      date: today,
      description: incomeDesc,
    })
    createdTransactionIds.push(expenseTx.id, incomeTx.id)

    await transactionsPage.goto()
    await expect(page.getByText(expenseDesc)).toBeVisible()
    await expect(page.getByText(incomeDesc)).toBeVisible()

    // Open advanced filter and toggle "Apenas despesas"
    // getByTestId finds the Mantine Switch root <label> element, which is visible
    await page.getByRole('button', { name: /Filtros avançados/ }).click()
    await page.getByTestId('switch_type_expense').click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(expenseDesc)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(incomeDesc)).not.toBeVisible({ timeout: 8000 })
  })

  // ── Clear filters ─────────────────────────────────────────────────────────
  test('clear filters button removes active filters', async ({ page }) => {
    const targetDesc = `ClearFilter Tx ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: targetDesc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(targetDesc)).toBeVisible()

    // Apply a text search that hides the transaction
    const searchInput = page.getByTestId('input_text_search')
    await searchInput.fill('xxxxxxxxxnotfound')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(targetDesc)).not.toBeVisible({ timeout: 8000 })

    // The clear filters button should now be visible
    await expect(page.getByTestId('btn_clear_filters')).toBeVisible()

    // Clear filters
    await page.getByTestId('btn_clear_filters').click()
    await page.waitForLoadState('networkidle')

    // Transaction should be visible again and clear filters button gone
    await expect(page.getByText(targetDesc)).toBeVisible({ timeout: 8000 })
    await expect(page.getByTestId('btn_clear_filters')).not.toBeVisible()
  })
})
