# Phase 15: E2E Coverage & Rounding Verification - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 5 (3 new, 2 modified)
**Analogs found:** 4 / 5 (one file — `splitMath.test.ts` — has no in-repo analog; documented below)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/e2e/tests/bulk-division.spec.ts` | e2e spec | HTTP API fixture → UI interactions → wire capture → API re-read verification | `frontend/e2e/tests/bulk-update-transfer.spec.ts` | exact (same partner-connection shape + mixed-tx-type bulk flow) |
| `frontend/e2e/helpers/fixtures.ts` (or `partner.ts`) | e2e helper | API primitive composition (partner user + connection + partner account) | `frontend/e2e/tests/bulk-update-transfer.spec.ts` lines 67-104 (inline equivalent) + `frontend/e2e/helpers/api.ts` primitives | role-match (first extracted helper in this codebase) |
| `frontend/src/utils/splitMath.test.ts` | unit test (colocated) | pure in-process assertions, no I/O | **none** — no `*.test.ts` files exist in `frontend/src/` (confirmed by Glob) | no-analog — use `node:test` template below |
| `frontend/package.json` | config | build script manifest | current `scripts` block (self-analog) | self |
| `.github/workflows/e2e.yml` (or new `.github/workflows/test-frontend.yml`) | CI config | GitHub Actions runner steps | `.github/workflows/e2e.yml` (npm-install + working-directory pattern) | exact |

---

## Pattern Assignments

### `frontend/e2e/tests/bulk-division.spec.ts` (e2e spec, HTTP-fixture → UI → wire-capture → API-verify)

**Analog:** `frontend/e2e/tests/bulk-update-transfer.spec.ts`

**Why this analog:** Both specs need (a) partner user + accepted user_connection, (b) primary-user transactions including a transfer to the partner, (c) per-test UI flow through the bulk menu, (d) API-level re-read to assert wire-format. The bulk-division spec replaces the category/date menu path with the Divisão path and adds a `page.waitForRequest` wire-shape assertion.

**Imports pattern** (from `bulk-update-transfer.spec.ts` lines 1-16):

```typescript
import { test, expect } from '@playwright/test'
import { TransactionsPage } from '../pages/TransactionsPage'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategory,
  apiDeleteCategory,
  apiCreateTransaction,
  apiDeleteTransaction,
  apiGetTransaction,
  apiCreateTag,        // drop if no tags in the division spec
  apiDeleteTag,        // drop if no tags in the division spec
  apiCreateUserConnection,
  getAuthTokenForUser,
  apiFetchAs,
} from '../helpers/api'
```

**`test.describe` + shared-state pattern** (lines 29-45):

```typescript
const PARTNER_EMAIL = 'e2e-bulk-division-partner@financeapp.local'

