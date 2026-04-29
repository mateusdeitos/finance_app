import { test, expect } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateTransaction,
  apiDeleteTransaction,
  apiCreateCategory,
  apiDeleteCategory,
  apiListTransactions,
} from "../helpers/api";
import { ImportTestIds } from '@/testIds'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CSV_HEADER = "Data;Descrição;Valor";
const CSV_HEADER_WITH_CATEGORY = "Data;Descrição;Valor;Categoria";

function buildCsvContent(rows: string[][], header = CSV_HEADER): string {
  return [header, ...rows.map((r) => r.join(";"))].join("\n");
}

function formatDateBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function formatDateISO(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ─── Category inference ─────────────────────────────────────────────────────

test.describe("Import: category column inference", () => {
  let importPage: ImportPage;
  let testAccountId: number;
  let testCategoryId: number;
  let testCategoryName: string;

  test.beforeAll(async () => {
    const uid = Date.now();
    const account = await apiCreateAccount({
      name: `Conta CatInf ${uid}`,
      initial_balance: 0,
    });
    testAccountId = account.id;

    testCategoryName = `CatInfer ${uid}`;
    const category = await apiCreateCategory({ name: testCategoryName });
    testCategoryId = category.id;
  });

  test.afterAll(async () => {
    await apiDeleteCategory(testCategoryId).catch(() => undefined);
    await apiDeleteAccount(testAccountId).catch(() => undefined);
  });

  test.beforeEach(async ({ page }) => {
    importPage = new ImportPage(page);
    await importPage.goto();
  });

  test("CSV with Categoria column pre-selects matching category", async () => {
    const description = `Cat Col Match ${Date.now()}`;
    const txDate = new Date(2026, 6, 10);

    const csv = buildCsvContent(
      [[formatDateBR(txDate), description, "-100,00", testCategoryName]],
      CSV_HEADER_WITH_CATEGORY,
    );

    await importPage.uploadCSV(csv, testAccountId);

    // Category should be auto-selected
    const categoryValue = await importPage.getRowCategoryValue(0);
    expect(categoryValue).toContain(testCategoryName);

    // Confirm import succeeds without manually selecting category
    await importPage.confirmImport();

    const transactions = await apiListTransactions(7, 2026);
    const tx = transactions.find((t) => t.description === description);
    expect(tx, "transaction should exist").toBeDefined();
    expect(tx!.category_id).toBe(testCategoryId);
  });

  test("CSV with Categoria column case-insensitive match", async () => {
    const description = `Cat Col Case ${Date.now()}`;
    const txDate = new Date(2026, 6, 11);

    const csv = buildCsvContent(
      [[formatDateBR(txDate), description, "-50,00", testCategoryName.toUpperCase()]],
      CSV_HEADER_WITH_CATEGORY,
    );

    await importPage.uploadCSV(csv, testAccountId);

    const categoryValue = await importPage.getRowCategoryValue(0);
    expect(categoryValue).toContain(testCategoryName);
  });

  test("CSV with Categoria column unknown name leaves category empty", async () => {
    const description = `Cat Col Unknown ${Date.now()}`;
    const txDate = new Date(2026, 6, 12);

    const csv = buildCsvContent(
      [[formatDateBR(txDate), description, "-75,00", "NonExistentCategory12345"]],
      CSV_HEADER_WITH_CATEGORY,
    );

    await importPage.uploadCSV(csv, testAccountId);

    const categoryValue = await importPage.getRowCategoryValue(0);
    expect(categoryValue).toBe("");
  });
});

// ─── Installment inference ─────────────────────────────────────────────────

test.describe("Import: installment inference from description", () => {
  let importPage: ImportPage;
  let testAccountId: number;
  let testCategoryId: number;

  test.beforeAll(async () => {
    const uid = Date.now();
    const account = await apiCreateAccount({
      name: `Conta InstInf ${uid}`,
      initial_balance: 0,
    });
    testAccountId = account.id;

    const category = await apiCreateCategory({ name: `CatInstInf ${uid}` });
    testCategoryId = category.id;
  });

  test.afterAll(async () => {
    await apiDeleteCategory(testCategoryId).catch(() => undefined);
    await apiDeleteAccount(testAccountId).catch(() => undefined);
  });

  test.beforeEach(async ({ page }) => {
    importPage = new ImportPage(page);
    await importPage.goto();
  });

  test("Parcela X de Y pattern: recurrence pre-filled and description cleaned", async () => {
    const txDate = new Date(2026, 7, 15);
    const rawDesc = `Compra Parcela - Parcela 2 de 6`;

    const csv = buildCsvContent([[formatDateBR(txDate), rawDesc, "-200,00"]]);

    await importPage.uploadCSV(csv, testAccountId);
    await importPage.setRowCategory(0, testCategoryId);

    // Recurrence button should show pre-filled summary (e.g. "6x (Mensal)")
    const recurrenceBtn = importPage.reviewStep.getByTestId(
      ImportTestIds.RowBtnRecurrencePopover(0),
    );
    await expect(recurrenceBtn).toContainText("6x", { timeout: 5000 });

    await importPage.confirmImport();

    const transactions = await apiListTransactions(8, 2026);
    const tx = transactions.find((t) => t.description === "Compra Parcela");
    expect(tx, "transaction should exist with cleaned description").toBeDefined();
    expect(tx!.installment_number).toBe(2);
    expect(tx!.transaction_recurrence?.type).toBe("monthly");
    expect(tx!.transaction_recurrence?.installments).toBe(6);
  });

  test("(X/Y) slash pattern: recurrence pre-filled and description cleaned", async () => {
    const txDate = new Date(2026, 7, 16);
    const rawDesc = `Loja Online (3/12)`;

    const csv = buildCsvContent([[formatDateBR(txDate), rawDesc, "-150,00"]]);

    await importPage.uploadCSV(csv, testAccountId);
    await importPage.setRowCategory(0, testCategoryId);

    const recurrenceBtn = importPage.reviewStep.getByTestId(
      ImportTestIds.RowBtnRecurrencePopover(0),
    );
    await expect(recurrenceBtn).toContainText("12x", { timeout: 5000 });

    await importPage.confirmImport();

    const transactions = await apiListTransactions(8, 2026);
    const tx = transactions.find((t) => t.description === "Loja Online");
    expect(tx, "transaction should exist with cleaned description").toBeDefined();
    expect(tx!.installment_number).toBe(3);
    expect(tx!.transaction_recurrence?.installments).toBe(12);
  });

  test("no installment pattern: no recurrence pre-filled", async () => {
    const description = `Aluguel Normal ${Date.now()}`;
    const txDate = new Date(2026, 7, 17);

    const csv = buildCsvContent([[formatDateBR(txDate), description, "-1500,00"]]);

    await importPage.uploadCSV(csv, testAccountId);

    // Recurrence button should show default "Parcelamento" (no pre-fill)
    const recurrenceBtn = importPage.reviewStep.getByTestId(
      ImportTestIds.RowBtnRecurrencePopover(0),
    );
    await expect(recurrenceBtn).toContainText("Parcelamento");
  });
});

// ─── Duplicate detection without description ────────────────────────────────

test.describe("Import: duplicate detection ignores description", () => {
  let importPage: ImportPage;
  let testAccountId: number;
  let testCategoryId: number;
  const createdTransactionIds: number[] = [];

  test.beforeAll(async () => {
    const uid = Date.now();
    const account = await apiCreateAccount({
      name: `Conta DupNoDesc ${uid}`,
      initial_balance: 0,
    });
    testAccountId = account.id;

    const category = await apiCreateCategory({ name: `CatDupNoDesc ${uid}` });
    testCategoryId = category.id;
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

  test("same date+amount but different description is detected as duplicate", async () => {
    const txDate = new Date(2026, 8, 10);

    // Pre-create transaction with one description
    const created = await apiCreateTransaction({
      account_id: testAccountId,
      transaction_type: "expense",
      category_id: testCategoryId,
      amount: 15000,
      date: formatDateISO(txDate),
      description: `Original Desc ${Date.now()}`,
    });
    createdTransactionIds.push(created.id);

    // Import CSV with same date+amount but completely different description
    const csv = buildCsvContent([
      [formatDateBR(txDate), `Totally Different ${Date.now()}`, "-150,00"],
    ]);

    await importPage.uploadCSV(csv, testAccountId);

    // Should be marked as duplicate despite different description
    const actionSelect = importPage.reviewStep.getByTestId(ImportTestIds.RowSelectAction(0));
    await expect(actionSelect).toHaveValue("Duplicado", { timeout: 5000 });
  });

  test("same date but different amount is NOT a duplicate", async () => {
    const txDate = new Date(2026, 8, 11);

    const created = await apiCreateTransaction({
      account_id: testAccountId,
      transaction_type: "expense",
      category_id: testCategoryId,
      amount: 20000,
      date: formatDateISO(txDate),
      description: `Amt Diff ${Date.now()}`,
    });
    createdTransactionIds.push(created.id);

    // Import CSV with same date but different amount
    const csv = buildCsvContent([
      [formatDateBR(txDate), `Amt Diff Other ${Date.now()}`, "-99,00"],
    ]);

    await importPage.uploadCSV(csv, testAccountId);

    const actionSelect = importPage.reviewStep.getByTestId(ImportTestIds.RowSelectAction(0));
    await expect(actionSelect).toHaveValue("Importar", { timeout: 5000 });
  });
});
