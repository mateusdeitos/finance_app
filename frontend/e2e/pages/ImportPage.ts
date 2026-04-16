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
    const select = this.uploadStep.getByTestId("select_import_account");
    await select.click();
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
    // Wait for the summary alert that appears after the import loop finishes
    await expect(this.finishedStep.getByText("Importação concluída")).toBeVisible({
      timeout: 30000,
    });
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
