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
