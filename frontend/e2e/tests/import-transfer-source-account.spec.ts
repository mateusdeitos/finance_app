import { test, expect } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import {
  apiFetchAs,
  apiListTransactions,
  getAuthTokenForUser,
  openAuthedPage,
} from "../helpers/api";
import { buildCsvContent } from "../helpers/csv";
import { ImportTestIds } from "@/testIds";

/**
 * Import transfer source-account E2E (issue #127).
 *
 * Validates that during transaction import, the user can pick BOTH the source
 * and destination accounts on transfer rows — previously, the source was
 * silently fixed to the import's default account. Also verifies the
 * cross-filter that prevents picking the same account in both selects.
 */

const DATE_DDMMYYYY = "10/04/2026";
const PERIOD = { month: 4, year: 2026 } as const;

async function setupUser() {
  const email = `e2e-import-transfer-src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@financeapp.local`;
  const token = await getAuthTokenForUser(email);

  const accA = await apiFetchAs(token, "/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name: "Conta A", initial_balance: 0 }),
  }).then((r) => r.json() as Promise<{ id: number }>);

  const accB = await apiFetchAs(token, "/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name: "Conta B", initial_balance: 0 }),
  }).then((r) => r.json() as Promise<{ id: number }>);

  return { token, accA: accA.id, accB: accB.id };
}

test.describe("Import: transfer source account", () => {
  test("user can override the source account on a transfer row", async ({ browser }) => {
    const { token, accA, accB } = await setupUser();
    const page = await openAuthedPage(browser, token);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const description = `Transferencia Import ${Date.now()}`;
    const csv = buildCsvContent([[DATE_DDMMYYYY, description, "-150,00"]]);
    // Upload with account A as the import default.
    await importPage.uploadCSV(csv, accA);

    // Switch the row to transfer, then explicitly set source=B and destination=A
    // (the opposite of what the legacy behavior would have produced).
    await importPage.setRowTransactionType(0, "transfer");
    await importPage.setRowSourceAccount(0, accB);
    await importPage.setRowDestinationAccount(0, accA);

    await importPage.confirmImport();
    expect(await importPage.getRowStatus(0)).toBe("success");

    const transactions = await apiListTransactions(PERIOD.month, PERIOD.year, { token });
    const tx = transactions.find((t) => t.description === description && t.account_id === accB);

    expect(tx, "transfer should exist on the chosen source account (B)").toBeDefined();
    expect(tx!.type).toBe("transfer");
    expect(tx!.operation_type).toBe("debit");
    const linked = tx!.linked_transactions ?? [];
    expect(
      linked.some((l) => l.account_id === accA),
      "linked credit transaction should land on destination A",
    ).toBe(true);

    await page.close();
  });

  test("destination select excludes the currently selected source account", async ({ browser }) => {
    const { token, accA, accB } = await setupUser();
    const page = await openAuthedPage(browser, token);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const description = `Transferencia Crossfilter ${Date.now()}`;
    const csv = buildCsvContent([[DATE_DDMMYYYY, description, "-150,00"]]);
    await importPage.uploadCSV(csv, accA);

    await importPage.setRowTransactionType(0, "transfer");
    // Source defaults to the import account (accA). Open the destination
    // select and verify accA is NOT offered as an option (cross-filter).
    await page.getByTestId(ImportTestIds.RowSelectDestinationAccount(0)).click();
    await expect(
      page.getByTestId(ImportTestIds.RowOptionDestinationAccount(0, accA)),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(ImportTestIds.RowOptionDestinationAccount(0, accB)),
    ).toBeVisible();

    await page.close();
  });
});
