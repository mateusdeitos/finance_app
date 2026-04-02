import { type Page, type Locator, expect } from '@playwright/test'

export class AccountsPage {
  readonly page: Page
  readonly newAccountButton: Locator

  constructor(page: Page) {
    this.page = page
    this.newAccountButton = page.getByTestId('btn_new_account')
  }

  async goto() {
    await this.page.goto('/accounts')
    await expect(this.newAccountButton).toBeVisible()
  }

  async openCreateForm() {
    await this.newAccountButton.click()
    await expect(this.page.getByTestId('account_form')).toBeVisible()
  }

  async fillForm(name: string, balanceCents = 0) {
    const form = this.page.getByTestId('account_form')
    await form.getByTestId('input_account_name').fill(name)
    if (balanceCents !== 0) {
      const balanceInput = form.locator('input[inputmode="numeric"]')
      await balanceInput.click()
      for (const digit of String(balanceCents)) {
        await balanceInput.press(digit)
      }
    }
  }

  async submitForm() {
    await this.page.getByTestId('btn_account_save').click()
    await expect(this.page.getByTestId('account_form')).not.toBeVisible({ timeout: 5000 })
  }

  private getCardByName(name: string): Locator {
    return this.page.locator(`[data-account-name="${name}"]`)
  }

  async editAccount(accountName: string) {
    await this.getCardByName(accountName).getByTestId('btn_account_edit').click()
    await expect(this.page.getByTestId('account_form')).toBeVisible()
  }

  async clickAccountAction(accountName: string) {
    await this.getCardByName(accountName).getByTestId('btn_account_action').click()
  }

  async deactivateAccount(accountName: string) {
    await this.clickAccountAction(accountName)
  }

  async deleteAccount(accountName: string) {
    await this.clickAccountAction(accountName)
  }
}
