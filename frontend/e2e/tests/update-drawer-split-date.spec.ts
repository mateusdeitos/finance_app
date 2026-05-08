/**
 * Update drawer — split settlement date pre-population (issue #69 follow-up).
 *
 * When the user opens the update drawer on a shared expense whose split has
 * a custom settlement date, the date input under the split row must be
 * pre-populated with that settlement's date. This regressed because the
 * single-tx GET (`GET /api/transactions/:id`) was not preloading
 * `settlements_from_source`, so the form's defaultValues fell back to `null`
 * for the date field.
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

// Pick a date inside the same month so the listing shows the row without
// needing a date filter swap.
const SETTLEMENT_DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-15`;
const SETTLEMENT_DATE_DDMMYYYY = `15/${String(MONTH).padStart(2, "0")}/${YEAR}`;

test("update drawer pre-populates split date from settlement.date", async ({ browser }) => {
  const setup = await createUserAndPartner("e2e-update-split-date");

  const catRes = await apiFetchAs(setup.userToken, "/api/categories", {
    method: "POST",
    body: JSON.stringify({ name: `Cat ${Date.now()}` }),
  });
  const cat = (await catRes.json()) as { id: number };

  const description = `update-split-date-${Date.now()}`;
  await apiFetchAs(setup.userToken, "/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      transaction_type: "expense",
      account_id: setup.userAccountId,
      category_id: cat.id,
      amount: 10000,
      date: TODAY,
      description,
      split_settings: [
        { connection_id: setup.connectionId, percentage: 50, date: SETTLEMENT_DATE },
      ],
    }),
  });

  // Recover the source tx id (and confirm the settlement was created with the
  // requested date) by listing on the user's private account.
  const txsRes = await apiFetchAs(
    setup.userToken,
    `/api/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.userAccountId}&with_settlements=true`,
  );
  const txs = (await txsRes.json()) as Transactions.Transaction[];
  const sourceTx = txs.find((t) => t.description === description);
  if (!sourceTx) throw new Error(`Created shared expense not found: ${description}`);
  const settlement = sourceTx.settlements_from_source?.[0];
  if (!settlement) throw new Error(`Settlement missing on source tx ${sourceTx.id}`);
  expect(settlement.date?.slice(0, 10)).toBe(SETTLEMENT_DATE);

  const page = await openAuthedPage(browser, setup.userToken);
  await page.goto(
    `/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.userAccountId}`,
  );
  await page.waitForLoadState("networkidle");

  // Click the source transaction row to open the update drawer. The drawer
  // fetches the source by id (GET /api/transactions/:id) — this was the
  // request that was previously missing settlements_from_source, breaking
  // the date-input hydration path in UpdateTransactionDrawer.
  await page.locator(`[data-transaction-id="${sourceTx.id}"]`).click();

  const updateDrawer = page.getByTestId(TransactionsTestIds.DrawerUpdate);
  await expect(updateDrawer).toBeVisible({ timeout: 10000 });

  const splitDateInput = updateDrawer.getByTestId(TransactionsTestIds.InputSplitDate(0));
  await expect(splitDateInput).toBeVisible();
  await expect(splitDateInput).toHaveValue(SETTLEMENT_DATE_DDMMYYYY);

  await page.close();
});