test.describe('Bulk Division', () => {
  let transactionsPage: TransactionsPage
  let accountId: number
  let accountName: string
  let categoryId: number
  // Multi-user setup
  let partnerToken: string
  let connectionId: number
  let connAccountId: number
  const createdTransactionIds: number[] = []
  // ...
})
```

**`beforeAll` partner-connection setup** — this is the block Phase 15 should extract into `setupPartnerConnection` (lines 47-105):

```typescript
test.beforeAll(async () => {
  accountName = `Bulk Div Account ${Date.now()}`
  const acc = await apiCreateAccount({ name: accountName, initial_balance: 0 })
  accountId = acc.id
  // ... categories ...

  // Partner user + connection
  partnerToken = await getAuthTokenForUser(PARTNER_EMAIL)
  await apiFetchAs(partnerToken, '/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: `Partner Div ${Date.now()}`, initial_balance: 0 }),
  })

  const meRes = await apiFetchAs(partnerToken, '/api/auth/me')
  const partnerUser = await meRes.json()

  try {
    const conn = await apiCreateUserConnection(partnerUser.id, 50)
    connectionId = conn.id
    await apiFetchAs(partnerToken, `/api/user-connections/${connectionId}/accepted`, {
      method: 'PATCH',
    })
  } catch (err) {
    if (String(err).includes('ALREADY_EXISTS')) {
      const connRes = await apiFetchAs(partnerToken, '/api/user-connections')
      const connections = await connRes.json()
      const existing = connections.find(
        (c: { connection_status: string }) => c.connection_status === 'accepted',
      )
      if (!existing) throw new Error('Connection exists but none are accepted')
      connectionId = existing.id
    } else {
      throw err
    }
  }

  // Find the primary user's account that holds the connection
  const primaryToken = await getAuthTokenForUser('e2e-test@financeapp.local')
  const accountsRes = await apiFetchAs(primaryToken, '/api/accounts')
  const allAccounts = await accountsRes.json()
  const connAccount = allAccounts.find(
    (a: { user_connection?: { id: number } }) => a.user_connection?.id === connectionId,
  )
  if (!connAccount) throw new Error(`No connection account for connection ${connectionId}`)
  connAccountId = connAccount.id
})
```

**`afterAll` cleanup pattern** (lines 107-115):

```typescript
test.afterAll(async () => {
  for (const id of createdTransactionIds) {
    await apiDeleteTransaction(id).catch(() => undefined)
  }
  await apiDeleteAccount(accountId).catch(() => undefined)
  await apiDeleteCategory(categoryId).catch(() => undefined)
})
```

**`beforeEach` page reset pattern** (lines 117-120):

```typescript
test.beforeEach(async ({ page }) => {
  transactionsPage = new TransactionsPage(page)
  await transactionsPage.goto()
})
```

**Bulk-menu + drawer navigation pattern — helper shape adapted from `bulkChangeCategory`** (lines 123-137):

```typescript
async function openDivisionDrawer(page: TransactionsPage['page'], txIds: number[]) {
  for (const id of txIds) await transactionsPage.selectTransaction(id)
  await transactionsPage.openBulkActionsMenu()
  await page.getByTestId('btn_bulk_division').click()
  // Mantine Drawer root stays hidden during animation — wait on an inner control instead
  await expect(page.getByTestId('btn_apply_bulk_division')).toBeVisible({ timeout: 8000 })
}
```

**Success-state assertion** (lines 133-136 pattern):

```typescript
await expect(page.getByTestId('bulk_success').or(page.getByTestId('bulk_error')))
  .toBeVisible({ timeout: 15000 })
