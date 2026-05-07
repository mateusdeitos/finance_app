/**
 * Bulk settlement date change — issue #69
 *
 * Two scenarios:
 *   1. happy path: user bulk-changes the date of a synthetic settlement row
 *      that surfaces on their shared (connection) account. Asserts the
 *      backing settlement was patched via PATCH /api/settlements/:id.
 *   2. silent-skip: when a mixed selection (one transaction + one inline
 *      settlement) is acted on with a settlement-incompatible bulk action
 *      ("Alterar categoria"), only the transaction is updated; the
 *      settlement is silently skipped. Mirrors the existing eligibility
 *      silent-skip used for linked transactions.
 */

import { test, expect } from "@playwright/test";
import { TransactionsPage } from "../pages/TransactionsPage";
import { TransactionsTestIds } from "@/testIds";
import { createUserAndPartner, type UserAndPartnerResult } from "../helpers/createUserAndPartner";
import { apiFetchAs, openAuthedPage } from "../helpers/api";
import type { Transactions } from "@/types/transactions";

const now = new Date();
const MONTH = now.getMonth() + 1;
const YEAR = now.getFullYear();
const TODAY = `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function apiCreateSharedExpense(
  setup: UserAndPartnerResult,
  categoryId: number,
  description: string,
  amount: number,
  date: string,
): Promise<{ sourceTx: Transactions.Transaction; settlement: Transactions.Settlement }> {
  await apiFetchAs(setup.userToken, "/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      transaction_type: "expense",
      account_id: setup.userAccountId,
      category_id: categoryId,
      amount,
      date,
      description,
      split_settings: [{ connection_id: setup.connectionId, percentage: 50 }],
    }),
  });

  // The Search endpoint, filtered to the user's private account, returns the
  // source transaction with its settlements_from_source preloaded.
  const txsRes = await apiFetchAs(
    setup.userToken,
    `/api/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.userAccountId}&with_settlements=true`,
  );
  const txs = (await txsRes.json()) as Transactions.Transaction[];
  const sourceTx = txs.find((t) => t.description === description);
  if (!sourceTx) throw new Error(`Created shared expense not found: ${description}`);
  const settlement = sourceTx.settlements_from_source?.[0];
  if (!settlement) throw new Error(`Settlement not preloaded on source tx ${sourceTx.id}`);
  return { sourceTx, settlement };
}

async function apiGetSettlementBySourceTx(
  setup: UserAndPartnerResult,
  sourceTxId: number,
): Promise<Transactions.Settlement> {
  // No dedicated GET endpoint for settlements. We list transactions filtered
  // to the user's private account (where the source tx lives), find the
  // source tx by id, and return its first inline settlement. Looking up by
  // source tx — rather than by settlement id — is necessary because
  // syncSettlementsForTransaction deletes and recreates settlements on every
  // source update, which means the settlement id changes even when the date
  // is preserved by the snapshot logic.
  const res = await apiFetchAs(
    setup.userToken,
    `/api/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.userAccountId}&with_settlements=true`,
  );
  const txs = (await res.json()) as Transactions.Transaction[];
  const tx = txs.find((t) => t.id === sourceTxId);
  if (!tx) throw new Error(`Source tx ${sourceTxId} not found via listing`);
  const s = tx.settlements_from_source?.[0];
  if (!s) throw new Error(`No settlement on source tx ${sourceTxId}`);
  return s;
}

test.describe("Bulk settlement date change", () => {
  let setup: UserAndPartnerResult;
  let categoryId: number;

  test.beforeAll(async () => {
    setup = await createUserAndPartner("e2e-settlement-bulk");
    const catRes = await apiFetchAs(setup.userToken, "/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: `Settlement Bulk Cat ${Date.now()}` }),
    });
    const cat = (await catRes.json()) as { id: number };
    categoryId = cat.id;
  });

  // ── Test 1: happy path — synthetic settlement bulk-date ────────────────────
  test("changes the date of a selected synthetic settlement row", async ({ browser }) => {
    const description = `synthetic-bulk-${Date.now()}`;

    // Create the source on a day that is guaranteed (a) different from
    // today, and (b) inside the current calendar month so the listing
    // surfaces it. The bulk-date drawer's DateInput defaults to "today"
    // and we click Aplicar without typing — so today is the target.
    // Avoiding DateInput typing dodges Mantine/dayjs locale-parsing
    // quirks that make programmatic .fill() unreliable.
    const todayDay = now.getDate();
    const sourceDay = todayDay === 15 ? 16 : 15;
    const sourceDate = `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(sourceDay).padStart(2, "0")}`;
    const targetYmd = TODAY;

    const { sourceTx, settlement } = await apiCreateSharedExpense(
      setup,
      categoryId,
      description,
      10000,
      sourceDate,
    );

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);

    // Filter by the user's connection (shared) account to surface the
    // synthetic settlement row instead of the source transaction.
    await page.goto(
      `/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.userConnAccountId}`,
    );
    await page.waitForLoadState("networkidle");

    const settlementCheckbox = page.getByTestId(
      TransactionsTestIds.CheckboxSettlement(settlement.id),
    );
    await expect(settlementCheckbox).toBeVisible({ timeout: 8000 });
    await settlementCheckbox.click();

    // Selection bar reflects exactly 1 selected row.
    expect(await txPage.getSelectedCount()).toBe(1);

    await txPage.openBulkActionsMenu();
    await page.getByTestId(TransactionsTestIds.BtnBulkDate).click();

    const dateDrawer = page.getByTestId(TransactionsTestIds.DrawerSelectDate);
    await expect(dateDrawer).toBeVisible();
    // The DateInput's useState defaults to `new Date()` (today). We rely on
    // that default and click Aplicar straight away — which means the source
    // expense above must NOT have been created on today's date, otherwise
    // the test wouldn't observe a state change.
    await page.getByTestId(TransactionsTestIds.BtnApplyDate).click();

    await expect(page.getByTestId(TransactionsTestIds.BulkSuccess)).toBeVisible({
      timeout: 15000,
    });

    // Look up the settlement by source tx id — the bulk-date PATCH on a
    // synthetic row updates the settlement in place (settlement.id is
    // preserved), but listing by source covers both that path and the
    // delete-and-recreate path triggered by other flows.
    const updated = await apiGetSettlementBySourceTx(setup, sourceTx.id);
    expect(updated.date?.slice(0, 10)).toBe(targetYmd);

    await page.close();
  });

  // ── Test 2: silent-skip — category change ignores settlements ─────────────
  test("bulk category change skips selected inline settlements silently", async ({
    browser,
  }) => {
    const description = `silent-skip-${Date.now()}`;
    const { sourceTx, settlement } = await apiCreateSharedExpense(
      setup,
      categoryId,
      description,
      10000,
      TODAY,
    );

    // A second category to switch to; only the transaction should adopt it.
    const otherCatRes = await apiFetchAs(setup.userToken, "/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: `Other Cat ${Date.now()}` }),
    });
    const otherCat = (await otherCatRes.json()) as { id: number };

    const initialSettlementDate = settlement.date?.slice(0, 10);

    const page = await openAuthedPage(browser, setup.userToken);
    const txPage = new TransactionsPage(page);

    // Filter by the private account so the source tx is rendered with its
    // inline settlement child — both rows side by side, both selectable.
    await page.goto(
      `/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.userAccountId}`,
    );
    await page.waitForLoadState("networkidle");

    await page
      .getByTestId(TransactionsTestIds.Checkbox(sourceTx.id))
      .first()
      .click();
    await page.getByTestId(TransactionsTestIds.CheckboxSettlement(settlement.id)).click();

    // Both selected: 1 tx + 1 settlement = 2.
    expect(await txPage.getSelectedCount()).toBe(2);

    await txPage.openBulkActionsMenu();
    await page.getByTestId(TransactionsTestIds.BtnBulkCategory).click();

    // Pick the other category in the SelectCategoryDrawer.
    await page.getByTestId(TransactionsTestIds.CategoryOption(otherCat.id)).click();

    await expect(page.getByTestId(TransactionsTestIds.BulkSuccess)).toBeVisible({
      timeout: 15000,
    });

    // Verify only the transaction got the new category; settlement is unchanged.
    const txsRes = await apiFetchAs(
      setup.userToken,
      `/api/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.userAccountId}&with_settlements=true`,
    );
    const txs = (await txsRes.json()) as Transactions.Transaction[];
    const updatedTx = txs.find((t) => t.description === description);
    expect(updatedTx?.category_id).toBe(otherCat.id);

    // Settlement is recreated on every source-tx update, so its id changes
    // even though the snapshot preserves the date. Re-look up by source.
    const updatedSettlement = await apiGetSettlementBySourceTx(setup, sourceTx.id);
    expect(updatedSettlement.date?.slice(0, 10)).toBe(initialSettlementDate);

    await page.close();
  });
});
