import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import {
  apiCreateAccount,
  apiCreateCategory,
  apiCreateTransaction,
  getAuthTokenForUser,
  openAuthedPage,
} from '../helpers/api'
import { TransactionsTestIds } from '@/testIds'

const today = new Date().toISOString().slice(0, 10)

/**
 * Issue #151 — selecting a description suggestion must not overwrite fields the
 * user has already edited manually. Each test creates a fresh user with its own
 * source transaction (the row the autocomplete suggests).
 */
test.describe('Description autocomplete — dirty-field preservation', () => {
  // ── AC1: manually-entered amount is preserved ──────────────────────────────
  test('preserves the amount typed before selecting a suggestion', async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-autocomplete-amount-${Date.now()}@financeapp.local`)
    const account = await apiCreateAccount({ name: 'Conta Auto', initial_balance: 0 }, { token })
    const sourceCategory = await apiCreateCategory({ name: 'Categoria Fonte' }, { token })
    const sourceDesc = `Fonte Amount ${Date.now()}`
    await apiCreateTransaction(
      {
        transaction_type: 'expense',
        account_id: account.id,
        category_id: sourceCategory.id,
        amount: 12345,
        date: today,
        description: sourceDesc,
      },
      { token },
    )

    const page = await openAuthedPage(browser, token)
    const txPage = new TransactionsPage(page)
    await txPage.goto()
    await txPage.openCreateForm()

    // User sets the amount manually, then picks a suggestion.
    await txPage.fillAmount(99999)
    await txPage.pickDescriptionSuggestion(sourceDesc)

    // Amount is preserved; the untouched category is filled from the suggestion.
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.InputAmount)).toHaveValue('999,99')
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.SelectCategory)).toHaveValue(
      'Categoria Fonte',
    )

    await page.close()
  })

  // ── AC2: manually-selected category is preserved ───────────────────────────
  test('preserves the category selected before choosing a suggestion', async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-autocomplete-category-${Date.now()}@financeapp.local`)
    const account = await apiCreateAccount({ name: 'Conta Auto', initial_balance: 0 }, { token })
    const sourceCategory = await apiCreateCategory({ name: 'Categoria Fonte' }, { token })
    const userCategory = await apiCreateCategory({ name: 'Categoria Escolhida' }, { token })
    const sourceDesc = `Fonte Category ${Date.now()}`
    await apiCreateTransaction(
      {
        transaction_type: 'expense',
        account_id: account.id,
        category_id: sourceCategory.id,
        amount: 12345,
        date: today,
        description: sourceDesc,
      },
      { token },
    )

    const page = await openAuthedPage(browser, token)
    const txPage = new TransactionsPage(page)
    await txPage.goto()
    await txPage.openCreateForm()

    // User picks a category manually, then picks a suggestion.
    await txPage.selectCategory(userCategory.id)
    await txPage.pickDescriptionSuggestion(sourceDesc)

    // Category is preserved; the untouched amount is filled from the suggestion.
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.SelectCategory)).toHaveValue(
      'Categoria Escolhida',
    )
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.InputAmount)).toHaveValue('123,45')

    await page.close()
  })

  // ── AC3: untouched fields are still filled by the suggestion ───────────────
  test('fills every untouched field from the suggestion', async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-autocomplete-untouched-${Date.now()}@financeapp.local`)
    const account = await apiCreateAccount({ name: 'Conta Auto', initial_balance: 0 }, { token })
    const sourceCategory = await apiCreateCategory({ name: 'Categoria Fonte' }, { token })
    const sourceDesc = `Fonte Untouched ${Date.now()}`
    // Source is an income so the transaction type also visibly changes.
    await apiCreateTransaction(
      {
        transaction_type: 'income',
        account_id: account.id,
        category_id: sourceCategory.id,
        amount: 12345,
        date: today,
        description: sourceDesc,
      },
      { token },
    )

    const page = await openAuthedPage(browser, token)
    const txPage = new TransactionsPage(page)
    await txPage.goto()
    await txPage.openCreateForm()

    // Only the description is touched; everything else is picked from the suggestion.
    await txPage.pickDescriptionSuggestion(sourceDesc)

    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.InputAmount)).toHaveValue('123,45')
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.SelectCategory)).toHaveValue(
      'Categoria Fonte',
    )
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.SelectAccount)).toHaveValue(
      'Conta Auto',
    )
    const segmented = txPage.formDrawer.getByTestId(TransactionsTestIds.SegmentedTransactionType)
    await expect(segmented.locator('[data-active]').first()).toContainText('Receita')

    await page.close()
  })

  // ── AC5: an account already present on the form is never overwritten ───────
  // Uses the single-account list filter to pre-fill the account as a *default*
  // (not user-touched / not dirty) — the case the suggestion used to clobber.
  test('preserves the pre-filled default account before choosing a suggestion', async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-autocomplete-account-${Date.now()}@financeapp.local`)
    const sourceAccount = await apiCreateAccount({ name: 'Conta Fonte', initial_balance: 0 }, { token })
    const defaultAccount = await apiCreateAccount({ name: 'Conta Padrao', initial_balance: 0 }, { token })
    const sourceCategory = await apiCreateCategory({ name: 'Categoria Fonte' }, { token })
    const sourceDesc = `Fonte Account ${Date.now()}`
    // The suggested source transaction lives on `sourceAccount`.
    await apiCreateTransaction(
      {
        transaction_type: 'expense',
        account_id: sourceAccount.id,
        category_id: sourceCategory.id,
        amount: 12345,
        date: today,
        description: sourceDesc,
      },
      { token },
    )

    const page = await openAuthedPage(browser, token)
    const txPage = new TransactionsPage(page)
    await txPage.goto()

    // Filter to `defaultAccount`, so the create form opens defaulted to it.
    await txPage.filterByAccount(defaultAccount.id)
    await txPage.openCreateForm()
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.SelectAccount)).toHaveValue(
      'Conta Padrao',
    )

    // Pick a suggestion whose source is a different account.
    await txPage.pickDescriptionSuggestion(sourceDesc)

    // The pre-filled default account is preserved; the untouched category fills.
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.SelectAccount)).toHaveValue(
      'Conta Padrao',
    )
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.SelectCategory)).toHaveValue(
      'Categoria Fonte',
    )

    await page.close()
  })

  // ── AC4: the same rule holds while editing an existing transaction ─────────
  test('preserves a manually-edited field when editing a transaction', async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-autocomplete-edit-${Date.now()}@financeapp.local`)
    const account = await apiCreateAccount({ name: 'Conta Auto', initial_balance: 0 }, { token })
    const sourceCategory = await apiCreateCategory({ name: 'Categoria Fonte' }, { token })
    const targetCategory = await apiCreateCategory({ name: 'Categoria Alvo' }, { token })

    const sourceDesc = `Fonte Edit ${Date.now()}`
    await apiCreateTransaction(
      {
        transaction_type: 'expense',
        account_id: account.id,
        category_id: sourceCategory.id,
        amount: 22200,
        date: today,
        description: sourceDesc,
      },
      { token },
    )

    const targetTx = await apiCreateTransaction(
      {
        transaction_type: 'expense',
        account_id: account.id,
        category_id: targetCategory.id,
        amount: 11100,
        date: today,
        description: `Alvo Edit ${Date.now()}`,
      },
      { token },
    )

    const page = await openAuthedPage(browser, token)
    const txPage = new TransactionsPage(page)
    await txPage.goto()
    await txPage.clickTransactionRow(targetTx.id)

    // User edits the amount, then picks a suggestion in the update drawer.
    await txPage.clearAndFillAmount(55500)
    await txPage.pickDescriptionSuggestion(sourceDesc, txPage.updateDrawer)

    // Edited amount is preserved; the untouched category takes the suggestion value.
    await expect(txPage.updateDrawer.getByTestId(TransactionsTestIds.InputAmount)).toHaveValue(
      '555,00',
    )
    await expect(txPage.updateDrawer.getByTestId(TransactionsTestIds.SelectCategory)).toHaveValue(
      'Categoria Fonte',
    )

    await page.close()
  })
})
