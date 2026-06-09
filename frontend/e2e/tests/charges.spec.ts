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
  openAuthedPage,
} from "../helpers/api";
import { ChargesTestIds } from "@/testIds";
import { SelectField } from "../helpers/formFields";

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
      accountId: primaryAccountId,
      connectionId,
      role: "charger",
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
        role: "charger",
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
      role: "charger" as const,
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

  test("create charge via UI with arbitrary amount + charger role on zero balance", async ({ browser }) => {
    // Isolated user pair — the fresh primary will have exactly one connection and one account,
    // so the drawer selectors are unambiguous.
    const freshPrimaryEmail = `e2e-arb-charger-primary-${Date.now()}@financeapp.local`;
    const freshPartnerEmail = `e2e-arb-charger-partner-${Date.now()}@financeapp.local`;
    const freshPrimaryToken = await getAuthTokenForUser(freshPrimaryEmail);
    const freshPartnerToken = await getAuthTokenForUser(freshPartnerEmail);

    const freshPartner = await (await apiFetchAs(freshPartnerToken, "/api/auth/me")).json();

    const connRes = await apiFetchAs(freshPrimaryToken, "/api/user-connections", {
      method: "POST",
      body: JSON.stringify({ to_user_id: freshPartner.id, from_default_split_percentage: 50 }),
    });
    const freshConn = await connRes.json();
    await apiFetchAs(freshPartnerToken, `/api/user-connections/${freshConn.id}/accepted`, {
      method: "PATCH",
    });

    const privAccName = `Arb Charger Acc ${Date.now()}`;
    const privAccRes = await apiFetchAs(freshPrimaryToken, "/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name: privAccName, initial_balance: 0 }),
    });
    const privAcc = await privAccRes.json();

    // Drive the UI as the fresh primary
    const page = await openAuthedPage(browser, freshPrimaryToken);
    const pageCharges = new ChargesPage(page);
    await pageCharges.gotoMonth(PERIOD_MONTH, PERIOD_YEAR);

    const description = `UI Arb Charger ${Date.now()}`;
    const arbitraryAmount = 123.45; // reais in the UI → 12345 cents in the DB
    await pageCharges.openCreateDrawer();
    await pageCharges.fillCreateForm({
      accountId: privAcc.id,
      connectionId: freshConn.id,
      role: "charger",
      amount: arbitraryAmount,
      description,
    });
    await pageCharges.submitCreate();
    await pageCharges.expectNotification(/Cobrança criada/);

    // Verify via API — the charge was saved with caller as charger and stored amount in cents.
    const listRes = await apiFetchAs(freshPrimaryToken, "/api/charges?direction=sent");
    const listBody = await listRes.json();
    const created = (listBody.charges ?? []).find((c: { description?: string }) => c.description === description);
    expect(created).toBeDefined();
    expect(created.amount).toBe(12345);
    expect(created.status).toBe("pending");
    const me = await (await apiFetchAs(freshPrimaryToken, "/api/auth/me")).json();
    expect(created.charger_user_id).toBe(me.id);
    expect(created.payer_user_id).toBe(freshPartner.id);

    await page.context().close();
  });

  test("payer can initiate charge via UI on zero balance", async ({ browser }) => {
    // Isolated pair — caller is the payer ("I owe you X"). Saved with caller in payer fields.
    const freshPrimaryEmail = `e2e-arb-payer-primary-${Date.now()}@financeapp.local`;
    const freshPartnerEmail = `e2e-arb-payer-partner-${Date.now()}@financeapp.local`;
    const freshPrimaryToken = await getAuthTokenForUser(freshPrimaryEmail);
    const freshPartnerToken = await getAuthTokenForUser(freshPartnerEmail);

    const freshPartner = await (await apiFetchAs(freshPartnerToken, "/api/auth/me")).json();

    const connRes = await apiFetchAs(freshPrimaryToken, "/api/user-connections", {
      method: "POST",
      body: JSON.stringify({ to_user_id: freshPartner.id, from_default_split_percentage: 50 }),
    });
    const freshConn = await connRes.json();
    await apiFetchAs(freshPartnerToken, `/api/user-connections/${freshConn.id}/accepted`, {
      method: "PATCH",
    });

    const privAccName = `Arb Payer Acc ${Date.now()}`;
    const privAccRes = await apiFetchAs(freshPrimaryToken, "/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name: privAccName, initial_balance: 0 }),
    });
    const privAcc = await privAccRes.json();

    const page = await openAuthedPage(browser, freshPrimaryToken);
    const pageCharges = new ChargesPage(page);
    await pageCharges.gotoMonth(PERIOD_MONTH, PERIOD_YEAR);

    const description = `UI Arb Payer ${Date.now()}`;
    const arbitraryAmount = 67.89;
    await pageCharges.openCreateDrawer();
    await pageCharges.fillCreateForm({
      accountId: privAcc.id,
      connectionId: freshConn.id,
      role: "payer",
      amount: arbitraryAmount,
      description,
    });
    await pageCharges.submitCreate();
    await pageCharges.expectNotification(/Cobrança criada/);

    const me = await (await apiFetchAs(freshPrimaryToken, "/api/auth/me")).json();
    // The caller INITIATED the charge (as payer), so it lands in their "sent"
    // tab — the counterparty is the one who must accept it, not the initiator.
    const sentRes = await apiFetchAs(freshPrimaryToken, "/api/charges?direction=sent");
    const sentBody = await sentRes.json();
    const created = (sentBody.charges ?? []).find((c: { description?: string }) => c.description === description);
    expect(created).toBeDefined();
    expect(created.amount).toBe(6789);
    expect(created.payer_user_id).toBe(me.id);
    expect(created.charger_user_id).toBe(freshPartner.id);
    expect(created.initiator_user_id).toBe(me.id);

    // It must NOT show up as something the initiator can accept ("received").
    const receivedRes = await apiFetchAs(freshPrimaryToken, "/api/charges?direction=received");
    const receivedBody = await receivedRes.json();
    const wronglyReceived = (receivedBody.charges ?? []).find(
      (c: { description?: string }) => c.description === description,
    );
    expect(wronglyReceived).toBeUndefined();

    await page.context().close();
  });

  // Regression for the reported bug:
  //   "I owe my wife 900 (my connection account is -900). I create a charge as
  //    PAYER to pay her, but the Accept is shown to ME and I get 'only she can
  //    accept'. And when accepted, her balance doesn't zero — it doubles."
  //
  // Asserts the full corrected flow end-to-end through the UI for BOTH users:
  //   1. The payer (initiator) sees the charge in "Enviadas" with Cancel, and
  //      NEVER an Accept button — even in "Recebidas".
  //   2. The counterparty (charger) sees it in "Recebidas" and can Accept it.
  //   3. After acceptance, BOTH connection-account balances settle to zero
  //      (no doubling).
  test("payer initiates a charge: counterparty accepts and both balances zero", async ({ browser }) => {
    // -- Two fresh, isolated users: the payer (owes) and the wife (is owed). --
    const payerEmail = `e2e-payer-flow-${Date.now()}@financeapp.local`;
    const wifeEmail = `e2e-wife-flow-${Date.now()}@financeapp.local`;
    const payerToken = await getAuthTokenForUser(payerEmail);
    const wifeToken = await getAuthTokenForUser(wifeEmail);

    const payerMe = await (await apiFetchAs(payerToken, "/api/auth/me")).json();
    const wifeMe = await (await apiFetchAs(wifeToken, "/api/auth/me")).json();

    // Private accounts (used to settle the charge into).
    const payerPriv = await (
      await apiFetchAs(payerToken, "/api/accounts", {
        method: "POST",
        body: JSON.stringify({ name: `Payer Priv ${Date.now()}`, initial_balance: 0 }),
      })
    ).json();
    const wifePriv = await (
      await apiFetchAs(wifeToken, "/api/accounts", {
        method: "POST",
        body: JSON.stringify({ name: `Wife Priv ${Date.now()}`, initial_balance: 0 }),
      })
    ).json();

    // Connection payer -> wife, accepted by the wife.
    const conn = await (
      await apiFetchAs(payerToken, "/api/user-connections", {
        method: "POST",
        body: JSON.stringify({ to_user_id: wifeMe.id, from_default_split_percentage: 50 }),
      })
    ).json();
    await apiFetchAs(wifeToken, `/api/user-connections/${conn.id}/accepted`, { method: "PATCH" });

    // Resolve each user's connection (shared-ledger) account.
    const findConnAccount = async (token: string): Promise<number> => {
      const accounts = await (await apiFetchAs(token, "/api/accounts")).json();
      const acc = accounts.find(
        (a: { user_connection?: { id: number } }) => a.user_connection?.id === conn.id,
      );
      if (!acc) throw new Error("connection account not found");
      return acc.id;
    };
    const payerConnAcc = await findConnAccount(payerToken);
    const wifeConnAcc = await findConnAccount(wifeToken);

    // Seed the imbalance: payer owes 900 (conn balance -900), wife is owed 900.
    const dateISO = `${PERIOD_YEAR}-${String(PERIOD_MONTH).padStart(2, "0")}-01T00:00:00Z`;
    const payerCat = await (
      await apiFetchAs(payerToken, "/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: `Payer Cat ${Date.now()}` }),
      })
    ).json();
    const wifeCat = await (
      await apiFetchAs(wifeToken, "/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: `Wife Cat ${Date.now()}` }),
      })
    ).json();
    await apiFetchAs(payerToken, "/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: payerConnAcc,
        transaction_type: "expense",
        category_id: payerCat.id,
        amount: 90000,
        date: dateISO,
        description: "owes wife",
      }),
    });
    await apiFetchAs(wifeToken, "/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: wifeConnAcc,
        transaction_type: "income",
        category_id: wifeCat.id,
        amount: 90000,
        date: dateISO,
        description: "owed by payer",
      }),
    });

    // -- The payer creates a charge as PAYER ("I'll pay you 900") via the UI. --
    const description = `Pay Wife ${Date.now()}`;
    const payerPage = await openAuthedPage(browser, payerToken);
    const payerCharges = new ChargesPage(payerPage);
    await payerCharges.gotoMonth(PERIOD_MONTH, PERIOD_YEAR);
    await payerCharges.openCreateDrawer();
    await payerCharges.fillCreateForm({
      accountId: payerPriv.id,
      connectionId: conn.id,
      role: "payer",
      amount: 900,
      description,
    });
    await payerCharges.submitCreate();
    await payerCharges.expectNotification(/Cobrança criada/);

    // Look up the created charge to scope assertions by its card id.
    const sent = await (await apiFetchAs(payerToken, "/api/charges?direction=sent")).json();
    const charge = (sent.charges ?? []).find(
      (c: { description?: string }) => c.description === description,
    );
    expect(charge).toBeDefined();
    expect(charge.payer_user_id).toBe(payerMe.id);
    expect(charge.charger_user_id).toBe(wifeMe.id);
    expect(charge.initiator_user_id).toBe(payerMe.id);

    // (1) The initiator sees it in "Enviadas" with Cancel — never Accept.
    await payerCharges.selectSentTab();
    const payerCard = payerPage.getByTestId(ChargesTestIds.Card(charge.id));
    await expect(payerCard).toBeVisible();
    await expect(payerCard.getByTestId(ChargesTestIds.BtnCancel)).toBeVisible();
    await expect(payerCard.getByTestId(ChargesTestIds.BtnAccept)).toHaveCount(0);
    // And it is NOT shown under "Recebidas" for the initiator. (Mantine keeps
    // the inactive "Enviadas" panel mounted but hidden, so the card still
    // EXISTS in the DOM — assert it isn't visible rather than absent.)
    await payerCharges.selectReceivedTab();
    await expect(payerPage.getByTestId(ChargesTestIds.Card(charge.id))).not.toBeVisible();

    // (2) The counterparty (wife) is the one offered the Accept action: the
    // charge shows up in HER "Recebidas" tab with an Accept button (the core of
    // the reported routing bug). She then settles it.
    const wifePage = await openAuthedPage(browser, wifeToken);
    const wifeCharges = new ChargesPage(wifePage);
    await wifeCharges.gotoMonth(PERIOD_MONTH, PERIOD_YEAR);
    await wifeCharges.selectReceivedTab();
    const wifeCard = wifePage.getByTestId(ChargesTestIds.Card(charge.id));
    await expect(wifeCard).toBeVisible();
    await expect(wifeCard.getByTestId(ChargesTestIds.BtnAccept)).toBeVisible();
    // The initiator-side actions (Cancel/Reject) must NOT be offered to her.
    await expect(wifeCard.getByTestId(ChargesTestIds.BtnCancel)).toHaveCount(0);

    // Settle the charge as the wife through the real backend.
    const acceptRes = await apiFetchAs(wifeToken, `/api/charges/${charge.id}/accept`, {
      method: "POST",
      body: JSON.stringify({ account_id: wifePriv.id, date: new Date().toISOString() }),
    });
    expect(acceptRes.status).toBe(204);

    // (3) Both connection-account balances are zeroed — not doubled.
    const connBalance = async (token: string, accountId: number): Promise<number> => {
      const body = await (
        await apiFetchAs(
          token,
          `/api/transactions/balance?month=${PERIOD_MONTH}&year=${PERIOD_YEAR}&account_id[]=${accountId}`,
        )
      ).json();
      return body.balance as number;
    };
    expect(await connBalance(payerToken, payerConnAcc)).toBe(0);
    expect(await connBalance(wifeToken, wifeConnAcc)).toBe(0);

    await payerPage.context().close();
    await wifePage.context().close();
  });

  test("submitting the create drawer without selecting a role is rejected", async () => {
    // The radio is required in the schema, so submit without picking charger/payer stays on-form.
    await chargesPage.openCreateDrawer();
    // Fill everything except role — submit must stay on the form.
    await new SelectField(chargesPage.createDrawer, ChargesTestIds.SelectMyAccount).pick(
      ChargesTestIds.OptionMyAccount(primaryAccountId),
    );
    await chargesPage.createDrawer.getByTestId(ChargesTestIds.BtnSubmitCreate).click();

    // The drawer must stay open and show a validation error for the role field.
    await expect(chargesPage.createDrawer).toBeVisible();
    await expect(chargesPage.createDrawer.getByText("Selecione seu papel")).toBeVisible();
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
        role: "charger",
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