await expect(page.getByTestId('bulk_error')).not.toBeVisible()
await expect(page.getByTestId('bulk_success')).toBeVisible()
await page.getByTestId('btn_bulk_done').click()
```

**API re-read verification pattern** (lines 181-187):

```typescript
const updated = await apiGetTransaction(tx.id)
expect(updated.split_settings).toBeTruthy()
// New Phase-15 assertion: each split_settings row has exactly these keys, nothing else.
for (const row of updated.split_settings ?? []) {
  expect(Object.keys(row).sort()).toEqual(['amount', 'connection_id'])
}
```

**Wire-capture pattern (NEW — not present in analog)** — use Playwright's `page.waitForRequest` to intercept outgoing PUT bodies before they hit the backend. This mirrors the "network-level assertion" contract CONTEXT.md D-E2E-3 mandates:

```typescript
// Arm the listener BEFORE triggering the submit — waitForRequest returns a promise.
const capturedPut = page.waitForRequest((req) =>
  req.url().includes('/api/transactions/') && req.method() === 'PUT'
)
await page.getByTestId('btn_apply_bulk_division').click()
const putReq = await capturedPut
const body = JSON.parse(putReq.postData() ?? '{}')
expect(body.split_settings).toBeTruthy()
for (const row of body.split_settings) {
  expect(Object.keys(row).sort()).toEqual(['amount', 'connection_id'])
  expect(typeof row.amount).toBe('number')
}
```

**Notes for planner:**

- **PO usage:** Always go through `TransactionsPage` (`selectTransaction`, `openBulkActionsMenu`, `getSelectedCount`). Never re-implement selection/menu access inline — `TransactionsPage` already exposes everything except the new Divisão menu item.
- **Divisão menu item is not yet on `TransactionsPage`** — planner decides whether to add a `openBulkDivision()` helper on the PO or click `btn_bulk_division` directly in the spec. Precedent in `bulkChangeCategory` helper (analog lines 123-137) is to click the inner testid directly; follow that.
- **API-level fixtures:** All test data is created via `apiCreate*` helpers (never via UI), and cleaned up in `afterAll` with `.catch(() => undefined)` so a half-failed setup doesn't cascade into afterAll errors.
- **Test ID conventions from Phase 13/14 that the spec will use:**
  - `btn_bulk_division` (menu item in `SelectionActionBar.tsx:63`)
  - `hint_bulk_division_no_connection` (disabled hint at `SelectionActionBar.tsx:68`)
  - `drawer_bulk_division` (drawer root at `BulkDivisionDrawer.tsx:67`)
  - `btn_apply_bulk_division` (submit inside drawer at `BulkDivisionDrawer.tsx:184`)
  - `badge_bulk_division_sum` (validation badge at `BulkDivisionDrawer.tsx:177`)
  - `bulk_division` prefix on BulkProgressDrawer → resolves at runtime to `bulk_success`, `bulk_error`, `btn_bulk_done` (see `BulkProgressDrawer` usage convention in analog spec).
- **Disabled-state spec MUST NOT run `setupPartnerConnection`** (CONTEXT.md D-FIX-3). It needs the primary user to have zero `accepted` connections. The test asserts the menu item has `disabled` and the `hint_bulk_division_no_connection` element renders.
- **Propagation drawer** — happy-path spec should avoid recurring transactions unless explicitly asserting propagation. CONTEXT.md deferred section excludes propagation-variant tests here.
- **Odd-cent amount** — CONTEXT.md §"Specific Ideas" mandates at least one tx with an odd-cent total (e.g. 101 cents) on a 30/70 split so the wire capture proves the last-split-absorbs-remainder behaviour end-to-end, not just in the unit test.
- **Silent-skip spec** — create one `transaction_type: 'transfer'` (use `destination_account_id: connAccountId`, see analog lines 339-347) + two expense/income txs. After submit, `apiGetTransaction(transferTxId)` must still return unchanged `split_settings` (should be null/undefined before and after).

---

### `frontend/e2e/helpers/fixtures.ts` (helper, API-primitive composition)

**Analog:** `frontend/e2e/tests/bulk-update-transfer.spec.ts` lines 67-104 (the inline `beforeAll` partner setup) + the primitives live in `frontend/e2e/helpers/api.ts` (already imported).

**Why no existing helper analog:** The codebase currently has exactly one helpers file (`api.ts`) and the partner-connection pattern is duplicated inline in every multi-user spec. Phase 15 is the first extraction. There is no prior helper to mimic in shape, but the primitives it will compose are well-established.

**Primitives the helper composes** (from `frontend/e2e/helpers/api.ts`):

```typescript
// Line 124-133 — create a pending connection between users
export async function apiCreateUserConnection(
  toUserId: number,
  splitPercentage = 50,
): Promise<{ id: number }> {
  const res = await apiFetch('/api/user-connections', {
    method: 'POST',
    body: JSON.stringify({
      to_user_id: toUserId,
      from_default_split_percentage: splitPercentage,
    }),
  })
  return res.json()
}

// Line 169-180 — mint a JWT for a specific user via /auth/test-login
export async function getAuthTokenForUser(email: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/auth/test-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(`Test login failed for ${email}: ${res.status}`)
  const setCookie = res.headers.get('set-cookie')
  const match = setCookie?.match(/auth_token=([^;]+)/)
  if (!match) throw new Error('No auth_token in response')
  return match[1]
}

// Line 207-221 — authenticated fetch as a specific user
export async function apiFetchAs(token: string, path: string, options: RequestInit = {}) { /* ... */ }
```

**Proposed signature for the new helper (planner confirms filename):**

```typescript
// frontend/e2e/helpers/fixtures.ts
import { apiCreateUserConnection, getAuthTokenForUser, apiFetchAs } from './api'

export interface PartnerConnectionResult {
  partnerToken: string
  connectionId: number
  connAccountId: number  // the primary user's account backing this connection
}

