import { type Page, type Locator, expect } from '@playwright/test'

export class TransactionsPage {
  readonly page: Page
  readonly heading: Locator
  readonly addButton: Locator
  readonly formDrawer: Locator

  constructor(page: Page) {
    this.page = page
    // Transactions page doesn't have an h1, but has a "+" button
    this.addButton = page.getByRole('button', { name: 'Nova transação' }).or(
      page.locator('button[aria-label*="nova"], button[aria-label*="add"]')
    ).first()
    this.formDrawer = page.getByRole('dialog')
  }

  async goto() {
    await this.page.goto('/transactions')
    await this.page.waitForLoadState('networkidle')
  }

  async openCreateForm() {
    // The "+" FAB button on mobile or desktop button
    const plusButton = this.page.locator('button').filter({
      has: this.page.locator('svg'),
    }).last()
    // Try the labeled button first
    const namedButton = this.page.getByRole('button', { name: /Nova transação|Nova Transação|\+/i })
    if (await namedButton.isVisible()) {
      await namedButton.first().click()
    } else {
      await plusButton.click()
    }
    await expect(this.formDrawer).toBeVisible()
  }

  async selectType(type: 'expense' | 'income' | 'transfer') {
    // 'expense' is the form default — skip the click to avoid a redundant re-render.
    if (type === 'expense') return
    const labels: Record<string, string> = {
      income: 'Receita',
      transfer: 'Transferência',
    }
    // Mantine SegmentedControl hides radio inputs off-screen.
    // Click the visible <label> element that wraps the hidden radio + visible span.
    await this.formDrawer.locator('label').filter({ hasText: new RegExp(`^${labels[type]}$`) }).click()
  }

  async fillAmount(amountCents: number) {
    // CurrencyInput builds value digit-by-digit via onKeyDown (not onChange).
    // fill() doesn't trigger keydown events. We use press() for each digit
    // with a delay so React flushes state between each keypress.
    // Typing "5000" (digit-by-digit) builds: 5 → 50 → 500 → 5000 cents.

    const amountInput = this.formDrawer.getByLabel(/Valor/)
    await amountInput.click() // focus; onFocus selects all text
    for (const digit of String(amountCents)) {
      await amountInput.press(digit)
    }
  }

  async fillDescription(description: string) {
    await this.formDrawer.getByLabel(/Descrição/).fill(description)
  }

  async selectAccount(accountName: string) {
    const accountSelect = this.formDrawer.getByLabel('Conta')
    await accountSelect.click()
    // The Select is searchable — type the name to filter, then click the option.
    await accountSelect.fill(accountName)
    await this.page.getByRole('option', { name: accountName }).click()
  }

  async selectCategory(categoryName: string) {
    const categorySelect = this.formDrawer.getByLabel('Categoria')
    await categorySelect.click()
    await categorySelect.fill(categoryName)
    await this.page.getByRole('option', { name: new RegExp(categoryName) }).click()
  }

  async submitForm() {
    await this.formDrawer.getByRole('button', { name: 'Salvar' }).click()
    await expect(this.formDrawer).not.toBeVisible({ timeout: 8000 })
  }

  async fillExpense(amountCents: number, description: string, accountName: string, categoryName: string) {
    await this.selectType('expense')
    await this.fillDescription(description)
    await this.fillAmount(amountCents)
    await this.selectAccount(accountName)
    await this.selectCategory(categoryName)
  }

  async fillIncome(amountCents: number, description: string, accountName: string, categoryName: string) {
    await this.selectType('income')
    await this.fillDescription(description)
    await this.fillAmount(amountCents)
    await this.selectAccount(accountName)
    await this.selectCategory(categoryName)
  }

  async selectTransaction(transactionId: number) {
    await this.page.getByTestId(`checkbox_${transactionId}`).first().click()
  }

  async getSelectedCount(): Promise<number> {
    const text = await this.page.getByTestId('selection_count').textContent()
    const match = text?.match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }

  async confirmBulkDelete() {
    await this.page.getByTestId('btn_bulk_delete').click()
    await expect(this.page.getByTestId('bulk_delete_success')).toBeVisible({ timeout: 15000 })
    await this.page.waitForLoadState('networkidle')
  }

  async selectPropagation(option: 'Somente esta' | 'Esta e as próximas' | 'Todas') {
    const valueMap: Record<string, string> = {
      'Somente esta': 'current',
      'Esta e as próximas': 'current_and_future',
      'Todas': 'all',
    }
    await this.page.getByTestId(`propagation_option_${valueMap[option]}`).click()
    await this.page.getByTestId('btn_propagation_confirm').click()
    await expect(this.page.getByTestId('bulk_delete_success')).toBeVisible({ timeout: 15000 })
    await this.page.waitForLoadState('networkidle')
  }

  async closeBulkDeleteDrawer() {
    await this.page.getByTestId('btn_bulk_delete_done').click()
  }

  async deleteTransaction(description: string) {
    const transactionRow = this.page.locator('[class*="Group"], [class*="Stack"]').filter({ hasText: description }).first()
    await transactionRow.click()
    // Transaction detail/actions should appear
    const deleteButton = this.page.getByRole('button', { name: /Excluir|Deletar/ })
    await expect(deleteButton).toBeVisible()
    await deleteButton.click()
    // Confirm if dialog appears
    const confirmButton = this.page.getByRole('button', { name: /Confirmar|Excluir/ }).last()
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
    await this.page.waitForLoadState('networkidle')
  }

  async getTransactionDescriptions(): Promise<string[]> {
    await this.page.waitForLoadState('networkidle')
    // Transaction descriptions appear as text in transaction list items
    const items = this.page.locator('[class*="transaction"], [class*="Transaction"]').locator('text=/\\w+/')
    const count = await items.count()
    const descriptions: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent()
      if (text?.trim()) descriptions.push(text.trim())
    }
    return descriptions
  }
}
