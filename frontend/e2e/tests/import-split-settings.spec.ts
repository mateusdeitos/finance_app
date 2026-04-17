import { test, expect } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategory,
  apiDeleteCategory,
  apiCreateUserConnection,
  getAuthTokenForUser,
  apiFetchAs,
} from "../helpers/api";

/**
 * Import Split Settings E2E Tests
 *
 * Validates that reopening the split settings popover on a previously
 * configured row does not send both percentage AND amount to the API.
 *
 * Requires multi-user setup (user connection needed for splits).
 */

const CSV_HEADER = "Data;Descrição;Valor";

function buildCsvContent(rows: string[][]): string {
  return [CSV_HEADER, ...rows.map((r) => r.join(";"))].join("\n");
}

const PARTNER_EMAIL = `e2e-split-import-${Date.now()}@financeapp.local`;

test.describe("Import with split settings", () => {
  let importPage: ImportPage;
  let testAccountId: number;
  let testAccountName: string;
  let testCategoryId: number;
  let testCategoryName: string;

  test.beforeAll(async () => {
    // 1. Create test account
    testAccountName = `Conta Split Import ${Date.now()}`;
    const account = await apiCreateAccount({
      name: testAccountName,
      initial_balance: 0,
    });
    testAccountId = account.id;

    // 2. Create test category
    testCategoryName = `Cat Split Import ${Date.now()}`;
    const category = await apiCreateCategory({ name: testCategoryName });
    testCategoryId = category.id;

    // 3. Auth as partner, create their account
    const partnerToken = await getAuthTokenForUser(PARTNER_EMAIL);
    await apiFetchAs(partnerToken, "/api/accounts", {
      method: "POST",
      body: JSON.stringify({
        name: `Partner Split ${Date.now()}`,
        initial_balance: 0,
      }),
    });

    // 4. Get partner user ID
    const meRes = await apiFetchAs(partnerToken, "/api/auth/me");
    const partnerUser = await meRes.json();

    // 5. Primary user creates connection to partner
    const conn = await apiCreateUserConnection(partnerUser.id, 50);

    // 6. Partner accepts the connection
    await apiFetchAs(
      partnerToken,
      `/api/user-connections/${conn.id}/accepted`,
      { method: "PATCH" },
    );
  });

  test.afterAll(async () => {
    await apiDeleteCategory(testCategoryId).catch(() => undefined);
    await apiDeleteAccount(testAccountId).catch(() => undefined);
  });

  test.beforeEach(async ({ page }) => {
    importPage = new ImportPage(page);
    await importPage.goto();
  });

  test("reopening split popover does not cause percentage+amount conflict on import", async () => {
    const description = `Split Reopen ${Date.now()}`;
    const csv = buildCsvContent([["15/01/2026", description, "-100,00"]]);

    await importPage.uploadCSV(csv, testAccountName);

    // Set category (required for expense)
    await importPage.setRowCategory(0, testCategoryName);

    // Open split popover — the split button is inside the row's "Divisão" column
    const row = importPage.reviewStep.locator('[data-row-index="0"]');
    const splitButton = row.locator("td").nth(9).getByRole("button");
    await splitButton.click();

    // Wait for popover dropdown to appear
    const popover = importPage.page.locator(".mantine-Popover-dropdown");
    await expect(popover).toBeVisible({ timeout: 5000 });

    // Add a split entry
    await popover.getByText("+ Adicionar divisão").click();

    // Select the connection account
    await popover.getByPlaceholder("Selecionar conta").click();
    await importPage.page.getByRole("option").first().click();

    // Default mode is "percentage" — split is now configured
    // Close the popover by pressing Escape
    await importPage.page.keyboard.press("Escape");
    await expect(popover).not.toBeVisible({ timeout: 3000 });

    // Reopen the split popover (this is the bug trigger)
    await splitButton.click();
    await expect(popover).toBeVisible({ timeout: 5000 });

    // Close again
    await importPage.page.keyboard.press("Escape");
    await expect(popover).not.toBeVisible({ timeout: 3000 });

    // Confirm import — should succeed without percentage+amount error
    await importPage.confirmImport();

    // Verify success (no error about percentage and amount together)
    await expect(
      importPage.page.getByText("Importação concluída com sucesso"),
    ).toBeVisible({ timeout: 15000 });
  });
});
