import { type Page, type Locator, expect } from "@playwright/test";
import { ChargesTestIds, CommonTestIds, type ChargeRole } from '@/testIds'
import {
  fillNumber,
  fillTextarea,
  pickRadio,
  selectOption,
} from '../helpers/formFields'

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
    accountId: number;
    connectionId: number;
    role: ChargeRole;
    description?: string;
    amount?: number;
  }) {
    // The drawer hides the connection Select when there's exactly one
    // connection (`singleConnection` branch). But on a cold render `useAccounts`
    // hasn't resolved when the form's `defaultValues` are computed, so the
    // Select can render briefly even for single-connection users — leaving
    // `connection_id` undefined unless we click it. Probe visibility and pick
    // the requested connection's option only if the Select actually rendered.
    const connectionSelect = this.createDrawer.getByTestId(ChargesTestIds.SelectConnection);
    if (await connectionSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await selectOption(
        this.createDrawer,
        ChargesTestIds.SelectConnection,
        ChargesTestIds.OptionConnection(opts.connectionId),
      );
    }

    await selectOption(
      this.createDrawer,
      ChargesTestIds.SelectMyAccount,
      ChargesTestIds.OptionMyAccount(opts.accountId),
    );

    await pickRadio(this.createDrawer, ChargesTestIds.RadioRole(opts.role));

    if (opts.amount != null) {
      // Mantine NumberInput uses comma as the decimal separator (locale pt-BR).
      await fillNumber(
        this.createDrawer,
        ChargesTestIds.InputAmount,
        opts.amount.toFixed(2).replace('.', ','),
      );
    }

    if (opts.description) {
      await fillTextarea(this.createDrawer, ChargesTestIds.InputDescription, opts.description);
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

  async fillAcceptForm(accountId: number) {
    await selectOption(
      this.acceptDrawer,
      ChargesTestIds.SelectAcceptAccount,
      ChargesTestIds.OptionAcceptAccount(accountId),
    );
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
