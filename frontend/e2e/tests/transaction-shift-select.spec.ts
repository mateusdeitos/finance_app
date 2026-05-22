import { test, expect, type Browser, type Page } from "@playwright/test";
import { TransactionsPage } from "../pages/TransactionsPage";
import { apiCreateTransaction, apiFetchAs, openAuthedPage } from "../helpers/api";
import { createUserAndPartner } from "../helpers/createUserAndPartner";
import type { Transactions } from "@/types/transactions";

// Regression for GitHub issue #159: the transaction listing interleaves
// transactions and their inline settlements. A shift+click range must span
// both entity types — previously the items of the other type were skipped.

const TX_DATE = "2026-05-15";
const TX_MONTH = 5;
const TX_YEAR = 2026;

interface MixedGroupSetup {
  page: Page;
  transactionsPage: TransactionsPage;
  txId: number;
  settlementId: number;
}

// Creates a connected user with one split transaction. The split produces an
// inline settlement, so the transaction's group renders two selectable rows:
// the transaction followed by its settlement.
async function setupMixedGroup(browser: Browser): Promise<MixedGroupSetup> {
  const { userToken, userAccountId, connectionId } =
    await createUserAndPartner("e2e-tx-shift-select");

  const categoryRes = await apiFetchAs(userToken, "/api/categories", {
    method: "POST",
    body: JSON.stringify({ name: `Cat shift-select ${Date.now()}` }),
  });
  const category = (await categoryRes.json()) as { id: number };

  const created = await apiCreateTransaction(
    {
      transaction_type: "expense",
      account_id: userAccountId,
      category_id: category.id,
      amount: 10000,
      date: TX_DATE,
      description: "Split transaction #159",
      split_settings: [{ connection_id: connectionId, percentage: 50 }],
    },
    { token: userToken },
  );

  // with_settlements=true preloads settlements_from_source on the source tx —
  // the listing omits it otherwise (mirrors the frontend's fetchTransactions).
  const txsRes = await apiFetchAs(
    userToken,
    `/api/transactions?month=${TX_MONTH}&year=${TX_YEAR}&with_settlements=true`,
  );
  const list = (await txsRes.json()) as Transactions.Transaction[];
  const source = list.find((t) => t.id === created.id);
  const settlement = source?.settlements_from_source?.[0];
  if (!settlement) {
    throw new Error("split transaction did not produce an inline settlement");
  }

  const page = await openAuthedPage(browser, userToken);
  const transactionsPage = new TransactionsPage(page);
  await transactionsPage.gotoMonth(TX_MONTH, TX_YEAR);

  return { page, transactionsPage, txId: created.id, settlementId: settlement.id };
}

test.describe("Transaction listing shift+click selection", () => {
  test("shift+click from a transaction to its settlement selects both", async ({
    browser,
  }) => {
    const { page, transactionsPage, txId, settlementId } =
      await setupMixedGroup(browser);

    // Anchor on the transaction, then shift+click the settlement below it.
    await transactionsPage.toggleTransactionCheckbox(txId);
    await expect(transactionsPage.transactionCheckbox(txId)).toBeChecked();

    await transactionsPage.toggleSettlementCheckbox(settlementId, { shiftKey: true });

    await expect(transactionsPage.transactionCheckbox(txId)).toBeChecked();
    await expect(transactionsPage.settlementCheckbox(settlementId)).toBeChecked();
    expect(await transactionsPage.getSelectedCount()).toBe(2);

    await page.close();
  });

  test("shift+click from a settlement to its transaction selects both", async ({
    browser,
  }) => {
    const { page, transactionsPage, txId, settlementId } =
      await setupMixedGroup(browser);

    // Anchor on the settlement, then shift+click the transaction above it.
    await transactionsPage.toggleSettlementCheckbox(settlementId);
    await expect(transactionsPage.settlementCheckbox(settlementId)).toBeChecked();

    await transactionsPage.toggleTransactionCheckbox(txId, { shiftKey: true });

    await expect(transactionsPage.settlementCheckbox(settlementId)).toBeChecked();
    await expect(transactionsPage.transactionCheckbox(txId)).toBeChecked();
    expect(await transactionsPage.getSelectedCount()).toBe(2);

    await page.close();
  });
});
