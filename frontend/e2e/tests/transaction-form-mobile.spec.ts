import { test, expect } from "@playwright/test";
import { TransactionsPage } from "../pages/TransactionsPage";
import { getAuthTokenForUser, openAuthedPage, apiFetchAs } from "../helpers/api";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";

/**
 * Mobile-viewport coverage for the transaction form. On mobile (<= 48em) the
 * date field and the account/category selects render as native controls
 * (<input type="date"> / <select>) for a better touch experience — the default
 * Playwright project runs at a desktop viewport, so these flows are exercised
 * here with an explicit mobile context.
 */

// 390×844 ≈ iPhone 12/13; well under the 48em (768px) mobile breakpoint.
const MOBILE_CONTEXT = { viewport: { width: 390, height: 844 }, hasTouch: true } as const;

/** A date within the current month that is guaranteed different from today. */
function targetDateThisMonth(): { iso: string; month: number; year: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate() === 1 ? 2 : 1;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso, month, year };
}

test.describe("Transaction form on mobile (native inputs)", () => {
  test("creates an expense using the native date input and native selects", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-mobile-expense-${Date.now()}@financeapp.local`);

    const account = (await (
      await apiFetchAs(token, "/api/accounts", {
        method: "POST",
        body: JSON.stringify({ name: "Conta Mobile", initial_balance: 0 }),
      })
    ).json()) as { id: number };

    const category = (await (
      await apiFetchAs(token, "/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: "Categoria Mobile" }),
      })
    ).json()) as { id: number };

    const page = await openAuthedPage(browser, token, MOBILE_CONTEXT);
    const transactionsPage = new TransactionsPage(page);
    await transactionsPage.goto();

    await transactionsPage.openCreateForm();
    const drawer = transactionsPage.formDrawer;

    // The form must fall back to native controls at this viewport.
    await expect(drawer.getByTestId(TransactionsTestIds.InputDate)).toHaveJSProperty("type", "date");
    await expect(drawer.getByTestId(TransactionsTestIds.SelectAccount)).toHaveJSProperty(
      "tagName",
      "SELECT",
    );
    await expect(drawer.getByTestId(TransactionsTestIds.SelectCategory)).toHaveJSProperty(
      "tagName",
      "SELECT",
    );

    const { iso, month, year } = targetDateThisMonth();
    const description = `Despesa Mobile ${Date.now()}`;
    await transactionsPage.fillExpenseNative(5000, description, account.id, category.id, iso);
    await transactionsPage.submitForm();

    await expect(page.getByText(description)).toBeVisible();

    // Persisted values match what the native controls set — in particular the
    // native date input drove `date` away from the form's "today" default.
    const txs = (await (
      await apiFetchAs(token, `/api/transactions?month=${month}&year=${year}`)
    ).json()) as Transactions.Transaction[];
    const created = txs.find((t) => t.description === description);
    expect(created).toBeTruthy();
    expect(created?.amount).toBe(5000);
    expect(created?.account_id).toBe(account.id);
    expect(created?.category_id).toBe(category.id);
    expect(created?.date.substring(0, 10)).toBe(iso);

    await page.close();
  });

  test("creates a transfer using the native source and destination selects", async ({ browser }) => {
    const token = await getAuthTokenForUser(`e2e-mobile-transfer-${Date.now()}@financeapp.local`);

    const source = (await (
      await apiFetchAs(token, "/api/accounts", {
        method: "POST",
        body: JSON.stringify({ name: "Origem Mobile", initial_balance: 10000 }),
      })
    ).json()) as { id: number };

    const destination = (await (
      await apiFetchAs(token, "/api/accounts", {
        method: "POST",
        body: JSON.stringify({ name: "Destino Mobile", initial_balance: 0 }),
      })
    ).json()) as { id: number };

    const page = await openAuthedPage(browser, token, MOBILE_CONTEXT);
    const transactionsPage = new TransactionsPage(page);
    await transactionsPage.goto();

    await transactionsPage.openCreateForm();
    const drawer = transactionsPage.formDrawer;

    await transactionsPage.selectType("transfer");
    const description = `Transferência Mobile ${Date.now()}`;
    await transactionsPage.fillDescription(description);
    await transactionsPage.fillAmount(2500);

    // Both source and destination render as native <select> on mobile.
    await expect(drawer.getByTestId(TransactionsTestIds.SelectAccount)).toHaveJSProperty(
      "tagName",
      "SELECT",
    );
    await expect(drawer.getByTestId(TransactionsTestIds.SelectDestinationAccount)).toHaveJSProperty(
      "tagName",
      "SELECT",
    );

    await transactionsPage.selectAccountNative(source.id);
    await transactionsPage.selectDestinationAccountNative(destination.id);
    await transactionsPage.submitForm();

    // A transfer between two own accounts shows on both (debit + credit), so the
    // description appears more than once — assert the first occurrence.
    await expect(page.getByText(description).first()).toBeVisible();

    const { month, year } = targetDateThisMonth();
    const txs = (await (
      await apiFetchAs(token, `/api/transactions?month=${month}&year=${year}`)
    ).json()) as Transactions.Transaction[];
    // The list returns both sides of the transfer; assert the source (debit) side.
    const transfers = txs.filter((t) => t.description === description && t.type === "transfer");
    expect(transfers.length).toBeGreaterThan(0);
    const debit = transfers.find((t) => t.account_id === source.id);
    expect(debit).toBeTruthy();
    expect(debit?.amount).toBe(2500);

    await page.close();
  });
});
