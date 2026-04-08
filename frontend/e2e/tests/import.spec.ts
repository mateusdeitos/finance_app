import { test, expect } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategory,
  apiDeleteCategory,
  apiCreateTransaction,
  apiDeleteTransaction,
} from "../helpers/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CSV_HEADER =
  "Data;Descrição;Tipo;Valor;Categoria;Conta Destino;Tipo de Parcelamento;Quantidade de Parcelas";

function buildCsvContent(rows: string[][]): string {
  return [CSV_HEADER, ...rows.map((r) => r.join(";"))].join("\n");
}

/** Format a Date as DD/MM/YYYY for the CSV. */
function formatDateBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Format a Date as YYYY-MM-DD for the API. */
function formatDateISO(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ─── Test suite ────────────────────────────────────────────────────────────────

test.describe("Import transactions", () => {
  let importPage: ImportPage;
  let testAccountId: number;
  let testAccountName: string;
  let testCategoryId: number;
  let testCategoryName: string;
  const createdTransactionIds: number[] = [];

  test.beforeAll(async () => {
    testAccountName = `Conta Import ${Date.now()}`;
    const account = await apiCreateAccount({
      name: testAccountName,
      initial_balance: 0,
    });
    testAccountId = account.id;

    // Category is required for non-transfer expense/income transactions
    const category = await apiCreateCategory({
      name: `Cat Import ${Date.now()}`,
    });
    testCategoryId = category.id;
    testCategoryName = category.name;
  });

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined);
    }
    await apiDeleteCategory(testCategoryId).catch(() => undefined);
    await apiDeleteAccount(testAccountId).catch(() => undefined);
  });

  test.beforeEach(async ({ page }) => {
    importPage = new ImportPage(page);
    await importPage.goto();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────
  test("happy path: import a single expense", async () => {
    const description = `Mercado Import ${Date.now()}`;
    const txDate = new Date(2026, 0, 15); // 15/01/2026

    const csv = buildCsvContent([
      [
        formatDateBR(txDate),
        description,
        "despesa",
        "150,00",
        testCategoryName,
        "",
        "",
        "",
      ],
    ]);

    await importPage.uploadCSV(csv, testAccountName);

    // Verify review step shows 1 row
    const rowCount = await importPage.getRowCount();
    expect(rowCount).toBe(1);

    await importPage.confirmImport();

    // Transaction should appear on the transactions page
    await importPage.page.goto("/transactions");
    await importPage.page.waitForLoadState("networkidle");
    await expect(importPage.page.getByText(description)).toBeVisible({
      timeout: 10000,
    });
  });

  // ── Duplicate detection ────────────────────────────────────────────────────
  test("duplicate detection: row is marked as duplicate", async () => {
    const description = `Duplicado Import ${Date.now()}`;
    const txDate = new Date(2026, 1, 20); // 20/02/2026

    // Create the transaction via API first (category_id required for expenses)
    const created = await apiCreateTransaction({
      account_id: testAccountId,
      transaction_type: "expense",
      category_id: testCategoryId,
      amount: 8000,
      date: formatDateISO(txDate),
      description,
    });
    createdTransactionIds.push(created.id);

    // Now try to import the same transaction
    const csv = buildCsvContent([
      [
        formatDateBR(txDate),
        description,
        "despesa",
        "80,00",
        testCategoryName,
        "",
        "",
        "",
      ],
    ]);

    await importPage.uploadCSV(csv, testAccountName);

    // Row 0 should have action "duplicate" (detected server-side)
    const actionSelect = importPage.reviewStep.getByTestId(
      "select_import_action_0",
    );
    await expect(actionSelect.locator("input")).toHaveValue("Duplicado", {
      timeout: 5000,
    });
  });

  // ── Skip a row ─────────────────────────────────────────────────────────────
  test("skip a row: only one transaction is imported", async () => {
    const description1 = `Importar ${Date.now()}`;
    const description2 = `Pular ${Date.now()}`;
    const txDate = new Date(2026, 2, 10); // 10/03/2026

    const csv = buildCsvContent([
      [
        formatDateBR(txDate),
        description1,
        "despesa",
        "50,00",
        testCategoryName,
        "",
        "",
        "",
      ],
      [
        formatDateBR(txDate),
        description2,
        "despesa",
        "75,00",
        testCategoryName,
        "",
        "",
        "",
      ],
    ]);

    await importPage.uploadCSV(csv, testAccountName);

    // Change row 1 action to "skip"
    await importPage.setRowAction(1, "skip");

    await importPage.confirmImport();

    // description1 should appear; description2 should not
    await importPage.page.goto("/transactions");
    await importPage.page.waitForLoadState("networkidle");
    await expect(importPage.page.getByText(description1)).toBeVisible({
      timeout: 10000,
    });
    await expect(importPage.page.getByText(description2)).not.toBeVisible();
  });

  // ── Invalid CSV ────────────────────────────────────────────────────────────
  test("invalid CSV: shows error message when header is missing required column", async () => {
    const invalidCsv = "Data;Descrição;Tipo\n15/01/2026;Teste;despesa";

    await importPage.selectAccount(testAccountName);
    await importPage.uploadCSVContent(invalidCsv);
    await importPage.processButton.click();

    // Should show an error alert, not navigate to review step
    await expect(importPage.uploadStep.getByRole("alert")).toBeVisible({
      timeout: 8000,
    });
    await expect(importPage.reviewStep).not.toBeVisible();
  });
});
