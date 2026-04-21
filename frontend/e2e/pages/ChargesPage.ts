import { type Page, type Locator, expect } from "@playwright/test";
import { ChargesTestIds, CommonTestIds } from '@/testIds'

export class ChargesPage {
  readonly page: Page;
  readonly createDrawer: Locator;
  readonly acceptDrawer: Locator;
  readonly rejectModal: Locator;
  readonly cancelModal: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createDrawer = page.getByTestId(ChargesTestIds.DrawerCreate);
    this.acceptDrawer = page.getByTestId(ChargesTestIds.DrawerAccept);
    this.rejectModal = page.getByTestId(ChargesTestIds.ModalConfirm('reject'));
    this.cancelModal = page.getByTestId(ChargesTestIds.ModalConfirm('cancel'));
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

  async selectReceivedTab() {
    await this.page.getByTestId(ChargesTestIds.Tab('received')).click();
    await this.page.waitForLoadState("networkidle");
  }

  async selectSentTab() {
    await this.page.getByTestId(ChargesTestIds.Tab('sent')).click();
    await this.page.waitForLoadState("networkidle");
  }

  // --- Assertions ---

  async expectChargeVisible(description: string) {
    // Charges are uniquely identified by their id (data-testid="charge_card_${id}"),
    // but tests only know the description. Scope the text search to visible charge
    // cards rather than to the whole page.
    await expect(
      this.page
        .locator('[data-testid^="charge_card_"]')
        .filter({ hasText: description })
        .first(),
    ).toBeVisible({ timeout: 5000 });
  }

  // --- Create ---

  async openCreateDrawer() {
    // Wait for network to settle first so accounts/connections are loaded before the drawer mounts.
    // This ensures singleConnection is computed correctly in the drawer's defaultValues.
    await this.page.waitForLoadState("networkidle");
    await this.page.getByTestId(ChargesTestIds.BtnNew).first().click();
    await expect(this.createDrawer).toBeVisible({ timeout: 5000 });
  }

  async fillCreateForm(opts: {
    accountName: string;
    role: "charger" | "payer";
    description?: string;
    amount?: number;
  }) {
    // If the connection dropdown is visible (multiple connections or accounts still loading),
    // select the first available option so connection_id gets set.
    const connectionSelect = this.createDrawer.getByTestId(ChargesTestIds.SelectConnection);
    if (await connectionSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await connectionSelect.click();
      await this.page.getByRole("option").first().click();
    }

    const accountSelect = this.createDrawer.getByTestId(ChargesTestIds.SelectMyAccount);
    await accountSelect.click();
    await this.page.getByRole("option", { name: opts.accountName }).click();

    const radioTestId = opts.role === "charger" ? "radio_role_charger" : "radio_role_payer";
    await this.createDrawer.getByTestId(radioTestId).check();

    if (opts.amount != null) {
      const amountInput = this.createDrawer.getByTestId(ChargesTestIds.InputAmount);
      await amountInput.fill(opts.amount.toFixed(2).replace(".", ","));
    }

    if (opts.description) {
      await this.createDrawer.getByTestId(ChargesTestIds.InputDescription).fill(opts.description);
    }
  }

  async submitCreate() {
    await this.createDrawer.getByTestId(ChargesTestIds.BtnSubmitCreate).click();
    await expect(this.createDrawer).not.toBeVisible({ timeout: 10000 });
  }

  // --- Accept ---

  async clickAccept() {
    await this.page.getByTestId(ChargesTestIds.BtnAccept).first().click();
    await expect(this.acceptDrawer).toBeVisible({ timeout: 5000 });
  }

  async fillAcceptForm(accountName: string) {
    const accountSelect = this.acceptDrawer.getByTestId(ChargesTestIds.SelectAcceptAccount);
    await accountSelect.click();
    await this.page.getByRole("option", { name: accountName }).click();
  }

  async submitAccept() {
    await this.acceptDrawer.getByTestId(ChargesTestIds.BtnSubmitAccept).click();
    await expect(this.acceptDrawer).not.toBeVisible({ timeout: 10000 });
  }

  // --- Reject / Cancel ---

  async clickReject() {
    await this.page.getByTestId(ChargesTestIds.BtnReject).first().click();
    await expect(this.rejectModal).toBeVisible({ timeout: 5000 });
  }

  async confirmReject() {
    await this.rejectModal.getByTestId(ChargesTestIds.BtnConfirm('reject')).click();
    await expect(this.rejectModal).not.toBeVisible({ timeout: 10000 });
  }

  async clickCancel() {
    await this.page.getByTestId(ChargesTestIds.BtnCancel).first().click();
    await expect(this.cancelModal).toBeVisible({ timeout: 5000 });
  }

  async confirmCancel() {
    await this.cancelModal.getByTestId(ChargesTestIds.BtnConfirm('cancel')).click();
    await expect(this.cancelModal).not.toBeVisible({ timeout: 10000 });
  }

  // --- Sidebar Badge ---

  async getSidebarBadgeCount(): Promise<number | null> {
    const badge = this.page.getByTestId(CommonTestIds.NavBadge("charges"));
    if (await badge.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await badge.textContent();
      return text ? parseInt(text) : null;
    }
    return null;
  }

  // --- Notifications ---

  async expectNotification(text: string | RegExp) {
    // Mantine notifications don't currently carry a testid — `getByText` on the
    // toast label is the pragmatic fallback until Notifications get testids.
    await expect(this.page.getByText(text).first()).toBeVisible({ timeout: 5000 });
  }
}
