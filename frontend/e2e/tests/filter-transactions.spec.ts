import { test, expect } from "@playwright/test";
import { TransactionsPage } from "../pages/TransactionsPage";
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategory,
  apiDeleteCategory,
  apiCreateTransaction,
  apiDeleteTransaction,
} from "../helpers/api";
import { TransactionsTestIds } from '@/testIds'

const today = new Date().toISOString().slice(0, 10);

/**
 * The create-transaction API requires a category_id for non-transfer types
 * (TRANSACTION.INVALID_CATEGORY_ID) — there is no way to POST a transaction
 * directly without one. A real "no category" transaction only exists after
 * its category gets deleted without a replacement, which nullifies
 * category_id on every transaction that referenced it. This helper
 * reproduces that path: create a disposable category, create the
 * transaction under it, then delete the category.
 */
async function createUncategorizedTransaction(
  payload: Omit<Parameters<typeof apiCreateTransaction>[0], "category_id">,
): Promise<{ id: number }> {
  const tempCategory = await apiCreateCategory({
    name: `Temp NoCat ${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
  const tx = await apiCreateTransaction({ ...payload, category_id: tempCategory.id });
  await apiDeleteCategory(tempCategory.id);
  return tx;
}

test.describe("Transaction Filters", () => {
  let transactionsPage: TransactionsPage;
  let accountAId: number;
  let accountAName: string;
  let accountBId: number;
  let accountBName: string;
  let categoryAId: number;
  let categoryAName: string;
  let categoryBId: number;
  let categoryBName: string;
  const createdTransactionIds: number[] = [];
  // Accounts created inside individual tests (isolated from accountA/accountB
  // so saldo assertions aren't polluted by other tests' transactions sharing
  // the same account/month), cleaned up alongside accountA/accountB.
  const extraAccountIds: number[] = [];

  test.beforeAll(async () => {
    accountAName = `Filtro Conta A ${Date.now()}`;
    const accountA = await apiCreateAccount({
      name: accountAName,
      initial_balance: 0,
    });
    accountAId = accountA.id;

    accountBName = `Filtro Conta B ${Date.now()}`;
    const accountB = await apiCreateAccount({
      name: accountBName,
      initial_balance: 0,
    });
    accountBId = accountB.id;

    categoryAName = `Filtro Cat A ${Date.now()}`;
    const categoryA = await apiCreateCategory({ name: categoryAName });
    categoryAId = categoryA.id;

    categoryBName = `Filtro Cat B ${Date.now()}`;
    const categoryB = await apiCreateCategory({ name: categoryBName });
    categoryBId = categoryB.id;
  });

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id).catch(() => undefined);
    }
    await apiDeleteAccount(accountAId).catch(() => undefined);
    await apiDeleteAccount(accountBId).catch(() => undefined);
    for (const id of extraAccountIds) {
      await apiDeleteAccount(id).catch(() => undefined);
    }
    await apiDeleteCategory(categoryAId).catch(() => undefined);
    await apiDeleteCategory(categoryBId).catch(() => undefined);
  });

  test.beforeEach(async ({ page }) => {
    transactionsPage = new TransactionsPage(page);
    await transactionsPage.goto();
    await page.addStyleTag({
      content: `*, *::before, *::after {
      transition-duration: 0ms !important;
      animation-duration: 0ms !important;
    }`,
    });
  });

  // ── Text search ───────────────────────────────────────────────────────────
  test("text search filters transactions by description", async ({ page }) => {
    const uniqueDesc = `BuscaUnica${Date.now()}`;
    const otherDesc = `OutraDesc${Date.now()}`;

    const tx1 = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: uniqueDesc,
    });
    const tx2 = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 2000,
      date: today,
      description: otherDesc,
    });
    createdTransactionIds.push(tx1.id, tx2.id);

    await transactionsPage.goto();
    await expect(page.getByText(uniqueDesc)).toBeVisible();
    await expect(page.getByText(otherDesc)).toBeVisible();

    // Type in search box
    const searchInput = page.getByTestId(TransactionsTestIds.InputTextSearch);
    await searchInput.fill(uniqueDesc);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(uniqueDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(otherDesc)).not.toBeVisible({ timeout: 8000 });
  });

  // ── Account filter ────────────────────────────────────────────────────────
  test("account filter shows only transactions from selected account", async ({ page }) => {
    const descA = `ContaA Tx ${Date.now()}`;
    const descB = `ContaB Tx ${Date.now()}`;

    const txA = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1500,
      date: today,
      description: descA,
    });
    const txB = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountBId,
      category_id: categoryAId,
      amount: 2500,
      date: today,
      description: descB,
    });
    createdTransactionIds.push(txA.id, txB.id);

    await transactionsPage.goto();
    await expect(page.getByText(descA)).toBeVisible();
    await expect(page.getByText(descB)).toBeVisible();

    // The Contas filter lives in the always-open desktop sidebar — no popover
    // to open, the checkbox is already on screen.
    await page.getByTestId(TransactionsTestIds.CheckboxFilterAccount(accountAId)).check();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(descA)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(descB)).not.toBeVisible({ timeout: 8000 });
  });

  // ── Category filter ───────────────────────────────────────────────────────
  test("category filter shows only transactions from selected category", async ({ page }) => {
    const descA = `CatA Tx ${Date.now()}`;
    const descB = `CatB Tx ${Date.now()}`;

    const txA = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 3000,
      date: today,
      description: descA,
    });
    const txB = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryBId,
      amount: 4000,
      date: today,
      description: descB,
    });
    createdTransactionIds.push(txA.id, txB.id);

    await transactionsPage.goto();
    await expect(page.getByText(descA)).toBeVisible();
    await expect(page.getByText(descB)).toBeVisible();

    // Categories filter lives in the always-open desktop sidebar — the
    // checkbox is rendered in the sidebar, no popover trigger to click.
    await page.getByTestId(TransactionsTestIds.CheckboxFilterCategory(categoryAId)).check();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(descA)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(descB)).not.toBeVisible({ timeout: 8000 });
  });

  // ── Type filter (advanced) ────────────────────────────────────────────────
  test("type filter shows only expenses when expense filter is active", async ({ page }) => {
    const expenseDesc = `TypeFilter Despesa ${Date.now()}`;
    const incomeDesc = `TypeFilter Receita ${Date.now()}`;

    const expenseTx = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: expenseDesc,
    });
    const incomeTx = await apiCreateTransaction({
      transaction_type: "income",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 2000,
      date: today,
      description: incomeDesc,
    });
    createdTransactionIds.push(expenseTx.id, incomeTx.id);

    await transactionsPage.goto();
    await expect(page.getByText(expenseDesc)).toBeVisible();
    await expect(page.getByText(incomeDesc)).toBeVisible();

    // Open advanced filter and toggle "Apenas despesas"
    // getByTestId finds the Mantine Switch root <label> element, which is visible
    await transactionsPage.openAdvancedFilters();
    await page.getByTestId(TransactionsTestIds.AdvancedFiltersPopover).waitFor({ state: "visible", timeout: 5000 });
    await page
      .getByTestId(TransactionsTestIds.SwitchType('expense'))
      .locator("xpath=ancestor::label")
      .click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(expenseDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(incomeDesc)).not.toBeVisible({ timeout: 8000 });
  });

  // ── Type filter — income ──────────────────────────────────────────────────
  test("type filter shows only income when income filter is active", async ({ page }) => {
    const expenseDesc = `IncomeFilter Despesa ${Date.now()}`;
    const incomeDesc = `IncomeFilter Receita ${Date.now()}`;

    const expenseTx = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: expenseDesc,
    });
    const incomeTx = await apiCreateTransaction({
      transaction_type: "income",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 2000,
      date: today,
      description: incomeDesc,
    });
    createdTransactionIds.push(expenseTx.id, incomeTx.id);

    await transactionsPage.goto();
    await expect(page.getByText(expenseDesc)).toBeVisible();
    await expect(page.getByText(incomeDesc)).toBeVisible();

    await transactionsPage.openAdvancedFilters();
    await page.getByTestId(TransactionsTestIds.AdvancedFiltersPopover).waitFor({ state: "visible", timeout: 5000 });
    await page.getByTestId(TransactionsTestIds.SwitchType('income')).locator("xpath=ancestor::label").click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(incomeDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(expenseDesc)).not.toBeVisible({ timeout: 8000 });
  });

  // ── Type filter — transfer ────────────────────────────────────────────────
  test("type filter shows only transfers when transfer filter is active", async ({ page }) => {
    const transferDesc = `TransferFilter Transf ${Date.now()}`;
    const expenseDesc = `TransferFilter Despesa ${Date.now()}`;

    const transferTx = await apiCreateTransaction({
      transaction_type: "transfer",
      account_id: accountAId,
      destination_account_id: accountBId,
      amount: 3000,
      date: today,
      description: transferDesc,
    });
    const expenseTx = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1500,
      date: today,
      description: expenseDesc,
    });
    createdTransactionIds.push(transferTx.id, expenseTx.id);

    await transactionsPage.goto();
    await expect(page.getByText(transferDesc).first()).toBeVisible();
    await expect(page.getByText(expenseDesc)).toBeVisible();

    await transactionsPage.openAdvancedFilters();
    await page.getByTestId(TransactionsTestIds.AdvancedFiltersPopover).waitFor({ state: "visible", timeout: 5000 });
    await page
      .getByTestId(TransactionsTestIds.SwitchType('transfer'))
      .locator("xpath=ancestor::label")
      .click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(transferDesc).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(expenseDesc)).not.toBeVisible({ timeout: 8000 });
  });

  // ── No category filter (advanced) ─────────────────────────────────────────
  test("no category filter shows only transactions without a category", async ({ page }) => {
    const categorizedDesc = `NoCategoryFilter Cat ${Date.now()}`;
    const uncategorizedDesc = `NoCategoryFilter NoCat ${Date.now()}`;

    const categorizedTx = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: categorizedDesc,
    });
    const uncategorizedTx = await createUncategorizedTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      amount: 2000,
      date: today,
      description: uncategorizedDesc,
    });
    createdTransactionIds.push(categorizedTx.id, uncategorizedTx.id);

    await transactionsPage.goto();
    await expect(page.getByText(categorizedDesc)).toBeVisible();
    await expect(page.getByText(uncategorizedDesc)).toBeVisible();

    await transactionsPage.openAdvancedFilters();
    await page.getByTestId(TransactionsTestIds.AdvancedFiltersPopover).waitFor({ state: "visible", timeout: 5000 });
    await page
      .getByTestId(TransactionsTestIds.SwitchNoCategory)
      .locator("xpath=ancestor::label")
      .click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(uncategorizedDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(categorizedDesc)).not.toBeVisible({ timeout: 8000 });

    // Toggling back off restores the categorized transaction.
    await page
      .getByTestId(TransactionsTestIds.SwitchNoCategory)
      .locator("xpath=ancestor::label")
      .click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(categorizedDesc)).toBeVisible({ timeout: 8000 });
  });

  // ── No category filter combined with type filter ────────────────────────────
  test("no category filter combined with type filter narrows further", async ({ page }) => {
    const categorizedExpenseDesc = `NoCatType CatExp ${Date.now()}`;
    const uncategorizedExpenseDesc = `NoCatType NoCatExp ${Date.now()}`;
    const uncategorizedIncomeDesc = `NoCatType NoCatInc ${Date.now()}`;

    const categorizedExpense = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: categorizedExpenseDesc,
    });
    const uncategorizedExpense = await createUncategorizedTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      amount: 1500,
      date: today,
      description: uncategorizedExpenseDesc,
    });
    const uncategorizedIncome = await createUncategorizedTransaction({
      transaction_type: "income",
      account_id: accountAId,
      amount: 2500,
      date: today,
      description: uncategorizedIncomeDesc,
    });
    createdTransactionIds.push(categorizedExpense.id, uncategorizedExpense.id, uncategorizedIncome.id);

    await transactionsPage.goto();
    await expect(page.getByText(categorizedExpenseDesc)).toBeVisible();
    await expect(page.getByText(uncategorizedExpenseDesc)).toBeVisible();
    await expect(page.getByText(uncategorizedIncomeDesc)).toBeVisible();

    await transactionsPage.openAdvancedFilters();
    await page.getByTestId(TransactionsTestIds.AdvancedFiltersPopover).waitFor({ state: "visible", timeout: 5000 });

    // "Sem categoria" alone: both uncategorized transactions remain.
    await page
      .getByTestId(TransactionsTestIds.SwitchNoCategory)
      .locator("xpath=ancestor::label")
      .click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(uncategorizedExpenseDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(uncategorizedIncomeDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(categorizedExpenseDesc)).not.toBeVisible({ timeout: 8000 });

    // Adding "Apenas despesas" on top narrows to only the uncategorized expense.
    await page
      .getByTestId(TransactionsTestIds.SwitchType('expense'))
      .locator("xpath=ancestor::label")
      .click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Escape");

    await expect(page.getByText(uncategorizedExpenseDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(uncategorizedIncomeDesc)).not.toBeVisible({ timeout: 8000 });
    await expect(page.getByText(categorizedExpenseDesc)).not.toBeVisible({ timeout: 8000 });
  });

  // ── No category filter combined with account filter ─────────────────────────
  test("no category filter combined with account filter narrows correctly", async ({ page }) => {
    const isolatedAccountName = `NoCatAccount Isolada ${Date.now()}`;
    const isolatedAccount = await apiCreateAccount({
      name: isolatedAccountName,
      initial_balance: 0,
    });
    extraAccountIds.push(isolatedAccount.id);

    const uncategorizedInIsolatedDesc = `NoCatAccount Isolada NoCat ${Date.now()}`;
    const categorizedInIsolatedDesc = `NoCatAccount Isolada Cat ${Date.now()}`;
    const uncategorizedInSharedDesc = `NoCatAccount Shared NoCat ${Date.now()}`;

    const uncategorizedInIsolated = await createUncategorizedTransaction({
      transaction_type: "expense",
      account_id: isolatedAccount.id,
      amount: 1000,
      date: today,
      description: uncategorizedInIsolatedDesc,
    });
    const categorizedInIsolated = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: isolatedAccount.id,
      category_id: categoryAId,
      amount: 2000,
      date: today,
      description: categorizedInIsolatedDesc,
    });
    const uncategorizedInShared = await createUncategorizedTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      amount: 3000,
      date: today,
      description: uncategorizedInSharedDesc,
    });
    createdTransactionIds.push(uncategorizedInIsolated.id, categorizedInIsolated.id, uncategorizedInShared.id);

    await transactionsPage.goto();
    await expect(page.getByText(uncategorizedInIsolatedDesc)).toBeVisible();
    await expect(page.getByText(categorizedInIsolatedDesc)).toBeVisible();
    await expect(page.getByText(uncategorizedInSharedDesc)).toBeVisible();

    // "Sem categoria" alone: both uncategorized transactions show, regardless of account.
    await transactionsPage.openAdvancedFilters();
    await page.getByTestId(TransactionsTestIds.AdvancedFiltersPopover).waitFor({ state: "visible", timeout: 5000 });
    await page
      .getByTestId(TransactionsTestIds.SwitchNoCategory)
      .locator("xpath=ancestor::label")
      .click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Escape");

    await expect(page.getByText(uncategorizedInIsolatedDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(uncategorizedInSharedDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(categorizedInIsolatedDesc)).not.toBeVisible({ timeout: 8000 });

    // Narrowing to the isolated account on top hides the shared-account transaction too.
    await transactionsPage.filterByAccount(isolatedAccount.id);

    await expect(page.getByText(uncategorizedInIsolatedDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(uncategorizedInSharedDesc)).not.toBeVisible({ timeout: 8000 });
    await expect(page.getByText(categorizedInIsolatedDesc)).not.toBeVisible({ timeout: 8000 });
  });

  // ── No category filter — saldo do mês ────────────────────────────────────────
  test("no category filter updates saldo, receitas and despesas to reflect only uncategorized transactions", async ({ page }) => {
    // Uses its own account so the summary totals aren't polluted by other
    // tests' transactions sharing accountA within the same month.
    const isolatedAccountName = `NoCatSaldo Isolada ${Date.now()}`;
    const isolatedAccount = await apiCreateAccount({
      name: isolatedAccountName,
      initial_balance: 0,
    });
    extraAccountIds.push(isolatedAccount.id);

    const categorizedExpense = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: isolatedAccount.id,
      category_id: categoryAId,
      amount: 2000, // R$ 20,00
      date: today,
      description: `NoCatSaldo CatExp ${Date.now()}`,
    });
    const uncategorizedExpense = await createUncategorizedTransaction({
      transaction_type: "expense",
      account_id: isolatedAccount.id,
      amount: 1000, // R$ 10,00
      date: today,
      description: `NoCatSaldo NoCatExp ${Date.now()}`,
    });
    const uncategorizedIncome = await createUncategorizedTransaction({
      transaction_type: "income",
      account_id: isolatedAccount.id,
      amount: 5000, // R$ 50,00
      date: today,
      description: `NoCatSaldo NoCatInc ${Date.now()}`,
    });
    createdTransactionIds.push(categorizedExpense.id, uncategorizedExpense.id, uncategorizedIncome.id);

    await transactionsPage.goto();
    await transactionsPage.filterByAccount(isolatedAccount.id);

    // Before "Sem categoria": Receitas 50,00 / Despesas 30,00 (20 + 10) / Saldo +20,00.
    await expect(page.getByTestId(TransactionsTestIds.StatIncome)).toHaveText(/\+R\$\s*50,00/, { timeout: 8000 });
    await expect(page.getByTestId(TransactionsTestIds.StatExpense)).toHaveText(/-R\$\s*30,00/, { timeout: 8000 });
    await expect(page.getByTestId(TransactionsTestIds.StatNetMonth)).toHaveText(/\+R\$\s*20,00/, { timeout: 8000 });

    await transactionsPage.openAdvancedFilters();
    await page.getByTestId(TransactionsTestIds.AdvancedFiltersPopover).waitFor({ state: "visible", timeout: 5000 });
    await page
      .getByTestId(TransactionsTestIds.SwitchNoCategory)
      .locator("xpath=ancestor::label")
      .click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Escape");

    // After "Sem categoria": the categorized expense drops out — Receitas
    // stays 50,00, Despesas becomes 10,00, Saldo becomes +40,00.
    await expect(page.getByTestId(TransactionsTestIds.StatIncome)).toHaveText(/\+R\$\s*50,00/, { timeout: 8000 });
    await expect(page.getByTestId(TransactionsTestIds.StatExpense)).toHaveText(/-R\$\s*10,00/, { timeout: 8000 });
    await expect(page.getByTestId(TransactionsTestIds.StatNetMonth)).toHaveText(/\+R\$\s*40,00/, { timeout: 8000 });
  });

  // ── No category filter — clear filters ───────────────────────────────────────
  test("clear filters button also resets the no category filter", async ({ page }) => {
    const categorizedDesc = `NoCatClear Cat ${Date.now()}`;
    const uncategorizedDesc = `NoCatClear NoCat ${Date.now()}`;

    const categorizedTx = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: categorizedDesc,
    });
    const uncategorizedTx = await createUncategorizedTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      amount: 2000,
      date: today,
      description: uncategorizedDesc,
    });
    createdTransactionIds.push(categorizedTx.id, uncategorizedTx.id);

    await transactionsPage.goto();
    await transactionsPage.openAdvancedFilters();
    await page.getByTestId(TransactionsTestIds.AdvancedFiltersPopover).waitFor({ state: "visible", timeout: 5000 });
    await page
      .getByTestId(TransactionsTestIds.SwitchNoCategory)
      .locator("xpath=ancestor::label")
      .click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Escape");

    await expect(page.getByText(categorizedDesc)).not.toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId(TransactionsTestIds.BtnClearFilters)).toBeVisible();

    await page.getByTestId(TransactionsTestIds.BtnClearFilters).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(categorizedDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(uncategorizedDesc)).toBeVisible({ timeout: 8000 });
  });

  // ── Tag filter ────────────────────────────────────────────────────────────
  test("tag filter shows only transactions with selected tag", async ({ page }) => {
    const tagName = `TagFiltro${Date.now()}`;
    const taggedDesc = `TagFilter Tagged ${Date.now()}`;
    const untaggedDesc = `TagFilter Untagged ${Date.now()}`;

    const taggedTx = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: taggedDesc,
      tags: [{ name: tagName }],
    });
    const untaggedTx = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 2000,
      date: today,
      description: untaggedDesc,
    });
    createdTransactionIds.push(taggedTx.id, untaggedTx.id);

    await transactionsPage.goto();
    await expect(page.getByText(taggedDesc)).toBeVisible();
    await expect(page.getByText(untaggedDesc)).toBeVisible();

    await page.getByTestId(TransactionsTestIds.BtnFilter('tags')).click();
    await page.getByTestId(TransactionsTestIds.PopoverFilter('tags')).locator(`[data-tag-name="${tagName}"]`).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(taggedDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(untaggedDesc)).not.toBeVisible({ timeout: 8000 });
  });

  // ── Grouping — by category ────────────────────────────────────────────────
  test("grouping by category groups transactions under correct category headers", async ({ page }) => {
    const descA = `GroupCat A ${Date.now()}`;
    const descB = `GroupCat B ${Date.now()}`;

    const txA = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: descA,
    });
    const txB = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryBId,
      amount: 2000,
      date: today,
      description: descB,
    });
    createdTransactionIds.push(txA.id, txB.id);

    await transactionsPage.goto();
    await transactionsPage.selectGroupBy("category");

    await expect(page.getByText(categoryAName).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(categoryBName).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(descA)).toBeVisible();
    await expect(page.getByText(descB)).toBeVisible();

    await transactionsPage.selectGroupBy("date");
  });

  // ── Grouping — by account ─────────────────────────────────────────────────
  test("grouping by account groups transactions under correct account headers", async ({ page }) => {
    const descA = `GroupAcct A ${Date.now()}`;
    const descB = `GroupAcct B ${Date.now()}`;

    const txA = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: descA,
    });
    const txB = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountBId,
      category_id: categoryAId,
      amount: 2000,
      date: today,
      description: descB,
    });
    createdTransactionIds.push(txA.id, txB.id);

    await transactionsPage.goto();
    await transactionsPage.selectGroupBy("account");

    await expect(page.getByText(accountAName).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(accountBName).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(descA)).toBeVisible();
    await expect(page.getByText(descB)).toBeVisible();

    await transactionsPage.selectGroupBy("date");
  });

  // ── Multiple filters combined ─────────────────────────────────────────────
  test("multiple filters: expense type and specific account combined", async ({ page }) => {
    const expenseADesc = `MultiFilter ExpA ${Date.now()}`;
    const incomeADesc = `MultiFilter IncA ${Date.now()}`;
    const expenseBDesc = `MultiFilter ExpB ${Date.now()}`;

    const expenseA = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: expenseADesc,
    });
    const incomeA = await apiCreateTransaction({
      transaction_type: "income",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 2000,
      date: today,
      description: incomeADesc,
    });
    const expenseB = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountBId,
      category_id: categoryAId,
      amount: 3000,
      date: today,
      description: expenseBDesc,
    });
    createdTransactionIds.push(expenseA.id, incomeA.id, expenseB.id);

    await transactionsPage.goto();
    await expect(page.getByText(expenseADesc)).toBeVisible();
    await expect(page.getByText(incomeADesc)).toBeVisible();
    await expect(page.getByText(expenseBDesc)).toBeVisible();

    // Apply expense type filter
    await transactionsPage.openAdvancedFilters();
    await page.getByTestId(TransactionsTestIds.AdvancedFiltersPopover).waitFor({ state: "visible", timeout: 5000 });
    await page
      .getByTestId(TransactionsTestIds.SwitchType('expense'))
      .locator("xpath=ancestor::label")
      .click({ timeout: 3000, force: true });
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Escape");

    // Apply account filter for accountA via the always-open desktop sidebar.
    await page.getByTestId(TransactionsTestIds.CheckboxFilterAccount(accountAId)).check();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(expenseADesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(incomeADesc)).not.toBeVisible({ timeout: 8000 });
    await expect(page.getByText(expenseBDesc)).not.toBeVisible({ timeout: 8000 });
  });

  // ── Clear filters ─────────────────────────────────────────────────────────
  test("clear filters button removes active filters", async ({ page }) => {
    const targetDesc = `ClearFilter Tx ${Date.now()}`;

    const tx = await apiCreateTransaction({
      transaction_type: "expense",
      account_id: accountAId,
      category_id: categoryAId,
      amount: 1000,
      date: today,
      description: targetDesc,
    });
    createdTransactionIds.push(tx.id);

    await transactionsPage.goto();
    await expect(page.getByText(targetDesc)).toBeVisible();

    // Apply a text search that hides the transaction
    const searchInput = page.getByTestId(TransactionsTestIds.InputTextSearch);
    await searchInput.fill("xxxxxxxxxnotfound");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(targetDesc)).not.toBeVisible({ timeout: 8000 });

    // The clear filters button should now be visible
    await expect(page.getByTestId(TransactionsTestIds.BtnClearFilters)).toBeVisible();

    // Clear filters
    await page.getByTestId(TransactionsTestIds.BtnClearFilters).click();
    await page.waitForLoadState("networkidle");

    // Transaction should be visible again and clear filters button gone
    await expect(page.getByText(targetDesc)).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId(TransactionsTestIds.BtnClearFilters)).not.toBeVisible();
  });
});
