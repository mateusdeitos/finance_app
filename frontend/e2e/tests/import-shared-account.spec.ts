import { test, expect } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import { createUserAndPartner, type UserAndPartnerResult } from "../helpers/createUserAndPartner";
import { apiFetchAs, apiListTransactions, openAuthedPage } from "../helpers/api";
import { buildCsvContent } from "../helpers/csv";
import { ImportTestIds } from "@/testIds";

/**
 * Import to shared account E2E tests.
 *
 * Expenses/incomes can be posted directly to a shared (connection) account,
 * so the import flow must allow picking one. Splits, however, are not allowed
 * on shared accounts — the split option must disappear for those rows.
 */

const now = new Date();
const MONTH = now.getMonth() + 1;
const YEAR = now.getFullYear();
const importDate = `15/${String(MONTH).padStart(2, "0")}/${YEAR}`;

test.describe("Import to shared account", () => {
  let setup: UserAndPartnerResult;
  let categoryId: number;

  test.beforeAll(async () => {
    setup = await createUserAndPartner("e2e-import-shared");

    const catRes = await apiFetchAs(setup.userToken, "/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: `Cat Import Shared ${Date.now()}` }),
    });
    const cat = (await catRes.json()) as { id: number };
    categoryId = cat.id;
  });

  test("imports an expense onto a shared account and partner sees inverted income", async ({
    browser,
  }) => {
    const page = await openAuthedPage(browser, setup.userToken);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const description = `Imported shared expense ${Date.now()}`;
    const csv = buildCsvContent([[importDate, description, "-100,00"]]);

    // Selecting the shared account is the behavior under test.
    await importPage.uploadCSV(csv, setup.userConnAccountId);
    await importPage.setRowCategory(0, categoryId);

    // Splits are not allowed on shared accounts — the popover must be gone.
    await expect(
      importPage.reviewStep.getByTestId(ImportTestIds.RowBtnSplitPopover(0)),
    ).not.toBeVisible();

    await importPage.confirmImport();
    await expect(page.getByText("Importação concluída com sucesso")).toBeVisible({
      timeout: 15000,
    });

    // Primary user sees the expense on the shared account.
    const userTxs = await apiListTransactions(MONTH, YEAR, { token: setup.userToken });
    const userExpense = userTxs.find((t) => t.description === description);
    expect(userExpense).toBeDefined();
    expect(userExpense!.type).toBe("expense");
    expect(userExpense!.operation_type).toBe("debit");
    expect(userExpense!.account_id).toBe(setup.userConnAccountId);

    // Partner sees the inverted income on their side of the connection.
    const partnerTxs = await apiListTransactions(MONTH, YEAR, { token: setup.partnerToken });
    const partnerIncome = partnerTxs.find((t) => t.description === description);
    expect(partnerIncome).toBeDefined();
    expect(partnerIncome!.type).toBe("income");
    expect(partnerIncome!.operation_type).toBe("credit");
    expect(partnerIncome!.account_id).toBe(setup.partnerConnAccountId);

    await page.close();
  });
});
