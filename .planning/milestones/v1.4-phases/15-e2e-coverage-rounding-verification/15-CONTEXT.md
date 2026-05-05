# Phase 15: E2E Coverage & Rounding Verification - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Add automated test coverage for the Phase 14 bulk-split flow:
1. Playwright e2e in `frontend/e2e/` covering the full bulk-division happy path, the disabled-state (0 connected accounts), and the transfer silent-skip in a mixed selection.
2. Unit tests for `splitPercentagesToCents` via Node's built-in `node:test` runner, asserting `Σ split.amount === tx.amount` holds exactly across odd-cent amounts and representative percentage mixes.

**In scope (this phase):** TEST-01, TEST-02. Close the 3 HUMAN-UAT items Phase 14 deferred here (happy-path, disabled state, silent-skip).

**Out of scope:**
- No new product code — tests only. If a test reveals a bug, it gets a gap-closure plan, not in-phase.
- No vitest/jest/bun — see D-T02-1.
- No E2E for propagation drawer variations — Phase 14's existing pattern is shared with category/date handlers, already implicitly covered.
- No retry-failed-items UI for BulkProgressDrawer (deferred polish, Phase 14 log).

</domain>

<decisions>
## Implementation Decisions

### TEST-02: Unit Test Strategy (PAY-01 verification)

- **D-T02-1:** Use Node's built-in test runner (`node:test` + `node:assert/strict`) — zero new dependencies. Do NOT add vitest, jest, or bun. `tsx` (already a dev dep candidate; verify) loads TS for the test runner.
- **D-T02-2:** Test file location: `frontend/src/utils/splitMath.test.ts`, co-located with `splitMath.ts`. This matches "pure utility next to its test" convention for the utils/ folder.
- **D-T02-3:** New script in `frontend/package.json`: `"test:unit": "node --test --import tsx ./src/**/*.test.ts"` (or equivalent pattern that globs TS test files). Planner confirms exact invocation against current Node/tsx behaviour.
- **D-T02-4:** CI must run `npm run test:unit` alongside the existing Playwright job. This is the CI-gate that proves TEST-02.
- **D-T02-5:** Assertion shape: for each `(amount, percentages[])` case, call `splitPercentagesToCents(amount, percentages)` and assert (a) the returned array length matches input, (b) each output has only `connection_id` and `amount` (no `percentage` field — PAY-02 guard), (c) `Σ result[i].amount === amount`, (d) the last split absorbs the remainder deterministically (compare vs naive `Math.round` on all splits).

### TEST-01: Playwright E2E Coverage

