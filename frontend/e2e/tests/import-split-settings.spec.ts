import { test, expect, type Page } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import {
  getAuthTokenForUser,
  apiFetchAs,
  openAuthedPage,
} from "../helpers/api";
import { ImportTestIds, TransactionsTestIds } from "@/testIds";

/**
 * Import Split Settings E2E Tests
 *
 * Validates that reopening the split settings popover on a previously
 * configured row does not send both percentage AND amount to the API.
 *
 * Requires multi-user setup (user connection needed for splits).
 *
 * Uses a fresh unique primary user per test run so the user has exactly one
 * connection — guaranteeing the auto-select in the split popover triggers.
 */

const CSV_HEADER = "Data;Descrição;Valor";

function buildCsvContent(rows: string[][]): string {
  return [CSV_HEADER, ...rows.map((r) => r.join(";"))].join("\n");
}

test.describe("Import with split settings", () => {
  let importPage: ImportPage;
  let primaryToken: string;
  let testAccountId: number;
  let testAccountName: string;
  let testCategoryId: number;
  let testCategoryName: string;
  let customPage: Page;

  test.beforeAll(async () => {
    // Use unique emails per run so each test run starts with a clean user
    // that has exactly one connection — required for the auto-select to trigger.
    const ts = Date.now();
    const PRIMARY_EMAIL = `e2e-split-primary-${ts}@financeapp.local`;
    const PARTNER_EMAIL = `e2e-split-partner-${ts}@financeapp.local`;

    // 1. Create fresh primary user and get their token
    primaryToken = await getAuthTokenForUser(PRIMARY_EMAIL);

    // 2. Create test account for the primary user
    testAccountName = `Conta Split Import ${ts}`;
    const accountRes = await apiFetchAs(primaryToken, "/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name: testAccountName, initial_balance: 0 }),
    });
    const account = await accountRes.json();
    testAccountId = account.id;

    // 3. Create test category for the primary user
    testCategoryName = `Cat Split Import ${ts}`;
    const categoryRes = await apiFetchAs(primaryToken, "/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: testCategoryName }),
    });
    const category = await categoryRes.json();
    testCategoryId = category.id;

    // 4. Create partner user and their account
    const partnerToken = await getAuthTokenForUser(PARTNER_EMAIL);
    await apiFetchAs(partnerToken, "/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name: `Partner Split ${ts}`, initial_balance: 0 }),
    });

    // 5. Get partner user ID
    const meRes = await apiFetchAs(partnerToken, "/api/auth/me");
    const partnerUser = (await meRes.json()) as { id: number };

    // 6. Primary user creates connection to partner
    const connRes = await apiFetchAs(primaryToken, "/api/user-connections", {
      method: "POST",
      body: JSON.stringify({ to_user_id: partnerUser.id, from_default_split_percentage: 50 }),
    });
    const conn = (await connRes.json()) as { id: number };

    // 7. Partner accepts the connection
    await apiFetchAs(partnerToken, `/api/user-connections/${conn.id}/accepted`, { method: "PATCH" });
  });

  test.afterAll(async () => {
    // Clean up primary user's resources using their token
    await apiFetchAs(primaryToken, `/api/categories/${testCategoryId}`, { method: "DELETE" }).catch(() => undefined);
    await apiFetchAs(primaryToken, `/api/accounts/${testAccountId}`, { method: "DELETE" }).catch(() => undefined);
  });

  test.beforeEach(async ({ browser }) => {
    // Open a page authenticated as the fresh primary user (not the shared e2e user)
    customPage = await openAuthedPage(browser, primaryToken);
    importPage = new ImportPage(customPage);
    await importPage.goto();
  });

  test.afterEach(async () => {
    // Close the custom browser context to avoid resource leaks
    await customPage?.context().close().catch(() => undefined);
  });

  test("reopening split popover does not cause percentage+amount conflict on import", async () => {
    const page = customPage;
    const description = `Split Reopen ${Date.now()}`;
    const csv = buildCsvContent([["15/01/2026", description, "-100,00"]]);

    await importPage.uploadCSV(csv, testAccountName);

    // Set category (required for expense)
    await importPage.setRowCategory(0, testCategoryName);

    // The split popover button starts with text "Sem divisão"
    const splitButton = importPage.reviewStep
      .locator('[data-row-index="0"]')
      .getByRole("button", { name: "Sem divisão" });
    await expect(splitButton).toBeVisible({ timeout: 5000 });
    await splitButton.click();

    // The split popover dropdown
    const popover = page.getByTestId(ImportTestIds.SplitPopoverDropdown(0));
    await expect(popover).toBeVisible({ timeout: 5000 });

    // Add a split entry — only one connection exists so it is auto-selected
    await popover.getByTestId(TransactionsTestIds.BtnAddSplitRow).click();

    // Wait for the split to be configured (percentage input appears after auto-select)
    await expect(popover.getByTestId(TransactionsTestIds.InputSplitPercentage)).toBeVisible();

    // Close the popover — click the page title area which is always visible
    await page.getByText("Revisão da importação").click({ force: true });
    await expect(popover).not.toBeVisible({ timeout: 5000 });

    // After configuring, the button text changes from "Sem divisão" to a summary.
    // Re-locate the split button in the same cell.
    const splitButtonAfter = importPage.reviewStep
      .locator('[data-row-index="0"]')
      .locator("td")
      .nth(9)
      .getByRole("button");
    await expect(splitButtonAfter).toBeVisible({ timeout: 5000 });

    // Reopen the split popover (this is the bug trigger)
    await splitButtonAfter.click();
    await expect(popover).toBeVisible({ timeout: 5000 });

    // Close again
    await page.getByText("Revisão da importação").click({ force: true });
    await expect(popover).not.toBeVisible({ timeout: 5000 });

    // Confirm import — should succeed without percentage+amount error
    await importPage.confirmImport();

    // Verify success (no error about percentage and amount together)
    await expect(page.getByText("Importação concluída com sucesso")).toBeVisible({ timeout: 15000 });
  });
});
