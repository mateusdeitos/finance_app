import { type Page, type Locator, expect } from "@playwright/test";
import { TransactionsTestIds, type PropagationOption, type TransactionType } from '@/testIds'
import {
  AutocompleteField,
  CurrencyField,
  SegmentedField,
  SelectField,
  TextField,
} from '../helpers/formFields'

export class TransactionsPage {
  readonly page: Page;
  readonly formDrawer: Locator;
  readonly updateDrawer: Locator;
  readonly linkedSplitDrawer: Locator;
  readonly linkedTransferDrawer: Locator;
  readonly calculatorDrawer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.formDrawer = page.getByTestId(TransactionsTestIds.DrawerCreate);
    this.updateDrawer = page.getByTestId(TransactionsTestIds.DrawerUpdate);
    this.linkedSplitDrawer = page.getByTestId(TransactionsTestIds.DrawerUpdateLinkedSplit);
    this.linkedTransferDrawer = page.getByTestId(TransactionsTestIds.DrawerUpdateLinkedTransfer);
    this.calculatorDrawer = page.getByTestId(TransactionsTestIds.DrawerCalculator);
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
    await this.page.getByTestId(TransactionsTestIds.BtnGroupByMenu).click();
    await this.page.getByTestId(TransactionsTestIds.MenuItemGroupBy(option)).click();
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

  async waitForLinkedSplitDrawer() {
    await expect(this.linkedSplitDrawer).toBeVisible({ timeout: 8000 });
  }

  async waitForLinkedTransferDrawer() {
    await expect(this.linkedTransferDrawer).toBeVisible({ timeout: 8000 });
  }

  /** Assert no form error alert is visible. Call after submit to catch validation/API errors early. */
  async assertNoFormErrors() {
    const alert = this.page.getByTestId(TransactionsTestIds.AlertFormError);
    if (await alert.isVisible()) {
      const text = (await alert.textContent()) ?? "<empty>";
      throw new Error(`Form error alert visible: ${text.trim()}`);
    }
  }

  /** Clear the description input and type a new value. */
  async clearAndFillDescription(description: string) {
    await new TextField(this.updateDrawer, TransactionsTestIds.InputDescription).fill(description);
  }

  /** Replace amount by clearing the input then typing digits. Defaults to update drawer. */
  async clearAndFillAmount(amountCents: number, drawer?: Locator) {
    const container = drawer ?? this.updateDrawer;
    await new CurrencyField(container, TransactionsTestIds.InputAmount).clearAndFillCents(
      amountCents,
    );
  }

