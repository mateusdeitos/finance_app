---
phase: 15-e2e-coverage-rounding-verification
plan: 01
subsystem: testing
tags: [node-test, tsx, unit-test, splitMath, rounding, PAY-01, PAY-02]

# Dependency graph
requires:
  - phase: 14-bulk-action-wiring-cent-exact-conversion
    provides: "splitPercentagesToCents helper at frontend/src/utils/splitMath.ts"
provides:
  - "6 node:test unit tests for splitPercentagesToCents covering CONTEXT.md §specifics (a)-(f)"
  - "test:unit npm script in frontend/package.json"
  - "tsx@4.21.0 devDependency for TS loading in node:test"
  - "CI gate: npm run test:unit step in .github/workflows/e2e.yml"
affects:
  - future unit test plans that add more *.test.ts files

# Tech tracking
tech-stack:
  added:
    - "tsx@4.21.0 (TypeScript loader for Node.js built-in test runner)"
  patterns:
    - "node:test + node:assert/strict for pure-function unit tests (no vitest/jest/bun)"
    - "Co-locate *.test.ts next to the utility under test in src/utils/"
    - "Relative imports (../types/transactions) not @/-alias in test files (tsx reads root tsconfig.json which lacks paths)"

key-files:
  created:
    - "frontend/src/utils/splitMath.test.ts"
  modified:
    - "frontend/package.json"
    - "frontend/package-lock.json"
    - ".github/workflows/e2e.yml"

key-decisions:
  - "Use relative import ../types/transactions instead of @/types/transactions: tsx resolves root tsconfig.json (no paths alias) not tsconfig.app.json"
  - "Place test:unit CI step before Playwright browser install in e2e.yml: unit tests are fast and don't need Docker stack"
  - "Explicit file path in test:unit script (not glob): deterministic invocation for first unit test"

patterns-established:
  - "Unit test pattern: node:test + node:assert/strict, no DOM/React deps, co-located with utility"
  - "4-part assertion contract per D-T02-5: length, key-shape (PAY-02), sum==amount (PAY-01), last-absorbs-remainder"

requirements-completed: [TEST-02]

# Metrics
duration: 15min
completed: 2026-04-20
---

# Phase 15 Plan 01: splitMath Unit Tests Summary

**6 node:test cases prove splitPercentagesToCents cent-exact rounding (PAY-01) and no percentage-field leak (PAY-02) via tsx@4.21.0 + Node built-in test runner, with CI gate in e2e.yml**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-20T00:00:00Z
- **Completed:** 2026-04-20
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Introduced the project's first frontend unit test suite (`frontend/src/utils/splitMath.test.ts`) — 6 cases, 0 failures
- Wired `test:unit` npm script (`node --import tsx --test ./src/utils/splitMath.test.ts`) + `tsx@4.21.0` devDep into `frontend/package.json`
- Added `Run unit tests` CI step to `.github/workflows/e2e.yml` (D-CI-2), ensuring `npm run test:unit` gates every PR alongside `e2e:ci`
- All four D-T02-5 assertions enforced per case: length, `['amount','connection_id']` key-shape, Σ=amount, last-absorbs-remainder

## Task Commits

1. **Task 1: Add tsx devDep and test:unit script** - `191e8c2` (chore)
2. **Task 2: Write splitMath.test.ts and CI gate** - `4d42a45` (test)

## Test Output

