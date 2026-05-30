import { test, expect } from "@playwright/test";
import { TransactionsPage } from "../pages/TransactionsPage";
import {
  apiCreateCharge,
  apiFetchAs,
  apiListTransactions,
  openAuthedPage,
} from "../helpers/api";
import { createUserAndPartner } from "../helpers/createUserAndPartner";
import { TransactionsTestIds } from "@/testIds";

/**
 * Charge-settlement transfer: editing the shared source account.
 *
 * When a charge is accepted, the charger receives an intra-user transfer whose
 * SOURCE (`account_id`) is the shared connection account (debit) and whose
 * destination is their private account (credit). The transfer source Select in
 * the edit form only offers personal accounts, so a shared source account would
 * render blank. The form must instead surface it via the read-only account
 * display. This test reproduces that exact flow and guards the fix.
 */

test.describe("Charge-settlement transfer: shared source account edit", () => {
  const now = new Date();
  const PERIOD_MONTH = now.getMonth() + 1;
  const PERIOD_YEAR = now.getFullYear();

  test("editing the charger's transfer shows the shared source account read-only", async ({
    browser,
  }) => {
    // Two connected users; the primary user will be the charger.
    const pair = await createUserAndPartner("e2e-charge-shared-src");

    // Primary creates a charge as charger with an arbitrary amount (works on a
    // zero balance). Charger's account is set → the partner (payer) must accept.
    const charge = await apiCreateCharge(
      {
        connection_id: pair.connectionId,
        my_account_id: pair.userAccountId,
        period_month: PERIOD_MONTH,
        period_year: PERIOD_YEAR,
        description: `Acerto ${Date.now()}`,
        amount: 20267,
        role: "charger",
        date: new Date(PERIOD_YEAR, PERIOD_MONTH - 1, 15).toISOString(),
      },
      { token: pair.userToken },
    );

    // Partner accepts → creates the charger's transfer (shared conn account →
    // private account) owned by the primary user, with charge_id set.
    const acceptRes = await apiFetchAs(pair.partnerToken, `/api/charges/${charge.id}/accept`, {
      method: "POST",
      body: JSON.stringify({
        account_id: pair.partnerAccountId,
        amount: 20267,
        date: new Date(PERIOD_YEAR, PERIOD_MONTH - 1, 15).toISOString(),
      }),
    });
    expect(acceptRes.ok, `accept failed: ${acceptRes.status} ${await acceptRes.text()}`).toBeTruthy();

    // Find the primary user's charge transfer whose source (debit side) is the
    // shared connection account — this is the leg that renders the source field.
    const txs = await apiListTransactions(PERIOD_MONTH, PERIOD_YEAR, { token: pair.userToken });
    const chargerTransfer = txs.find(
      (t) =>
        t.type === "transfer" &&
        t.operation_type === "debit" &&
        t.account_id === pair.userConnAccountId &&
        t.charge_id != null,
    );
    expect(chargerTransfer, "expected charger's shared-source transfer").toBeTruthy();

    // Open the edit drawer for that transfer as the primary user. The transfer
    // row container has no click handler — only its cells do — so click the
    // description text (the proven interaction for transfer rows).
    const page = await openAuthedPage(browser, pair.userToken);
    const transactionsPage = new TransactionsPage(page);
    await transactionsPage.gotoMonth(PERIOD_MONTH, PERIOD_YEAR);

    const row = page.locator(`[data-transaction-id="${chargerTransfer!.id}"]`);
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByText("Charge settlement").click();
    await transactionsPage.waitForUpdateDrawer();

    const drawer = transactionsPage.updateDrawer;

    // The shared source account can't be a personal-only Select option, so it
    // must render as the read-only account field — NOT a blank Select.
    await expect(drawer.getByTestId(TransactionsTestIds.ReadOnlyAccount)).toBeVisible();
    await expect(drawer.getByTestId(TransactionsTestIds.SelectAccount)).not.toBeVisible();

    await page.close();
  });
});
