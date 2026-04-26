import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateTransaction,
  apiDeleteTransaction,
  apiGetTransaction,
} from '../helpers/api'
import { TransactionsTestIds } from '@/testIds'

test.describe('Transfer Transactions', () => {
  let transactionsPage: TransactionsPage
  let sourceAccountId: number
  let sourceAccountName: string
  let destAccountId: number
  let destAccountName: string
  const createdTransactionIds: number[] = []

  test.beforeAll(async () => {
    sourceAccountName = `Origem Transfer ${Date.now()}`
    const source = await apiCreateAccount({ name: sourceAccountName, initial_balance: 0 })
    sourceAccountId = source.id

    destAccountName = `Destino Transfer ${Date.now()}`
    const dest = await apiCreateAccount({ name: destAccountName, initial_balance: 0 })
    destAccountId = dest.id
  })

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined)
    }
    await apiDeleteAccount(sourceAccountId).catch(() => undefined)
    await apiDeleteAccount(destAccountId).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    transactionsPage = new TransactionsPage(page)
    await transactionsPage.goto()
  })

  test('create a transfer transaction', async ({ page }) => {
    const description = `Transferência Teste ${Date.now()}`

    await transactionsPage.openCreateForm()
    await transactionsPage.fillTransfer(20000, description, sourceAccountId, destAccountId)
    await transactionsPage.submitForm()

    // A transfer creates two rows (debit + credit) with the same description
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 8000 })
  })

  test('transfer form shows source and destination account selects', async ({ page }) => {
    await transactionsPage.openCreateForm()
    await transactionsPage.selectType('transfer')

    await expect(page.getByTestId(TransactionsTestIds.SelectAccount)).toBeVisible()
    await expect(page.getByTestId(TransactionsTestIds.SelectDestinationAccount)).toBeVisible()
    // Category selector must NOT appear for transfers
    await expect(page.getByTestId(TransactionsTestIds.SelectCategory)).not.toBeVisible()
  })

  test('editing the credit side of a same-user transfer opens the debit (origin) side', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const description = `Transfer Origin ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'transfer',
      account_id: sourceAccountId,
      destination_account_id: destAccountId,
      amount: 5000, // R$ 50,00
      date: today,
      description,
    })
    createdTransactionIds.push(tx.id)

    // apiCreateTransaction returns the debit-side id; fetch to resolve the
    // linked credit-side id so we can click that specific row.
    const debitSide = await apiGetTransaction(tx.id)
    const creditSideId = debitSide.linked_transactions?.[0]?.id
    expect(creditSideId, 'expected credit-side linked transaction').toBeTruthy()

    await transactionsPage.goto()
    await expect(page.getByText(description).first()).toBeVisible()

    // Click the credit-side (destination) row. The fix should swap the edit
    // target to the debit (origin) side, so the form is populated with the
    // source account as "Conta" and destination account as "Conta de destino"
    // — not the other way around.
    await page
      .locator(`[data-transaction-id="${creditSideId}"]`)
      .getByText(description)
      .click()
    await transactionsPage.waitForUpdateDrawer()

    await expect(
      transactionsPage.updateDrawer.getByTestId(TransactionsTestIds.SelectAccount),
    ).toHaveValue(sourceAccountName)
    await expect(
      transactionsPage.updateDrawer.getByTestId(TransactionsTestIds.SelectDestinationAccount),
    ).toHaveValue(destAccountName)

    // Change a restricted-on-linked-tx field (amount). Without the fix, the
    // drawer would have loaded the credit-side transaction and the backend
    // would reject this save as a linked-transaction edit.
    await transactionsPage.clearAndFillAmount(8800) // R$ 88,00
    await transactionsPage.submitUpdate()

    // Updating the amount rebuilds the credit-side linked transaction with a
    // new id, so re-fetch the debit side to resolve the current credit id.
    const updatedDebit = await apiGetTransaction(tx.id)
    const newCreditSideId = updatedDebit.linked_transactions?.[0]?.id
    expect(newCreditSideId, 'expected new credit-side linked transaction').toBeTruthy()

    await expect(
      page.locator(`[data-transaction-id="${tx.id}"]`).getByText(/88,00/),
    ).toBeVisible({ timeout: 8000 })
    await expect(
      page.locator(`[data-transaction-id="${newCreditSideId}"]`).getByText(/88,00/),
    ).toBeVisible({ timeout: 8000 })
  })

  test('update transfer description', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const originalDesc = `Transfer Update Orig ${Date.now()}`
    const updatedDesc = `Transfer Update New ${Date.now()}`

    const tx = await apiCreateTransaction({
      transaction_type: 'transfer',
      account_id: sourceAccountId,
      destination_account_id: destAccountId,
      amount: 5000,
      date: today,
      description: originalDesc,
    })
    createdTransactionIds.push(tx.id)

    await transactionsPage.goto()
    // Transfer creates two rows with the same description
    await expect(page.getByText(originalDesc).first()).toBeVisible()

    // Click the description text within the specific row to reliably open the edit drawer.
    // Clicking the row center is not reliable for transfers since the layout differs.
    await page.locator(`[data-transaction-id="${tx.id}"]`).getByText(originalDesc).click()
    await transactionsPage.waitForUpdateDrawer()
    await transactionsPage.clearAndFillDescription(updatedDesc)
    await transactionsPage.submitUpdate()

    await expect(page.getByText(updatedDesc).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(originalDesc).first()).not.toBeVisible()
  })
})
