import { test, expect } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import {
  apiFetchAs,
  getAuthTokenForUser,
  openAuthedPage,
} from "../helpers/api";
import { buildCsvContent, formatDateBR } from "../helpers/csv";
import { ImportTestIds } from "@/testIds";

/**
 * Regression for issue #116. Two guarantees the hook must hold:
 *
 *   A) Toggling the row's action select (no field edit) never re-fires
 *      `/api/transactions/check-duplicate` — this used to happen because the
 *      legacy `useEffect` re-ran on the `enabled` flip. Now `useQuery` gates
 *      execution natively and `staleTime: Infinity` caches by tuple.
 *
 *   B) Once the user has manually changed the action, the hook stops
 *      auto-flipping for that row, even if a later edit surfaces a backend
 *      collision. The user's explicit choice wins forever.
 */

function formatDateISO(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function localMidnightISO(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

async function createTestUser(suffix: string) {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `e2e-${suffix}-${uid}@financeapp.local`;
  const token = await getAuthTokenForUser(email);

  const accountRes = await apiFetchAs(token, "/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name: `Account ${uid}`, initial_balance: 0 }),
  });
  const account = (await accountRes.json()) as { id: number };

  const catRes = await apiFetchAs(token, "/api/categories", {
    method: "POST",
    body: JSON.stringify({ name: `Category ${uid}` }),
  });
  const category = (await catRes.json()) as { id: number };

  return { token, accountId: account.id, categoryId: category.id };
}

test.describe("Import: duplicate-check flip behavior (#116)", () => {
  test("flipping action duplicate↔import without field edits never re-fires the check", async ({
    browser,
  }) => {
    const { token, accountId, categoryId } = await createTestUser("dup-flip");

    // Seed a real transaction so the import-row gets auto-flagged duplicate
    // by the backend during CSV processing.
    const txDate = new Date(2026, 4, 12); // 12/05/2026
    const description = `Dup Flip ${Date.now()}`;
    await apiFetchAs(token, "/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        transaction_type: "expense",
        account_id: accountId,
        category_id: categoryId,
        amount: 8000,
        date: localMidnightISO(formatDateISO(txDate)),
        description,
      }),
    });

    const page = await openAuthedPage(browser, token);

    // Count every call to /api/transactions/check-duplicate without altering
    // the response — the backend is the source of truth, we just observe.
    let checkCount = 0;
    await page.route("**/api/transactions/check-duplicate", async (route) => {
      checkCount += 1;
      await route.continue();
    });

    const importPage = new ImportPage(page);
    await importPage.goto();

    const csv = buildCsvContent([
      [formatDateBR(txDate), description, "-80,00"],
    ]);
    await importPage.uploadCSV(csv, accountId);

    // Row 0 is auto-flagged as a duplicate by the backend (review step shows
    // "Duplicado"). The auto-flag flow runs synchronously during import-csv,
    // not via the row hook, so this should NOT have called check-duplicate.
    const actionSelect = importPage.reviewStep.getByTestId(
      ImportTestIds.RowSelectAction(0),
    );
    await expect(actionSelect).toHaveValue("Duplicado", { timeout: 5000 });
    expect(checkCount).toBe(0);

    // 1) duplicate → import (no field edit). Bug being fixed: this used to
    //    fire because the legacy useEffect re-ran on `enabled: false → true`.
    await importPage.setRowAction(0, "import");
    // Give the debounce + any straggling fetch a beat to land before asserting.
    await page.waitForTimeout(750);
    expect(checkCount).toBe(0);

    // 2) Toggle through several action changes — still no re-fire because
    //    the debounced (date, amount, accountId) tuple has not changed.
    await importPage.setRowAction(0, "duplicate");
    await importPage.setRowAction(0, "import");
    await page.waitForTimeout(750);
    expect(checkCount).toBe(0);

    // 3) Edit the amount to a non-colliding value: query fires (debounced
    //    fields actually changed), backend returns is_duplicate=false. The
    //    user already overrode the action, so the row stays at "Importar".
    await importPage.setRowAmount(0, 9000); // 90,00 — no existing match
    await expect.poll(() => checkCount, { timeout: 5000 }).toBe(1);
    await expect(actionSelect).toHaveValue("Importar");

    // 4) Edit the amount BACK to the colliding value (8000). Backend will
    //    answer is_duplicate=true again (cache hit on the original tuple,
    //    so checkCount is still 1). Pre-fix: the row auto-flipped back to
    //    "Duplicado" and the user couldn't keep it on "Importar". Post-fix:
    //    user-override is sticky, so the action holds.
    await importPage.setRowAmount(0, 8000);
    // Give debounce + cached query + any side-effect a beat to settle.
    await page.waitForTimeout(750);
    expect(checkCount).toBe(1);
    await expect(actionSelect).toHaveValue("Importar");

    // 5) Manual flip back and forth on this tuple — still cache hit, still
    //    no auto-revert because user-override is locked in.
    await importPage.setRowAction(0, "duplicate");
    await importPage.setRowAction(0, "import");
    await page.waitForTimeout(750);
    expect(checkCount).toBe(1);
    await expect(actionSelect).toHaveValue("Importar");

    await page.close();
  });
});
