import { test, expect } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategory,
  apiDeleteCategory,
  apiListTransactions,
} from "../helpers/api";
import { buildCsvContent } from "../helpers/csv";

/**
 * Import Installment E2E Tests
 *
 * Validates that installment settings (parcelamento) configured in the import
 * review step are persisted correctly in the created transaction.
 *
 * Flow:
 *   1. Upload a CSV with a single expense row.
 *   2. Configure installments via the recurrence popover (e.g. 1/3 monthly).
 *   3. Confirm import.
 *   4. Fetch the created transaction via the API and assert that
 *      `transaction_recurrence` reflects the configured settings.
 */

test.describe("Import with installment settings", () => {
  let importPage: ImportPage;
  let testAccountId: number;
  let testAccountName: string;
  let testCategoryId: number;
  let testCategoryName: string;

  test.beforeAll(async () => {
    testAccountName = `Conta Parcela Import ${Date.now()}`;
    const account = await apiCreateAccount({
      name: testAccountName,
      initial_balance: 0,
    });
    testAccountId = account.id;

    testCategoryName = `Cat Parcela Import ${Date.now()}`;
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

  test("installment settings are saved: transaction has correct recurrence after import", async () => {
    const description = `Parcelado Import ${Date.now()}`;
    // Use a fixed date so we know which month/year to query
    const csv = buildCsvContent([["15/03/2026", description, "-300,00"]]);

    await importPage.uploadCSV(csv, testAccountId);

    // Set category (required for expenses)
    await importPage.setRowCategory(0, testCategoryId);

    // Configure 1/3 monthly installments
    await importPage.setRowInstallments(0, { type: "monthly", current: 1, total: 3 });

    // Confirm import
    await importPage.confirmImport();

    // Fetch transactions for March 2026 and find the imported one
    const transactions = await apiListTransactions(3, 2026);
    const tx = transactions.find((t) => t.description === description);

    expect(tx, "transaction should exist after import").toBeDefined();
    expect(tx!.transaction_recurrence_id, "should have a recurrence id").not.toBeNull();
    expect(tx!.transaction_recurrence_id, "should have a recurrence id").not.toBeUndefined();
    expect(tx!.installment_number).toBe(1);
    expect(tx!.transaction_recurrence?.type).toBe("monthly");
    expect(tx!.transaction_recurrence?.installments).toBe(3);
  });
});
