import { type Page, type Locator, expect } from "@playwright/test";
import { TransactionsTestIds, type PropagationOption, type TransactionType } from '@/testIds'
import {
  CurrencyField,
  SegmentedField,
  SelectField,
  TextField,
} from '../helpers/formFields'

export class TransactionsPage {
  readonly page: Page;
  readonly formDrawer: Locator;
  readonly updateDrawer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.formDrawer = page.getByTestId(TransactionsTestIds.DrawerCreate);
    this.updateDrawer = page.getByTestId(TransactionsTestIds.DrawerUpdate);
  }

  async goto() {
    await this.page.goto("/transactions");
    await this.page.waitForLoadState("networkidle");
  }

  async gotoMonth(month: number, year: number) {
    await this.page.goto(`/transactions?month=${month}&year=${year}`);
    await this.page.waitForLoadState("networkidle");
  }

  async openAdvancedFilters() {
    await this.page.getByTestId(TransactionsTestIds.BtnOpenAdvancedFilters).click();
  }

  async selectGroupBy(option: 'date' | 'category' | 'account') {
    await new SegmentedField(this.page, TransactionsTestIds.SegmentedGroupBy).pick(
      TransactionsTestIds.SegmentGroupBy(option),
    );
    await this.page.waitForLoadState('networkidle');
  }

  /** Click the transaction row for the given transaction ID to open the update drawer. */
  async clickTransactionRow(transactionId: number) {
    await this.page.locator(`[data-transaction-id="${transactionId}"]`).click();
    await this.waitForUpdateDrawer();
  }

  async waitForUpdateDrawer() {
    await expect(this.updateDrawer).toBeVisible({ timeout: 8000 });
  }

  /** Clear the description input and type a new value. */
  async clearAndFillDescription(description: string) {
    await new TextField(this.updateDrawer, TransactionsTestIds.InputDescription).fill(description);
  }

  /** Replace amount in the update form by selecting all and pressing digits. */
  async clearAndFillAmount(amountCents: number) {
    await new CurrencyField(this.updateDrawer, TransactionsTestIds.InputAmount).clearAndFillCents(
      amountCents,
    );
  }

  /** Click save in the update drawer and wait for it to close. */
  async submitUpdate() {
    await this.updateDrawer.getByTestId(TransactionsTestIds.BtnSave).click();
    await expect(this.updateDrawer).not.toBeVisible({ timeout: 10000 });
  }

  /** Select a propagation option in the update drawer. */
  async selectUpdatePropagation(
    option: "current" | "current_and_future" | "all"
  ) {
    await this.updateDrawer
      .getByTestId(TransactionsTestIds.PropagationUpdateOption(option))
      .click();
  }

  async isUpdatePropagationVisible(): Promise<boolean> {
    return this.updateDrawer
      .getByTestId(TransactionsTestIds.PropagationUpdateOption('current'))
      .isVisible();
  }

  async openCreateForm() {
    await this.page.getByTestId(TransactionsTestIds.BtnNew).first().click();
    await expect(this.formDrawer).toBeVisible();
  }

  async selectType(type: TransactionType) {
    await new SegmentedField(this.formDrawer, TransactionsTestIds.SegmentedTransactionType).pick(
      TransactionsTestIds.SegmentTransactionType(type),
    );
  }

  async fillAmount(amountCents: number) {
    await new CurrencyField(this.formDrawer, TransactionsTestIds.InputAmount).fillCents(
      amountCents,
    );
  }

  async fillDescription(description: string) {
    await new TextField(this.formDrawer, TransactionsTestIds.InputDescription).fill(description);
  }

  async selectAccount(accountId: number) {
    await new SelectField(this.formDrawer, TransactionsTestIds.SelectAccount).pick(
      TransactionsTestIds.OptionAccount(accountId),
    );
  }

  async selectCategory(categoryId: number) {
    await new SelectField(this.formDrawer, TransactionsTestIds.SelectCategory).pick(
      TransactionsTestIds.OptionCategory(categoryId),
    );
  }

  async submitForm() {
    await this.page.getByTestId(TransactionsTestIds.BtnSave).click();
    await expect(this.formDrawer).not.toBeVisible({ timeout: 8000 });
  }

  async fillExpense(
    amountCents: number,
    description: string,
    accountId: number,
    categoryId: number,
  ) {
    await this.selectType("expense");
    await this.fillDescription(description);
    await this.fillAmount(amountCents);
    await this.selectAccount(accountId);
    await this.selectCategory(categoryId);
  }

  async fillIncome(
    amountCents: number,
    description: string,
    accountId: number,
    categoryId: number,
  ) {
    await this.selectType("income");
    await this.fillDescription(description);
    await this.fillAmount(amountCents);
    await this.selectAccount(accountId);
    await this.selectCategory(categoryId);
  }

  async selectDestinationAccount(accountId: number) {
    await new SelectField(this.formDrawer, TransactionsTestIds.SelectDestinationAccount).pick(
      TransactionsTestIds.OptionDestinationAccount(accountId),
    );
  }

  async fillTransfer(
    amountCents: number,
    description: string,
    sourceAccountId: number,
    destAccountId: number,
  ) {
    await this.selectType("transfer");
    await this.fillDescription(description);
    await this.fillAmount(amountCents);
    await this.selectAccount(sourceAccountId);
    await this.selectDestinationAccount(destAccountId);
  }

  async selectTransaction(transactionId: number) {
    await this.page.getByTestId(TransactionsTestIds.Checkbox(transactionId)).first().click();
  }

  async getSelectedCount(): Promise<number> {
    const text = await this.page.getByTestId(TransactionsTestIds.SelectionCount).textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  async openBulkActionsMenu() {
    await this.page.getByTestId(TransactionsTestIds.BtnBulkActionsMenu).click();
  }

  async confirmBulkDelete() {
    await this.openBulkActionsMenu();
    await this.page.getByTestId(TransactionsTestIds.BtnBulkDelete).click();
    await expect(this.page.getByTestId(TransactionsTestIds.BulkSuccess)).toBeVisible({
      timeout: 15000,
    });
    await this.page.waitForLoadState("networkidle");
  }

  async selectPropagation(
    option: PropagationOption,
    action: "delete" | "update" = "delete"
  ) {
    await this.page
      .getByTestId(TransactionsTestIds.PropagationOption(option))
      .click();
    const confirmTestId = action === "delete" ? "btn_propagation_confirm" : "btn_propagation_confirm_update";
    await this.page.getByTestId(confirmTestId).click();
    await expect(this.page.getByTestId(TransactionsTestIds.BulkSuccess)).toBeVisible({
      timeout: 15000,
    });
    await this.page.waitForLoadState("networkidle");
  }

  async closeBulkDeleteDrawer() {
    await this.page.getByTestId(TransactionsTestIds.BtnBulkDone).click();
  }
}