```
✔ splitPercentagesToCents — (a) 50/50 on 100 cents (even baseline) (0.649ms)
✔ splitPercentagesToCents — (b) 30/70 on 101 cents (odd; last absorbs remainder) (0.061ms)
✔ splitPercentagesToCents — (c) 33/33/34 on 100 cents (sum already matches) (0.061ms)
✔ splitPercentagesToCents — (d) 33/33/34 on 10001 cents (remainder=2 absorbed by last) (0.062ms)
✔ splitPercentagesToCents — (e) 50/50 on 1 cent (degenerate; last absorbs) (0.053ms)
✔ splitPercentagesToCents — (f) single 100% split (no-op loop; last gets full amount) (0.064ms)
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

## Cases Tested and Expected Outputs

| Case | Input (amount, percentages) | Expected output (amounts) | Invariant exercised |
|------|----------------------------|---------------------------|---------------------|
| (a) even baseline | 100, [50, 50] | [50, 50] | Σ=100, no remainder |
| (b) odd, 2-split | 101, [30, 70] | [30, 71] | last absorbs 1-cent remainder (not naive 70) |
| (c) 33/33/34 even | 100, [33, 33, 34] | [33, 33, 34] | sum already exact, no drift |
| (d) 33/33/34 odd | 10001, [33, 33, 34] | [3300, 3300, 3401] | last absorbs 2-cent remainder (naive would give 3400) |
| (e) 1-cent degenerate | 1, [50, 50] | [1, 0] | Math.round(0.5)=1 in JS; last=0; Σ=1 |
| (f) single 100% | 5000, [100] | [5000] | no-op loop; last=full amount; no NaN |

Case (d) is the key differentiator: proves the algorithm produces 3401 (remainder-absorption), not 3400 (naive `Math.round`). A regression to naive rounding would fail this case's Σ check: 3300+3300+3400=10000 ≠ 10001.

## tsx Path Alias Resolution

tsx resolved `../types/transactions` (relative import) successfully. The `@/types/transactions` alias was NOT used in the test file because tsx reads the root `frontend/tsconfig.json` (which has no `paths` field) rather than `tsconfig.app.json` (which defines `@/*`). The helper itself (`splitMath.ts`) uses `@/types/transactions` but is compiled by Vite which reads `tsconfig.app.json`. Future unit test authors should use relative imports to `src/types/*`.

## tsx Version

`tsx v4.21.0` pinned by `npm install -D tsx` on 2026-04-20 (Node v24.2.0).

## Files Created/Modified

- `frontend/src/utils/splitMath.test.ts` — 6 node:test cases for splitPercentagesToCents
- `frontend/package.json` — added `test:unit` script + `tsx@^4.21.0` devDependency
- `frontend/package-lock.json` — regenerated with tsx resolved
- `.github/workflows/e2e.yml` — added `Run unit tests` step before Playwright (D-CI-2)

## Decisions Made

- **Relative import over @/ alias:** tsx reads root `tsconfig.json` (no `paths`), so `../types/transactions` is used in the test file. Documents the pattern for all future unit tests.
- **Explicit file path in test:unit script:** `./src/utils/splitMath.test.ts` instead of a glob — deterministic invocation, matches D-T02-3's "confirm exact invocation" preference for the first unit test. Glob can be added when more tests exist.
- **CI placement:** `Run unit tests` placed after `npm ci` but before Playwright browser install and Docker stack — unit tests are fast (~107ms) and self-contained; no infrastructure needed.

## Deviations from Plan

### Auto-added CI Gate

**1. [Rule 2 - Missing Critical] Added npm run test:unit step to .github/workflows/e2e.yml**
- **Found during:** Task 2
- **Issue:** CONTEXT.md D-CI-2 requires `npm run test:unit` to run in CI alongside `e2e:ci`. The e2e.yml workflow had no unit test step.
- **Fix:** Added `Run unit tests` step after `npm ci --legacy-peer-deps` and before Playwright browser install
- **Files modified:** `.github/workflows/e2e.yml`
- **Verification:** Step placement verified via file read; no Docker or browser needed for unit test execution
- **Committed in:** `4d42a45` (Task 2 commit)

---

**Total deviations:** 1 auto-added (missing CI gate per plan's D-CI-2 decision)
**Impact on plan:** Required by CONTEXT.md D-CI-2 — not scope creep, plan explicitly called for it.

## Issues Encountered

None. All 6 tests passed on first run.

## Known Stubs

None — tests exercise the actual `splitPercentagesToCents` implementation; no mocks or hardcoded returns.

## Next Phase Readiness

- TEST-02 satisfied: unit tests prove PAY-01 (Σ=amount) and PAY-02 (no percentage field) guards are in place
- `npm run test:unit` CI gate active for all future PRs touching `frontend/`
- Phase 15 Plan 02 (E2E bulk-division Playwright tests) can proceed independently
- Future unit tests: add files to `src/utils/*.test.ts` and either enumerate in `test:unit` script or switch to a glob

---
*Phase: 15-e2e-coverage-rounding-verification*
*Completed: 2026-04-20*
