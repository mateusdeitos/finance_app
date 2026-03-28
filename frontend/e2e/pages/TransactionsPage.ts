import { type Page, type Locator, expect } from '@playwright/test'

export class TransactionsPage {
  readonly page: Page
  readonly formDrawer: Locator

  constructor(page: Page) {
    this.page = page
    this.formDrawer = page.getByRole('dialog')
  }

  async goto() {
    await this.page.goto('/transactions')
    await this.page.waitForLoadState('networkidle')
  }

  async openCreateForm() {
    await this.page.getByTestId('btn_new_transaction').first().click()
    await expect(this.formDrawer).toBeVisible()
  }

  async selectType(type: 'expense' | 'income' | 'transfer') {
    if (type === 'expense') return
    const labels: Record<string, string> = {
      income: 'Receita',
      transfer: 'Transferência',
    }
    await this.page.getByTestId('segmented_transaction_type').getByText(labels[type]).click()
  }

  async fillAmount(amountCents: number) {
    const amountInput = this.page.getByTestId('input_amount')
    await amountInput.click()
    for (const digit of String(amountCents)) {
      await amountInput.press(digit)
    }
  }

  async fillDescription(description: string) {
    await this.page.getByTestId('input_description').fill(description)
  }

  async selectAccount(accountName: string) {
    const input = this.page.getByTestId('select_account').locator('input')
    await input.click()
    await input.fill(accountName)
    await this.page.getByRole('option', { name: accountName }).click()
  }

  async selectCategory(categoryName: string) {
    const input = this.page.getByTestId('select_category').locator('input')
    await input.click()
    await input.fill(categoryName)
    await this.page.getByRole('option', { name: new RegExp(categoryName) }).click()
  }

  async submitForm() {
    await this.page.getByTestId('btn_save_transaction').click()
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
