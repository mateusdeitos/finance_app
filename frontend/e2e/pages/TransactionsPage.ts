import { type Page, type Locator, expect } from "@playwright/test";
import { TransactionsTestIds, type PropagationOption } from '@/testIds'
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
    const labelMap: Record<string, string> = { date: 'Data', category: 'Categoria', account: 'Conta' }
    await this.page.getByTestId(TransactionsTestIds.SegmentedGroupBy).getByText(labelMap[option]).click()
    await this.page.waitForLoadState('networkidle')
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
    const input = this.updateDrawer.getByTestId(TransactionsTestIds.InputDescription);
    await input.fill(description);
  }

  /** Replace amount in the update form by selecting all and pressing digits. */
  async clearAndFillAmount(amountCents: number) {
    const input = this.updateDrawer.getByTestId(TransactionsTestIds.InputAmount);
    await input.click();
    await input.press("Control+a");
    for (const digit of String(amountCents)) {
      await input.press(digit);
    }
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

  async selectType(type: "expense" | "income" | "transfer") {
    if (type === "expense") return;
    const labels: Record<string, string> = {
      income: "Receita",
      transfer: "Transferência",
    };
    await this.page
      .getByTestId(TransactionsTestIds.SegmentedTransactionType)
      .getByText(labels[type])
      .click();
  }

  async fillAmount(amountCents: number) {
    const amountInput = this.page.getByTestId(TransactionsTestIds.InputAmount);
    await amountInput.click();
    for (const digit of String(amountCents)) {
      await amountInput.press(digit);
    }
  }

  async fillDescription(description: string) {
    await this.page.getByTestId(TransactionsTestIds.InputDescription).fill(description);
  }

  async selectAccount(accountName: string) {
    const input = this.page.getByTestId(TransactionsTestIds.SelectAccount);
    await input.click();
    await input.fill(accountName);
    // Mantine Select options are portalled and aren't instrumented with a
    // testid; getByRole('option') is the documented fallback until we switch
    // Select consumers to renderOption with explicit testids.
    await this.page.getByRole("option", { name: accountName }).click();
  }

  async selectCategory(categoryName: string) {
    const input = this.page.getByTestId(TransactionsTestIds.SelectCategory);
    await input.click();
    await input.fill(categoryName);
    await this.page
      .getByRole("option", { name: new RegExp(categoryName) })
      .click();
  }

  async submitForm() {
    await this.page.getByTestId(TransactionsTestIds.BtnSave).click();
    await expect(this.formDrawer).not.toBeVisible({ timeout: 8000 });
  }

  async fillExpense(
    amountCents: number,
    description: string,
    accountName: string,
    categoryName: string
  ) {
    await this.selectType("expense");
    await this.fillDescription(description);
    await this.fillAmount(amountCents);
    await this.selectAccount(accountName);
    await this.selectCategory(categoryName);
  }

  async fillIncome(
    amountCents: number,
    description: string,
    accountName: string,
    categoryName: string
  ) {
    await this.selectType("income");
    await this.fillDescription(description);
    await this.fillAmount(amountCents);
    await this.selectAccount(accountName);
    await this.selectCategory(categoryName);
  }

  async selectDestinationAccount(accountName: string) {
    const input = this.page.getByTestId(TransactionsTestIds.SelectDestinationAccount);
    await input.click();
    await input.fill(accountName);
    await this.page.getByRole("option", { name: accountName }).click();
  }

  async fillTransfer(
    amountCents: number,
    description: string,
    sourceAccountName: string,
    destAccountName: string
  ) {
    await this.selectType("transfer");
    await this.fillDescription(description);
    await this.fillAmount(amountCents);
    await this.selectAccount(sourceAccountName);
    await this.selectDestinationAccount(destAccountName);
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
    option: "Somente esta" | "Esta e as próximas" | "Todas",
    action: "delete" | "update" = "delete"
  ) {
    const valueMap: Record<string, PropagationOption> = {
      "Somente esta": "current",
      "Esta e as próximas": "current_and_future",
      Todas: "all",
    };
    await this.page
      .getByTestId(TransactionsTestIds.PropagationOption(valueMap[option]))
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