export async function setupPartnerConnection(opts?: {
  email?: string
  status?: 'accepted' | 'pending'
  splitPercentage?: number
}): Promise<PartnerConnectionResult> {
  // Compose: getAuthTokenForUser(email) → create partner account (POST /api/accounts)
  // → fetch /api/auth/me as partner → apiCreateUserConnection(partnerUser.id)
  // → PATCH /api/user-connections/:id/accepted (if status === 'accepted')
  // → ALREADY_EXISTS fallback: find existing accepted connection
  // → find connAccountId via primary user's /api/accounts
  // (Mirror the inline block from bulk-update-transfer.spec.ts lines 67-104)
}
```

**Notes for planner:**

- **Filename:** CONTEXT.md D-FIX-1 allows `fixtures.ts` or `partner.ts`. Prefer `fixtures.ts` to leave room for future composed fixtures (e.g. `setupSelectionOfTransactions`). Document the choice in the plan.
- **Scope discipline (D-FIX-2):** Helper must return *only* the partner primitives. Do NOT extract category/tag/transaction creation into it — those vary per test and inlining keeps each spec readable.
- **`ALREADY_EXISTS` fallback is part of the contract, not an afterthought** — the partner user is global across e2e runs (seeded by the backend), so repeated spec runs will hit an existing connection. The fallback is NOT retry logic; it's the happy path on second and subsequent runs.
- **No cleanup function needed:** The analog spec does not delete the partner user or the connection in `afterAll` — they are shared fixtures and torn down by the docker-compose stack between CI runs. Helper returns only setup data.
- **Default email:** The helper should accept an `email` option but default to a phase-specific email like `'e2e-bulk-division-partner@financeapp.local'` to avoid collisions with other specs that use the same helper.

---

### `frontend/src/utils/splitMath.test.ts` (unit test, colocated, pure-assertion)

**Analog:** **NONE in this repo.** Confirmed by CONTEXT.md lines 128-130:

> No existing unit test infra — `frontend/src/` has zero `*.test.ts` files and `package.json` has no `test` script. Phase 15 introduces the first unit test, via `node:test`.

**Signature under test** (from `frontend/src/utils/splitMath.ts` lines 26-47):

```typescript
export function splitPercentagesToCents(
  amount: number,
  splits: Transactions.SplitSetting[],
): Transactions.SplitSetting[] {
  if (splits.length === 0) return [];

  const result: Transactions.SplitSetting[] = [];
  let runningSum = 0;

  for (let i = 0; i < splits.length - 1; i++) {
    const pct = splits[i].percentage ?? 0;
    const cents = Math.round((amount * pct) / 100);
    result.push({ connection_id: splits[i].connection_id, amount: cents });
    runningSum += cents;
  }

  // Last split absorbs the rounding remainder.
  const last = splits[splits.length - 1];
  result.push({ connection_id: last.connection_id, amount: amount - runningSum });

  return result;
}
```

**Key behaviors to assert** (from CONTEXT.md D-T02-5 + §"Specific Ideas"):

1. Output length === input length.
2. Each output row has exactly keys `['amount', 'connection_id']` (no `percentage`). Use `Object.keys(row).sort()` equality per D-T02-5(b) and PAY-02.
3. `Σ result[i].amount === amount` for all cases.
4. Last split absorbs the remainder deterministically — compare against naive `Math.round` on the last split, which would drift.
5. Edge cases per CONTEXT.md §"Specific Ideas":
   - 50/50 on even cents (`amount=100`, `[50,50]` → baseline)
   - 30/70 on odd cents (`amount=101`, `[30,70]` → remainder = 1)
   - 33/33/34 on 100 (sum already matches, no remainder)
   - 33/33/34 on 10001 (remainder = 2, absorbed by last)
   - 50/50 on 1 cent (degenerate: 0 + 1 = 1)
   - single 100% split (no-op case, the "for loop" never executes, last gets full amount)

**Template (since there is no in-repo analog) — `node:test` + `node:assert/strict`:**

```typescript
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { splitPercentagesToCents } from './splitMath'
import type { Transactions } from '@/types/transactions'

test('splitPercentagesToCents — 50/50 on even cents', () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 50 },
    { connection_id: 2, percentage: 50 },
  ]
  const out = splitPercentagesToCents(100, input)
  assert.equal(out.length, 2)
  assert.deepEqual(Object.keys(out[0]).sort(), ['amount', 'connection_id'])
  assert.equal(out[0].amount + out[1].amount, 100)
})

