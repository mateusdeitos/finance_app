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

/**
 * Nested Category Display E2E Tests
 *
 * Validates that the transaction list correctly displays category names
 * for nested (child) categories, not just root categories.
 */

test.describe("Nested category display in transaction list", () => {
  let testAccountId: number;
  let parentCategoryId: number;
  let childCategoryId: number;
  let childCategoryName: string;
  let transactionId: number;
  let transactionDescription: string;
  const txDate = new Date();

  test.beforeAll(async () => {
    // 1. Create test account
    const account = await apiCreateAccount({
      name: `Conta NestedCat ${Date.now()}`,
      initial_balance: 0,
    });
    testAccountId = account.id;

    // 2. Create parent category
    const parentCategory = await apiCreateCategory({
      name: `Parent Cat ${Date.now()}`,
    });
    parentCategoryId = parentCategory.id;

    // 3. Create child category under parent
    childCategoryName = `Child Cat ${Date.now()}`;
    const childCategory = await apiCreateCategory({
      name: childCategoryName,
      parent_id: parentCategoryId,
    });
    childCategoryId = childCategory.id;

    // 4. Create transaction with child category
    const month = String(txDate.getMonth() + 1).padStart(2, "0");
    const day = String(txDate.getDate()).padStart(2, "0");
    const year = txDate.getFullYear();
    transactionDescription = `Nested Cat Test ${Date.now()}`;

    const tx = await apiCreateTransaction({
      account_id: testAccountId,
      transaction_type: "expense",
      category_id: childCategoryId,
      amount: 5000,
      date: `${year}-${month}-${day}`,
      description: transactionDescription,
    });
    transactionId = tx.id;
  });

  test.afterAll(async () => {
    await apiDeleteTransaction(transactionId).catch(() => undefined);
    await apiDeleteCategory(childCategoryId).catch(() => undefined);
    await apiDeleteCategory(parentCategoryId).catch(() => undefined);
    await apiDeleteAccount(testAccountId).catch(() => undefined);
  });

  test("child category name is visible in transaction row", async ({
    page,
  }) => {
    const transactionsPage = new TransactionsPage(page);
    await transactionsPage.gotoMonth(
      txDate.getMonth() + 1,
      txDate.getFullYear(),
    );

    // Find the transaction row
    const transactionRow = page.locator(
      `[data-transaction-id="${transactionId}"]`,
    );
    await expect(transactionRow).toBeVisible({ timeout: 10000 });

    // The child category name should be visible in the row
    await expect(transactionRow.getByText(childCategoryName)).toBeVisible();
  });

  test("child category name appears as group header when grouped by category", async ({
    page,
  }) => {
    const transactionsPage = new TransactionsPage(page);
    await transactionsPage.gotoMonth(
      txDate.getMonth() + 1,
      txDate.getFullYear(),
    );

    // Switch to group by category
    await transactionsPage.selectGroupBy("category");

    // The child category name should appear as a group label
    await expect(page.getByText(childCategoryName)).toBeVisible({
      timeout: 10000,
    });
  });
});
