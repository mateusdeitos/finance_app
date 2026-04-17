import { type Page, type Locator, expect } from "@playwright/test";

export class ImportPage {
  readonly page: Page;
  readonly uploadStep: Locator;
  readonly reviewStep: Locator;
  readonly finishedStep: Locator;
  readonly processButton: Locator;
  readonly confirmButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.uploadStep = page.getByTestId("import_upload_step");
    this.reviewStep = page.getByTestId("import_review_step");
    this.finishedStep = page.getByTestId("finished_import_successfully_step");
    this.processButton = page.getByTestId("btn_process_csv");
    this.confirmButton = page.getByTestId("btn_confirm_import");
  }

  /** Navigate to /transactions and click "Importar transações" in the overflow menu. */
  async goto() {
    await this.page.goto("/transactions");
    await this.page.waitForLoadState("networkidle");
    // Open the overflow menu (ActionIcon with IconDots)
    await this.page.getByRole("button", { name: "Mais opções" }).first().click();
    await this.page.getByText("Importar transações").click();
    await expect(this.uploadStep).toBeVisible({ timeout: 8000 });
  }

  /** Select the account in the upload step (Mantine Select is readonly, use click+option). */
  async selectAccount(accountName: string) {
    const input = this.uploadStep.getByTestId("select_import_account");
    await input.click();
    await this.page.getByRole("option", { name: accountName }).click();
  }

  /** Upload a CSV file by writing content into the hidden file input. */
  async uploadCSVContent(csvContent: string) {
    const fileInput = this.uploadStep.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf-8"),
    });
  }

  /** Click "Processar arquivo" and wait for the review step to appear. */
  async submitUpload() {
    await this.processButton.click();
    await expect(this.reviewStep).toBeVisible({ timeout: 15000 });
  }

  /** Full upload flow: select account, upload CSV, submit. */
  async uploadCSV(csvContent: string, accountName: string) {
    await this.selectAccount(accountName);
    await this.uploadCSVContent(csvContent);
    await this.submitUpload();
  }

  /**
   * Click confirm import and wait until the import loop finishes.
   *
   * Two possible completion states:
   * - allImportedSuccess: the review_step Box is REPLACED by a success screen
   *   with "Importação concluída com sucesso!" — must search the whole page.
   * - done with errors: the review_step Box stays and shows an Alert with
   *   "Importação concluída com erros" inside it.
   *
   * In both cases the text starts with "Importação concluída", so we wait for
   * that substring anywhere on the page.
   */
  async confirmImport() {
    await this.confirmButton.click();
    // Wait for the import loop to finish. Two possible completion states:
    // - allImportedSuccess: finished_import_successfully_step replaces review_step
    //   ("Importação concluída com sucesso!") — page then navigates away after 3s.
    // - done with errors: review_step stays and shows an Alert
    //   ("Importação concluída com erros").
    // Search the whole page so both cases are covered.
    await expect(this.page.getByText("Importação concluída", { exact: false }).first()).toBeVisible({ timeout: 30000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15000 });
  }

  /** Return the number of review rows in the table. */
  async getRowCount(): Promise<number> {
    return this.reviewStep.locator("[data-row-index]").count();
  }

  /**
   * Return the import status of a row (idle | loading | success | error | duplicate).
   * Reads from the data-testid status cell.
   */
  async getRowStatus(rowIndex: number): Promise<string> {
    const statusCell = this.reviewStep.getByTestId(`import_status_${rowIndex}`);
    const actionSelect = this.reviewStep.getByTestId(`select_import_action_${rowIndex}`);
    // Check visible icons
    const hasSuccess = await statusCell
      .locator("svg[class*='icon-check'], [data-icon='check']")
      .isVisible()
      .catch(() => false);
    if (hasSuccess) return "success";
    const hasError = await statusCell
      .locator("svg[class*='icon-x'], [data-icon='x']")
      .isVisible()
      .catch(() => false);
    if (hasError) return "error";
    // Otherwise read from action select value
    const value = await actionSelect
      .locator("input")
      .inputValue()
      .catch(() => "");
    return value || "pending";
  }

  /** Set the category for a row via the searchable category select. */
  async setRowCategory(rowIndex: number, categoryName: string) {
    const select = this.reviewStep.getByTestId(`select_category_${rowIndex}`);
    await select.click();
    await select.fill(categoryName);
    await this.page.getByRole("option", { name: categoryName }).click();
  }

  /** Click the + button next to the category select to open the category creation drawer. */
  async openCreateCategoryDrawer(rowIndex: number) {
    const row = this.reviewStep.getByTestId(`import_row_${rowIndex}`);
    await row.getByRole("button", { name: "Criar categoria" }).click();
    // Wait for drawer content (root div starts hidden during Mantine transition)
    await expect(this.page.getByTestId("drawer_create_category").getByRole("button", { name: "Nova Categoria" })).toBeVisible({ timeout: 5000 });
  }

  /** Click the + button next to the account select in the upload step header. */
  async openCreateAccountDrawerFromHeader() {
    await this.uploadStep.getByRole("button", { name: "Criar conta" }).click();
    await expect(this.page.getByTestId("account_form")).toBeVisible({ timeout: 5000 });
  }

  /** Create a new category inside the category drawer and close it. */
  async createCategoryInDrawer(name: string, opts?: { emoji?: string }) {
    const drawer = this.page.getByTestId("drawer_create_category");
    // Click "Nova Categoria" to show the inline input (may already be visible)
    const newButton = drawer.getByRole("button", { name: "Nova Categoria" });
    if (await newButton.isVisible()) {
      await newButton.click();
    }
    // Wait for and fill the inline input
    const input = drawer.getByTestId("input_new_category_name");
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(name);
    await input.press("Enter");
    // Wait for the category to appear in the tree
    await expect(drawer.getByText(name)).toBeVisible({ timeout: 5000 });

    // Optionally set an emoji on the newly created category
    if (opts?.emoji) {
      // Find the newly created category's emoji button
      const categoryRow = drawer.getByText(name).locator("..").locator("..");
      const emojiButton = categoryRow.locator("[data-testid^='btn_emoji_']");
      await emojiButton.click();
      // Click the emoji option — it exists in exactly one open picker
      const emojiOption = this.page.getByTestId(`emoji_${opts.emoji}`).first();
      await expect(emojiOption).toBeVisible({ timeout: 5000 });
      await emojiOption.click();
      // Wait for save to complete
      await this.page.waitForLoadState("networkidle");
    }

    // Close the drawer
    await drawer.getByRole("button", { name: "Fechar" }).click();
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
  }

  /** Create a new account inside the account drawer. */
  async createAccountInDrawer(name: string) {
    const form = this.page.getByTestId("account_form");
    await form.getByTestId("input_account_name").fill(name);
    await form.getByTestId("btn_account_save").click();
    await expect(form).not.toBeVisible({ timeout: 10000 });
  }

  /** Get the current value of the category select for a row. */
  async getRowCategoryValue(rowIndex: number): Promise<string> {
    const select = this.reviewStep.getByTestId(`select_category_${rowIndex}`);
    return select.inputValue();
  }

  /** Get the current value of the main account select in the upload step. */
  async getHeaderAccountValue(): Promise<string> {
    const select = this.uploadStep.getByTestId("select_import_account");
    return select.inputValue();
  }

  /** Click a row's checkbox, optionally holding Shift. */
  async toggleRowCheckbox(rowIndex: number, options?: { shiftKey?: boolean }) {
    const row = this.reviewStep.getByTestId(`import_row_${rowIndex}`);
    const checkbox = row.locator('input[type="checkbox"]');
    if (options?.shiftKey) {
      await checkbox.click({ modifiers: ['Shift'] });
    } else {
      await checkbox.click();
    }
  }

  /** Return whether a row's checkbox is checked. */
  async isRowSelected(rowIndex: number): Promise<boolean> {
    const row = this.reviewStep.getByTestId(`import_row_${rowIndex}`);
    return row.locator('input[type="checkbox"]').isChecked();
  }

  /** Change the action for a row via the action select. */
  async setRowAction(rowIndex: number, action: "import" | "skip" | "duplicate") {
    const labels: Record<string, string> = {
      import: "Importar",
      skip: "Não importar",
      duplicate: "Duplicado",
    };
    const select = this.reviewStep.getByTestId(`select_import_action_${rowIndex}`);
    await select.click();
    await this.page.getByRole("option", { name: labels[action] }).click();
  }

  /** Check whether a row's action select shows a particular value (by visible label). */
  async getRowActionLabel(rowIndex: number): Promise<string> {
    const select = this.reviewStep.getByTestId(`select_import_action_${rowIndex}`);
    return select.locator("input").inputValue();
  }
}
