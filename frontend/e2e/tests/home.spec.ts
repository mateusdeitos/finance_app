import { test, expect } from '@playwright/test'
import {
  apiFetchAs,
  apiCreateTransaction,
  getAuthTokenForUser,
  openAuthedPage,
} from '../helpers/api'
import { HomePage } from '../pages/HomePage'
import { HomeTestIds } from '@/testIds'

const MONTH = 4
const YEAR = 2026
const DATE = `${YEAR}-0${MONTH}-15` // 2026-04-15

async function createAccount(token: string, name: string): Promise<number> {
  const res = await apiFetchAs(token, '/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name, initial_balance: 100000 }),
  })
  return ((await res.json()) as { id: number }).id
}

async function createCategory(token: string, name: string): Promise<number> {
  const res = await apiFetchAs(token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return ((await res.json()) as { id: number }).id
}

test('home dashboard renders period summaries and account rows deep-link to the filtered transactions', async ({
  browser,
}) => {
  const stamp = Date.now()
  const token = await getAuthTokenForUser(`e2e-home-${stamp}@financeapp.local`)

  const accountId = await createAccount(token, `Conta Home ${stamp}`)
  const foodCat = await createCategory(token, `Alimentação ${stamp}`)
  const salaryCat = await createCategory(token, `Salário ${stamp}`)

  // An expense (feeds the category pie + income/expense flow).
  await apiCreateTransaction(
    {
      transaction_type: 'expense',
      account_id: accountId,
      category_id: foodCat,
      amount: 25000,
      date: DATE,
      description: `Supermercado ${stamp}`,
    },
    { token },
  )
  // An income (feeds the Sankey income flow).
  await apiCreateTransaction(
    {
      transaction_type: 'income',
      account_id: accountId,
      category_id: salaryCat,
      amount: 500000,
      date: DATE,
      description: `Salário ${stamp}`,
    },
    { token },
  )
  // A recurring expense whose first installment lands in the period.
  await apiCreateTransaction(
    {
      transaction_type: 'expense',
      account_id: accountId,
      category_id: foodCat,
      amount: 12000,
      date: DATE,
      description: `Assinatura ${stamp}`,
      recurrence_settings: { type: 'monthly', current_installment: 1, total_installments: 3 },
    },
    { token },
  )

  const page = await openAuthedPage(browser, token)
  const home = new HomePage(page)
  await home.goto(MONTH, YEAR)

  // All dashboard sections are present.
  await expect(home.section(HomeTestIds.AccountBalancesSection)).toBeVisible()
  await expect(home.section(HomeTestIds.ExpenseChartSection)).toBeVisible()
  await expect(home.section(HomeTestIds.IncomeFlowSection)).toBeVisible()
  await expect(home.section(HomeTestIds.RecurringStartingSection)).toBeVisible()

  // Expense category appears in the pie legend.
  await expect(home.section(HomeTestIds.ExpenseChartSection)).toContainText(`Alimentação ${stamp}`)

  // The recurring expense starting this period is listed.
  await expect(home.section(HomeTestIds.RecurringStartingSection)).toContainText(`Assinatura ${stamp}`)

  // Clicking an account row deep-links to its filtered transaction list.
  await home.accountRow(accountId).click()
  await expect(page).toHaveURL(/\/transactions\?.*accountIds/)
  await expect(page).toHaveURL(new RegExp(String(accountId)))

  await page.close()
})
