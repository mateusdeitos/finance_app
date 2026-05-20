/**
 * Settlement-aware duplicate detection during import
 *
 * When a shared expense is recorded, a credit settlement is created on the
 * author's side of the connection account. When the author later imports an
 * income row on that same connection account whose amount/description align
 * with the settlement, the import drawer must surface the settlement under a
 * dedicated section — distinct from the existing-transactions list.
 *
 * Mirror scenario for shared incomes / debit settlements is not covered here:
 * the credit case exercises the same code path on both sides.
 */

import { test, expect } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import { apiFetchAs, openAuthedPage } from "../helpers/api";
import { createUserAndPartner } from "../helpers/createUserAndPartner";
import { buildCsvContent } from "../helpers/csv";
import { ImportTestIds } from "@/testIds";
import type { Transactions } from "@/types/transactions";

function formatDateBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

test.describe("Import: settlement-aware duplicate detection", () => {
  test("income on the connection account flags the existing credit settlement", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-set-dup");

    const catRes = await apiFetchAs(setup.userToken, "/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: `Cat ${Date.now()}` }),
    });
    const category = (await catRes.json()) as { id: number };

    const sharedDate = new Date(2026, 6, 15); // July 15 2026
    const description = `Jantar restaurante ${Date.now()}`;

    // 1. Author creates a shared expense → produces a credit settlement of 5000
    //    on the user's side of the connection account.
    await apiFetchAs(setup.userToken, "/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        transaction_type: "expense",
        account_id: setup.userAccountId,
        category_id: category.id,
        amount: 10000,
        date: ymd(sharedDate),
        description,
        split_settings: [{ connection_id: setup.connectionId, percentage: 50 }],
      }),
    });

    // 2. Fetch the settlement so we know its id (for the per-card testid).
    const txsRes = await apiFetchAs(
      setup.userToken,
      `/api/transactions?month=${sharedDate.getMonth() + 1}&year=${sharedDate.getFullYear()}&account_id[]=${setup.userAccountId}&with_settlements=true`,
    );
    const txs = (await txsRes.json()) as Transactions.Transaction[];
    const sourceTx = txs.find((t) => t.description === description);
    expect(sourceTx).toBeDefined();
    const settlement = sourceTx?.settlements_from_source?.[0];
    expect(settlement).toBeDefined();
    expect(settlement?.amount).toBe(5000);
    expect(settlement?.type).toBe("credit");

    // 3. Import an income row on the connection account that aligns with the
    //    settlement on amount, description, and month.
    const page = await openAuthedPage(browser, setup.userToken);
    const importPage = new ImportPage(page);
    await importPage.goto();

    const importDate = new Date(2026, 6, 20); // July 20 2026 — same month
    const csv = buildCsvContent([
      [formatDateBR(importDate), description, "50,00"],
    ]);
    await importPage.uploadCSV(csv, setup.userConnAccountId);

    await expect(importPage.reviewStep.getByTestId(ImportTestIds.Row(0))).toBeVisible();
    await expect(importPage.duplicateWarning(0)).toBeVisible({ timeout: 5000 });

    // 4. Open the drawer and confirm both sections behave as expected.
    await importPage.openDuplicatesDrawer(0);

    const settlementsSection = importPage.duplicatesDrawer.getByTestId(
      ImportTestIds.DrawerDuplicatesSettlementsSection,
    );
    await expect(settlementsSection).toBeVisible();

    const card = importPage.duplicatesDrawer.getByTestId(
      ImportTestIds.DrawerDuplicatesSettlementCard(settlement!.id),
    );
    await expect(card).toBeVisible();
    await expect(card).toContainText(description);

    // The transactions section must NOT render — there is no existing
    // transaction on the connection account itself, just the settlement.
    await expect(
      importPage.duplicatesDrawer.getByTestId(ImportTestIds.DrawerDuplicatesTransactionsSection),
    ).not.toBeVisible();

    // 5. "Marcar como não importar" must still work for settlement-only matches.
    await importPage.markNotImportFromDrawer();
    await expect(await importPage.getRowActionLabel(0)).toBe("Não importar");

    await page.close();
  });

  test("transfer row never matches against settlements", async ({ browser }) => {
    const setup = await createUserAndPartner("e2e-set-dup-xfer");

    const catRes = await apiFetchAs(setup.userToken, "/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: `Cat ${Date.now()}` }),
    });
    const category = (await catRes.json()) as { id: number };

    const sharedDate = new Date(2026, 7, 10);
    const description = `Compra mercado ${Date.now()}`;

    await apiFetchAs(setup.userToken, "/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        transaction_type: "expense",
        account_id: setup.userAccountId,
        category_id: category.id,
        amount: 20000,
        date: ymd(sharedDate),
        description,
        split_settings: [{ connection_id: setup.connectionId, percentage: 50 }],
      }),
    });

    const page = await openAuthedPage(browser, setup.userToken);
    const importPage = new ImportPage(page);
    await importPage.goto();

    // Import an income row first so it parses, then flip the row to transfer
    // — settlement matching must drop away.
    const csv = buildCsvContent([
      [formatDateBR(sharedDate), description, "100,00"],
    ]);
    await importPage.uploadCSV(csv, setup.userConnAccountId);

    await expect(importPage.duplicateWarning(0)).toBeVisible({ timeout: 5000 });

    // Switch the row type to transfer and confirm the warning disappears.
    await importPage.setRowTransactionType(0, "transfer");
    await expect(importPage.duplicateWarning(0)).not.toBeVisible({ timeout: 5000 });

    await page.close();
  });
});
