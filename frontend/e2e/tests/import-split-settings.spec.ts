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

  test("reopening split popover does not cause percentage+amount conflict on import", async ({
    page,
  }) => {
    const description = `Split Reopen ${Date.now()}`;
    const csv = buildCsvContent([["15/01/2026", description, "-100,00"]]);

    await importPage.uploadCSV(csv, testAccountId);

    // Set category (required for expense)
    await importPage.setRowCategory(0, testCategoryId);

    // The split popover button starts with text "Sem divisão"
    const splitButton = importPage.reviewStep
      .locator('[data-row-index="0"]')
      .getByRole("button", { name: "Sem divisão" });
    await expect(splitButton).toBeVisible({ timeout: 5000 });
    await splitButton.click();

    // The split popover renders as role="dialog" (unlike Mantine Select dropdowns)
    const popover = page.locator('.mantine-Popover-dropdown[role="dialog"]');
    await expect(popover).toBeVisible({ timeout: 5000 });

    // Add a split entry
    await popover.getByText("+ Adicionar divisão").click();

    // Select the connection account from the dropdown inside the popover
    await popover.getByPlaceholder("Selecionar conta").click();
    await page.getByRole("option").first().click();

    // Wait for the split to be configured (percentage input appears)
    await expect(popover.locator('input[type="text"]').first()).toBeVisible();

    // Close the popover — click the page title area which is always visible
    await page.getByText("Revisão da importação").click({ force: true });
    await expect(popover).not.toBeVisible({ timeout: 5000 });

    // After configuring, the button text changes from "Sem divisão" to a summary
    // Re-locate the split button in the same cell
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
    await expect(
      page.getByText("Importação concluída com sucesso"),
    ).toBeVisible({ timeout: 15000 });
  });
});