test('splitPercentagesToCents — 30/70 on odd cents (last absorbs remainder)', () => {
  const input: Transactions.SplitSetting[] = [
    { connection_id: 1, percentage: 30 },
    { connection_id: 2, percentage: 70 },
  ]
  const out = splitPercentagesToCents(101, input)
  assert.equal(out[0].amount, Math.round(101 * 30 / 100)) // 30
  assert.equal(out[1].amount, 101 - out[0].amount)         // 71 (absorbs remainder)
  assert.equal(out[0].amount + out[1].amount, 101)
})

// ... one test() per edge case from D-T02-5 ...
```

**Running locally and in CI — loader options:**

- `node --import tsx --test ./src/**/*.test.ts` (glob support relies on the shell; on CI prefer an explicit path or tsx's own runner).
- `tsx` is NOT currently a devDep (see `package.json` `devDependencies` — no `tsx` entry). Planner decides: add `tsx` as devDep, OR invoke through `npx tsx --test ./src/**/*.test.ts` which fetches on demand (slower, flakier on CI). Recommend adding `tsx` as devDep.

**Notes for planner:**

- **Path alias `@/`** — the test imports `@/types/transactions` just like `splitMath.ts` does (line 1). This alias is resolved by Vite/`tsconfig.json`. `tsx` respects `tsconfig.json`'s `paths`, but confirm during planning. Fallback: use `'../types/transactions'` (relative) to sidestep resolver surprises.
- **Glob invocation** — CONTEXT.md D-T02-3 flags that `tsx` glob behaviour may be flaky. Safer alternative: `"test:unit": "node --import tsx --test ./src/utils/splitMath.test.ts"` (explicit file), or enumerate via a small wrapper. Start with the glob; if CI fails, downgrade to explicit file list.
- **Colocation is the convention** — Phase 15 sets the precedent for all future frontend unit tests. Place the test file next to its subject (`src/utils/splitMath.test.ts` next to `src/utils/splitMath.ts`). Future `*.test.ts` files in `src/` should follow the same rule.
- **No React/DOM imports** — these are pure-function tests. Do not pull in `@testing-library/react` or anything jsdom-related. CONTEXT.md D-T02-1 explicitly forbids vitest/jest/bun.
- **Test IDs are irrelevant here** — unit tests don't touch the DOM. All assertions are on return values.

---

### `frontend/package.json` (config — modify)

**Analog:** self (current file). The `scripts` block already contains the e2e script set; `test:unit` follows the same naming convention.

**Current `scripts` block** (from `frontend/package.json` lines 6-17):

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "eslint src",
  "e2e": "PLAYWRIGHT_BASE_URL=http://localhost:3100 PLAYWRIGHT_BACKEND_URL=http://localhost:8090 playwright test",
  "e2e:debug": "PLAYWRIGHT_BASE_URL=http://localhost:3100 PLAYWRIGHT_BACKEND_URL=http://localhost:8090 playwright test --debug",
  "e2e:ui": "PLAYWRIGHT_BASE_URL=http://localhost:3100 PLAYWRIGHT_BACKEND_URL=http://localhost:8090 playwright test --ui",
  "e2e:ci": "PLAYWRIGHT_BASE_URL=http://localhost:3100 PLAYWRIGHT_BACKEND_URL=http://localhost:8090 playwright test --reporter=github",
  "e2e:docker-up": "docker compose -f ../docker-compose.e2e.yml up -d --wait",
  "e2e:docker-down": "docker compose -f ../docker-compose.e2e.yml down -v"
},
```

**Change required** — add one key (placement: after `"lint"`, before `"e2e"` to keep lint/test/e2e grouped):

```json
"test:unit": "node --import tsx --test ./src/utils/splitMath.test.ts",
```

**devDependencies change** (separate from `scripts`):

```json
"tsx": "^4.x.x",   // add to devDependencies (currently absent)
```

**Notes for planner:**

