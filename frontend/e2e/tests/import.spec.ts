import { test, expect } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateTransaction,
  apiDeleteTransaction,
  apiCreateCategory,
  apiDeleteCategory,
} from "../helpers/api";
import { buildCsvContent, formatDateBR } from "../helpers/csv";
import { ImportTestIds } from '@/testIds'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

    testCategoryName = `Categoria Import ${Date.now()}`;
    const category = await apiCreateCategory({
      name: testCategoryName,
    });
    testCategoryId = category.id;
  });

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined);
    }
    await apiDeleteCategory(testCategoryId).catch(() => undefined);
    await apiDeleteAccount(testAccountId).catch(() => undefined);
    await apiDeleteCategory(testCategoryId).catch(() => undefined);
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
      [formatDateBR(txDate), description, "-150,00"],
    ]);

    await importPage.uploadCSV(csv, testAccountId);

    // Verify review step shows 1 row
    const rowCount = await importPage.getRowCount();
    expect(rowCount).toBe(1);

    // Category is required for non-transfer rows before confirming
    await importPage.setRowCategory(0, testCategoryId);

    await importPage.confirmImport();

    // Transaction should appear somewhere on the transactions page
    const month = txDate.getMonth() + 1;
    const year = txDate.getFullYear();
    await importPage.page.goto(`/transactions?month=${month}&year=${year}`);
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
      [formatDateBR(txDate), description, "-80,00"],
    ]);

    await importPage.uploadCSV(csv, testAccountId);

    // Row 0 should have action "duplicate" (detected server-side)
    const actionSelect = importPage.reviewStep.getByTestId(ImportTestIds.RowSelectAction(0));
    await expect(actionSelect).toHaveValue("Duplicado", {
      timeout: 5000,
    });
  });

  // ── Skip a row ─────────────────────────────────────────────────────────────
  test("skip a row: only one transaction is imported", async () => {
    const description1 = `Importar ${Date.now()}`;
    const description2 = `Pular ${Date.now()}`;
    const txDate = new Date(2026, 2, 10); // 10/03/2026

    const csv = buildCsvContent([
      [formatDateBR(txDate), description1, "-50,00"],
      [formatDateBR(txDate), description2, "-75,00"],
    ]);

    await importPage.uploadCSV(csv, testAccountId);

    // Change row 1 action to "skip"
    await importPage.setRowAction(1, "skip");

    // Category is required for the row being imported
    await importPage.setRowCategory(0, testCategoryId);

    await importPage.confirmImport();

    // description1 should appear; description2 should not
    const month = txDate.getMonth() + 1;
    const year = txDate.getFullYear();
    await importPage.page.goto(`/transactions?month=${month}&year=${year}`);
    await importPage.page.waitForLoadState("networkidle");
    await expect(importPage.page.getByText(description1)).toBeVisible({
      timeout: 10000,
    });
    await expect(importPage.page.getByText(description2)).not.toBeVisible();
  });

  // ── Inline category creation ────────────────────────────────────────────────
  test("create category inline: auto-selects in row after drawer close", async () => {
    const description = `Cat Inline ${Date.now()}`;
    const newCategoryName = `Nova Cat ${Date.now()}`;
    const txDate = new Date(2026, 3, 20); // 20/04/2026

    const csv = buildCsvContent([
      [formatDateBR(txDate), description, "-30,00"],
    ]);

    await importPage.uploadCSV(csv, testAccountId);

    // Open category drawer from the + button on row 0
    await importPage.openCreateCategoryDrawer(0);

    // Create a category inside the drawer and close it
    await importPage.createCategoryInDrawer(newCategoryName);

    // Category should be auto-selected in row 0 after drawer close
    // Wait for Mantine Select to reflect the new value after form.setValue + re-render
    await expect(importPage.reviewStep.getByTestId(ImportTestIds.RowSelectCategory(0)))
      .toHaveValue(newCategoryName, { timeout: 5000 });

    // Confirm import succeeds with the auto-selected category
    await importPage.confirmImport();

    const month = txDate.getMonth() + 1;
    const year = txDate.getFullYear();
    await importPage.page.goto(`/transactions?month=${month}&year=${year}`);
    await importPage.page.waitForLoadState("networkidle");
    await expect(importPage.page.getByText(description)).toBeVisible({
      timeout: 10000,
    });
  });

  // ── Inline category creation with emoji ─────────────────────────────────────
  test("create category with emoji inline: emoji appears in select label", async () => {
    const description = `Cat Emoji ${Date.now()}`;
    const newCategoryName = `Emoji Cat ${Date.now()}`;
    const emoji = "🏠";
    const txDate = new Date(2026, 4, 5); // 05/05/2026

    const csv = buildCsvContent([
      [formatDateBR(txDate), description, "-45,00"],
    ]);

    await importPage.uploadCSV(csv, testAccountId);

    // Open category drawer and create a category with emoji
    await importPage.openCreateCategoryDrawer(0);
    await importPage.createCategoryInDrawer(newCategoryName, { emoji });

    // Category should be auto-selected with emoji prefix in the select
    await expect(importPage.reviewStep.getByTestId(ImportTestIds.RowSelectCategory(0)))
      .toHaveValue(`${emoji} ${newCategoryName}`, { timeout: 5000 });
  });

  // ── Inline account creation ────────────────────────────────────────────────
  test("create account inline: auto-selects in header after drawer close", async () => {
    const newAccountName = `Nova Conta Import ${Date.now()}`;

    // Open account drawer from the + button in the upload step header
    await importPage.openCreateAccountDrawerFromHeader();

    // Create account inside the drawer
    await importPage.createAccountInDrawer(newAccountName);

    // Account should be auto-selected in the header select after drawer close
    const selectedValue = await importPage.getHeaderAccountValue();
    expect(selectedValue).toBe(newAccountName);
  });

  // ── Invalid CSV ────────────────────────────────────────────────────────────
  test("invalid CSV: shows error message when header is missing required column", async () => {
    const invalidCsv = "Data;Descrição\n15/01/2026;Teste";

    await importPage.selectAccount(testAccountId);
    await importPage.uploadCSVContent(invalidCsv);
    await importPage.processButton.click();

    // Should show an error alert, not navigate to review step
    await expect(importPage.uploadStep.getByRole("alert")).toBeVisible({
      timeout: 8000,
    });
    await expect(importPage.reviewStep).not.toBeVisible();
  });
});
