import { type Page, type Locator, expect } from '@playwright/test'
import { AccountsTestIds } from '@/testIds'
import { fillCurrencyCents, fillText } from '../helpers/formFields'

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
    await fillText(form, AccountsTestIds.InputName, name)
    if (balanceCents !== 0) {
      await fillCurrencyCents(form, AccountsTestIds.InputInitialBalance, balanceCents)
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

  async clickAccountAction(accountName: string) {
    await this.getCardByName(accountName).getByTestId(AccountsTestIds.BtnAction).click()
  }

  async deactivateAccount(accountName: string) {
    await this.clickAccountAction(accountName)
  }

  async deleteAccount(accountName: string) {
    await this.clickAccountAction(accountName)
  }

  async reactivateAccount(accountName: string) {
    await this.clickAccountAction(accountName)
  }
}
