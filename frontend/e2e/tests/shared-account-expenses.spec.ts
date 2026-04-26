import { test, expect } from "@playwright/test";
import { TransactionsPage } from "../pages/TransactionsPage";
import { TransactionsTestIds } from "@/testIds";
import { createUserAndPartner, type UserAndPartnerResult } from "../helpers/createUserAndPartner";
import {
  apiFetchAs,
  apiListTransactions,
  openAuthedPage,
} from "../helpers/api";

const now = new Date();
const MONTH = now.getMonth() + 1;
const YEAR = now.getFullYear();

test.describe("Shared account expenses", () => {
  let setup: UserAndPartnerResult;
  let categoryId: number;
  let sharedAccountId: number;

  test.beforeAll(async () => {
    setup = await createUserAndPartner("e2e-shared-acct");

    // Create a category for the primary user
    const catRes = await apiFetchAs(setup.userToken, "/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: `Cat ${Date.now()}` }),
    });
    const cat = (await catRes.json()) as { id: number };
    categoryId = cat.id;

    // The shared account is the one backing the user connection.
    sharedAccountId = setup.userConnAccountId;
  });

  test("create expense on shared account creates inverted tx for partner", async ({
    browser,
  }) => {
    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    await txPage.gotoMonth(MONTH, YEAR);

    await txPage.openCreateForm();
    await txPage.fillDescription("Shared expense test");
    await txPage.fillAmount(5000);
    await txPage.selectAccount(sharedAccountId);
    await txPage.selectCategory(categoryId);

    // Split settings should NOT be visible when shared account is selected
    await expect(
      page.getByTestId(TransactionsTestIds.BtnAddSplitRow),
    ).not.toBeVisible();

    await txPage.submitForm();

    // Verify user1 sees the expense
    const userTxs = await apiListTransactions(MONTH, YEAR, {
      token: setup.userToken,
    });
    const userExpense = userTxs.find(
      (t) => t.description === "Shared expense test",
    );
    expect(userExpense).toBeDefined();
    expect(userExpense!.type).toBe("expense");
    expect(userExpense!.operation_type).toBe("debit");
    expect(userExpense!.account_id).toBe(setup.userConnAccountId);

    // Verify partner sees the inverted income
    const partnerTxs = await apiListTransactions(MONTH, YEAR, {
      token: setup.partnerToken,
    });
    const partnerIncome = partnerTxs.find(
      (t) => t.description === "Shared expense test",
    );
    expect(partnerIncome).toBeDefined();
    expect(partnerIncome!.type).toBe("income");
    expect(partnerIncome!.operation_type).toBe("credit");
    expect(partnerIncome!.account_id).toBe(setup.partnerConnAccountId);

    await page.close();
  });

  test("create income on shared account creates inverted tx for partner", async ({
    browser,
  }) => {
    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    await txPage.gotoMonth(MONTH, YEAR);

    await txPage.openCreateForm();
    await txPage.selectType("income");
    await txPage.fillDescription("Shared income test");
    await txPage.fillAmount(3000);
    await txPage.selectAccount(sharedAccountId);
    await txPage.selectCategory(categoryId);

    await txPage.submitForm();

    // Verify user1 sees the income
    const userTxs = await apiListTransactions(MONTH, YEAR, {
      token: setup.userToken,
    });
    const userIncome = userTxs.find(
      (t) => t.description === "Shared income test",
    );
    expect(userIncome).toBeDefined();
    expect(userIncome!.type).toBe("income");
    expect(userIncome!.operation_type).toBe("credit");

    // Verify partner sees the inverted expense
    const partnerTxs = await apiListTransactions(MONTH, YEAR, {
      token: setup.partnerToken,
    });
    const partnerExpense = partnerTxs.find(
      (t) => t.description === "Shared income test",
    );
    expect(partnerExpense).toBeDefined();
    expect(partnerExpense!.type).toBe("expense");
    expect(partnerExpense!.operation_type).toBe("debit");

    await page.close();
  });

  test("shared accounts not visible in transfer source selector", async ({
    browser,
  }) => {
    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);
    await txPage.gotoMonth(MONTH, YEAR);

    await txPage.openCreateForm();
    await txPage.selectType("transfer");

    // Open the source account dropdown and verify the shared account option is not listed
    const sourceInput = page.getByTestId(TransactionsTestIds.SelectAccount);
    await sourceInput.click();
    await expect(
      page.getByTestId(TransactionsTestIds.OptionAccount(sharedAccountId)),
    ).not.toBeVisible();

    await page.close();
  });
});
