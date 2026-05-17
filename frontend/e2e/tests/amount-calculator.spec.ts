import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategory,
  apiDeleteCategory,
} from '../helpers/api'

test.describe('Amount calculator', () => {
  let transactionsPage: TransactionsPage
  let testAccountId: number
  let testCategoryId: number

  test.beforeAll(async () => {
    const account = await apiCreateAccount({
      name: `Conta Calculadora ${Date.now()}`,
      initial_balance: 0,
    })
    testAccountId = account.id

    const category = await apiCreateCategory({ name: `Categoria Calc ${Date.now()}` })
    testCategoryId = category.id
  })

  test.afterAll(async () => {
    await apiDeleteAccount(testAccountId).catch(() => undefined)
    await apiDeleteCategory(testCategoryId).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    transactionsPage = new TransactionsPage(page)
    await transactionsPage.goto()
  })

  test('computes a sum in the calculator and applies it to the amount', async () => {
    const description = `Despesa Calc ${Date.now()}`

    await transactionsPage.openCreateForm()
    await transactionsPage.selectType('expense')
    await transactionsPage.fillDescription(description)

    // 10,00 + 5,00 = 15,00 — operands entered cents-style (1000 + 500 cents).
    await transactionsPage.openAmountCalculator()
    await transactionsPage.pressCalculatorKeys([
      '1', '0', '0', '0',
      'add',
      '5', '0', '0',
      'equals',
    ])
    await transactionsPage.applyCalculator()

    expect(await transactionsPage.getAmountValue()).toBe('15,00')

    await transactionsPage.selectAccount(testAccountId)
    await transactionsPage.selectCategory(testCategoryId)
    await transactionsPage.submitForm()

    await expect(transactionsPage.page.getByText(description)).toBeVisible()
  })

  test('preloads the current amount and multiplies it', async () => {
    await transactionsPage.openCreateForm()
    await transactionsPage.selectType('expense')
    await transactionsPage.fillAmount(2000) // R$ 20,00

    await transactionsPage.openAmountCalculator()
    // The calculator opens preloaded with the input's current value.
    expect(await transactionsPage.getCalculatorDisplay()).toContain('20,00')

    // 20,00 x 2,00 = 40,00
    await transactionsPage.pressCalculatorKeys(['mul', '2', '0', '0', 'equals'])
    await transactionsPage.applyCalculator()

    expect(await transactionsPage.getAmountValue()).toBe('40,00')
  })

  test('discards the result when the calculator is dismissed', async () => {
    await transactionsPage.openCreateForm()
    await transactionsPage.selectType('expense')
    await transactionsPage.fillAmount(2500) // R$ 25,00

    await transactionsPage.openAmountCalculator()
    await transactionsPage.pressCalculatorKeys(['9', '9', '9'])
    await transactionsPage.dismissCalculator()

    // ESC discards — the amount input keeps its original value.
    expect(await transactionsPage.getAmountValue()).toBe('25,00')
  })
})
