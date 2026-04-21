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
    await this.page.getByTestId("btn_more_options").first().click();
    await this.page.getByTestId("menu_item_import_transactions").click();
    await expect(this.uploadStep).toBeVisible({ timeout: 8000 });
  }

  /** Select the account in the upload step (Mantine Select is readonly, use click+option). */
  async selectAccount(accountName: string) {
    const input = this.uploadStep.getByTestId("select_import_account");
    await input.click();
    // Mantine Select options are portalled — documented escape (see Phase 7 plan).
    await this.page.getByRole("option", { name: accountName }).click();
  }

  /** Upload a CSV file by writing content into the hidden file input. */
  async uploadCSVContent(csvContent: string) {
    // Mantine's FileInput wraps a real <input type="file">. The FileInput
    // wrapper has data-testid="input_csv_file"; Playwright's setInputFiles
    // needs the underlying input element, reached by a native-type descendant
    // probe. This is native HTML (not Mantine internals), scoped to the
    // testid wrapper — survives Mantine upgrades.
    const fileInput = this.uploadStep
      .getByTestId("input_csv_file")
      .locator('input[type="file"]');
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
   *   ("Importação concluída com sucesso!") — page then navigates away after 3s.
   * - done with errors: the review_step Box stays and shows an Alert
   *   ("Importação concluída com erros").
   *
   * We watch for either the finished_step testid or a fallback substring,
   * whichever appears first.
   */
  async confirmImport() {
    await this.confirmButton.click();
    await expect
      .poll(
        async () => {
          if (await this.finishedStep.isVisible().catch(() => false)) return "success";
          if (
            await this.reviewStep
              .getByText("Importação concluída com erros")
              .isVisible()
              .catch(() => false)
          ) {
            return "with_errors";
          }
          return null;
        },
        { timeout: 30000 }
      )
      .not.toBeNull();
    await this.page.waitForLoadState("networkidle", { timeout: 15000 });
  }

  /** Return the number of review rows in the table. */
  async getRowCount(): Promise<number> {
    return this.reviewStep.locator("[data-row-index]").count();
  }

  /**
   * Return the import status of a row. Reads directly from the data-status
   * attribute on the status cell, rather than probing for Mantine icon classes.
   * Returns: "idle" | "loading" | "success" | "error" (plus "pending" fallback).
   */
  async getRowStatus(rowIndex: number): Promise<string> {
    const statusCell = this.reviewStep.getByTestId(`import_status_${rowIndex}`);
    const status = await statusCell.getAttribute("data-status");
    if (status && status !== "idle") return status;
    // idle → fall back to the row's action (e.g. "duplicate", "skip")
    const actionSelect = this.reviewStep.getByTestId(`select_import_action_${rowIndex}`);
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
    await this.reviewStep.getByTestId(`btn_create_category_row_${rowIndex}`).click();
    await expect(
      this.page
        .getByTestId("drawer_create_category")
        .getByTestId("btn_new_category_in_drawer"),
    ).toBeVisible({ timeout: 5000 });
  }

  /** Click the + button next to the account select in the upload step header. */
  async openCreateAccountDrawerFromHeader() {
    await this.uploadStep.getByTestId("btn_create_account_header").click();
    await expect(this.page.getByTestId("account_form")).toBeVisible({ timeout: 5000 });
  }

  /** Create a new category inside the category drawer and close it. */
  async createCategoryInDrawer(name: string, opts?: { emoji?: string }) {
    const drawer = this.page.getByTestId("drawer_create_category");
    // Click "Nova Categoria" to show the inline input (may already be visible)
    const newButton = drawer.getByTestId("btn_new_category_in_drawer");
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
      // Find the newly created category's emoji button and extract category ID
      const categoryRow = drawer.getByText(name).locator("..").locator("..");
      const emojiButton = categoryRow.locator("[data-testid^='btn_emoji_']");
      const emojiTestId = await emojiButton.getAttribute("data-testid");
      const categoryId = emojiTestId!.replace("btn_emoji_", "");
      await emojiButton.click();
      const emojiOption = this.page.getByTestId(`emoji_${opts.emoji}`).first();
      await expect(emojiOption).toBeVisible({ timeout: 5000 });
      await emojiOption.click();
      // Close the emoji picker drawer (saves on close)
      const emojiDrawer = this.page.getByTestId(`drawer_emoji_picker_${categoryId}`);
      await emojiDrawer.getByRole("button", { name: "Fechar" }).click();
      await expect(emojiDrawer).not.toBeVisible({ timeout: 5000 });
      // Wait for save to complete
      await this.page.waitForLoadState("networkidle");
    }

    // Close the drawer
    await drawer.getByTestId("btn_close_create_category_drawer").click();
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
    const checkbox = this.reviewStep
      .getByTestId(`checkbox_import_row_${rowIndex}`)
      .locator("input");
    if (options?.shiftKey) {
      await checkbox.click({ modifiers: ["Shift"] });
    } else {
      await checkbox.click();
    }
  }

  /** Return whether a row's checkbox is checked. */
  async isRowSelected(rowIndex: number): Promise<boolean> {
    return this.reviewStep
      .getByTestId(`checkbox_import_row_${rowIndex}`)
      .locator("input")
      .isChecked();
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
