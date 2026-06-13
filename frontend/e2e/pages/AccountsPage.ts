import { type Page, type Locator, expect } from '@playwright/test'
import { AccountsTestIds } from '@/testIds'
import { CurrencyField, TextField } from '../helpers/formFields'

export class AccountsPage {
  readonly page: Page
  readonly newAccountButton: Locator

  constructor(page: Page) {
    this.page = page
    this.newAccountButton = page.getByTestId(AccountsTestIds.BtnNew)
  }

  async goto() {
    await this.page.goto('/accounts')
    await expect(this.newAccountButton).toBeVisible()
  }

  async openCreateForm() {
    await this.newAccountButton.click()
    await expect(this.page.getByTestId(AccountsTestIds.Form)).toBeVisible()
  }

  async fillForm(name: string, balanceCents = 0) {
    const form = this.page.getByTestId(AccountsTestIds.Form)
    await new TextField(form, AccountsTestIds.InputName).fill(name)
    if (balanceCents !== 0) {
      await new CurrencyField(form, AccountsTestIds.InputInitialBalance).fillCents(balanceCents)
    }
  }

  async submitForm() {
    await this.page.getByTestId(AccountsTestIds.BtnSave).click()
    await expect(this.page.getByTestId(AccountsTestIds.Form)).not.toBeVisible({ timeout: 5000 })
  }

  private getCardByName(name: string): Locator {
    return this.page.locator(`[data-account-name="${name}"]`)
  }

  async editAccount(accountName: string) {
    await this.getCardByName(accountName).getByTestId(AccountsTestIds.BtnEdit).click()
    await expect(this.page.getByTestId(AccountsTestIds.Form)).toBeVisible()
  }

  async deactivateAccount(accountName: string) {
    await this.getCardByName(accountName).getByTestId(AccountsTestIds.BtnDeactivate).click()
  }

  /**
   * Hard-deletes an account. For an account with no transactions the delete is
   * immediate; otherwise a drawer prompts for a strategy (not handled here).
   */
  async deleteAccount(accountName: string) {
    await this.getCardByName(accountName).getByTestId(AccountsTestIds.BtnDelete).click()
  }

  async reactivateAccount(accountName: string) {
    await this.getCardByName(accountName).getByTestId(AccountsTestIds.BtnActivate).click()
  }

  async moveAccountUp(accountName: string) {
    await this.getCardByName(accountName).getByTestId(AccountsTestIds.BtnMoveUp).click()
  }

  async moveAccountDown(accountName: string) {
    await this.getCardByName(accountName).getByTestId(AccountsTestIds.BtnMoveDown).click()
  }
}
