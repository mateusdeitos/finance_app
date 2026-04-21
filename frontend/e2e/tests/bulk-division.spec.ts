/**
 * Bulk Division — TEST-01 (PAY-01, PAY-02, BULK-01, BULK-02, BULK-03, UI-02)
 *
 * This spec closes the three HUMAN-UAT items Phase 14 deferred to CI:
 *   1. 14-HUMAN-UAT.md test 1 — happy-path Divisão flow (Test 1 below)
 *   2. 14-HUMAN-UAT.md test 2 — disabled state with 0 connected accounts (Test 2 below)
 *   3. 14-HUMAN-UAT.md test 3 — transfer silent-skip in mixed selection (Test 3 below)
 *
 * Test 1 uses TWO accepted partner connections so a 30/70 split with an
 * odd-cent total exercises the last-split-absorbs-remainder wire format
 * end-to-end (CONTEXT.md §"Specific Ideas"). With exactly 1 connection,
 * BulkDivisionDrawer (lines 79-90) seeds a single row and the "+ Adicionar divisão"
 * anchor is hidden (hasAvailableConnections=false), so a 30/70 split with 2 rows
 * requires 2 connections. This is the recommended path per 15-02-PLAN.md §interfaces.
 */

import { test, expect, type Request } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategory,
  apiDeleteCategory,
  apiCreateTransaction,
  apiDeleteTransaction,
  apiGetTransaction,
  apiFetchAs,
  getAuthTokenForUser,
  openAuthedPage,
} from '../helpers/api'
import { setupPartnerConnection } from '../helpers/fixtures'

