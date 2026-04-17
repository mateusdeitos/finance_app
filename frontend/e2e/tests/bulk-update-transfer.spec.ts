import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategory,
  apiDeleteCategory,
  apiCreateTransaction,
  apiDeleteTransaction,
  apiUpdateTransaction,
  apiCreateUserConnection,
  getAuthTokenForUser,
  apiFetchAs,
} from '../helpers/api'

/**
 * Bulk Update Transfer (different users) — regression test
 *
 * Bug: bulk update sent only the changed field (e.g. category_id) without the
 * rest of the transaction data. The backend expects a full payload, so:
 *   - For transfers between different users: nil DestinationAccountID caused 500
 *   - For any transaction type: other fields (description, amount, etc.) were lost
 *
 * Fix: frontend now sends full transaction payload with the changed field overridden.
 */

const PARTNER_EMAIL = 'e2e-bulk-transfer-partner@financeapp.local'

test.describe('Bulk Update Transfer between different users', () => {
  let transactionsPage: TransactionsPage
  let sourceAccountId: number
  let sourceAccountName: string
  let partnerToken: string
  let connectionId: number
  let connAccountId: number
  let categoryId: number
  let categoryName: string
  let newCategoryId: number
  let newCategoryName: string
  const createdTransactionIds: number[] = []

  test.beforeAll(async () => {
    // 1. Create primary user account
    sourceAccountName = `Bulk Xfer Source ${Date.now()}`
    const sourceAccount = await apiCreateAccount({ name: sourceAccountName, initial_balance: 0 })
    sourceAccountId = sourceAccount.id

    // 2. Auth as partner, create their account
    partnerToken = await getAuthTokenForUser(PARTNER_EMAIL)
    const partnerAccountRes = await apiFetchAs(partnerToken, '/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: `Partner Bulk Xfer ${Date.now()}`, initial_balance: 0 }),
    })
    await partnerAccountRes.json()

    // 3. Get partner user ID
    const meRes = await apiFetchAs(partnerToken, '/api/auth/me')
    const partnerUser = await meRes.json()

    // 4. Create + accept connection (idempotent)
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

    // 5. Find the connection account
    const primaryToken = await getAuthTokenForUser('e2e-test@financeapp.local')
    const accountsRes = await apiFetchAs(primaryToken, '/api/accounts')
    const allAccounts = await accountsRes.json()
    const connAccount = allAccounts.find(
      (a: { user_connection?: { id: number } }) => a.user_connection?.id === connectionId,
    )
    if (!connAccount) throw new Error(`No connection account for connection ${connectionId}`)
    connAccountId = connAccount.id

    // 6. Create categories
    categoryName = `Cat Bulk Xfer ${Date.now()}`
    const cat = await apiCreateCategory({ name: categoryName })
    categoryId = cat.id

    newCategoryName = `Cat Bulk Xfer New ${Date.now()}`
    const newCat = await apiCreateCategory({ name: newCategoryName })
    newCategoryId = newCat.id
  })

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined)
    }
    await apiDeleteAccount(sourceAccountId).catch(() => undefined)
    await apiDeleteCategory(categoryId).catch(() => undefined)
    await apiDeleteCategory(newCategoryId).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    transactionsPage = new TransactionsPage(page)
    await transactionsPage.goto()
  })

  test('bulk category change on transfer between different users succeeds without data loss', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const desc = `Bulk Xfer Cat ${Date.now()}`
    const amount = 5000

    const tx = await apiCreateTransaction({
      transaction_type: 'transfer',
      account_id: sourceAccountId,
      destination_account_id: connAccountId,
      amount,
      date: today,
      description: desc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })

    // Select and bulk-update category
    await transactionsPage.selectTransaction(tx.id)
    expect(await transactionsPage.getSelectedCount()).toBeGreaterThanOrEqual(1)

    await transactionsPage.openBulkActionsMenu()
    await page.getByTestId('btn_bulk_category').click()

    // Select new category in drawer
    const categoryDrawer = page.getByRole('dialog')
    await expect(categoryDrawer).toBeVisible({ timeout: 5000 })
    const categoryInput = categoryDrawer.locator('input').first()
    await categoryInput.fill(newCategoryName)
    await page.getByRole('option', { name: new RegExp(newCategoryName) }).click()

    // Must succeed
    await expect(page.getByTestId('bulk_success').or(page.getByTestId('bulk_error'))).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByTestId('bulk_error')).not.toBeVisible()
    await expect(page.getByTestId('bulk_success')).toBeVisible()

    // Verify description preserved after reload
    await page.getByTestId('btn_bulk_done').click()
    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })
  })

  test('bulk date change on transfer between different users succeeds without data loss', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const desc = `Bulk Xfer Date ${Date.now()}`
    const amount = 7500

    const tx = await apiCreateTransaction({
      transaction_type: 'transfer',
      account_id: sourceAccountId,
      destination_account_id: connAccountId,
      amount,
      date: today,
      description: desc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })

    // Select and bulk-update date
    await transactionsPage.selectTransaction(tx.id)
    expect(await transactionsPage.getSelectedCount()).toBeGreaterThanOrEqual(1)

    await transactionsPage.openBulkActionsMenu()
    await page.getByTestId('btn_bulk_date').click()

    // Confirm date in drawer (picks current date by default)
    const dateDrawer = page.getByRole('dialog')
    await expect(dateDrawer).toBeVisible({ timeout: 5000 })
    const confirmBtn = dateDrawer.getByRole('button', { name: /confirmar|salvar|ok/i })
    await confirmBtn.click()

    // Must succeed
    await expect(page.getByTestId('bulk_success').or(page.getByTestId('bulk_error'))).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByTestId('bulk_error')).not.toBeVisible()
    await expect(page.getByTestId('bulk_success')).toBeVisible()

    // Verify description preserved after reload
    await page.getByTestId('btn_bulk_done').click()
    await transactionsPage.goto()
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 8000 })
  })
})
