import { test, expect, type Page } from "@playwright/test";
import { TransactionsPage } from "../pages/TransactionsPage";
import {
  apiFetchAs,
  apiCreateAccount,
  apiCreateCategory,
  apiCreateUserConnection,
  apiAcceptConnection,
  apiCreateTransaction,
  apiGetTransaction,
  apiDeleteTransaction,
  getAuthTokenForUser,
  openAuthedPage,
} from "../helpers/api";
import { TransactionsTestIds } from "@/testIds";

/**
 * Linked Transaction Edit — e2e tests for the restricted editing model.
 *
 * When a user edits a transaction whose `original_user_id` belongs to another
 * user, the form enters a restricted mode:
 *   - 'split'    — shows only date, amount, and category
 *   - 'transfer' — shows only date and amount
 *
 * Amount edits on linked transactions propagate back to the source transaction
 * (and all its siblings) so every side of a split or cross-user transfer stays
 * in sync.
 *
 * Setup strategy: fresh unique users per run so there are no shared-state
 * collisions across CI runs. The partner creates transactions that result in
 * the primary user receiving a linked tx. This lets us test the restricted
 * form using the primary user's page without a second browser context.
 */

test.describe("Linked Transaction Edit", () => {
  let transactionsPage: TransactionsPage;
  let customPage: Page;
  let primaryToken: string;
  let partnerToken: string;
  let partnerAccountId: number;
  let partnerCategoryId: number;
  let primaryCategoryId: number;
  let connectionId: number;
  let primaryConnAccountId: number;
  const createdTransactionIds: number[] = [];

  test.beforeAll(async () => {
    const ts = Date.now();
    const PRIMARY_EMAIL = `e2e-linked-edit-primary-${ts}@financeapp.local`;
    const PARTNER_EMAIL = `e2e-linked-edit-partner-${ts}@financeapp.local`;

    // Fresh primary user + account + category
    primaryToken = await getAuthTokenForUser(PRIMARY_EMAIL);
    await apiCreateAccount({ name: `LinkedEdit Primary ${ts}`, initial_balance: 0 }, { token: primaryToken });
    const primaryCat = await apiCreateCategory(
      { name: `LinkedEdit PrimaryCat ${ts}` },
      { token: primaryToken },
    );
    primaryCategoryId = primaryCat.id;

    // Fresh partner user + account + category
    partnerToken = await getAuthTokenForUser(PARTNER_EMAIL);
    const partnerAcc = await apiCreateAccount(
      { name: `LinkedEdit Partner ${ts}`, initial_balance: 0 },
      { token: partnerToken },
    );
    partnerAccountId = partnerAcc.id;

    const partnerCat = await apiCreateCategory({ name: `LinkedEdit Cat ${ts}` }, { token: partnerToken });
    partnerCategoryId = partnerCat.id;

    // Fetch partner user ID
    const partnerMeRes = await apiFetchAs(partnerToken, "/api/auth/me");
    const partnerUser = (await partnerMeRes.json()) as { id: number };

    // Primary user creates a connection to the partner and the partner accepts it
    const conn = await apiCreateUserConnection(partnerUser.id, 50, { token: primaryToken });
    connectionId = conn.id;
    await apiAcceptConnection(connectionId, { token: partnerToken });

    // Resolve the primary user's account that backs this connection
    const accountsRes = await apiFetchAs(primaryToken, "/api/accounts");
    const allAccounts = (await accountsRes.json()) as Array<{
      id: number;
      user_connection?: { id: number };
    }>;
    const connAccount = allAccounts.find((a) => a.user_connection?.id === connectionId);
    if (!connAccount) throw new Error(`No connection account found for connection ${connectionId}`);
    primaryConnAccountId = connAccount.id;
  });

  test.afterAll(async () => {
    for (const id of createdTransactionIds) {
      await apiDeleteTransaction(id, undefined, { token: partnerToken }).catch(() => undefined);
    }
  });

  test.beforeEach(async ({ browser }) => {
    customPage = await openAuthedPage(browser, primaryToken);
    transactionsPage = new TransactionsPage(customPage);
    await transactionsPage.goto();
  });

  test.afterEach(async () => {
    await customPage.close();
  });

  // ─── Split linked tx — restricted to date + amount + category ───────────────

  test("split linked tx: form shows only date, amount, and category", async () => {
    const today = new Date().toISOString();
    const desc = `LinkedSplit Restrict ${Date.now()}`;

    // Partner creates a split expense — the primary user receives the linked tx.
    const { id: partnerTxId } = await apiCreateTransaction(
      {
        transaction_type: "expense",
        account_id: partnerAccountId,
        category_id: partnerCategoryId,
        amount: 10000,
        date: today,
        description: desc,
        split_settings: [{ connection_id: connectionId, amount: 5000 }],
      },
      { token: partnerToken },
    );
    createdTransactionIds.push(partnerTxId);
    // Fetch the full transaction to get linked_transactions (POST only returns the id)
    const partnerTx = await apiGetTransaction(partnerTxId, { token: partnerToken });

    // Find the primary user's linked tx — it lives in their connection-backed account
    const primaryLinkedTxId = partnerTx.linked_transactions?.find(
      (lt) => lt.account_id === primaryConnAccountId,
    )?.id;
    expect(primaryLinkedTxId, "expected linked tx for primary user").toBeTruthy();

    await transactionsPage.goto();
    await expect(customPage.getByText(desc).first()).toBeVisible({ timeout: 8000 });

    // Click the description inside the primary user's linked tx row
    await customPage.locator(`[data-transaction-id="${primaryLinkedTxId}"]`).getByText(desc).click();
    await transactionsPage.waitForLinkedSplitDrawer();

    const drawer = transactionsPage.linkedSplitDrawer;

    // These fields must NOT appear in split-restricted mode
    await expect(drawer.getByTestId(TransactionsTestIds.SegmentedTransactionType)).not.toBeVisible();
    await expect(drawer.getByTestId(TransactionsTestIds.InputDescription)).not.toBeVisible();
    await expect(drawer.getByTestId(TransactionsTestIds.SelectAccount)).not.toBeVisible();

    // These fields MUST be visible in split mode
    await expect(drawer.getByTestId(TransactionsTestIds.InputAmount)).toBeVisible();
    await expect(drawer.getByTestId(TransactionsTestIds.SelectCategory)).toBeVisible();
  });

  test("split linked tx: editing amount propagates to the source transaction", async () => {
    const today = new Date().toISOString();
    const desc = `LinkedSplit Amount ${Date.now()}`;

    // Partner creates split expense: total R$100, primary share R$50
    const { id: partnerTxId } = await apiCreateTransaction(
      {
        transaction_type: "expense",
        account_id: partnerAccountId,
        category_id: partnerCategoryId,
        amount: 10000,
        date: today,
        description: desc,
        split_settings: [{ connection_id: connectionId, amount: 5000 }],
      },
      { token: partnerToken },
    );
    createdTransactionIds.push(partnerTxId);
    // Fetch the full transaction to get linked_transactions (POST only returns the id)
    const partnerTx = await apiGetTransaction(partnerTxId, { token: partnerToken });

    // Find the primary user's linked tx — it lives in their connection-backed account
    const primaryLinkedTxId = partnerTx.linked_transactions?.find(
      (lt) => lt.account_id === primaryConnAccountId,
    )?.id;
    expect(primaryLinkedTxId, "expected linked tx for primary user").toBeTruthy();

    await transactionsPage.goto();
    await expect(customPage.getByText(desc).first()).toBeVisible({ timeout: 8000 });

    // Primary user opens their linked tx and changes the amount to R$80,00
    await customPage.locator(`[data-transaction-id="${primaryLinkedTxId}"]`).getByText(desc).click();
    await transactionsPage.waitForLinkedSplitDrawer();

    const drawer = transactionsPage.linkedSplitDrawer;
    await transactionsPage.clearAndFillAmount(8000, drawer);
    await transactionsPage.selectCategory(primaryCategoryId, drawer);
    await transactionsPage.submitUpdate(drawer);

    // Primary user's linked tx must reflect the new amount
    const updatedLinkedTx = await apiGetTransaction(primaryLinkedTxId!, { token: primaryToken });
    expect(updatedLinkedTx.amount).toBe(8000);

    // The source tx (partner's original) must also be updated (amount propagation)
    const updatedSourceTx = await apiGetTransaction(partnerTx.id, { token: partnerToken });
    expect(updatedSourceTx.amount).toBe(8000);
  });

  // ─── Transfer linked tx — restricted to date + amount only ──────────────────

  test("transfer linked tx: form shows only date and amount", async () => {
    const today = new Date().toISOString();
    const desc = `LinkedXfer Restrict ${Date.now()}`;

    // Partner creates a transfer TO the primary user's connection account.
    // This results in the primary user receiving a credit-side linked tx with
    // original_user_id = partner.id → linkedTransactionMode = 'transfer'.
    const { id: partnerTxId } = await apiCreateTransaction(
      {
        transaction_type: "transfer",
        account_id: partnerAccountId,
        destination_account_id: primaryConnAccountId,
        amount: 7500,
        date: today,
        description: desc,
      },
      { token: partnerToken },
    );
    createdTransactionIds.push(partnerTxId);
    // Fetch the full transaction to get linked_transactions (POST only returns the id)
    const partnerTx = await apiGetTransaction(partnerTxId, { token: partnerToken });

    // Find the primary user's credit-side tx (account_id === primaryConnAccountId)
    const primaryCreditTxId =
      partnerTx.linked_transactions?.find((lt) => lt.account_id === primaryConnAccountId)?.id ??
      partnerTx.linked_transactions?.[0]?.id;
    expect(primaryCreditTxId, "expected credit-side linked tx for primary user").toBeTruthy();

    await transactionsPage.goto();
    await expect(customPage.getByText(desc).first()).toBeVisible({ timeout: 8000 });

    // Click the primary user's credit-side row
    await customPage.locator(`[data-transaction-id="${primaryCreditTxId}"]`).getByText(desc).click();
    await transactionsPage.waitForLinkedTransferDrawer();

    const drawer = transactionsPage.linkedTransferDrawer;

    // These fields must NOT appear in transfer-restricted mode
    await expect(drawer.getByTestId(TransactionsTestIds.SegmentedTransactionType)).not.toBeVisible();
    await expect(drawer.getByTestId(TransactionsTestIds.InputDescription)).not.toBeVisible();
    await expect(drawer.getByTestId(TransactionsTestIds.SelectAccount)).not.toBeVisible();
    await expect(drawer.getByTestId(TransactionsTestIds.SelectCategory)).not.toBeVisible();

    // Only date and amount may be changed in transfer mode
    await expect(drawer.getByTestId(TransactionsTestIds.InputAmount)).toBeVisible();
  });

  test("transfer linked tx: editing amount propagates to the source transaction", async () => {
    const today = new Date().toISOString();
    const desc = `LinkedXfer Amount ${Date.now()}`;

    // Partner creates a transfer of R$75,00 to the primary user
    const { id: partnerTxId } = await apiCreateTransaction(
      {
        transaction_type: "transfer",
        account_id: partnerAccountId,
        destination_account_id: primaryConnAccountId,
        amount: 7500,
        date: today,
        description: desc,
      },
      { token: partnerToken },
    );
    createdTransactionIds.push(partnerTxId);
    // Fetch the full transaction to get linked_transactions (POST only returns the id)
    const partnerTx = await apiGetTransaction(partnerTxId, { token: partnerToken });

    const primaryCreditTxId =
      partnerTx.linked_transactions?.find((lt) => lt.account_id === primaryConnAccountId)?.id ??
      partnerTx.linked_transactions?.[0]?.id;
    expect(primaryCreditTxId, "expected credit-side linked tx for primary user").toBeTruthy();

    await transactionsPage.goto();
    await expect(customPage.getByText(desc).first()).toBeVisible({ timeout: 8000 });

    // Primary user edits the amount on their credit side to R$90,00
    await customPage.locator(`[data-transaction-id="${primaryCreditTxId}"]`).getByText(desc).click();
    await transactionsPage.waitForLinkedTransferDrawer();

    const drawer = transactionsPage.linkedTransferDrawer;
    await transactionsPage.clearAndFillAmount(9000, drawer);
    await transactionsPage.submitUpdate(drawer);

    // Verify primary user's credit side carries the new amount
    const updatedCreditTx = await apiGetTransaction(primaryCreditTxId!, { token: primaryToken });
    expect(updatedCreditTx.amount).toBe(9000);

    // Verify the partner's source (debit) side was also propagated
    const updatedPartnerTx = await apiGetTransaction(partnerTx.id, { token: partnerToken });
    expect(updatedPartnerTx.amount).toBe(9000);
  });
});
