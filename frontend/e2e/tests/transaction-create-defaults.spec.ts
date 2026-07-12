import { test, expect } from "@playwright/test";
import { TransactionsPage } from "../pages/TransactionsPage";
import {
  apiCreateAccount,
  apiCreateCategory,
  apiFetchAs,
  getAuthTokenForUser,
  openAuthedPage,
} from "../helpers/api";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";

const now = new Date();
const MONTH = now.getMonth() + 1;
const YEAR = now.getFullYear();

async function listTransactions(token: string): Promise<Transactions.Transaction[]> {
  const res = await apiFetchAs(token, `/api/transactions?month=${MONTH}&year=${YEAR}`);
  return res.json() as Promise<Transactions.Transaction[]>;
}

test.describe("Create-transaction defaults", () => {
  // When the list is filtered to a single account, the create form defaults to
  // that account regardless of the localStorage prefill.
  test("new transaction defaults to the single filtered account", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-create-filter-${Date.now()}@financeapp.local`);
    const accountA = await apiCreateAccount({ name: "Conta A", initial_balance: 0 }, { token });
    await apiCreateAccount({ name: "Conta B", initial_balance: 0 }, { token });
    const category = await apiCreateCategory({ name: "Categoria Filtro" }, { token });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    await txPage.goto();

    await txPage.filterByAccount(accountA.id);
    await txPage.openCreateForm();

    // The account select is pre-filled with the filtered account.
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.SelectAccount)).toHaveValue(
      "Conta A",
    );

    // And it persists on submit without the user touching the account field.
    const description = `Filtro Default ${Date.now()}`;
    await txPage.fillDescription(description);
    await txPage.fillAmount(3000);
    await txPage.selectCategory(category.id);
    await txPage.submitForm();

    const created = (await listTransactions(token)).find((t) => t.description === description);
    expect(created?.account_id).toBe(accountA.id);

    await page.close();
  });

  // "Salvar e criar outra" keeps the shared fields (account, category) and only
  // clears amount + description so a batch of similar entries is fast.
  test("save-and-create-another keeps account/category and clears amount/description", async ({
    browser,
  }) => {
    const token = await getAuthTokenForUser(`e2e-create-another-${Date.now()}@financeapp.local`);
    const account = await apiCreateAccount({ name: "Conta Lote", initial_balance: 0 }, { token });
    const category = await apiCreateCategory({ name: "Categoria Lote" }, { token });

    const page = await openAuthedPage(browser, token);
    const txPage = new TransactionsPage(page);
    await txPage.goto();
    await txPage.openCreateForm();

    const first = `Primeira Lote ${Date.now()}`;
    await txPage.fillExpense(5000, first, account.id, category.id);
    await txPage.saveAndCreateAnother();

    // Amount and description are cleared; account and category carry over.
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.InputAmount)).toHaveValue("0,00");
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.InputDescription)).toHaveValue("");
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.SelectAccount)).toHaveValue(
      "Conta Lote",
    );
    await expect(txPage.formDrawer.getByTestId(TransactionsTestIds.SelectCategory)).toHaveValue(
      "Categoria Lote",
    );

    // Fill only the per-entry fields and save the second transaction.
    const second = `Segunda Lote ${Date.now()}`;
    await txPage.fillDescription(second);
    await txPage.fillAmount(7000);
    await txPage.submitForm();

    const txs = await listTransactions(token);
    const firstTx = txs.find((t) => t.description === first);
    const secondTx = txs.find((t) => t.description === second);
    expect(firstTx?.account_id).toBe(account.id);
    expect(firstTx?.category_id).toBe(category.id);
    expect(firstTx?.amount).toBe(5000);
    expect(secondTx?.account_id).toBe(account.id);
    expect(secondTx?.category_id).toBe(category.id);
    expect(secondTx?.amount).toBe(7000);

    await page.close();
  });
});
