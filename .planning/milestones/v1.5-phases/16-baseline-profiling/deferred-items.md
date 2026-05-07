# Phase 16 — Deferred Items

Items discovered during execution that are out of scope for the current plan.

## From 16-01 execution (2026-05-05)

### A 5th e2e spec also duplicates `buildCsvContent`

**File:** `frontend/e2e/tests/import-enhancements.spec.ts` (lines 13–24)

**Observation:** This file inlines `CSV_HEADER`, `CSV_HEADER_WITH_CATEGORY`, `buildCsvContent` (with optional `header` parameter — exact same shape as the new `frontend/e2e/helpers/csv.ts` export), and `formatDateBR`. It was not listed in 16-01-PLAN.md's `<files>` for Task 1 and the plan's action explicitly prohibits modifying any `.spec.ts` outside the 4 listed.

**Why deferred:** Plan scope is binding — the explicit instruction "Do NOT modify any `.spec.ts` outside the 4 listed" overrides the truth statement that the helper should be the *only* definition in the repo. The duplicate is a benign style issue (no functional risk; identical signature) and migrating it does not block phase 16-03.

**Suggested follow-up:** A small follow-up plan (or piggyback on a phase-21 cleanup) should:
1. Replace the inlined `CSV_HEADER`, `CSV_HEADER_WITH_CATEGORY`, `buildCsvContent`, `formatDateBR` block in `import-enhancements.spec.ts` with `import { buildCsvContent, formatDateBR, CSV_HEADER, CSV_HEADER_WITH_CATEGORY } from '../helpers/csv'`.
2. Verify `grep -rn "function buildCsvContent\|const buildCsvContent" frontend/e2e/tests/` returns 0 matches.

### `npm run lint` environment issue

**Issue:** `cd frontend && npm run lint` fails with `Cannot find package '@eslint/js'` (module resolution error from `eslint.config.mjs`). The failure is **pre-existing** — reproduced cleanly on the worktree base before any 16-01 changes were applied (`git stash` + run).

**Why deferred:** Not caused by 16-01. Out of scope per the per-task fix-attempt policy ("only auto-fix issues DIRECTLY caused by the current task's changes").

**Suggested fix:** `npm install --save-dev @eslint/js` inside `frontend/`, or audit `package.json` to ensure `@eslint/js` is declared as an explicit devDependency (it is consumed transitively at the moment).

## From 16-03 execution (2026-05-06)

### Scenarios 3 & 4 are NOT caused by `useWatch` — page-level `selected` state cascades

**Files:** `frontend/src/pages/ImportTransactionsPage.tsx:40` (`useState<Set<number>>` for `selected`), `:90` (`handleToggleSelect`)

**Observation:** The 4-scenario baseline (16-PERF-BASELINE.md → Hypothesis Verdict) showed that the checkbox-toggle and shift-click scenarios re-render all 100 review rows with `ImportTransactionsPage` as the **only** updater — no RHF `Controller` involved. Phase 17's planned `useWatch`/`compute` rewrite addresses scenarios 1 & 2 (keystrokes) but **will not fix scenarios 3 & 4**.

**Why deferred:** Phase 17's scope is locked to `useWatch` rewriting. Pulling in row-selection refactor would expand scope and risk landing two interventions in the same phase, which makes attribution of P21's measurements ambiguous.

**Suggested follow-up:** P18 or P19 must address one of:
1. Lifting `selected` into a context or per-row subscription so toggling row N invalidates only row N.
2. Memoizing `ImportReviewRow` (`React.memo` + stable callback identities) so a page-level state change does not invalidate children that don't depend on `selected`.

P21 must include these scenarios in its re-measurement and the verdict must explicitly call out whether P17 alone, or P17+P18/P19, brought scenarios 3 & 4 under the gate threshold.

### Scenario 2 lists `ImportReviewRow2` as an additional updater (intra-row subscription)

**File:** `frontend/src/components/transactions/import/ImportReviewRow.tsx` (to inspect)

**Observation:** In the amount-keystroke profile (`frontend/profilling/cenario_2.json` → largest commit, fiber id 7469), `ImportReviewRow2` appears in `updaters` alongside `Controller` and `ImportTransactionsPage`. Description-keystroke (cenário 1) does not show this. Suggests there is a per-row subscription (likely a `useWatch` / `watch` on a sibling field) that fires on amount edits but not on description edits.

**Why deferred:** Independent of the page-level cascade. Even after P17 fixes the page-level `useWatch`, this row-internal re-render may still fire — but its blast radius is one row, not 100.

**Suggested follow-up:** During P17 or P18, audit `ImportReviewRow.tsx` for any field-watching hooks. If a `useWatch` / `watch` of an amount-adjacent field exists, evaluate whether it can be narrowed via `compute` or removed.
