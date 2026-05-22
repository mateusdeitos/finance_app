import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { ImportPage } from "../pages/ImportPage";
import {
  getAuthTokenForUser,
  apiFetchAs,
} from "../helpers/api";
import { buildCsvContent } from "../helpers/csv";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Fresh user so the import table is clean — no shared DB interference.
const FRESH_USER_EMAIL = `e2e-shift-select-${Date.now()}@financeapp.local`;

// ─── Test suite ───────────────────────────────────────────────────────────────

test.describe("Import shift+click selection", () => {
  let freshUserToken: string;
  let freshAccountId: number;
  let freshAccountName: string;
  let context: BrowserContext;
  let page: Page;
  let importPage: ImportPage;

  const csv = buildCsvContent([
    ["01/01/2026", "Row 0", "-10,00"],
    ["02/01/2026", "Row 1", "-20,00"],
    ["03/01/2026", "Row 2", "-30,00"],
    ["04/01/2026", "Row 3", "-40,00"],
    ["05/01/2026", "Row 4", "-50,00"],
    ["06/01/2026", "Row 5", "-60,00"],
    ["07/01/2026", "Row 6", "-70,00"],
    ["08/01/2026", "Row 7", "-80,00"],
  ]);

  test.beforeAll(async ({ browser }) => {
    // 1. Create fresh user via test-login
    freshUserToken = await getAuthTokenForUser(FRESH_USER_EMAIL);

    // 2. Create account for this user
    freshAccountName = `Shift Select Account ${Date.now()}`;
    const res = await apiFetchAs(freshUserToken, "/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name: freshAccountName, initial_balance: 0 }),
    });
    const account = await res.json();
    freshAccountId = account.id;

    // 3. Create browser context with this user's auth
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const url = new URL(baseURL);
    context = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: "auth_token",
            value: freshUserToken,
            domain: url.hostname,
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: false,
            sameSite: "Lax" as const,
          },
        ],
        origins: [],
      },
    });
  });

  test.afterAll(async () => {
    await apiFetchAs(freshUserToken, `/api/accounts/${freshAccountId}`, {
      method: "DELETE",
    }).catch(() => undefined);
    await context?.close();
  });

  test.beforeEach(async () => {
    page = await context.newPage();
    importPage = new ImportPage(page);
    await importPage.goto();
    await importPage.uploadCSV(csv, freshAccountId);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  // ── Basic: shift+click with no prior selection selects from 0 to clicked ──
  test("shift+click with no prior selection: selects from row 0 to clicked row", async () => {
    // Shift+click row 4 — no anchor yet, so the range falls back to row 0, fills 0..4
    await importPage.toggleRowCheckbox(4, { shiftKey: true });

    for (let i = 0; i <= 4; i++) {
      expect(await importPage.isRowSelected(i)).toBe(true);
    }
    for (let i = 5; i <= 7; i++) {
      expect(await importPage.isRowSelected(i)).toBe(false);
    }
  });

  // ── Shift+click fills the range from the anchor to the clicked row ─────────
  test("shift+click fills the range between the anchor and the clicked row", async () => {
    // Select row 2 normally — it becomes the anchor
    await importPage.toggleRowCheckbox(2);
    expect(await importPage.isRowSelected(2)).toBe(true);

    // Shift+click row 6 — anchor is row 2, fills the range 2..6 (not 0,1)
    await importPage.toggleRowCheckbox(6, { shiftKey: true });

    expect(await importPage.isRowSelected(0)).toBe(false);
    expect(await importPage.isRowSelected(1)).toBe(false);
    for (let i = 2; i <= 6; i++) {
      expect(await importPage.isRowSelected(i)).toBe(true);
    }
    expect(await importPage.isRowSelected(7)).toBe(false);
  });

  // ── Anchor is the last plain click, not the earliest selected row ──────────
  test("with multiple selected: shift+click fills from the last plain-clicked row", async () => {
    // Select rows 1 and 4 — row 4 is the last plain click, so it is the anchor
    await importPage.toggleRowCheckbox(1);
    await importPage.toggleRowCheckbox(4);

    // Shift+click row 7 — anchor is row 4, fills 4..7 (row 1 stays, 2,3 untouched)
    await importPage.toggleRowCheckbox(7, { shiftKey: true });

    expect(await importPage.isRowSelected(0)).toBe(false);
    expect(await importPage.isRowSelected(1)).toBe(true);
    expect(await importPage.isRowSelected(2)).toBe(false);
    expect(await importPage.isRowSelected(3)).toBe(false);
    for (let i = 4; i <= 7; i++) {
      expect(await importPage.isRowSelected(i)).toBe(true);
    }
  });

  // ── Regression #159: anchor below the shift-clicked row fills upward ───────
  test("shift+click above the anchor selects the upward range", async () => {
    // Select row 6 normally — it becomes the anchor
    await importPage.toggleRowCheckbox(6);
    expect(await importPage.isRowSelected(6)).toBe(true);

    // Shift+click row 2 — should fill the range 2..6, not 0..2
    await importPage.toggleRowCheckbox(2, { shiftKey: true });

    expect(await importPage.isRowSelected(0)).toBe(false);
    expect(await importPage.isRowSelected(1)).toBe(false);
    for (let i = 2; i <= 6; i++) {
      expect(await importPage.isRowSelected(i)).toBe(true);
    }
    expect(await importPage.isRowSelected(7)).toBe(false);
  });

  // ── Normal click (no shift) toggles single row ─────────────────────────────
  test("normal click without shift only toggles single row", async () => {
    await importPage.toggleRowCheckbox(3);
    expect(await importPage.isRowSelected(3)).toBe(true);

    // Other rows unaffected
    expect(await importPage.isRowSelected(2)).toBe(false);
    expect(await importPage.isRowSelected(4)).toBe(false);

    // Click again to deselect
    await importPage.toggleRowCheckbox(3);
    expect(await importPage.isRowSelected(3)).toBe(false);
  });
});