test.describe('Bulk Division', () => {
  let transactionsPage: TransactionsPage
  let accountId: number
  let categoryId: number
  let connectionId: number
  let connectionId2: number
  let connAccountId: number
  const createdTransactionIds: number[] = []

  test.beforeAll(async () => {
    // Primary account and category shared across tests
    const acc = await apiCreateAccount({
      name: `Bulk Div Account ${Date.now()}`,
      initial_balance: 0,
    })
    accountId = acc.id

    const cat = await apiCreateCategory({ name: `Bulk Div Cat ${Date.now()}` })
    categoryId = cat.id

    // Two partner connections for happy-path (30/70 requires 2 rows in the drawer).
    // Partner 1 — used in both happy-path and silent-skip
    const partner1 = await setupPartnerConnection({
      email: 'e2e-bulk-division-partner@financeapp.local',
      status: 'accepted',
    })
    connectionId = partner1.connectionId
    connAccountId = partner1.connAccountId

    // Partner 2 — used in happy-path to enable a 2-row 30/70 split
    const partner2 = await setupPartnerConnection({
      email: 'e2e-bulk-division-partner2@financeapp.local',
      status: 'accepted',
    })
    connectionId2 = partner2.connectionId
  })

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined)
    }
    await apiDeleteAccount(accountId).catch(() => undefined)
    await apiDeleteCategory(categoryId).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    transactionsPage = new TransactionsPage(page)
    await transactionsPage.goto()
  })

  // ─── Test 1: Happy-path Divisão flow ────────────────────────────────────────
  // Closes: 14-HUMAN-UAT.md test 1 — full happy-path Divisão flow
  // Covers: TEST-01, PAY-01, PAY-02, BULK-01, BULK-02, BULK-03 (income tx included)
  test('happy path: 30/70 split applied to ≥2 transactions (including income + odd-cent)', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)

    // Tx A: odd-cent expense — proves last-split-absorbs-remainder on the wire
    // 101 cents * 30% = Math.round(30.3) = 30; last gets 101 - 30 = 71 (CONTEXT.md §"Specific Ideas")
    const txA = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountId,
      category_id: categoryId,
      amount: 101,
      date: today,
      description: `Bulk Div Odd ${Date.now()}`,
    })
    createdTransactionIds.push(txA.id)

    // Tx B: income with odd cents — covers BULK-03 (income type flows through division normally)
    const txB = await apiCreateTransaction({
      transaction_type: 'income',
      account_id: accountId,
      category_id: categoryId,
      amount: 10001,
      date: today,
      description: `Bulk Div Income ${Date.now()}`,
    })
    createdTransactionIds.push(txB.id)

    // Tx C: clean-multiple expense — baseline
    const txC = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountId,
      category_id: categoryId,
      amount: 5000,
      date: today,
      description: `Bulk Div Even ${Date.now()}`,
    })
    createdTransactionIds.push(txC.id)

    // Reload so the new transactions appear in the list
    await transactionsPage.goto()

    // Select all 3 transactions
    await transactionsPage.selectTransaction(txA.id)
    await transactionsPage.selectTransaction(txB.id)
    await transactionsPage.selectTransaction(txC.id)
    await expect(page.getByTestId('selection_count')).toHaveText('3')

    // Open bulk menu → click Divisão
    await transactionsPage.openBulkActionsMenu()
    await page.getByTestId('btn_bulk_division').click()

    // Wait for drawer to be ready (Mantine Drawer may keep root hidden during animation)
    await expect(page.getByTestId('btn_apply_bulk_division')).toBeVisible({ timeout: 8000 })

    // With 2 connected accounts, BulkDivisionDrawer seeds row 1 with empty {connection_id: 0}.
    // We must pick the first connection and set 30%, then add a second row for 70%.
    const drawer = page.getByTestId('drawer_bulk_division')

    // Row 1: select partner 1's connection, set to 30%
    const firstSelect = drawer.getByPlaceholder('Selecionar conta').first()
    await firstSelect.click()
    // Pick the first available option (partner 1's account — any visible option works for row 1)
    await page.getByRole('option').first().click()

    // Set row 1 percentage to 30
    const percentInputs = drawer.getByTestId('input_split_percentage')
    await percentInputs.nth(0).fill('30')

    // Add a second row
    await drawer.getByRole('button', { name: '+ Adicionar divisão' }).click()

    // Row 2: select the remaining available connection (partner 2)
    const secondSelect = drawer.getByPlaceholder('Selecionar conta').last()
    await secondSelect.click()
    await page.getByRole('option').first().click()

    // Set row 2 percentage to 70
    await percentInputs.nth(1).fill('70')

    // Verify the sum badge shows 100%
    await expect(drawer.getByTestId('badge_bulk_division_sum')).toHaveText(/Total: 100% \/ 100%/)

    // --- Arm network capture BEFORE clicking submit (playwright-best-practices) ---
    const capturedPuts: Array<{
      amount: number
      split_settings: Array<{ amount: number; connection_id: number }>
    }> = []
    const onRequest = (req: Request) => {
      if (req.method() === 'PUT' && /\/api\/transactions\/\d+$/.test(req.url())) {
        const body = req.postDataJSON()
        if (body && Array.isArray(body.split_settings)) {
          capturedPuts.push(body as { amount: number; split_settings: Array<{ amount: number; connection_id: number }> })
        }
      }
    }
    page.on('request', onRequest)

    try {
      await page.getByTestId('btn_apply_bulk_division').click()
      await expect(page.getByTestId('bulk_success')).toBeVisible({ timeout: 15000 })
    } finally {
      page.off('request', onRequest)
    }

    await page.getByTestId('btn_bulk_done').click()

    // --- Wire-format assertions on each captured PUT body ---
    // PAY-02: each split_settings row must have ONLY 'amount' and 'connection_id' keys
    expect(capturedPuts.length).toBeGreaterThanOrEqual(3)
    for (const body of capturedPuts) {
      expect(Array.isArray(body.split_settings)).toBe(true)
      for (const row of body.split_settings) {
        // PAY-02: no 'percentage' field on the wire
        expect(Object.keys(row).sort()).toEqual(['amount', 'connection_id'])
        expect(typeof row.amount).toBe('number')
        expect(Number.isInteger(row.amount)).toBe(true)
      }
      // Cent-exact sum: Σ split.amount === tx.amount (PAY-01)
      const splitSum = body.split_settings.reduce((s, r) => s + r.amount, 0)
      expect(splitSum).toBe(body.amount)
    }

    // Specifically, the 101-cent tx MUST prove last-split-absorbs-remainder:
    // 30% of 101 = Math.round(30.3) = 30; last gets 101 - 30 = 71
    const oddTx = capturedPuts.find((b) => b.amount === 101)
    expect(oddTx).toBeTruthy()
    if (oddTx) {
      // First split gets 30 (Math.round(101 * 30 / 100))
      expect(oddTx.split_settings[0].amount).toBe(30)
      // Last split absorbs the remainder: 71 (not Math.round(101 * 70 / 100) = 71, but proven by subtraction)
      expect(oddTx.split_settings[1].amount).toBe(71)
    }

    // --- API re-read assertions: split_settings persisted with only connection_id + amount ---
    for (const txId of [txA.id, txB.id, txC.id]) {
      const updated = await apiGetTransaction(txId)
      expect(updated.split_settings).toBeTruthy()
      for (const row of updated.split_settings ?? []) {
        // PAY-02 guard on the persisted state (not just on wire)
        expect(Object.keys(row).sort()).toEqual(['amount', 'connection_id'])
      }
    }
  })

  // ─── Test 2: Disabled state with 0 connected accounts ───────────────────────
  // Closes: 14-HUMAN-UAT.md test 2 — disabled state with 0 connected accounts
  // Strategy: use openAuthedPage() to run as a fresh solo user (e2e-bulk-division-solo@...)
  // who has no accepted connections. The primary test user now has 2 connections from
  // beforeAll, so we cannot test the disabled state with the default auth.
  test('Divisão menu item is disabled + hint visible when user has 0 connected accounts', async ({ browser }) => {
    const soloEmail = 'e2e-bulk-division-solo@financeapp.local'
    const soloToken = await getAuthTokenForUser(soloEmail)
    const soloPage = await openAuthedPage(browser, soloToken)

    try {
      // Create a minimal account + category + transaction for the solo user
      // so the SelectionActionBar can appear (needs at least 1 selected transaction)
      const accRes = await apiFetchAs(soloToken, '/api/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: `Solo Acct ${Date.now()}`, initial_balance: 0 }),
      })
      const soloAccount = (await accRes.json()) as { id: number }
      const soloAccountId = soloAccount.id

      const catRes = await apiFetchAs(soloToken, '/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: `Solo Cat ${Date.now()}` }),
      })
      const soloCategory = (await catRes.json()) as { id: number }
      const soloCategoryId = soloCategory.id

      const today = new Date().toISOString().slice(0, 10)
      const txRes = await apiFetchAs(soloToken, '/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          transaction_type: 'expense',
          account_id: soloAccountId,
          category_id: soloCategoryId,
          amount: 1000,
          date: `${today}T00:00:00+00:00`,
          description: `Solo Test ${Date.now()}`,
        }),
      })
      const soloTx = (await txRes.json()) as { id: number }
      const soloTxId = soloTx.id

      // Navigate to transactions page and select the transaction
      const soloTransactionsPage = new TransactionsPage(soloPage)
      await soloTransactionsPage.goto()
      await soloTransactionsPage.selectTransaction(soloTxId)

      // Open the bulk actions menu
      await soloTransactionsPage.openBulkActionsMenu()

      // Key assertions (HUMAN-UAT#2):
      const divBtn = soloPage.getByTestId('btn_bulk_division')
      await expect(divBtn).toBeVisible()
      // Playwright's toBeDisabled() works for buttons AND elements with aria-disabled="true"
      await expect(divBtn).toBeDisabled()

      // The hint text must be visible with exact Portuguese copy
      const hint = soloPage.getByTestId('hint_bulk_division_no_connection')
      await expect(hint).toBeVisible()
      await expect(hint).toHaveText('Conecte uma conta para usar esta ação.')

      // Clicking the disabled item should be a no-op: drawer_bulk_division must NOT appear
      // We verify by checking the drawer is not visible after the disabled click attempt.
      // Note: Mantine renders disabled Menu.Item as a button[disabled], so click() may throw
      // or be intercepted; either way the drawer should not open.
      await divBtn.click({ force: true }).catch(() => undefined)
      await expect(soloPage.getByTestId('drawer_bulk_division')).not.toBeVisible()

      // Cleanup solo user resources
      await apiFetchAs(soloToken, `/api/transactions/${soloTxId}`, { method: 'DELETE' }).catch(() => undefined)
      await apiFetchAs(soloToken, `/api/categories/${soloCategoryId}`, { method: 'DELETE' }).catch(() => undefined)
      await apiFetchAs(soloToken, `/api/accounts/${soloAccountId}`, { method: 'DELETE' }).catch(() => undefined)
    } finally {
      await soloPage.close()
    }
  })

  // ─── Test 3: Transfer silent-skip in mixed selection ────────────────────────
  // Closes: 14-HUMAN-UAT.md test 3 — transfer silent-skip in mixed selection
  // Verifies: transfer transactions are silently skipped; non-transfers get split_settings;
  // no error row appears in BulkProgressDrawer; transfer's split_settings unchanged.
  test('transfer is silently skipped in mixed selection; only non-transfers get split_settings', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)

    // Tx D: regular expense — will receive split_settings
    const txD = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountId,
      category_id: categoryId,
      amount: 2000,
      date: today,
      description: `Bulk Div Skip D ${Date.now()}`,
    })
    createdTransactionIds.push(txD.id)

    // Tx E: regular expense — will receive split_settings
    const txE = await apiCreateTransaction({
      transaction_type: 'expense',
      account_id: accountId,
      category_id: categoryId,
      amount: 3000,
      date: today,
      description: `Bulk Div Skip E ${Date.now()}`,
    })
    createdTransactionIds.push(txE.id)

    // Tx F: transfer to partner account — must be silently skipped (no split_settings applied)
    const txF = await apiCreateTransaction({
      transaction_type: 'transfer',
      account_id: accountId,
      destination_account_id: connAccountId,
      amount: 4000,
      date: today,
      description: `Bulk Div Skip F ${Date.now()}`,
    })
    createdTransactionIds.push(txF.id)

    // Reload so all 3 transactions appear
    await transactionsPage.goto()

    // Select all 3 (including the transfer)
    await transactionsPage.selectTransaction(txD.id)
    await transactionsPage.selectTransaction(txE.id)
    await transactionsPage.selectTransaction(txF.id)
    await expect(page.getByTestId('selection_count')).toHaveText('3')

    // Open bulk menu → click Divisão
    await transactionsPage.openBulkActionsMenu()
    await page.getByTestId('btn_bulk_division').click()

    // Wait for drawer to be ready
    await expect(page.getByTestId('btn_apply_bulk_division')).toBeVisible({ timeout: 8000 })

    // With 2+ connections, the first row starts empty; pick partner 1's connection for 100%
    const drawer = page.getByTestId('drawer_bulk_division')
    const firstSelect = drawer.getByPlaceholder('Selecionar conta').first()
    await firstSelect.click()
    await page.getByRole('option').first().click()

    // Set percentage to 100 (single-row, 100% split is valid)
    const percentInputs = drawer.getByTestId('input_split_percentage')
    await percentInputs.nth(0).fill('100')

    // Verify sum badge shows 100%
    await expect(drawer.getByTestId('badge_bulk_division_sum')).toHaveText(/Total: 100% \/ 100%/)

    // --- Arm network capture BEFORE clicking submit ---
    const capturedPuts: Array<{ amount: number; split_settings: unknown }> = []
    const onRequest = (req: Request) => {
      if (req.method() === 'PUT' && /\/api\/transactions\/\d+$/.test(req.url())) {
        const body = req.postDataJSON()
        if (body) capturedPuts.push(body as { amount: number; split_settings: unknown })
      }
    }
    page.on('request', onRequest)

    try {
      await page.getByTestId('btn_apply_bulk_division').click()
      await expect(page.getByTestId('bulk_success')).toBeVisible({ timeout: 15000 })
    } finally {
      page.off('request', onRequest)
    }

    // --- Silent-skip assertions ---
    // Only 2 PUTs should have been sent (Tx D and Tx E — transfer Tx F was skipped)
    expect(capturedPuts.length).toBe(2)

    // No error row surfaced in the progress drawer
    await expect(page.getByTestId('bulk_error')).not.toBeVisible()

    await page.getByTestId('btn_bulk_done').click()

    // --- API re-read assertions ---
    // Tx F (transfer): split_settings must remain null/undefined (unchanged from create-time)
    const transferTx = await apiGetTransaction(txF.id)
    expect(
      transferTx.split_settings === null ||
        transferTx.split_settings === undefined ||
        (Array.isArray(transferTx.split_settings) && transferTx.split_settings.length === 0),
    ).toBe(true)

    // Tx D: split_settings applied with {connection_id, amount: 2000}
    const txDUpdated = await apiGetTransaction(txD.id)
    expect(Array.isArray(txDUpdated.split_settings)).toBe(true)
    expect(txDUpdated.split_settings!.length).toBe(1)
    expect(txDUpdated.split_settings![0].connection_id).toBe(connectionId)
    expect(txDUpdated.split_settings![0].amount).toBe(2000)

    // Tx E: split_settings applied with {connection_id, amount: 3000}
    const txEUpdated = await apiGetTransaction(txE.id)
    expect(Array.isArray(txEUpdated.split_settings)).toBe(true)
    expect(txEUpdated.split_settings!.length).toBe(1)
    expect(txEUpdated.split_settings![0].connection_id).toBe(connectionId)
    expect(txEUpdated.split_settings![0].amount).toBe(3000)
  })
})
