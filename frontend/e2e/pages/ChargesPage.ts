import { type Page, type Locator, expect } from "@playwright/test";

export class ChargesPage {
  readonly page: Page;
  readonly createDrawer: Locator;
  readonly acceptDrawer: Locator;
  readonly confirmModal: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createDrawer = page.getByRole("dialog", { name: "Criar Cobrança" });
    this.acceptDrawer = page.getByRole("dialog", { name: "Aceitar Cobrança" });
    this.confirmModal = page.getByRole("dialog");
  }

  async goto() {
    await this.page.goto("/charges");
    await this.page.waitForLoadState("networkidle");
  }

  async gotoMonth(month: number, year: number) {
    await this.page.goto(`/charges?month=${month}&year=${year}`);
    await this.page.waitForLoadState("networkidle");
  }

  // --- Tabs ---

  /** Get the active tab panel (Mantine uses aria-selected on tab, panel linked via aria-labelledby) */
  private async getActivePanel(): Promise<Locator> {
    const activeTab = this.page.locator('[role="tab"][aria-selected="true"]');
    const tabId = await activeTab.getAttribute("id");
    return this.page.locator(`[role="tabpanel"][aria-labelledby="${tabId}"]`);
  }

  async selectReceivedTab() {
    await this.page.getByRole("tab", { name: "Recebidas" }).click();
    await this.page.waitForLoadState("networkidle");
  }

  async selectSentTab() {
    await this.page.getByRole("tab", { name: "Enviadas" }).click();
    await this.page.waitForLoadState("networkidle");
  }

  // --- Assertions ---

  async expectChargeVisible(description: string) {
    const panel = await this.getActivePanel();
    await expect(panel.getByText(description)).toBeVisible({ timeout: 5000 });
  }

  // --- Create ---

  async openCreateDrawer() {
    // Wait for network to settle first so accounts/connections are loaded before the drawer mounts.
    // This ensures singleConnection is computed correctly in the drawer's defaultValues.
    await this.page.waitForLoadState("networkidle");
    await this.page.getByRole("button", { name: "Nova Cobrança" }).click();
    await expect(this.createDrawer).toBeVisible({ timeout: 5000 });
  }

  async fillCreateForm(opts: { accountName: string; description?: string }) {
    // If the connection dropdown is visible (multiple connections or accounts still loading),
    // select the first available option so connection_id gets set.
    const connectionSelect = this.createDrawer.getByRole("textbox", { name: "Conexao" });
    if (await connectionSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await connectionSelect.click();
      await this.page.getByRole("option").first().click();
    }

    const accountSelect = this.createDrawer.getByRole("textbox", { name: "Minha conta" });
    await accountSelect.click();
    await this.page.getByRole("option", { name: opts.accountName }).click();

    if (opts.description) {
      await this.createDrawer.getByLabel("Descricao (opcional)").fill(opts.description);
    }
  }

  async submitCreate() {
    await this.createDrawer.getByRole("button", { name: "Criar Cobrança" }).click();
    await expect(this.createDrawer).not.toBeVisible({ timeout: 10000 });
  }

  // --- Accept ---

  async clickAccept() {
    const panel = await this.getActivePanel();
    await panel.getByRole("button", { name: "Aceitar" }).first().click();
    await expect(this.acceptDrawer).toBeVisible({ timeout: 5000 });
  }

  async fillAcceptForm(accountName: string) {
    const accountSelect = this.acceptDrawer.getByRole("textbox", { name: "Conta" });
    await accountSelect.click();
    await this.page.getByRole("option", { name: accountName }).click();
  }

  async submitAccept() {
    await this.acceptDrawer.getByRole("button", { name: /Confirmar/ }).click();
    await expect(this.acceptDrawer).not.toBeVisible({ timeout: 10000 });
  }

  // --- Reject / Cancel ---

  async clickReject() {
    const panel = await this.getActivePanel();
    await panel.getByRole("button", { name: "Recusar" }).first().click();
    await expect(this.confirmModal).toBeVisible({ timeout: 5000 });
  }

  async confirmReject() {
    await this.confirmModal.getByRole("button", { name: "Recusar" }).click();
    await expect(this.confirmModal).not.toBeVisible({ timeout: 10000 });
  }

  async clickCancel() {
    const panel = await this.getActivePanel();
    await panel.getByRole("button", { name: "Cancelar" }).first().click();
    await expect(this.confirmModal).toBeVisible({ timeout: 5000 });
  }

  async confirmCancel() {
    await this.confirmModal.getByRole("button", { name: "Cancelar cobrança" }).click();
    await expect(this.confirmModal).not.toBeVisible({ timeout: 10000 });
  }

  // --- Sidebar Badge ---

  async getSidebarBadgeCount(): Promise<number | null> {
    // Mantine NavLink renders badge in rightSection. Look for a small red badge near "Cobrancas"
    const navLink = this.page.locator('a[href="/charges"]').first();
    const badge = navLink.locator('[class*="mantine-Badge-root"]').first();
    if (await badge.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await badge.textContent();
      return text ? parseInt(text) : null;
    }
    return null;
  }

  // --- Notifications ---

  async expectNotification(text: string | RegExp) {
    await expect(this.page.getByText(text).first()).toBeVisible({ timeout: 5000 });
  }
}
