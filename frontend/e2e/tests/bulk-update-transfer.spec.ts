import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategory,
  apiDeleteCategory,
  apiCreateTransaction,
  apiDeleteTransaction,
  apiGetTransaction,
  apiCreateTag,
  apiDeleteTag,
  apiCreateUserConnection,
  getAuthTokenForUser,
  apiFetchAs,
} from '../helpers/api'
import { TransactionsTestIds } from '@/testIds'

/**
 * Bulk Update — regression tests for data loss prevention
 *
 * Bug: bulk update sent only the changed field (e.g. category_id) without
 * the rest of the transaction data. The backend expects a full payload, so:
 *   - Transfers between different users: nil DestinationAccountID → 500
 *   - All transaction types: other fields were silently lost
 *
 * Fix: frontend now sends full transaction payload with only the changed field overridden.
 */

const PARTNER_EMAIL = 'e2e-bulk-update-partner@financeapp.local'

test.describe('Bulk Update — data preservation', () => {
  let transactionsPage: TransactionsPage
  let accountId: number
  let accountName: string
  let categoryId: number
  let categoryName: string
  let newCategoryId: number
  let newCategoryName: string
  let tagId: number
  let tagName: string
  // Multi-user setup
  let partnerToken: string
  let connectionId: number
  let connAccountId: number
  const createdTransactionIds: number[] = []

  test.beforeAll(async () => {
    // Primary account
    accountName = `Bulk Upd Account ${Date.now()}`
    const acc = await apiCreateAccount({ name: accountName, initial_balance: 0 })
    accountId = acc.id

    // Categories
    categoryName = `Cat Bulk ${Date.now()}`
    const cat = await apiCreateCategory({ name: categoryName })
    categoryId = cat.id

    newCategoryName = `Cat Bulk New ${Date.now()}`
    const newCat = await apiCreateCategory({ name: newCategoryName })
    newCategoryId = newCat.id

    // Tag
    tagName = `tag-bulk-${Date.now()}`
    const tag = await apiCreateTag({ name: tagName })
    tagId = tag.id

    // Partner user + connection
    partnerToken = await getAuthTokenForUser(PARTNER_EMAIL)
    await apiFetchAs(partnerToken, '/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: `Partner Bulk ${Date.now()}`, initial_balance: 0 }),
    })

    const meRes = await apiFetchAs(partnerToken, '/api/auth/me')
    const partnerUser = await meRes.json()

    try {
      const conn = await apiCreateUserConnection(partnerUser.id, 50)
      connectionId = conn.id
      await apiFetchAs(partnerToken, `/api/user-connections/${connectionId}/accepted`, {
        method: 'PATCH',
      })
    } catch (err) {
      if (String(err).includes('ALREADY_EXISTS')) {
        const connRes = await apiFetchAs(partnerToken, '/api/user-connections')
        const connections = await connRes.json()
        const existing = connections.find(
          (c: { connection_status: string }) => c.connection_status === 'accepted',
        )
        if (!existing) throw new Error('Connection exists but none are accepted')
        connectionId = existing.id
      } else {
        throw err
      }
    }

    const primaryToken = await getAuthTokenForUser('e2e-test@financeapp.local')
    const accountsRes = await apiFetchAs(primaryToken, '/api/accounts')
    const allAccounts = await accountsRes.json()
    const connAccount = allAccounts.find(
      (a: { user_connection?: { id: number } }) => a.user_connection?.id === connectionId,
    )
    if (!connAccount) throw new Error(`No connection account for connection ${connectionId}`)
    connAccountId = connAccount.id
  })

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined)
    }
    await apiDeleteAccount(accountId).catch(() => undefined)
    await apiDeleteCategory(categoryId).catch(() => undefined)
    await apiDeleteCategory(newCategoryId).catch(() => undefined)
    await apiDeleteTag(tagId).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    transactionsPage = new TransactionsPage(page)
    await transactionsPage.goto()
  })

  // ── Helper: select transaction and do bulk category change via UI ──
  async function bulkChangeCategory(page: TransactionsPage['page'], txId: number, targetCategoryId: number) {
    await transactionsPage.selectTransaction(txId)
    await transactionsPage.openBulkActionsMenu()
    await page.getByTestId(TransactionsTestIds.BtnBulkCategory).click()

    // Wait for a category option to appear (Mantine Drawer root stays hidden during animation)
    const categoryOption = page.getByTestId(TransactionsTestIds.CategoryOption(targetCategoryId))
    await expect(categoryOption).toBeVisible({ timeout: 8000 })
    await categoryOption.click()

    await expect(page.getByTestId(TransactionsTestIds.BulkSuccess).or(page.getByTestId(TransactionsTestIds.BulkError))).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId(TransactionsTestIds.BulkError)).not.toBeVisible()
    await expect(page.getByTestId(TransactionsTestIds.BulkSuccess)).toBeVisible()
    await page.getByTestId(TransactionsTestIds.BtnBulkDone).click()
  }

  // ── Helper: select transaction and do bulk date change via UI ──
  async function bulkChangeDate(page: TransactionsPage['page'], txId: number) {
    await transactionsPage.selectTransaction(txId)
    await transactionsPage.openBulkActionsMenu()
    await page.getByTestId(TransactionsTestIds.BtnBulkDate).click()

    // Wait for the apply button inside the date drawer (Mantine Drawer root stays hidden during animation)
    const applyBtn = page.getByTestId(TransactionsTestIds.BtnApplyDate)
    await expect(applyBtn).toBeVisible({ timeout: 8000 })
    await applyBtn.click()

    await expect(page.getByTestId(TransactionsTestIds.BulkSuccess).or(page.getByTestId(TransactionsTestIds.BulkError))).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId(TransactionsTestIds.BulkError)).not.toBeVisible()
    await expect(page.getByTestId(TransactionsTestIds.BulkSuccess)).toBeVisible()
    await page.getByTestId(TransactionsTestIds.BtnBulkDone).click()
  }

  // ─────────────────────────────────────────────────────────────────────
  // Expense — no recurrence, no split
  // ─────────────────────────────────────────────────────────────────────

  test('expense: bulk category change preserves description, amount, tags', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const desc = `Bulk Exp Cat ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountId,
      category_id: categoryId,
      amount: 4200,
      date: today,
      description: desc,
      tags: [{ id: tagId, name: tagName }],
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })

    await bulkChangeCategory(page, tx.id, newCategoryId)

    // Verify via API
    const updated = await apiGetTransaction(tx.id)
    expect(updated.description).toBe(desc)
    expect(updated.amount).toBe(4200)
    expect(updated.account_id).toBe(accountId)
    expect(updated.category_id).toBe(newCategoryId)
    expect(updated.tags?.some((t) => t.name === tagName)).toBe(true)
  })

  test('expense: bulk date change preserves description, amount, category, tags', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const desc = `Bulk Exp Date ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountId,
      category_id: categoryId,
      amount: 3300,
      date: today,
      description: desc,
      tags: [{ id: tagId, name: tagName }],
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })

    await bulkChangeDate(page, tx.id)

    const updated = await apiGetTransaction(tx.id)
    expect(updated.description).toBe(desc)
    expect(updated.amount).toBe(3300)
    expect(updated.account_id).toBe(accountId)
    expect(updated.category_id).toBe(categoryId)
    expect(updated.tags?.some((t) => t.name === tagName)).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────
  // Income — no recurrence, no split
  // ─────────────────────────────────────────────────────────────────────

  test('income: bulk category change preserves description, amount, tags', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const desc = `Bulk Inc Cat ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'income',
      account_id: accountId,
      category_id: categoryId,
      amount: 9900,
      date: today,
      description: desc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })

    await bulkChangeCategory(page, tx.id, newCategoryId)

    const updated = await apiGetTransaction(tx.id)
    expect(updated.description).toBe(desc)
    expect(updated.amount).toBe(9900)
    expect(updated.category_id).toBe(newCategoryId)
    expect(updated.type).toBe('income')
  })

  // ─────────────────────────────────────────────────────────────────────
  // Expense — with recurrence, no split
  // ─────────────────────────────────────────────────────────────────────

  test('recurring expense: bulk category change preserves recurrence and data', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const desc = `Bulk Recur Cat ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountId,
      category_id: categoryId,
      amount: 1500,
      date: today,
      description: desc,
      recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 3 },
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })

    // Select, open bulk menu, change category — propagation drawer will appear
    await transactionsPage.selectTransaction(tx.id)
    await transactionsPage.openBulkActionsMenu()
    await page.getByTestId(TransactionsTestIds.BtnBulkCategory).click()

    // Wait for category option inside drawer
    const catOption = page.getByTestId(TransactionsTestIds.CategoryOption(newCategoryId))
    await expect(catOption).toBeVisible({ timeout: 8000 })
    await catOption.click()

    // Propagation drawer should appear for recurring tx — wait for option inside it
    const propagationOption = page.getByTestId(TransactionsTestIds.PropagationOption('current'))
    await expect(propagationOption.or(page.getByTestId(TransactionsTestIds.BulkSuccess))).toBeVisible({ timeout: 8000 })

    // If propagation appears, select "current"
    const propagationVisible = await propagationOption.isVisible().catch(() => false)
    if (propagationVisible) {
      await transactionsPage.selectPropagation('current', 'update')
    }

    await expect(page.getByTestId(TransactionsTestIds.BulkSuccess)).toBeVisible({ timeout: 15000 })
    await page.getByTestId(TransactionsTestIds.BtnBulkDone).click()

    const updated = await apiGetTransaction(tx.id)
    expect(updated.description).toBe(desc)
    expect(updated.amount).toBe(1500)
    expect(updated.category_id).toBe(newCategoryId)
    expect(updated.transaction_recurrence_id).toBeTruthy()
  })

  // ─────────────────────────────────────────────────────────────────────
  // Expense — with split (shared expense)
  // ─────────────────────────────────────────────────────────────────────

  test('split expense: bulk category change preserves split settings', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const desc = `Bulk Split Cat ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountId,
      category_id: categoryId,
      amount: 8000,
      date: today,
      description: desc,
      split_settings: [{ connection_id: connectionId, amount: 4000 }],
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })

    await bulkChangeCategory(page, tx.id, newCategoryId)

    const updated = await apiGetTransaction(tx.id)
    expect(updated.description).toBe(desc)
    expect(updated.amount).toBe(8000)
    expect(updated.category_id).toBe(newCategoryId)
    // Split should be preserved — linked_transactions should still exist
    expect(updated.linked_transactions?.length).toBeGreaterThan(0)
  })

  // ─────────────────────────────────────────────────────────────────────
  // Transfer between different users
  // ─────────────────────────────────────────────────────────────────────

  test('transfer between different users: bulk date change succeeds and preserves data', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const desc = `Bulk Xfer Date ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'transfer',
      account_id: accountId,
      destination_account_id: connAccountId,
      amount: 5000,
      date: today,
      description: desc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })

    await bulkChangeDate(page, tx.id)

    const updated = await apiGetTransaction(tx.id)
    expect(updated.description).toBe(desc)
    expect(updated.amount).toBe(5000)
    expect(updated.type).toBe('transfer')
    // Transfer should still have linked transaction (the other side)
    expect(updated.linked_transactions?.length).toBeGreaterThan(0)
    // Transfers don't hold category_id
    expect(updated.category_id).toBeFalsy()
  })

  test('transfer between different users: bulk category change does not assign category', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const desc = `Bulk Xfer NoCat ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'transfer',
      account_id: accountId,
      destination_account_id: connAccountId,
      amount: 3000,
      date: today,
      description: desc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })

    await bulkChangeCategory(page, tx.id, newCategoryId)

    const updated = await apiGetTransaction(tx.id)
    expect(updated.description).toBe(desc)
    expect(updated.amount).toBe(3000)
    expect(updated.type).toBe('transfer')
    // Transfer must NOT have category_id after bulk category change
    expect(updated.category_id).toBeFalsy()
    // Linked transaction preserved
    expect(updated.linked_transactions?.length).toBeGreaterThan(0)
  })
})