- **`tsx` is not installed** — confirmed by reading the current `devDependencies` block (lines 34-53). Planner must `npm install -D tsx` as part of the Phase 15 plan. Expect `package-lock.json` churn.
- **Script naming** — CONTEXT.md D-T02-3 specifies `"test:unit"` verbatim. Do not shorten to `"test"` (which some ecosystems expect to mean "all tests") — `test:unit` distinguishes from future `test:integration` or similar.
- **No change to existing scripts** — the `e2e:ci` script is what CI currently runs. Leave it alone.
- **Consider a `"test"` alias** — planner discretion per CONTEXT.md §"Claude's Discretion". Recommendation: do NOT add `"test": "npm run test:unit"` yet; keep the script surface explicit until a clear precedent emerges.

---

### `.github/workflows/e2e.yml` (CI config — modify) OR new `.github/workflows/test-frontend.yml`

**Analog:** `.github/workflows/e2e.yml` (full file, 53 lines). This is the existing frontend-paths-triggered workflow and demonstrates the "working-directory: frontend" + "npm ci --legacy-peer-deps" + Node 22 pattern.

**Full existing workflow:**

```yaml
name: E2E Tests

on:
  pull_request:
    branches: [main]
    paths:
      - "frontend/**"

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        working-directory: frontend
        run: npm ci --legacy-peer-deps

      - name: Install Playwright browsers
        working-directory: frontend
        run: npx playwright install --with-deps chromium

      - name: Start stack
        run: docker compose -f docker-compose.e2e.yml up -d --wait
        timeout-minutes: 5

      - name: Run E2E tests
        working-directory: frontend
        env:
          PLAYWRIGHT_BASE_URL: http://localhost:3100
          PLAYWRIGHT_BACKEND_URL: http://localhost:8090
          CI: true
        run: npm run e2e:ci

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/
          retention-days: 7

      - name: Stop stack
        if: always()
        run: docker compose -f docker-compose.e2e.yml down -v
```

**Two options for `test:unit` integration** — planner picks ONE:

