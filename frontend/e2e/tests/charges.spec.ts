import { test, expect } from "@playwright/test";
import { ChargesPage } from "../pages/ChargesPage";
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCharge,
  apiCancelCharge,
  apiCreateUserConnection,
  apiCreateTransaction,
  apiCreateCategory,
  apiDeleteCategory,
  getAuthTokenForUser,
  apiFetchAs,
} from "../helpers/api";

/**
 * Charges E2E Tests
 *
 * These tests require a two-user setup: the primary test user (charger)
 * creates charges against a partner user (payer). The partner is created
 * via test-login and connected via the user-connections API.
 *
 * The primary user is already authenticated via global-setup.
 * The partner user is set up in beforeAll via API calls.
 */

const PARTNER_EMAIL = `e2e-charges-partner-${Date.now()}@financeapp.local`;
const now = new Date();
const PERIOD_MONTH = now.getMonth() + 1;
const PERIOD_YEAR = now.getFullYear();

test.describe("Charges", () => {
  let chargesPage: ChargesPage;
  let primaryAccountId: number;
  let primaryAccountName: string;
  let partnerToken: string;
  let partnerAccountId: number;
  let connectionId: number;
  let primaryConnAccountId: number;
  let seedCategoryId: number;
  const createdChargeIds: number[] = [];

  test.beforeAll(async () => {
    // 1. Create a primary user account
    primaryAccountName = `Conta Cobranças ${Date.now()}`;
    const account = await apiCreateAccount({ name: primaryAccountName, initial_balance: 0 });
    primaryAccountId = account.id;

    // 2. Auth as partner, create their account
    partnerToken = await getAuthTokenForUser(PARTNER_EMAIL);
    const partnerAccountRes = await apiFetchAs(partnerToken, "/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name: `Partner Account ${Date.now()}`, initial_balance: 0 }),
    });
    const partnerAccount = await partnerAccountRes.json();
    partnerAccountId = partnerAccount.id;

    // 3. Get partner user ID
    const meRes = await apiFetchAs(partnerToken, "/api/auth/me");
    const partnerUser = await meRes.json();

    // 4. Primary user creates connection to partner (unique partner per run — no collision)
    const conn = await apiCreateUserConnection(partnerUser.id, 50);
    connectionId = conn.id;
    // 5. Partner accepts the connection
    await apiFetchAs(partnerToken, `/api/user-connections/${connectionId}/accepted`, {
      method: "PATCH",
    });

    // 6. Create seed category (all non-transfer transactions require category_id)
    const seedCat = await apiCreateCategory({ name: `Charges Seed ${Date.now()}` });
    seedCategoryId = seedCat.id;

    // 7. Find the primary user's connection account (created by connection setup)
    //    and seed income so balance > 0 (charges require balance != 0)
    const accountsRes = await apiFetchAs(await getAuthTokenForUser("e2e-test@financeapp.local"), "/api/accounts");
    const allAccounts = await accountsRes.json();
    const connAccount = allAccounts.find(
      (a: { user_connection?: { id: number } }) => a.user_connection?.id === connectionId,
    );
    if (!connAccount) throw new Error(`No connection account found for connection ${connectionId}`);
    primaryConnAccountId = connAccount.id;

    // Create an income on the primary user's connection account so balance > 0
    // Positive balance means "partner owes primary" → primary is charger when creating charges
    await apiCreateTransaction({
      account_id: primaryConnAccountId,
      transaction_type: "income",
      category_id: seedCategoryId,
      amount: 50000,
      date: `${PERIOD_YEAR}-${String(PERIOD_MONTH).padStart(2, "0")}-01`,
      description: "E2E seed for charges (primary)",
    });

    // Also seed the partner's connection account (partner-created charges check partner's balance)
    const partnerAccountsRes = await apiFetchAs(partnerToken, "/api/accounts");
    const partnerAllAccounts = await partnerAccountsRes.json();
    const partnerConnAccount = partnerAllAccounts.find(
      (a: { user_connection?: { id: number } }) => a.user_connection?.id === connectionId,
    );
    if (partnerConnAccount) {
      // Partner needs their own category
      const partnerCatRes = await apiFetchAs(partnerToken, "/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: `Partner Seed ${Date.now()}` }),
      });
      const partnerCat = await partnerCatRes.json();
      // Income on partner's connection account → partner's balance > 0 → partner is charger
      await apiFetchAs(partnerToken, "/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          account_id: partnerConnAccount.id,
          transaction_type: "income",
          category_id: partnerCat.id,
          amount: 50000,
          date: `${PERIOD_YEAR}-${String(PERIOD_MONTH).padStart(2, "0")}-01T00:00:00Z`,
          description: "E2E seed for charges (partner)",
        }),
      });
    }
  });

  test.afterAll(async () => {
    // Clean up charges
    for (const id of createdChargeIds) {
      await apiCancelCharge(id).catch(() => undefined);
    }
    // Clean up accounts and category
    await apiDeleteAccount(primaryAccountId).catch(() => undefined);
    await apiFetchAs(partnerToken, `/api/accounts/${partnerAccountId}`, {
      method: "DELETE",
    }).catch(() => undefined);
    await apiDeleteCategory(seedCategoryId).catch(() => undefined);
  });

  test.beforeEach(async ({ page }) => {
    chargesPage = new ChargesPage(page);
    await chargesPage.gotoMonth(PERIOD_MONTH, PERIOD_YEAR);
  });

  test("navigate to charges page and see tabs", async () => {
    await expect(chargesPage.page.getByRole("tab", { name: "Recebidas" })).toBeVisible();
    await expect(chargesPage.page.getByRole("tab", { name: "Enviadas" })).toBeVisible();
  });

  test("show empty state when no charges exist", async ({ browser }) => {
    // Use a fresh user with no charges to guarantee empty state
    const freshToken = await getAuthTokenForUser(`e2e-empty-charges-${Date.now()}@financeapp.local`);
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const url = new URL(baseURL);
    const context = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: "auth_token",
            value: freshToken,
            domain: url.hostname,
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: false,
            sameSite: "Lax" as const,
          },
        ],
        origins: [],
      },
    });
    const page = await context.newPage();
    await page.goto(`/charges?month=${PERIOD_MONTH}&year=${PERIOD_YEAR}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: "Enviadas" }).click();
    await expect(page.getByText("Nenhuma cobrança enviada")).toBeVisible({ timeout: 5000 });

    await context.close();
  });

  test("create a charge and see it in sent tab", async ({ page }) => {
    const description = `Cobrança E2E ${Date.now()}`;

    await chargesPage.openCreateDrawer();
    await chargesPage.fillCreateForm({
      accountName: primaryAccountName,
      description,
    });
    await chargesPage.submitCreate();

    // Notification
    await chargesPage.expectNotification(/Cobrança criada/);

    // Charge visible in sent tab
    await chargesPage.selectSentTab();
    await chargesPage.expectChargeVisible(description);
  });

  test("reject a received charge", async ({ page, context }) => {
    // Create a charge from partner → primary user (primary is the payer)
    const description = `Reject Test ${Date.now()}`;
    const chargeRes = await apiFetchAs(partnerToken, "/api/charges", {
      method: "POST",
      body: JSON.stringify({
        connection_id: connectionId,
        my_account_id: partnerAccountId,
        period_month: PERIOD_MONTH,
        period_year: PERIOD_YEAR,
        description,
        date: new Date().toISOString(),
      }),
    });
    const charge = await chargeRes.json();
    createdChargeIds.push(charge.id);

    // Reload charges page as primary user (who is the payer)
    await chargesPage.gotoMonth(PERIOD_MONTH, PERIOD_YEAR);
    await chargesPage.selectReceivedTab();

    await chargesPage.clickReject();
    await chargesPage.confirmReject();

    await chargesPage.expectNotification(/Cobrança recusada/);
  });

  test("cancel a sent charge", async ({ page }) => {
    const description = `Cancel Test ${Date.now()}`;

    // Primary user creates a charge (primary is charger, partner is payer)
    const chargePayload = {
      connection_id: connectionId,
      my_account_id: primaryAccountId,
      period_month: PERIOD_MONTH,
      period_year: PERIOD_YEAR,
      description,
      date: new Date().toISOString(),
    };
    const charge = await apiCreateCharge(chargePayload);
    createdChargeIds.push(charge.id);

    // Reload and find in sent tab
    await chargesPage.gotoMonth(PERIOD_MONTH, PERIOD_YEAR);
    await chargesPage.selectSentTab();

    await chargesPage.clickCancel();
    await chargesPage.confirmCancel();

    await chargesPage.expectNotification(/Cobrança cancelada/);
  });

  test("sidebar badge shows pending count", async ({ page }) => {
    // Create a charge from partner where primary is payer
    const description = `Badge Test ${Date.now()}`;
    await apiFetchAs(partnerToken, "/api/charges", {
      method: "POST",
      body: JSON.stringify({
        connection_id: connectionId,
        my_account_id: partnerAccountId,
        period_month: PERIOD_MONTH,
        period_year: PERIOD_YEAR,
        description,
        date: new Date().toISOString(),
      }),
    });

    // Reload and check badge
    await chargesPage.gotoMonth(PERIOD_MONTH, PERIOD_YEAR);

    // Badge should show at least 1 — Mantine Badge inside NavLink for /charges
    const badge = page.locator('a[href="/charges"]').locator('[class*="mantine-Badge-root"]').first();
    await expect(badge).toBeVisible({ timeout: 5000 });
    const text = await badge.textContent();
    expect(parseInt(text ?? "0")).toBeGreaterThanOrEqual(1);
  });
});