- **D-E2E-1:** Single new spec file: `frontend/e2e/tests/bulk-division.spec.ts`. Three test cases inside one `test.describe('Bulk Division', ...)` block:
  1. **Happy path** — partner + 1 accepted connection → auto-selected in drawer; select ≥2 transactions (including at least one income); submit 30/70 split; verify BulkProgressDrawer reports success; requery each tx via API and assert `split_settings` matches the wire-format (`connection_id` + `amount`, no `percentage`); assert at least one of the submitted PUT payloads had an odd-cent last-split remainder (confirms Phase 14 wiring lands the helper's output on the wire).
  2. **Disabled state** — no accepted connections → open bulk menu → Divisão item is disabled; the hint "Conecte uma conta para usar esta ação." renders; clicking is a no-op (selection count unchanged, no drawer opens).
  3. **Transfer silent-skip** — mixed selection including at least one transfer → submit division → BulkProgressDrawer rows list only the non-transfer transactions; no error row for the transfer; after completion, requery the transfer via API and assert its `split_settings` is unchanged.
- **D-E2E-2:** Closes the three HUMAN-UAT items carried forward in `14-HUMAN-UAT.md` (deferred_to_ci → resolved by this phase's passing CI).
- **D-E2E-3:** Use `TransactionsPage` Page Object (existing) for navigation + selection. Network payload assertions use Playwright's `page.waitForRequest(...)` with a URL matcher on `PUT /api/transactions/*` to capture the outgoing body and assert absence of a `percentage` field — mirrors the network-level assertion pattern the user asked for.
- **D-E2E-4:** Test IDs to rely on: `btn_bulk_division` (menu item), `bulk_division` prefix on BulkProgressDrawer, any existing `connection_select` / `percentage_input` IDs in `BulkDivisionDrawer` (Phase 13 — confirm exact names during planning).

### Fixture Strategy

- **D-FIX-1:** Extract `setupPartnerConnection(opts?: { status?: 'accepted' | 'pending' })` into `frontend/e2e/helpers/fixtures.ts` (new file, or `helpers/partner.ts` — planner decides on filename). Returns `{ partnerToken, connectionId, connAccountId }`. Three callers justify extraction.
- **D-FIX-2:** Helper scope is tight — **only** the partner user + user_connection + partner-side account. Primary account, categories, and transactions remain inline in each spec's `beforeAll` (they differ too much across the 3 test cases to abstract well).
- **D-FIX-3:** Happy-path + silent-skip specs call `setupPartnerConnection({ status: 'accepted' })` to get `connectedAccountsCount === 1` (triggering auto-select). Disabled-state spec does NOT call the helper — it leaves the primary user with 0 accepted connections.
- **D-FIX-4:** Reuse existing `apiCreateUserConnection`, `getAuthTokenForUser`, `apiCreateAccount`, `apiCreateCategory`, `apiCreateTransaction`, `apiFetchAs` from `frontend/e2e/helpers/api.ts` — no changes to the api helpers file.

### CI Integration

- **D-CI-1:** Phase verification hinges on CI green on the PR: both `npm run test:unit` and `npm run e2e:ci` must pass. This is the project-level preference recorded in user memory (`feedback_e2e_via_ci.md`) — no local manual testing required.
- **D-CI-2:** If `.github/workflows/*.yml` does not already run `npm run test:unit`, the planner adds a step. Minimal CI plumbing — additive only.

### Claude's Discretion

- Rounding edge-case amounts: planner picks a representative set. Floor recommendation: `(amount=101, [30,70])`, `(amount=100, [33,33,34])`, `(amount=10001, [33,33,34])`, `(amount=1, [50,50])`, plus one 4-split case. Each exercises a different corner of `Math.round` vs remainder.
- Exact shape of the `setupPartnerConnection` helper signature, filename, and whether to return a cleanup function vs rely on spec-level teardown.
- Exact script glob for `test:unit` (may need to be explicit file list if tsx glob support is flaky).
- Whether to also run `npm run test:unit` in pre-commit hooks (probably yes; planner decides).
- Where inside `bulk-division.spec.ts` to put shared variable declarations and whether `beforeAll` or `beforeEach` is the right granularity.

### Folded Todos

None.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Spec
- `.planning/REQUIREMENTS.md` §v1.4 — TEST-01, TEST-02 definitions
- `.planning/ROADMAP.md` §"Phase 15" — goal + success criteria (note the "Playwright (or unit)" clause for TEST-02)
- `.planning/phases/14-bulk-action-wiring-cent-exact-conversion/14-HUMAN-UAT.md` — the three deferred UAT items this phase closes
- `.planning/phases/14-bulk-action-wiring-cent-exact-conversion/14-VERIFICATION.md` — Phase 14 must-haves verified; the `human_verification` section is the source of truth for what this phase's tests must cover
- `.planning/phases/14-bulk-action-wiring-cent-exact-conversion/14-CONTEXT.md` — upstream decisions (splitPercentagesToCents signature, payload shape, silent-skip filter)

### Code under test
- `frontend/src/utils/splitMath.ts` — `splitPercentagesToCents` (TEST-02 target)
- `frontend/src/components/transactions/SelectionActionBar.tsx` — Divisão menu item + disabled-state hint
- `frontend/src/routes/_authenticated.transactions.tsx` — `handleDivisionClick`, `getDivisionEligibleIds`, `connectedAccountsCount` wiring
- `frontend/src/components/transactions/BulkDivisionDrawer.tsx` — drawer under test (Phase 13 artifact)

### Test infrastructure (existing — reuse)
- `frontend/playwright.config.ts` — Playwright setup, base URL, project config
- `frontend/e2e/global-setup.ts` / `frontend/e2e/global-teardown.ts` — session bootstrap
- `frontend/e2e/helpers/api.ts` — `apiCreateAccount`, `apiCreateCategory`, `apiCreateTransaction`, `apiDeleteTransaction`, `apiGetTransaction`, `apiCreateUserConnection`, `getAuthTokenForUser`, `apiFetchAs` — the API-level fixture primitives
- `frontend/e2e/pages/TransactionsPage.ts` — Page Object with selection + bulk menu methods
- `frontend/e2e/tests/bulk-update-transfer.spec.ts` — reference pattern for partner-connection setup and multi-user bulk flow testing
- `frontend/e2e/tests/bulk-delete-transactions.spec.ts` — reference pattern for bulk action testing shape

### Conventions
- `frontend/CLAUDE.md` — stack, utils/ conventions, drawer patterns (tests do not use `renderDrawer`)
- `CLAUDE.md` (root) — cents as int64 end-to-end (TEST-02 is the guard that the wire-format stays int64)

### External
- Node.js `node:test` docs (Node 20+): https://nodejs.org/api/test.html — planner references for runner flags and reporter options
- `tsx` docs: https://tsx.is — loader for TypeScript in `node --test`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`frontend/e2e/helpers/api.ts`** — full API-level fixture toolkit. `apiCreateUserConnection` + `getAuthTokenForUser` are the partner-connection primitives. `apiFetchAs(token, url)` lets tests verify state from the partner's perspective too.
- **`frontend/e2e/pages/TransactionsPage.ts`** — existing Page Object; has selection helpers and bulk-menu accessors. Planner confirms exact method names during planning.
- **`bulk-update-transfer.spec.ts`** — textbook pattern for `beforeAll` fixture setup with partner connection. New spec mirrors this structure, swapping the action under test.
- **`bulk-delete-transactions.spec.ts`** — reference for bulk-action selection + submit flow.

### Established Patterns
- **Page Object Model** — navigation + selectors live in `e2e/pages/*.ts`, not in specs.
- **API-level fixtures** — test data is created via the HTTP API (not DB seeds) for realism. Tests clean up via `apiDelete*` in `afterAll` or per-test `finally`.
- **Multi-user setup** — primary user is the default auth; partner user is created explicitly with `getAuthTokenForUser(email, password)` and the connection is established via `apiCreateUserConnection`.
- **Deterministic test IDs** — existing naming is `btn_bulk_<action>` + `bulk_<action>` prefix on BulkProgressDrawer. Specs rely on these.

### Integration Points
- **New helper file:** `frontend/e2e/helpers/fixtures.ts` (or `partner.ts`) with `setupPartnerConnection`. No other helpers/ files touched.
- **New test file:** `frontend/e2e/tests/bulk-division.spec.ts` with three test cases.
- **New test file:** `frontend/src/utils/splitMath.test.ts` co-located with the helper under test.
- **package.json:** add `"test:unit"` script. No production dependencies change.
- **CI workflow:** ensure `npm run test:unit` runs alongside `npm run e2e:ci`.

### Non-integration points (confirmed absent)
- **No existing unit test infra** — `frontend/src/` has zero `*.test.ts` files and `package.json` has no `test` script. Phase 15 introduces the first unit test, via `node:test`.
- **No vitest/jest/bun** in package.json. Decision D-T02-1 is the first test-framework choice for this codebase.

</code_context>

<specifics>
## Specific Ideas

- The happy-path spec should include at least one **income** transaction in the selection to explicitly cover BULK-03 (income flows through division normally).
- The happy-path spec should use an **odd-cent total** (e.g., `tx.amount = 101 cents`) on at least one selected tx so the wire capture can prove the last-split-absorbs-remainder behaviour end-to-end, not just in the unit test.
- The silent-skip spec should submit a selection with at least one **transfer** and at least two non-transfers; the assertion is that the progress drawer shows exactly the non-transfer count.
- The disabled-state spec does not need to submit anything — it only asserts the menu item's `disabled` prop and the presence of the hint copy.
- The unit test file should cover: (a) 50/50 on even cents (baseline), (b) 30/70 on odd cents (remainder = 1), (c) 33/33/34 on 100 (sum already matches), (d) 33/33/34 on 10001 (remainder = 2, absorbed by last), (e) 50/50 on 1 cent (degenerate case: 0 + 1 = 1), (f) single 100% split (no-op case).
- Wire-format assertion in Playwright: capture the PUT body via `page.waitForRequest`, parse JSON, assert each `split_settings[*]` object has exactly the keys `connection_id` and `amount` (use `Object.keys().sort()` equality).

</specifics>

<deferred>
## Deferred Ideas

- **Test coverage for the propagation drawer variants in the division flow** — Phase 14's propagation handling reuses the category/date pattern; regressions there would surface in existing specs. Not worth duplicating.
- **Visual regression tests** for the disabled-state hint styling — out of scope for a test phase; belongs in a Chromatic / Percy integration phase if we ever add one.
- **Unit tests for `getDivisionEligibleIds`** — the helper is small and the silent-skip e2e already covers its external behaviour. A unit test would be pure plumbing.
- **Performance tests for `splitPercentagesToCents` on very large split arrays** — not a realistic input size; UI caps splits at N accounts.
- **Fuzz testing the rounding math** — cute but not necessary; the deterministic edge cases cover the space.

</deferred>

---

*Phase: 15-e2e-coverage-rounding-verification*
*Context gathered: 2026-04-20*
