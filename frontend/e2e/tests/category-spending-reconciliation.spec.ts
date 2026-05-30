import { test, expect } from '@playwright/test'
import { createUserAndPartner } from '../helpers/createUserAndPartner'
import { apiFetchAs, apiCreateTransaction, openAuthedPage } from '../helpers/api'
import { CategoriesTestIds } from '@/testIds'
import { Transactions } from '@/types/transactions'

/**
 * Reconciliation: the Categories page spending totals for a period must equal
 * the expense balance derived from the transaction list for the same period,
 * INCLUDING settlements from split/shared transactions on both ends, and
 * DISREGARDING transfers. Income is present as a negative control (it is not
 * spending and must not appear in any category total).
 *
 * A split/shared expense records the full amount on the payer's source
 * transaction plus a `credit` settlement for the partner's share coming back,
 * so the payer's real spend = source amount − settlement credit, attributed to
 * the source transaction's category.
 */

const MONTH = 5
const YEAR = 2026
const DATE = `${YEAR}-0${MONTH}-15` // 2026-05-15

/** "R$ 1.234,56" → 123456 cents. */
function parseBRLToCents(text: string): number {
  const digits = text.replace(/[^\d,]/g, '')
  const [int, dec = ''] = digits.split(',')
  return parseInt(int || '0', 10) * 100 + parseInt((dec + '00').slice(0, 2), 10)
}

async function createCategory(token: string, name: string): Promise<number> {
  const res = await apiFetchAs(token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return ((await res.json()) as { id: number }).id
}

async function createAccount(token: string, name: string): Promise<number> {
  const res = await apiFetchAs(token, '/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name, initial_balance: 0 }),
  })
  return ((await res.json()) as { id: number }).id
}

test('Categories spending reconciles with the transaction-list expense balance for the period', async ({
  browser,
}) => {
  const setup = await createUserAndPartner('e2e-cat-recon')
  const stamp = Date.now()

  // Categories for user A
  const mercado = await createCategory(setup.userToken, `Mercado ${stamp}`)
  const restaurante = await createCategory(setup.userToken, `Restaurante ${stamp}`)
  const salario = await createCategory(setup.userToken, `Salário ${stamp}`)
  // Partner B needs its own category for the split it originates.
  const bCat = await createCategory(setup.partnerToken, `BCat ${stamp}`)

  // A second private account for A so we can record an own-account transfer.
  const aSecond = await createAccount(setup.userToken, `Conta 2 ${stamp}`)

  // ── Period transactions ───────────────────────────────────────────────────
  // Normal expenses.
  await apiCreateTransaction(
    { transaction_type: 'expense', account_id: setup.userAccountId, category_id: mercado, amount: 30000, date: DATE, description: 'Mercado' },
    { token: setup.userToken },
  )
  await apiCreateTransaction(
    { transaction_type: 'expense', account_id: setup.userAccountId, category_id: restaurante, amount: 20000, date: DATE, description: 'Restaurante' },
    { token: setup.userToken },
  )
  // Income — negative control: must not count as spend.
  await apiCreateTransaction(
    { transaction_type: 'income', account_id: setup.userAccountId, category_id: salario, amount: 100000, date: DATE, description: 'Salário' },
    { token: setup.userToken },
  )
  // Transfer between A's own accounts — negative control: disregarded.
  await apiCreateTransaction(
    { transaction_type: 'transfer', account_id: setup.userAccountId, destination_account_id: aSecond, amount: 15000, date: DATE, description: 'Transferência' },
    { token: setup.userToken },
  )
  // Split expense by A: full R$400 on Restaurante, 50% to the partner → a R$200
  // credit settlement comes back, so A's real Restaurante spend from this is R$200.
  await apiCreateTransaction(
    {
      transaction_type: 'expense', account_id: setup.userAccountId, category_id: restaurante, amount: 40000, date: DATE,
      description: 'Jantar dividido', split_settings: [{ connection_id: setup.connectionId, percentage: 50 }],
    },
    { token: setup.userToken },
  )
  // Split expense originated by B (the other end): A receives a category-less
  // linked income for its share — must not count toward A's spending.
  await apiCreateTransaction(
    {
      transaction_type: 'expense', account_id: setup.partnerAccountId, category_id: bCat, amount: 10000, date: DATE,
      description: 'Split do parceiro', split_settings: [{ connection_id: setup.connectionId, percentage: 50 }],
    },
    { token: setup.partnerToken },
  )

  // ── Reference: reduce A's transaction list (source of truth) the same way ──
  const listRes = await apiFetchAs(
    setup.userToken,
    `/api/transactions?month=${MONTH}&year=${YEAR}&with_settlements=true`,
  )
  const txns = (await listRes.json()) as Transactions.Transaction[]
  const expectedByCat = new Map<number, number>()
  for (const t of txns) {
    if (t.type !== 'expense' || t.category_id == null) continue
    let amount = Math.abs(t.amount)
    for (const s of t.settlements_from_source ?? []) {
      amount += s.type === 'credit' ? -s.amount : s.amount
    }
    expectedByCat.set(t.category_id, (expectedByCat.get(t.category_id) ?? 0) + amount)
  }
  const expectedTotal = [...expectedByCat.values()].reduce((sum, v) => sum + v, 0)

  // Sanity-pin the scenario to hand-computed figures.
  expect(expectedByCat.get(mercado) ?? 0).toBe(30000)
  expect(expectedByCat.get(restaurante) ?? 0).toBe(40000) // 20000 normal + (40000 − 20000 settlement)
  expect(expectedByCat.has(salario)).toBe(false) // income excluded
  expect(expectedTotal).toBe(70000)

  // ── Categories page (user A) must match the transaction-list reduction ────
  const page = await openAuthedPage(browser, setup.userToken)
  try {
    await page.goto(`/categories?month=${MONTH}&year=${YEAR}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId(CategoriesTestIds.DistributionPanel)).toBeVisible()

    const totalText = await page.getByTestId(CategoriesTestIds.DistributionTotal).innerText()
    expect(parseBRLToCents(totalText)).toBe(expectedTotal)

    const mercadoText = await page.getByTestId(CategoriesTestIds.CardTotal(mercado)).innerText()
    expect(parseBRLToCents(mercadoText)).toBe(expectedByCat.get(mercado) ?? 0)

    const restauranteText = await page.getByTestId(CategoriesTestIds.CardTotal(restaurante)).innerText()
    expect(parseBRLToCents(restauranteText)).toBe(expectedByCat.get(restaurante) ?? 0)

    // Income category renders but shows zero spend.
    const salarioText = await page.getByTestId(CategoriesTestIds.CardTotal(salario)).innerText()
    expect(parseBRLToCents(salarioText)).toBe(0)
  } finally {
    await page.close()
  }
})
