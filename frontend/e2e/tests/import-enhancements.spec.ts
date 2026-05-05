import { test, expect } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import {
  getAuthTokenForUser,
  openAuthedPage,
  apiFetchAs,
} from "../helpers/api";
import { ImportTestIds } from '@/testIds'
import type { Transactions } from '@/types/transactions'

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

function localMidnightISO(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

/** Create a fresh user with account and category, return all handles. */
async function createTestUser(suffix: string) {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `e2e-${suffix}-${uid}@financeapp.local`;
  const token = await getAuthTokenForUser(email);

  const accountRes = await apiFetchAs(token, "/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name: `Account ${uid}`, initial_balance: 0 }),
  });
  const account = (await accountRes.json()) as { id: number; name: string };

  const categoryName = `Category ${uid}`;
  const catRes = await apiFetchAs(token, "/api/categories", {
    method: "POST",
    body: JSON.stringify({ name: categoryName }),
  });
  const category = (await catRes.json()) as { id: number; name: string };

  return { token, email, accountId: account.id, categoryId: category.id, categoryName };
}

async function createTransactionAs(
  token: string,
  payload: { account_id: number; category_id: number; amount: number; date: string; description: string },
) {
  const res = await apiFetchAs(token, "/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      transaction_type: "expense",
      ...payload,
      date: localMidnightISO(payload.date),
    }),
  });
  return (await res.json()) as { id: number };
}

async function listTransactionsAs(token: string, month: number, year: number) {
  const res = await apiFetchAs(token, `/api/transactions?month=${month}&year=${year}`);
  return (await res.json()) as Transactions.Transaction[];
}

// ─── Category inference ─────────────────────────────────────────────────────

test.describe("Import: category column inference", () => {
  test("CSV with Categoria column pre-selects matching category", async ({ browser }) => {
    const user = await createTestUser("cat-match");
    const page = await openAuthedPage(browser, user.token);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const description = `Cat Col Match ${Date.now()}`;
    const txDate = new Date(2026, 6, 10);

    const csv = buildCsvContent(
      [[formatDateBR(txDate), description, "-100,00", user.categoryName]],
      CSV_HEADER_WITH_CATEGORY,
    );

    await importPage.uploadCSV(csv, user.accountId);

    const categoryValue = await importPage.getRowCategoryValue(0);
    expect(categoryValue).toContain(user.categoryName);

    await importPage.confirmImport();

    const transactions = await listTransactionsAs(user.token, 7, 2026);
    const tx = transactions.find((t) => t.description === description);
    expect(tx, "transaction should exist").toBeDefined();
    expect(tx!.category_id).toBe(user.categoryId);

    await page.close();
  });

  test("CSV with Categoria column case-insensitive match", async ({ browser }) => {
    const user = await createTestUser("cat-case");
    const page = await openAuthedPage(browser, user.token);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const txDate = new Date(2026, 6, 11);

    const csv = buildCsvContent(
      [[formatDateBR(txDate), `Cat Case ${Date.now()}`, "-50,00", user.categoryName.toUpperCase()]],
      CSV_HEADER_WITH_CATEGORY,
    );

    await importPage.uploadCSV(csv, user.accountId);

    const categoryValue = await importPage.getRowCategoryValue(0);
    expect(categoryValue).toContain(user.categoryName);

    await page.close();
  });

  test("CSV with Categoria column unknown name leaves category empty", async ({ browser }) => {
    const user = await createTestUser("cat-unknown");
    const page = await openAuthedPage(browser, user.token);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const txDate = new Date(2026, 6, 12);

    const csv = buildCsvContent(
      [[formatDateBR(txDate), `Cat Unknown ${Date.now()}`, "-75,00", "NonExistentCategory12345"]],
      CSV_HEADER_WITH_CATEGORY,
    );

    await importPage.uploadCSV(csv, user.accountId);

    const categoryValue = await importPage.getRowCategoryValue(0);
    expect(categoryValue).toBe("");

    await page.close();
  });
});

// ─── Installment inference ─────────────────────────────────────────────────

