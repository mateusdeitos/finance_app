/**
 * Synthetic settlement row — edit flow (issue #78).
 *
 * When the transactions list is filtered by the user's connection (shared)
 * account, the backend returns a synthetic Transaction row representing the
 * settlement of a split expense whose source lives on a private account.
 * This test exercises clicking that synthetic row: the FE fetches the
 * source transaction by its id and opens the UpdateTransactionDrawer.
 */

import { test, expect } from "@playwright/test";
import { TransactionsTestIds } from "@/testIds";
import { createUserAndPartner } from "../helpers/createUserAndPartner";
import { apiFetchAs, openAuthedPage } from "../helpers/api";
import type { Transactions } from "@/types/transactions";

const now = new Date();
const MONTH = now.getMonth() + 1;
const YEAR = now.getFullYear();
const TODAY = `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

test.describe("Synthetic settlement row — edit", () => {
  test("clicking a synthetic row opens the source transaction's update drawer", async ({
    browser,
  }) => {
    const setup = await createUserAndPartner("e2e-synthetic-edit");

    const catRes = await apiFetchAs(setup.userToken, "/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: `Cat ${Date.now()}` }),
    });
    const cat = (await catRes.json()) as { id: number };

    const description = `synthetic-edit-${Date.now()}`;
    await apiFetchAs(setup.userToken, "/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        transaction_type: "expense",
        account_id: setup.userAccountId,
        category_id: cat.id,
        amount: 10000,
        date: TODAY,
        description,
        split_settings: [{ connection_id: setup.connectionId, percentage: 50 }],
      }),
    });

    // Recover the settlement id by listing the source via the user's private
    // account (where settlements_from_source is preloaded).
    const txsRes = await apiFetchAs(
      setup.userToken,
      `/api/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.userAccountId}&with_settlements=true`,
    );
    const txs = (await txsRes.json()) as Transactions.Transaction[];
    const sourceTx = txs.find((t) => t.description === description);
    if (!sourceTx) throw new Error(`Created shared expense not found: ${description}`);
    const settlementId = sourceTx.settlements_from_source?.[0]?.id;
    if (!settlementId) throw new Error("Settlement not preloaded on source");

    const page = await openAuthedPage(browser, setup.userToken);

    // Filter by the user's connection account so the synthetic row is what
    // gets rendered (the source is on a different account and hidden by
    // the filter).
    await page.goto(
      `/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.userConnAccountId}`,
    );
    await page.waitForLoadState("networkidle");

    // Click the row body (not the checkbox) to trigger the edit flow.
    await page.getByTestId(TransactionsTestIds.SettlementRow(settlementId)).click();

    // Drawer opens with the source transaction loaded — its description
    // is rendered in the description input.
    const updateDrawer = page.getByTestId(TransactionsTestIds.DrawerUpdate);
    await expect(updateDrawer).toBeVisible({ timeout: 10000 });
    await expect(
      updateDrawer.getByTestId(TransactionsTestIds.InputDescription),
    ).toHaveValue(description);

    await page.close();
  });
});
