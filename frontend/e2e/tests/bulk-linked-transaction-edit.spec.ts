/**
 * Bulk edits on a partner's (to_user) linked transaction — issue #205 parity.
 *
 * The single-row edit drawer already lets the partner (the "ponta" of a share)
 * change the date / description / category / amount / tags of their OWN linked
 * transaction. Before this change the bulk actions silently skipped those rows:
 * getEligibleIds filtered out any transaction whose original_user_id != the
 * current user, which is exactly the partner's linked side (original_user_id
 * points at the author).
 *
 * These tests assert the parity: the partner can now bulk-change the two fields
 * that have a bulk action AND are allowed on a linked tx — category and date.
 *
 * Setup: the primary user creates a shared expense (split) so the partner
 * receives a real debit transaction on their connection account. We then drive
 * the bulk action while authenticated as the PARTNER.
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

async function apiCreateSharedExpense(
  setup: UserAndPartnerResult,
  categoryId: number,
  description: string,
  amount: number,
  date: string,
): Promise<void> {
  const res = await apiFetchAs(setup.userToken, "/api/transactions", {
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
  if (!res.ok) throw new Error(`Failed to create shared expense: ${res.status}`);
}

/** Resolve the partner's linked (debit) transaction on their connection account. */
async function apiGetPartnerLinkedTx(
  setup: UserAndPartnerResult,
  description: string,
): Promise<Transactions.Transaction> {
  const res = await apiFetchAs(
    setup.partnerToken,
    `/api/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.partnerConnAccountId}`,
  );
  const txs = (await res.json()) as Transactions.Transaction[];
  const tx = txs.find((t) => t.description === description);
  if (!tx) throw new Error(`Partner linked tx not found: ${description}`);
  return tx;
}

test.describe("Bulk edits on partner's linked transaction", () => {
  let setup: UserAndPartnerResult;
  let primaryCategoryId: number;
  let partnerCategoryId: number;

  test.beforeAll(async () => {
    setup = await createUserAndPartner("e2e-bulk-linked");

    const primaryCatRes = await apiFetchAs(setup.userToken, "/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: `Bulk Linked Primary Cat ${Date.now()}` }),
    });
    primaryCategoryId = ((await primaryCatRes.json()) as { id: number }).id;

    const partnerCatRes = await apiFetchAs(setup.partnerToken, "/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: `Bulk Linked Partner Cat ${Date.now()}` }),
    });
    partnerCategoryId = ((await partnerCatRes.json()) as { id: number }).id;
  });

  // ── Category ──────────────────────────────────────────────────────────────
  test("partner can bulk-change the category of their own linked transaction", async ({
    browser,
  }) => {
    const description = `bulk-linked-cat-${Date.now()}`;
    await apiCreateSharedExpense(setup, primaryCategoryId, description, 10000, TODAY);

    const partnerTx = await apiGetPartnerLinkedTx(setup, description);

    const page = await openAuthedPage(browser, setup.partnerToken);
    const txPage = new TransactionsPage(page);
    await page.goto(
      `/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.partnerConnAccountId}`,
    );
    await page.waitForLoadState("networkidle");

    await page.getByTestId(TransactionsTestIds.Checkbox(partnerTx.id)).first().click();
    expect(await txPage.getSelectedCount()).toBe(1);

    await txPage.openBulkActionsMenu();
    await page.getByTestId(TransactionsTestIds.BtnBulkCategory).click();
    await page.getByTestId(TransactionsTestIds.CategoryOption(partnerCategoryId)).click();

    // Pre-fix this never appeared: the row was silently skipped, leaving 0
    // eligible items so the progress drawer never opened.
    await expect(page.getByTestId(TransactionsTestIds.BulkSuccess)).toBeVisible({
      timeout: 15000,
    });

    const updated = await apiGetPartnerLinkedTx(setup, description);
    expect(updated.category_id).toBe(partnerCategoryId);

    await page.close();
  });

  // ── Date ──────────────────────────────────────────────────────────────────
  test("partner can bulk-change the date of their own linked transaction", async ({
    browser,
  }) => {
    const description = `bulk-linked-date-${Date.now()}`;
    // Create on a day inside the current month that is NOT today, so applying
    // the bulk-date default (today) is observable.
    const todayDay = now.getDate();
    const sourceDay = todayDay === 15 ? 16 : 15;
    const sourceDate = `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(sourceDay).padStart(2, "0")}`;
    await apiCreateSharedExpense(setup, primaryCategoryId, description, 10000, sourceDate);

    const partnerTx = await apiGetPartnerLinkedTx(setup, description);

    const page = await openAuthedPage(browser, setup.partnerToken);
    const txPage = new TransactionsPage(page);
    await page.goto(
      `/transactions?month=${MONTH}&year=${YEAR}&account_id[]=${setup.partnerConnAccountId}`,
    );
    await page.waitForLoadState("networkidle");

    await page.getByTestId(TransactionsTestIds.Checkbox(partnerTx.id)).first().click();
    expect(await txPage.getSelectedCount()).toBe(1);

    await txPage.openBulkActionsMenu();
    await page.getByTestId(TransactionsTestIds.BtnBulkDate).click();

    const dateDrawer = page.getByTestId(TransactionsTestIds.DrawerSelectDate);
    await expect(dateDrawer).toBeVisible();
    // The DateInput defaults to today; click Aplicar straight away.
    await page.getByTestId(TransactionsTestIds.BtnApplyDate).click();

    await expect(page.getByTestId(TransactionsTestIds.BulkSuccess)).toBeVisible({
      timeout: 15000,
    });

    const updated = await apiGetPartnerLinkedTx(setup, description);
    expect(updated.date?.slice(0, 10)).toBe(TODAY);

    await page.close();
  });
});