**Option A (recommended, minimal):** Add a new step to `e2e.yml` that runs BEFORE "Install Playwright browsers" (unit tests don't need the browsers or the backend stack). Example insertion between lines 24 and 26:

```yaml
- name: Install frontend dependencies
  working-directory: frontend
  run: npm ci --legacy-peer-deps

- name: Run unit tests
  working-directory: frontend
  run: npm run test:unit

- name: Install Playwright browsers
  working-directory: frontend
  run: npx playwright install --with-deps chromium
```

Pros: single workflow run, fails fast if unit tests break.
Cons: unit-test failure blocks the e2e run (which might be useful or annoying).

**Option B (separate workflow file — `.github/workflows/test-frontend.yml`):** Mirror the shape of `.github/workflows/test.yml` (backend test workflow, 33 lines) but targeting frontend:

```yaml
name: Frontend Unit Tests

on:
  pull_request:
    branches: [main]
    paths:
      - "frontend/**"

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci --legacy-peer-deps
      - run: npm run test:unit
```

Pros: decoupled — unit test passes/fails independently of the heavy Playwright job, parallel execution on the PR.
Cons: one more workflow file to maintain.

**Notes for planner:**

- **Recommendation:** Option A. CONTEXT.md D-CI-1 says both `test:unit` and `e2e:ci` must be green on the PR; running them in one workflow keeps the PR-check list short and mirrors how `test.yml` (backend) bundles unit + integration into a single job.
- **Node version 22** is the established version (both `test.yml` and `e2e.yml` use it). `node:test` is stable on Node 22 — no version bump needed.
- **`--legacy-peer-deps`** — this flag is NOT optional; react-compiler and peer-dep conflicts in this repo require it. Every `npm ci` command in this workflow uses it (line 24) — match the pattern exactly.
- **No secrets needed** for unit tests — they run in-process, no network.
- **`paths` filter** — the existing workflow triggers only on `frontend/**` changes. Since `test:unit` targets frontend code, this stays correct. No need to add `.github/workflows/**` to the paths filter.

---

## Shared Patterns

### 1. Multi-user partner fixture pattern

**Source:** `frontend/e2e/tests/bulk-update-transfer.spec.ts` lines 67-104 (inline block to be extracted).

**Apply to:** `bulk-division.spec.ts` happy-path and silent-skip tests (NOT the disabled-state test — CONTEXT.md D-FIX-3).

**Contract:**

```typescript
const { partnerToken, connectionId, connAccountId } =
  await setupPartnerConnection({ status: 'accepted' })
// `connectionId` → pass to BulkDivisionDrawer form as connection_id
// `connAccountId` → used only if the spec also creates transfers into the partner's account
// `partnerToken` → used with apiFetchAs for partner-side API verification, if needed
```

### 2. API-level fixture + UI-driven test pattern

**Source:** `frontend/e2e/tests/bulk-update-transfer.spec.ts` (whole file), `frontend/e2e/tests/bulk-delete-transactions.spec.ts` (whole file).

**Apply to:** `bulk-division.spec.ts`.

**Pattern:**

1. `beforeAll` — create accounts/categories/partner connection via API (no UI clicks for setup).
2. Per-test — create transactions via API, then **`await transactionsPage.goto()`** to reload the page so the new txs appear.
3. UI interaction — only for the behavior under test (selection, menu open, submit).
4. Verification — `await apiGetTransaction(txId)` to assert wire state, NOT a UI assertion (UI might not reflect immediately; API state is ground truth).
5. `afterAll` — best-effort cleanup via `.catch(() => undefined)`.

### 3. Test ID naming convention

**Source:** `frontend/src/components/transactions/SelectionActionBar.tsx` + `frontend/src/components/transactions/BulkDivisionDrawer.tsx`.

**Apply to:** All spec selectors — use `getByTestId(...)`, not `getByText(...)` or `getByRole(...)`, for actionable elements.

**Established prefixes this spec will use:**

- `btn_bulk_<action>` — menu items in `SelectionActionBar` (`btn_bulk_division`, `btn_bulk_delete`, `btn_bulk_category`, `btn_bulk_date`).
- `btn_apply_<action>` — drawer confirm button (`btn_apply_bulk_division`).
- `bulk_<action>_*` — BulkProgressDrawer outputs (`bulk_success`, `bulk_error`, `btn_bulk_done`).
- `hint_<feature>_*` — inline hint text (`hint_bulk_division_no_connection`).

### 4. Wire-format assertion pattern (cents as int64)

**Source:** Root `CLAUDE.md` + Phase 14 `14-VERIFICATION.md` observable truth #4.

**Apply to:** Both the e2e wire-capture assertion AND the unit test in `splitMath.test.ts`.

**Assertion:** each `split_settings` row sent on the wire or returned from `splitPercentagesToCents` has exactly keys `['amount', 'connection_id']` (alphabetically sorted). No `percentage` field. Backend rejects 400 if `percentage` is present when `amount` is also present — so this assertion directly guards the PAY-02 requirement.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `frontend/src/utils/splitMath.test.ts` | unit test | pure assertion | No existing `*.test.ts` file in `frontend/src/`. CONTEXT.md §"Non-integration points" confirms Phase 15 introduces the first unit test. Planner uses the `node:test` template above. |

---

## Metadata

**Analog search scope:**
- `frontend/e2e/tests/` (all 17 spec files; focused on `bulk-*` and `transfer-*`)
- `frontend/e2e/helpers/` (single file: `api.ts`)
- `frontend/e2e/pages/` (5 page objects; read `TransactionsPage.ts` in full)
- `frontend/src/utils/` (checked for colocated tests — none exist)
- `.github/workflows/` (6 workflows; read `e2e.yml`, `test.yml`, `lint.yml`, `deploy.yml`, `draft-release.yml`)
- `frontend/src/components/transactions/` (read `SelectionActionBar.tsx`, `BulkDivisionDrawer.tsx`)
- `frontend/src/routes/_authenticated.transactions.tsx` (handler body + eligibility helpers)
- `frontend/src/types/transactions.ts` (`SplitSetting` type)
- `frontend/package.json`, `frontend/playwright.config.ts`, `frontend/e2e/global-setup.ts`

**Files scanned:** ~20 source files across e2e, src, types, workflows, config.

**Pattern extraction date:** 2026-04-20