  /** Click save in the update drawer and wait for it to close. */
  async submitUpdate(drawer?: Locator) {
    const container = drawer ?? this.updateDrawer;
    await container.getByTestId(TransactionsTestIds.BtnSave).click();
    await this.assertNoFormErrors();
    await expect(container).not.toBeVisible({ timeout: 10000 });
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

  /**
   * Expand the recurrence / split / tags accordion in the create-or-update form
   * so its content (Switch, inputs, etc.) becomes visible. No-op if already open
   * — clicking the header toggles, so callers should only call this once.
   */
  async expandExtraSection(panel: "recurrence" | "split" | "tags", drawer?: Locator) {
    const container = drawer ?? this.formDrawer;
    const header = container.getByTestId(TransactionsTestIds.SegmentExtraSection(panel));
    await header.scrollIntoViewIfNeeded();
    // `force: true` bypasses Playwright's actionability stability check.
    // Mantine Drawer mounts trigger transient layout shifts (queries loading,
    // Selects populating, drag-handle animating in) that have caused the
    // accordion header to be flagged "not stable" for the full timeout window.
    // The header is a real <button> — clicking it is safe even mid-animation.
    await header.click({ force: true });
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

  /**
   * Type a description and pick the autocomplete suggestion whose text equals
   * it, triggering the suggestion-fill behaviour. Defaults to the create drawer.
   */
  async pickDescriptionSuggestion(description: string, drawer?: Locator) {
    const container = drawer ?? this.formDrawer;
    await new AutocompleteField(container, TransactionsTestIds.InputDescription).pickSuggestion(
      description,
      TransactionsTestIds.OptionDescriptionSuggestion(description),
    );
  }

  async selectAccount(accountId: number) {
    await new SelectField(this.formDrawer, TransactionsTestIds.SelectAccount).pick(
      TransactionsTestIds.OptionAccount(accountId),
    );
  }

  /** Select a category. Pass `drawer` to scope to a non-create drawer (e.g. linked split). */
  async selectCategory(categoryId: number, drawer?: Locator) {
    const container = drawer ?? this.formDrawer;
    await new SelectField(container, TransactionsTestIds.SelectCategory).pick(
      TransactionsTestIds.OptionCategory(categoryId),
    );
  }

  async submitForm() {
    await this.formDrawer.getByTestId(TransactionsTestIds.BtnSave).click();
    await this.assertNoFormErrors();
    await expect(this.formDrawer).not.toBeVisible({ timeout: 8000 });
  }

  /** Current displayed value of the create-form amount input (e.g. "15,00"). */
  async getAmountValue(): Promise<string> {
    return this.formDrawer.getByTestId(TransactionsTestIds.InputAmount).inputValue();
  }

  /** Open the amount calculator drawer from the create-form amount input. */
  async openAmountCalculator() {
    await this.formDrawer.getByTestId(TransactionsTestIds.BtnOpenCalculator).click();
    await expect(this.calculatorDrawer).toBeVisible({ timeout: 8000 });
  }

  /** Current value shown on the calculator display (e.g. "R$ 20,00"). */
  async getCalculatorDisplay(): Promise<string> {
    return (
      (await this.calculatorDrawer.getByTestId(TransactionsTestIds.CalcDisplay).textContent()) ?? ""
    );
  }

  /**
   * Click a sequence of calculator keys. Each entry is a key id as declared by
   * `TransactionsTestIds.CalcKey` — digits ("0".."9", "00"), operators
   * ("add", "sub", "mul", "div"), "equals", "clear", "backspace", "negate".
   */
  async pressCalculatorKeys(keys: string[]) {
    for (const key of keys) {
      await this.calculatorDrawer.getByTestId(TransactionsTestIds.CalcKey(key)).click();
    }
  }

  /**
   * Type a sequence of physical keys while the calculator drawer is open.
   * Each entry is a Playwright key name — digits ("0".."9"), operators
   * ("+", "-", "*", "/"), "Enter", "Backspace".
   */
  async typeOnCalculator(keys: string[]) {
    for (const key of keys) {
      await this.page.keyboard.press(key);
    }
  }

  /** Apply the calculator result back to the amount input and wait for it to close. */
  async applyCalculator() {
    await this.calculatorDrawer.getByTestId(TransactionsTestIds.BtnCalcApply).click();
    await expect(this.calculatorDrawer).not.toBeVisible({ timeout: 8000 });
  }

  /**
   * Dismiss the calculator via its Cancel button — the result is discarded.
   * (Escape is avoided: it would also close the underlying create drawer,
   * since each drawer registers its own window-level Escape listener.)
   */
  async dismissCalculator() {
    await this.calculatorDrawer.getByTestId(TransactionsTestIds.BtnCalcCancel).click();
    await expect(this.calculatorDrawer).not.toBeVisible({ timeout: 8000 });
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

  /** Locator for a transaction's selection checkbox. */
  transactionCheckbox(transactionId: number): Locator {
    return this.page.getByTestId(TransactionsTestIds.Checkbox(transactionId)).first();
  }

  /** Locator for a settlement's selection checkbox. */
  settlementCheckbox(settlementId: number): Locator {
    return this.page
      .getByTestId(TransactionsTestIds.CheckboxSettlement(settlementId))
      .first();
  }

  /** Click a transaction's selection checkbox, optionally holding Shift. */
  async toggleTransactionCheckbox(transactionId: number, options?: { shiftKey?: boolean }) {
    await this.transactionCheckbox(transactionId).click(
      options?.shiftKey ? { modifiers: ["Shift"] } : {},
    );
  }

  /** Click a settlement's selection checkbox, optionally holding Shift. */
  async toggleSettlementCheckbox(settlementId: number, options?: { shiftKey?: boolean }) {
    await this.settlementCheckbox(settlementId).click(
      options?.shiftKey ? { modifiers: ["Shift"] } : {},
    );
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
