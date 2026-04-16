import { test, expect } from '@playwright/test'
import { ChargesPage } from '../pages/ChargesPage'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCharge,
  apiCancelCharge,
  apiCreateUserConnection,
  getAuthTokenForUser,
  apiFetchAs,
} from '../helpers/api'

/**
 * Charges E2E Tests
 *
 * These tests require a two-user setup: the primary test user (charger)
 * creates charges against a partner user (payer). The partner is created
 * via test-login and connected via the user-connections API.
 *
 * The primary user is already authenticated via global-setup.
 * The partner user is set up in beforeAll via API calls.
 */

const PARTNER_EMAIL = 'e2e-partner@financeapp.local'
const now = new Date()
const PERIOD_MONTH = now.getMonth() + 1
const PERIOD_YEAR = now.getFullYear()

test.describe('Charges', () => {
  let chargesPage: ChargesPage
  let primaryAccountId: number
  let primaryAccountName: string
  let partnerToken: string
  let partnerAccountId: number
  let connectionId: number
  const createdChargeIds: number[] = []

  test.beforeAll(async () => {
    // 1. Create a primary user account
    primaryAccountName = `Conta Cobranças ${Date.now()}`
    const account = await apiCreateAccount({ name: primaryAccountName, initial_balance: 0 })
    primaryAccountId = account.id

    // 2. Auth as partner, create their account
    partnerToken = await getAuthTokenForUser(PARTNER_EMAIL)
    const partnerAccountRes = await apiFetchAs(partnerToken, '/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: `Partner Account ${Date.now()}`, initial_balance: 0 }),
    })
    const partnerAccount = await partnerAccountRes.json()
    partnerAccountId = partnerAccount.id

    // 3. Get partner user ID
    const meRes = await apiFetchAs(partnerToken, '/api/me')
    const partnerUser = await meRes.json()

    // 4. Primary user creates connection to partner
    const conn = await apiCreateUserConnection(partnerUser.id, 50)
    connectionId = conn.id

    // 5. Partner accepts the connection
    await apiFetchAs(partnerToken, `/api/user-connections/${connectionId}/accepted`, {
      method: 'PATCH',
    })
  })

  test.afterAll(async () => {
    // Clean up charges
    for (const id of createdChargeIds) {
      await apiCancelCharge(id).catch(() => undefined)
    }
    // Clean up accounts
    await apiDeleteAccount(primaryAccountId).catch(() => undefined)
    await apiFetchAs(partnerToken, `/api/accounts/${partnerAccountId}`, {
      method: 'DELETE',
    }).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    chargesPage = new ChargesPage(page)
    await chargesPage.gotoMonth(PERIOD_MONTH, PERIOD_YEAR)
  })

  test('navigate to charges page and see tabs', async () => {
    await expect(chargesPage.page.getByRole('tab', { name: 'Recebidas' })).toBeVisible()
    await expect(chargesPage.page.getByRole('tab', { name: 'Enviadas' })).toBeVisible()
  })

  test('show empty state when no charges exist', async () => {
    await chargesPage.selectSentTab()
    // One of these should be visible depending on tab
    const emptyMsg = chargesPage.page.getByText(/Nenhuma cobranca/)
    await expect(emptyMsg).toBeVisible({ timeout: 5000 })
  })

  test('create a charge and see it in sent tab', async ({ page }) => {
    const description = `Cobranca E2E ${Date.now()}`

    await chargesPage.openCreateDrawer()
    await chargesPage.fillCreateForm({
      accountName: primaryAccountName,
      description,
    })
    await chargesPage.submitCreate()

    // Notification
    await chargesPage.expectNotification(/Cobranca criada/)

    // Charge visible in sent tab
    await chargesPage.selectSentTab()
    await expect(page.getByText(description)).toBeVisible({ timeout: 5000 })
  })

  test('reject a received charge', async ({ page, context }) => {
    // Create a charge from partner → primary user (primary is the payer)
    const description = `Reject Test ${Date.now()}`
    const chargeRes = await apiFetchAs(partnerToken, '/api/charges', {
      method: 'POST',
      body: JSON.stringify({
        connection_id: connectionId,
        my_account_id: partnerAccountId,
        period_month: PERIOD_MONTH,
        period_year: PERIOD_YEAR,
        description,
        date: new Date().toISOString(),
      }),
    })
    const charge = await chargeRes.json()
    createdChargeIds.push(charge.id)

    // Reload charges page as primary user (who is the payer)
    await chargesPage.gotoMonth(PERIOD_MONTH, PERIOD_YEAR)
    await chargesPage.selectReceivedTab()

    await chargesPage.clickReject(description)
    await chargesPage.confirmReject()

    await chargesPage.expectNotification(/Cobranca recusada/)
  })

  test('cancel a sent charge', async ({ page }) => {
    const description = `Cancel Test ${Date.now()}`

    // Primary user creates a charge (primary is charger, partner is payer)
    const chargePayload = {
      connection_id: connectionId,
      my_account_id: primaryAccountId,
      period_month: PERIOD_MONTH,
      period_year: PERIOD_YEAR,
      description,
      date: new Date().toISOString(),
    }
    const charge = await apiCreateCharge(chargePayload)
    createdChargeIds.push(charge.id)

    // Reload and find in sent tab
    await chargesPage.gotoMonth(PERIOD_MONTH, PERIOD_YEAR)
    await chargesPage.selectSentTab()

    await chargesPage.clickCancel(description)
    await chargesPage.confirmCancel()

    await chargesPage.expectNotification(/Cobranca cancelada/)
  })

  test('sidebar badge shows pending count', async ({ page }) => {
    // Create a charge from partner where primary is payer
    const description = `Badge Test ${Date.now()}`
    await apiFetchAs(partnerToken, '/api/charges', {
      method: 'POST',
      body: JSON.stringify({
        connection_id: connectionId,
        my_account_id: partnerAccountId,
        period_month: PERIOD_MONTH,
        period_year: PERIOD_YEAR,
        description,
        date: new Date().toISOString(),
      }),
    })

    // Reload and check badge
    await chargesPage.gotoMonth(PERIOD_MONTH, PERIOD_YEAR)

    // Badge should show at least 1
    const badge = page.locator('nav').locator('[class*="badge"], [class*="Badge"]')
    await expect(badge).toBeVisible({ timeout: 5000 })
  })
})
