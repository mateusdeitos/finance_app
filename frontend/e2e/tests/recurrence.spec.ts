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
import { fillNumber } from '../helpers/formFields'
import { RecurrenceTestIds, TransactionsTestIds } from '@/testIds'

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('Recurrence', () => {
  let transactionsPage: TransactionsPage
  let testAccountId: number
  let testCategoryId: number
  let testAccountName: string
  let testCategoryName: string
  const createdTransactionIds: number[] = []

  // Use January 2025 as base month — predictable, in the past
  const baseDate = '2025-01-15'
  const baseMonth = 1
  const baseYear = 2025

  test.beforeAll(async () => {
    testAccountName = `Conta Recurrence ${Date.now()}`
    testCategoryName = `Cat Recurrence ${Date.now()}`

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

  // ── Test 1 (E2E-02): Creates recurring expense 1/5 and shows badge 1/5 ──────
  test('creates recurring expense 1/5 and shows badge 1/5', async ({ page }) => {
    const desc = `Parcela 1 de 5 - e2e ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 5000,
      date: baseDate,
      description: desc,
      recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 5 },
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.gotoMonth(baseMonth, baseYear)

    const row = page.locator(`[data-transaction-id="${tx.id}"]`)
    await expect(row).toBeVisible()
    await expect(row.getByText('1/5')).toBeVisible()
  })

  // ── Test 2 (E2E-03): Creates recurring expense 3/10 and shows correct badges across months ──
  test('creates recurring expense 3/10 and shows correct badges across months', async ({ page }) => {
    const desc = `Parcela 3 de 10 - e2e ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 7500,
      date: baseDate,
      description: desc,
      recurrence_settings: { type: 'monthly', current_installment: 3, total_installments: 10 },
    })
    createdTransactionIds.push(tx.id)

    // Month 0 (base month): badge shows "3/10"
    await transactionsPage.gotoMonth(baseMonth, baseYear)
    const row = page.locator(`[data-transaction-id="${tx.id}"]`)
    await expect(row).toBeVisible()
    await expect(row.getByText('3/10')).toBeVisible()

    // Month 1 (base + 1): badge shows "4/10"
    await transactionsPage.gotoMonth(baseMonth + 1, baseYear)
    await expect(page.getByText('4/10')).toBeVisible()

    // Month 2 (base + 2): badge shows "5/10"
    await transactionsPage.gotoMonth(baseMonth + 2, baseYear)
    await expect(page.getByText('5/10')).toBeVisible()
  })

  // ── Test 3 (E2E-04 + TST-08): Shows validation error when parcela atual > total ──
  test('shows validation error when parcela atual is greater than total de parcelas', async ({ page }) => {
    await transactionsPage.gotoMonth(baseMonth, baseYear)
    await transactionsPage.openCreateForm()

    // Fill the main expense fields first
    await transactionsPage.fillExpense(1000, `Parcela invalida - e2e ${Date.now()}`, testAccountId, testCategoryId)

    // Enable recurrence toggle — click the visible <label> element, not the hidden input
    await page.locator('label', { hasText: 'Recorrência' }).click()

    // Fill invalid values: current (5) > total (3)
    await fillNumber(transactionsPage.formDrawer, RecurrenceTestIds.CurrentInstallmentInput, 5)
    await fillNumber(transactionsPage.formDrawer, RecurrenceTestIds.TotalInstallmentsInput, 3)

    // Attempt to submit
    await page.getByTestId(TransactionsTestIds.BtnSave).click()

    // Assert validation error is visible
    await expect(page.getByText('Parcela atual nao pode ser maior que o total')).toBeVisible()

    // Assert drawer is still open (form was NOT submitted)
    await expect(transactionsPage.formDrawer).toBeVisible()
  })
})
