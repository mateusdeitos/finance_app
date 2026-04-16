import { type Page, type Locator, expect } from '@playwright/test'

export class ChargesPage {
  readonly page: Page
  readonly createDrawer: Locator
  readonly acceptDrawer: Locator
  readonly confirmModal: Locator

  constructor(page: Page) {
    this.page = page
    this.createDrawer = page.getByRole('dialog', { name: 'Criar Cobranca' })
    this.acceptDrawer = page.getByRole('dialog', { name: 'Aceitar Cobranca' })
    this.confirmModal = page.getByRole('dialog')
  }

  /** Find a visible charge card by its description text */
  chargeCard(description: string): Locator {
    return this.page.getByText(description, { exact: false }).locator('visible=true').first()
  }

  async goto() {
    await this.page.goto('/charges')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoMonth(month: number, year: number) {
    await this.page.goto(`/charges?month=${month}&year=${year}`)
    await this.page.waitForLoadState('networkidle')
  }

  // --- Tabs ---

  async selectReceivedTab() {
    await this.page.getByRole('tab', { name: 'Recebidas' }).click()
    await this.page.waitForLoadState('networkidle')
  }

  async selectSentTab() {
    await this.page.getByRole('tab', { name: 'Enviadas' }).click()
    await this.page.waitForLoadState('networkidle')
  }

  // --- Create ---

  async openCreateDrawer() {
    await this.page.getByRole('button', { name: 'Nova Cobranca' }).click()
    await expect(this.createDrawer).toBeVisible({ timeout: 5000 })
  }

  async fillCreateForm(opts: {
    accountName: string
    description?: string
  }) {
    // Account select
    const accountSelect = this.createDrawer.getByRole('textbox', { name: 'Minha conta' })
    await accountSelect.click()
    await this.page.getByRole('option', { name: opts.accountName }).click()

    if (opts.description) {
      await this.createDrawer.getByLabel('Descricao (opcional)').fill(opts.description)
    }
  }

  async submitCreate() {
    await this.createDrawer.getByRole('button', { name: 'Criar Cobranca' }).click()
    await expect(this.createDrawer).not.toBeVisible({ timeout: 10000 })
  }

  // --- Accept ---

  async clickAccept(chargeDescription: string) {
    await this.page.getByRole('button', { name: 'Aceitar' }).locator('visible=true').first().click()
    await expect(this.acceptDrawer).toBeVisible({ timeout: 5000 })
  }

  async fillAcceptForm(accountName: string) {
    const accountSelect = this.acceptDrawer.getByRole('textbox', { name: 'Conta' })
    await accountSelect.click()
    await this.page.getByRole('option', { name: accountName }).click()
  }

  async submitAccept() {
    await this.acceptDrawer.getByRole('button', { name: /Confirmar/ }).click()
    await expect(this.acceptDrawer).not.toBeVisible({ timeout: 10000 })
  }

  // --- Reject / Cancel ---

  async clickReject(chargeDescription: string) {
    await this.page.getByRole('button', { name: 'Recusar' }).locator('visible=true').first().click()
    await expect(this.confirmModal).toBeVisible({ timeout: 5000 })
  }

  async confirmReject() {
    await this.confirmModal.getByRole('button', { name: 'Recusar' }).click()
    await expect(this.confirmModal).not.toBeVisible({ timeout: 10000 })
  }

  async clickCancel(chargeDescription: string) {
    await this.page.getByRole('button', { name: 'Cancelar' }).locator('visible=true').first().click()
    await expect(this.confirmModal).toBeVisible({ timeout: 5000 })
  }

  async confirmCancel() {
    await this.confirmModal.getByRole('button', { name: 'Cancelar cobranca' }).click()
    await expect(this.confirmModal).not.toBeVisible({ timeout: 10000 })
  }

  // --- Sidebar Badge ---

  async getSidebarBadgeCount(): Promise<number | null> {
    const navLink = this.page.locator('nav').getByText(/Cobran/).first()
    const badge = navLink.locator('..').locator('[class*="badge"], [class*="Badge"]').first()
    if (await badge.isVisible()) {
      const text = await badge.textContent()
      return text ? parseInt(text) : null
    }
    return null
  }

  // --- Notifications ---

  async expectNotification(text: string | RegExp) {
    await expect(this.page.getByText(text).first()).toBeVisible({ timeout: 5000 })
  }
}