test.describe("Import: installment inference from description", () => {
  test("Parcela X de Y pattern: recurrence pre-filled and description cleaned", async ({ browser }) => {
    const user = await createTestUser("inst-parcela");
    const page = await openAuthedPage(browser, user.token);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const txDate = new Date(2026, 7, 15);
    const csv = buildCsvContent([[formatDateBR(txDate), "Compra Parcela - Parcela 2 de 6", "-200,00"]]);

    await importPage.uploadCSV(csv, user.accountId);
    await importPage.setRowCategory(0, user.categoryId);

    const recurrenceBtn = importPage.reviewStep.getByTestId(
      ImportTestIds.RowBtnRecurrencePopover(0),
    );
    await expect(recurrenceBtn).toContainText("6x", { timeout: 5000 });

    await importPage.confirmImport();

    const transactions = await listTransactionsAs(user.token, 8, 2026);
    const tx = transactions.find((t) => t.description === "Compra Parcela");
    expect(tx, "transaction should exist with cleaned description").toBeDefined();
    expect(tx!.installment_number).toBe(2);
    expect(tx!.transaction_recurrence?.type).toBe("monthly");
    expect(tx!.transaction_recurrence?.installments).toBe(6);

    await page.close();
  });

  test("(X/Y) slash pattern: recurrence pre-filled and description cleaned", async ({ browser }) => {
    const user = await createTestUser("inst-slash");
    const page = await openAuthedPage(browser, user.token);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const txDate = new Date(2026, 7, 16);
    const csv = buildCsvContent([[formatDateBR(txDate), "Loja Online (3/12)", "-150,00"]]);

    await importPage.uploadCSV(csv, user.accountId);
    await importPage.setRowCategory(0, user.categoryId);

    const recurrenceBtn = importPage.reviewStep.getByTestId(
      ImportTestIds.RowBtnRecurrencePopover(0),
    );
    await expect(recurrenceBtn).toContainText("12x", { timeout: 5000 });

    await importPage.confirmImport();

    const transactions = await listTransactionsAs(user.token, 8, 2026);
    const tx = transactions.find((t) => t.description === "Loja Online");
    expect(tx, "transaction should exist with cleaned description").toBeDefined();
    expect(tx!.installment_number).toBe(3);
    expect(tx!.transaction_recurrence?.installments).toBe(12);

    await page.close();
  });

  test("no installment pattern: no recurrence pre-filled", async ({ browser }) => {
    const user = await createTestUser("inst-none");
    const page = await openAuthedPage(browser, user.token);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const txDate = new Date(2026, 7, 17);
    const csv = buildCsvContent([[formatDateBR(txDate), `Aluguel Normal ${Date.now()}`, "-1500,00"]]);

    await importPage.uploadCSV(csv, user.accountId);

    const recurrenceBtn = importPage.reviewStep.getByTestId(
      ImportTestIds.RowBtnRecurrencePopover(0),
    );
    await expect(recurrenceBtn).toContainText("Parcelamento");

    await page.close();
  });
});

// ─── Duplicate detection without description ────────────────────────────────

test.describe("Import: duplicate detection ignores description", () => {
  test("same date+amount but different description is detected as duplicate", async ({ browser }) => {
    const user = await createTestUser("dup-desc");
    const txDate = new Date(2026, 8, 10);

    await createTransactionAs(user.token, {
      account_id: user.accountId,
      category_id: user.categoryId,
      amount: 15000,
      date: formatDateISO(txDate),
      description: `Original Desc ${Date.now()}`,
    });

    const page = await openAuthedPage(browser, user.token);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const csv = buildCsvContent([
      [formatDateBR(txDate), `Totally Different ${Date.now()}`, "-150,00"],
    ]);

    await importPage.uploadCSV(csv, user.accountId);

    const actionSelect = importPage.reviewStep.getByTestId(ImportTestIds.RowSelectAction(0));
    await expect(actionSelect).toHaveValue("Duplicado", { timeout: 5000 });

    await page.close();
  });

  test("same date but different amount is NOT a duplicate", async ({ browser }) => {
    const user = await createTestUser("dup-amt");
    const txDate = new Date(2026, 8, 11);

    await createTransactionAs(user.token, {
      account_id: user.accountId,
      category_id: user.categoryId,
      amount: 20000,
      date: formatDateISO(txDate),
      description: `Amt Diff ${Date.now()}`,
    });

    const page = await openAuthedPage(browser, user.token);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const csv = buildCsvContent([
      [formatDateBR(txDate), `Amt Diff Other ${Date.now()}`, "-99,00"],
    ]);

    await importPage.uploadCSV(csv, user.accountId);

    const actionSelect = importPage.reviewStep.getByTestId(ImportTestIds.RowSelectAction(0));
    await expect(actionSelect).toHaveValue("Importar", { timeout: 5000 });

    await page.close();
  });
});
