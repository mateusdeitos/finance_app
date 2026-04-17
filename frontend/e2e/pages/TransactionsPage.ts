import { type Page, type Locator, expect } from "@playwright/test";

export class TransactionsPage {
  readonly page: Page;
  readonly formDrawer: Locator;
  readonly updateDrawer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.formDrawer = page.getByRole("dialog");
    this.updateDrawer = page.getByRole("dialog", { name: "Editar transação" });
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
    await this.page.getByTestId("open_advanced_filters").click();
  }

  async selectGroupBy(option: 'date' | 'category' | 'account') {
    const labelMap: Record<string, string> = { date: 'Data', category: 'Categoria', account: 'Conta' }
    await this.page.getByTestId('segmented_group_by').getByText(labelMap[option]).click()
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
    const input = this.updateDrawer.getByTestId("input_description");
    await input.fill(description);
  }

  /** Replace amount in the update form by selecting all and pressing digits. */
  async clearAndFillAmount(amountCents: number) {
    const input = this.updateDrawer.getByTestId("input_amount");
    await input.click();
    await input.press("Control+a");
    for (const digit of String(amountCents)) {
      await input.press(digit);
    }
  }

  /** Click save in the update drawer and wait for it to close. */
  async submitUpdate() {
    await this.updateDrawer.getByTestId("btn_save_transaction").click();
    await expect(this.updateDrawer).not.toBeVisible({ timeout: 10000 });
  }

  /** Select a propagation option in the update drawer. */
  async selectUpdatePropagation(
    option: "current" | "current_and_future" | "all"
  ) {
    await this.updateDrawer
      .getByTestId(`propagation_update_option_${option}`)
      .click();
  }

  async isUpdatePropagationVisible(): Promise<boolean> {
    return this.updateDrawer
      .getByTestId("propagation_update_option_current")
      .isVisible();
  }

  async openCreateForm() {
    await this.page.getByTestId("btn_new_transaction").first().click();
    await expect(this.formDrawer).toBeVisible();
  }

  async selectType(type: "expense" | "income" | "transfer") {
    if (type === "expense") return;
    const labels: Record<string, string> = {
      income: "Receita",
      transfer: "Transferência",
    };
    await this.page
      .getByTestId("segmented_transaction_type")
      .getByText(labels[type])
      .click();
  }

  async fillAmount(amountCents: number) {
    const amountInput = this.page.getByTestId("input_amount");
    await amountInput.click();
    for (const digit of String(amountCents)) {
      await amountInput.press(digit);
    }
  }

  async fillDescription(description: string) {
    await this.page.getByTestId("input_description").fill(description);
  }

  async selectAccount(accountName: string) {
    const input = this.page.getByTestId("select_account");
    await input.click();
    await input.fill(accountName);
    await this.page.getByRole("option", { name: accountName }).click();
  }

  async selectCategory(categoryName: string) {
    const input = this.page.getByTestId("select_category");
    await input.click();
    await input.fill(categoryName);
    await this.page
      .getByRole("option", { name: new RegExp(categoryName) })
      .click();
  }

  async submitForm() {
    await this.page.getByTestId("btn_save_transaction").click();
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
    const input = this.page.getByTestId("select_destination_account");
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
    await this.page.getByTestId(`checkbox_${transactionId}`).first().click();
  }

  async getSelectedCount(): Promise<number> {
    const text = await this.page.getByTestId("selection_count").textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  async openBulkActionsMenu() {
    await this.page.getByTestId("btn_bulk_actions_menu").click();
  }

  async confirmBulkDelete() {
    await this.openBulkActionsMenu();
    await this.page.getByTestId("btn_bulk_delete").click();
    await expect(this.page.getByTestId("bulk_success")).toBeVisible({
      timeout: 15000,
    });
    await this.page.waitForLoadState("networkidle");
  }

  async selectPropagation(
    option: "Somente esta" | "Esta e as próximas" | "Todas",
    action: "delete" | "update" = "delete"
  ) {
    const valueMap: Record<string, string> = {
      "Somente esta": "current",
      "Esta e as próximas": "current_and_future",
      Todas: "all",
    };
    await this.page
      .getByTestId(`propagation_option_${valueMap[option]}`)
      .click();
    const confirmTestId = action === "delete" ? "btn_propagation_confirm" : "btn_propagation_confirm_update";
    await this.page.getByTestId(confirmTestId).click();
    await expect(this.page.getByTestId("bulk_success")).toBeVisible({
      timeout: 15000,
    });
    await this.page.waitForLoadState("networkidle");
  }

  async closeBulkDeleteDrawer() {
    await this.page.getByTestId("btn_bulk_done").click();
  }

  async deleteTransaction(description: string) {
    const transactionRow = this.page
      .locator('[class*="Group"], [class*="Stack"]')
      .filter({ hasText: description })
      .first();
    await transactionRow.click();
    // Transaction detail/actions should appear
    const deleteButton = this.page.getByRole("button", {
      name: /Excluir|Deletar/,
    });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    // Confirm if dialog appears
    const confirmButton = this.page
      .getByRole("button", { name: /Confirmar|Excluir/ })
      .last();
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }
    await this.page.waitForLoadState("networkidle");
  }

  async getTransactionDescriptions(): Promise<string[]> {
    await this.page.waitForLoadState("networkidle");
    // Transaction descriptions appear as text in transaction list items
    const items = this.page
      .locator('[class*="transaction"], [class*="Transaction"]')
      .locator("text=/\\w+/");
    const count = await items.count();
    const descriptions: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent();
      if (text?.trim()) descriptions.push(text.trim());
    }
    return descriptions;
  }
}
