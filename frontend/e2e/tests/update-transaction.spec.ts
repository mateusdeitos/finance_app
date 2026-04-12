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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()

const nextMonthDate = new Date(currentYear, now.getMonth() + 1, 1)
const nextMonth = nextMonthDate.getMonth() + 1
const nextYear = nextMonthDate.getFullYear()

const today = now.toISOString().slice(0, 10)

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('Transaction Update', () => {
  let transactionsPage: TransactionsPage
  let testAccountId: number
  let testCategoryId: number
  const createdTransactionIds: number[] = []

  test.beforeAll(async () => {
    const account = await apiCreateAccount({
      name: `Conta Update ${Date.now()}`,
      initial_balance: 0,
    })
    testAccountId = account.id

    const category = await apiCreateCategory({ name: `Cat Update ${Date.now()}` })
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
    await transactionsPage.goto()
  })

  // ── Test 1: Pre-population ─────────────────────────────────────────────────
  test('opens update drawer pre-populated with transaction values', async ({ page }) => {
    const desc = `Aluguel Test ${Date.now()}`
    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 150000,
      date: today,
      description: desc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc)).toBeVisible()

    await transactionsPage.clickTransactionRow(tx.id)

    // Drawer title
    await expect(transactionsPage.updateDrawer).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Editar transação' })).toBeVisible()

    // Description pre-populated
    const descInput = transactionsPage.updateDrawer.getByTestId('input_description')
    await expect(descInput).toHaveValue(desc)

    // Amount pre-populated (150000 cents = R$ 1.500,00)
    const amountInput = transactionsPage.updateDrawer.getByTestId('input_amount')
    await expect(amountInput).toHaveValue('1.500,00')

    // Expense type selected (data-active is on the label element, not the inner span)
    const segmented = transactionsPage.updateDrawer.getByTestId('segmented_transaction_type')
    await expect(segmented.locator('[data-active]').first()).toContainText('Despesa')
  })

  // ── Test 2: Update description ─────────────────────────────────────────────
  test('updates description and refreshes the list', async ({ page }) => {
    const originalDesc = `Desc Original ${Date.now()}`
    const updatedDesc = `Desc Updated ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 1000,
      date: today,
      description: originalDesc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(originalDesc)).toBeVisible()

    await transactionsPage.clickTransactionRow(tx.id)
    await transactionsPage.clearAndFillDescription(updatedDesc)
    await transactionsPage.submitUpdate()

    // Drawer closed; updated description visible
    await expect(page.getByText(updatedDesc)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(originalDesc)).not.toBeVisible()
  })

  // ── Test 3: Update amount ──────────────────────────────────────────────────
  test('updates amount and refreshes the list', async ({ page }) => {
    const desc = `Amount Test ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 5000, // R$ 50,00
      date: today,
      description: desc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc)).toBeVisible()

    await transactionsPage.clickTransactionRow(tx.id)

    // Change amount to 9900 (R$ 99,00)
    await transactionsPage.clearAndFillAmount(9900)
    await transactionsPage.submitUpdate()

    // Updated amount visible in the specific transaction row
    // (currency format uses non-breaking space: R$\u00a099,00)
    await expect(
      page.locator(`[data-transaction-id="${tx.id}"]`).getByText(/99,00/)
    ).toBeVisible({ timeout: 8000 })
  })

  // ── Test 4: Selection mode suppresses row click ────────────────────────────
  test('row click toggles selection instead of opening drawer in selection mode', async ({ page }) => {
    const desc1 = `Sel Mode A ${Date.now()}`
    const desc2 = `Sel Mode B ${Date.now()}`

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
    await expect(page.getByText(desc1)).toBeVisible()
    await expect(page.getByText(desc2)).toBeVisible()

    // Select tx1 — enters selection mode
    await transactionsPage.selectTransaction(tx1.id)
    expect(await transactionsPage.getSelectedCount()).toBe(1)

    // Click tx2 row while in selection mode — should toggle checkbox, NOT open drawer
    await page.locator(`[data-transaction-id="${tx2.id}"]`).click()

    // Drawer must NOT be open
    await expect(transactionsPage.updateDrawer).not.toBeVisible()

    // Count should now be 2
    expect(await transactionsPage.getSelectedCount()).toBe(2)

    // Clean up selection
    await page.getByTestId('btn_clear_selection').click()
  })

  // ── Test 5: Non-recurring hides propagation selector ──────────────────────
  test('hides propagation selector for non-recurring transaction', async ({ page }) => {
    const desc = `No Recur ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 1000,
      date: today,
      description: desc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc)).toBeVisible()

    await transactionsPage.clickTransactionRow(tx.id)

    await expect(page.getByTestId('propagation_update_option_current')).not.toBeVisible()
  })

  // ── Test 6: Recurring shows propagation selector ───────────────────────────
  test('shows all 3 propagation options for recurring transaction', async ({ page }) => {
    const desc = `Recur Show Prop ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 3000,
      date: today,
      description: desc,
      recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 3 },
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible()

    await transactionsPage.clickTransactionRow(tx.id)

    await expect(page.getByTestId('propagation_update_option_current')).toBeVisible()
    await expect(page.getByTestId('propagation_update_option_current_and_future')).toBeVisible()
    await expect(page.getByTestId('propagation_update_option_all')).toBeVisible()
  })

  // ── Test 7: Propagation "current" — only changes current installment ────────
  test('propagation "current" updates only the selected installment', async ({ page }) => {
    const originalDesc = `Recur Cur Orig ${Date.now()}`
    const updatedDesc = `Recur Cur Upd ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 2000,
      date: today,
      description: originalDesc,
      recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 3 },
    })
    createdTransactionIds.push(tx.id)

    // Update current installment with propagation = "current"
    await transactionsPage.goto()
    await expect(page.getByText(originalDesc).first()).toBeVisible()

    await transactionsPage.clickTransactionRow(tx.id)
    await transactionsPage.clearAndFillDescription(updatedDesc)
    // "current" is the default — no need to click it, but be explicit
    await transactionsPage.selectUpdatePropagation('current')
    await transactionsPage.submitUpdate()

    // Current month shows updated description
    await expect(page.getByText(updatedDesc).first()).toBeVisible({ timeout: 8000 })

    // Next month still shows original description
    await transactionsPage.gotoMonth(nextMonth, nextYear)
    await expect(page.getByText(originalDesc).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(updatedDesc)).not.toBeVisible()
  })

  // ── Test 8: Propagation "all" — changes all installments ──────────────────
  test('propagation "all" updates all installments', async ({ page }) => {
    const originalDesc = `Recur All Orig ${Date.now()}`
    const updatedDesc = `Recur All Upd ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: testAccountId,
      category_id: testCategoryId,
      amount: 2000,
      date: today,
      description: originalDesc,
      recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 3 },
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(originalDesc).first()).toBeVisible()

    await transactionsPage.clickTransactionRow(tx.id)
    await transactionsPage.clearAndFillDescription(updatedDesc)
    await transactionsPage.selectUpdatePropagation('all')
    await transactionsPage.submitUpdate()

    // Current month shows updated description
    await expect(page.getByText(updatedDesc).first()).toBeVisible({ timeout: 8000 })

    // Next month also shows updated description
    await transactionsPage.gotoMonth(nextMonth, nextYear)
    await expect(page.getByText(updatedDesc).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(originalDesc)).not.toBeVisible()
  })
})
