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
 * Regression for issue #116. Three guarantees the hook must hold:
 *
 *   A) Toggling the row's action select (no field edit) never re-fires
 *      `/api/transactions/check-duplicate` — the legacy `useEffect` re-ran
 *      on the `enabled` flip; `useQuery` gates execution natively and
 *      `staleTime: Infinity` caches by tuple.
 *
 *   B) Once the user has manually changed the action, the hook stops
 *      auto-flipping AND stops fetching for that row. Their explicit
 *      choice wins and we do not waste a request whose answer we would
 *      discard anyway.
 *
 *   C) When the user has NOT taken control, editing fields into a known
 *      collision still auto-flips the row to "Duplicado" — the original
 *      hook responsibility is preserved for non-overridden rows.
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
  test("user override locks action and stops further check-duplicate requests", async ({
    browser,
  }) => {
    const { token, accountId, categoryId } = await createTestUser("dup-lock");

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

    // Row 0 is auto-flagged "Duplicado" by the backend during /import-csv —
    // no client-side check fired for that.
    const actionSelect = importPage.reviewStep.getByTestId(
      ImportTestIds.RowSelectAction(0),
    );
    await expect(actionSelect).toHaveValue("Duplicado", { timeout: 5000 });
    expect(checkCount).toBe(0);

    // 1) duplicate → import (no field edit). Pre-fix: legacy useEffect
    //    re-ran on `enabled: false → true` and fired a request. Now: no
    //    request, AND the user override is recorded.
    await importPage.setRowAction(0, "import");
    await page.waitForTimeout(750);
    expect(checkCount).toBe(0);

    // 2) Toggle the action a few more times — still no request, still no
    //    auto-revert (override is locked in).
    await importPage.setRowAction(0, "duplicate");
    await importPage.setRowAction(0, "import");
    await page.waitForTimeout(750);
    expect(checkCount).toBe(0);
    await expect(actionSelect).toHaveValue("Importar");

    // 3) Edit the amount to a non-colliding value — after override, the
    //    hook short-circuits the fetch entirely (it would discard the
    //    answer regardless).
    await importPage.setRowAmount(0, 9000); // 90,00 — no existing match
    await page.waitForTimeout(750);
    expect(checkCount).toBe(0);
    await expect(actionSelect).toHaveValue("Importar");

    // 4) Edit back to the colliding amount: pre-fix the row was auto-
    //    reverted to "Duplicado" and the user could not keep "Importar".
    //    Post-fix: still no request, action holds.
    await importPage.setRowAmount(0, 8000);
    await page.waitForTimeout(750);
    expect(checkCount).toBe(0);
    await expect(actionSelect).toHaveValue("Importar");

    await page.close();
  });

  test("without user override, editing fields into a collision still auto-flips to duplicate", async ({
    browser,
  }) => {
    const { token, accountId, categoryId } = await createTestUser("dup-auto");

    // Seed an existing transaction at (date, 80,00). The CSV row starts at
    // (date, 90,00) — NOT a duplicate — so it lands as "Importar" and the
    // user does not need to touch the action select.
    const txDate = new Date(2026, 4, 14); // 14/05/2026
    const description = `Auto Flip ${Date.now()}`;
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

    let checkCount = 0;
    await page.route("**/api/transactions/check-duplicate", async (route) => {
      checkCount += 1;
      await route.continue();
    });

    const importPage = new ImportPage(page);
    await importPage.goto();

    const csv = buildCsvContent([
      // Different amount → backend marks this row as "import", not duplicate.
      [formatDateBR(txDate), `Other ${Date.now()}`, "-90,00"],
    ]);
    await importPage.uploadCSV(csv, accountId);

    const actionSelect = importPage.reviewStep.getByTestId(
      ImportTestIds.RowSelectAction(0),
    );
    await expect(actionSelect).toHaveValue("Importar", { timeout: 5000 });
    expect(checkCount).toBe(0);

    // Edit the amount to match the seeded transaction → collision.
    await importPage.setRowAmount(0, 8000);
    // Hook fires the check, backend says is_duplicate=true, hook auto-flips.
    await expect.poll(() => checkCount, { timeout: 5000 }).toBe(1);
    await expect(actionSelect).toHaveValue("Duplicado");

    await page.close();
  });
});
