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

// dd/mm/yyyy used by the DateInput component
function ddmmyyyy(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${m}/${d.getFullYear()}`;
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
    const { sourceTx, settlement } = await apiCreateSharedExpense(
      setup,
      categoryId,
      description,
      10000,
      TODAY,
    );

    // Pick a target day > 12 so the DD/MM/YYYY input string can't be
    // misparsed as MM/DD/YYYY by Mantine's DateInput dayjs parser. Stay
    // inside the current month so the post-update listing (filtered by
    // current month) still surfaces the settlement.
    const todayDay = now.getDate();
    const targetDay = todayDay >= 25 ? 13 : 25;
    const target = new Date(YEAR, MONTH - 1, targetDay);
    const targetYmd = ymd(target);

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
    await dateDrawer.getByTestId(TransactionsTestIds.InputBulkDate).fill(ddmmyyyy(target));
    await page.getByTestId(TransactionsTestIds.BtnApplyDate).click();

    await expect(page.getByTestId(TransactionsTestIds.BulkSuccess)).toBeVisible({
      timeout: 15000,
    });

    // Look up the settlement by source tx id rather than by the original
    // settlement.id — sync deletes and recreates settlements after every
    // source update, so the id changes even though the date is preserved.
    void settlement; // intentionally unused; the sync loop replaces it.
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
    void settlement; // intentionally unused after the sync loop.
    const updatedSettlement = await apiGetSettlementBySourceTx(setup, sourceTx.id);
    expect(updatedSettlement.date?.slice(0, 10)).toBe(initialSettlementDate);

    await page.close();
  });
});
