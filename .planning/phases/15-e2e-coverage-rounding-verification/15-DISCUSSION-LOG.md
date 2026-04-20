# Phase 15: E2E Coverage & Rounding Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 15-e2e-coverage-rounding-verification
**Areas discussed:** TEST-02 approach, E2E scope breadth, Fixture strategy

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| TEST-02 approach | Vitest vs Playwright-only vs Bun for rounding verification | ✓ |
| E2E scope breadth | Happy path only vs all 3 flows (incl. disabled + silent-skip) | ✓ |
| Fixture strategy | Reuse inline vs shared helper vs Page Object extension | ✓ |
| Rounding edge cases | Specific amounts/percentages for TEST-02 | (skipped — Claude's discretion) |

---

## TEST-02 approach

| Option | Description | Selected |
|--------|-------------|----------|
| Add Vitest | Install Vitest + add npm test script. Co-located splitMath.test.ts. Pure math → pure test. | |
| Playwright only | Inline rounding assertions in TEST-01 via network intercept. No new dep. Tests the wire. | |
| Bun test | Bun's built-in runner. Requires Bun as dev dep. | |
| **Other: node:test** | **User-provided. Node 20+ built-in test runner + tsx loader. Zero deps.** | ✓ |

**User's choice:** "use node:test pkg for unit testing"
**Notes:** Node's built-in runner with `tsx` as the TS loader. Cleanest path — no framework at all, no build step for tests. Captured as D-T02-1..D-T02-5.

---

## E2E scope breadth

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 (happy + disabled + silent-skip) | Recommended — closes 3 deferred HUMAN-UAT items in one phase. | ✓ |
| Happy-path only (TEST-01 literal) | Literal ROADMAP scope. Other two items stay as manual UAT. | |
| Happy + silent-skip (no disabled) | Skip disabled-state as too close to unit territory. | |

**User's choice:** All 3
**Notes:** Aligns with the project preference that e2e lives in CI (not manual testing). Captured as D-E2E-1..D-E2E-4.

---

## Fixture strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse inline pattern | Copy bulk-update-transfer.spec.ts setup into each new spec. Matches current convention. | |
| **Extract a shared helper** | **setupPartnerConnection() in frontend/e2e/helpers/. 3 callers justify extraction.** | ✓ |
| Extend TransactionsPage | Add seedPartnerConnection to the Page Object. Mixes UI + API seeding. | |

**User's choice:** Extract a shared helper
**Notes:** 3 new callers (happy + disabled + silent-skip specs) across Phase 15 plus the existing bulk-update-transfer caller makes extraction worth it.

### Follow-up — Helper scope

| Option | Description | Selected |
|--------|-------------|----------|
| **Just the partner connection (tight scope)** | **Only user + user_connection + partner account. Per-spec data inline.** | ✓ |
| Full split-test fixtures | Also seed account/category/transactions. One-call setup. | |
| Decompose into multiple helpers | setup + seed + mix, each separate. Overkill for 3 specs. | |

**User's choice:** Tight scope
**Notes:** Captured as D-FIX-1..D-FIX-4.

---

## Claude's Discretion

- Rounding edge cases for TEST-02 (floor list captured in D-T02-5 + specifics)
- Helper signature/filename/cleanup semantics
- Exact `test:unit` script glob/invocation
- Whether to add test:unit to pre-commit hooks

## Deferred Ideas

See `15-CONTEXT.md` `<deferred>` section — propagation e2e, visual regression, `getDivisionEligibleIds` unit tests, perf tests, fuzz tests.
