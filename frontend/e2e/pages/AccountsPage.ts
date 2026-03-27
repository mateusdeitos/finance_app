import { type Page, type Locator, expect } from '@playwright/test'

export class AccountsPage {
  readonly page: Page
  readonly heading: Locator
  readonly newAccountButton: Locator
  readonly drawer: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.locator('p, h1, h2').filter({ hasText: /^Contas$/ }).first()
    this.newAccountButton = page.getByRole('button', { name: 'Nova Conta' })
    this.drawer = page.getByRole('dialog')
  }

  async goto() {
    await this.page.goto('/accounts')
    await expect(this.newAccountButton).toBeVisible()
  }

  async openCreateForm() {
    await this.newAccountButton.click()
    await expect(this.drawer).toBeVisible()
  }

  async fillForm(name: string, balanceCents = 0) {
    await this.drawer.getByLabel('Nome').fill(name)
    // Balance field uses a custom currency input — type the value directly
    if (balanceCents !== 0) {
      const balanceInput = this.drawer.locator('input[type="text"]').last()
      await balanceInput.clear()
      await balanceInput.fill(String(balanceCents / 100))
    }
  }

  async submitForm() {
    await this.drawer.getByRole('button', { name: 'Salvar' }).click()
    // Wait for drawer to close
    await expect(this.drawer).not.toBeVisible({ timeout: 5000 })
  }

  async editAccount(accountName: string) {
    const card = this.page.locator('[data-radix-scroll-area-viewport]').or(this.page.locator('main')).locator(`text=${accountName}`).locator('..').locator('..')
    await card.getByRole('button').first().click()
    await expect(this.drawer).toBeVisible()
  }

  /** Click the action button (deactivate for active, activate for inactive) */
  async clickAccountAction(accountName: string) {
    const card = this.getCardByName(accountName)
    // Last action button on the card (delete/deactivate/activate)
    await card.getByRole('button').last().click()
  }

  async deactivateAccount(accountName: string) {
    await this.clickAccountAction(accountName)
  }

  async deleteAccount(accountName: string) {
    await this.clickAccountAction(accountName)
  }

  async getAccountNames(): Promise<string[]> {
    await this.page.waitForLoadState('networkidle')
    const cards = this.page.locator('[class*="mantine-Card"]')
    const count = await cards.count()
    const names: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).locator('[style*="font-weight"]').first().textContent()
      if (text) names.push(text.trim())
    }
    return names
  }

  private getCardByName(name: string): Locator {
    return this.page.locator('[class*="mantine-Card"]').filter({ hasText: name })
  }
}
