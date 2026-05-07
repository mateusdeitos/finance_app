---
phase: 15-e2e-coverage-rounding-verification
plan: "03"
subsystem: ci
tags: [ci, github-actions, unit-tests, playwright, e2e, TEST-01, TEST-02]
dependency_graph:
  requires:
    - phase: 15-e2e-coverage-rounding-verification
      plan: "01"
      provides: "npm run test:unit script + Run unit tests step in e2e.yml"
    - phase: 15-e2e-coverage-rounding-verification
      plan: "02"
      provides: "bulk-division.spec.ts with 3 Playwright tests"
  provides:
    - "CI gate: npm run test:unit runs in every frontend PR before Playwright install"
    - "Human verification gate: CI green = TEST-01 + TEST-02 closed in production"
  affects:
    - ".github/workflows/e2e.yml"
tech_stack:
  added: []
  patterns:
    - "Fail-fast CI: unit tests before Playwright browser install, no Docker stack needed"
key_files:
  created: []
  modified:
    - ".github/workflows/e2e.yml (pre-emptively by Plan 15-01 executor, commit 4d42a45)"
decisions:
  - "Task 1 acceptance criteria were already satisfied by Plan 15-01's executor (commit 4d42a45) — no additional edit made to avoid duplicate step insertion"
  - "Plan 15-03 scope is verification-only for Task 1; checkpoint:human-verify gates TEST-01 + TEST-02 closure"
requirements-completed: []
metrics:
  duration: 5min
  completed: "2026-04-20"
  tasks: 1
  files: 0
---

# Phase 15 Plan 03: Wire unit tests into CI + CI-green human verification

**CI gate is already active: Plan 15-01's executor pre-emptively added the "Run unit tests" step to `.github/workflows/e2e.yml` (commit 4d42a45) before Plan 15-03 executed. All Task 1 acceptance criteria verified; awaiting CI-green human verification at the checkpoint gate.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-20T23:42:47Z
- **Completed:** 2026-04-20 (partial — awaiting human-verify checkpoint)
- **Tasks completed:** 1 of 2 (Task 2 is a blocking checkpoint)
- **Files modified:** 0 (change was made by Plan 15-01 executor)

## Task Verification

### Task 1: Add "Run unit tests" step to `.github/workflows/e2e.yml`

**Status: ALREADY SATISFIED — no edit needed**

Plan 15-01's executor added the "Run unit tests" step as a deviation (Rule 2 — missing CI gate per CONTEXT.md D-CI-2), committed in `4d42a45`:
```
test(15-01): add splitMath unit tests (6 node:test cases) and CI gate
- Add 'Run unit tests' step to .github/workflows/e2e.yml before Playwright
  (D-CI-2: npm run test:unit must run in CI alongside e2e:ci)
```

All Task 1 acceptance criteria verified as passing:

| Check | Result |
|-------|--------|
| `grep -q "name: Run unit tests" .github/workflows/e2e.yml` | PASS |
| `grep -q "run: npm run test:unit" .github/workflows/e2e.yml` | PASS |
| Step ordering (install-deps < unit-tests < playwright-install) via awk | PASS |
| YAML syntax valid (npx js-yaml) | PASS |
| `working-directory: frontend` present for the new step | PASS (line 27) |

### Current `.github/workflows/e2e.yml` step order

```yaml
- name: Install frontend dependencies    # line 22
  working-directory: frontend
  run: npm ci --legacy-peer-deps

- name: Run unit tests                   # line 26 (added by 4d42a45)
  working-directory: frontend
  run: npm run test:unit

- name: Install Playwright browsers      # line 30
  working-directory: frontend
  run: npx playwright install --with-deps chromium

- name: Start stack
  run: docker compose -f docker-compose.e2e.yml up -d --wait

- name: Run E2E tests
  ...
  run: npm run e2e:ci

- name: Upload Playwright report
  if: always()

- name: Stop stack
  if: always()
```

Non-negotiables all confirmed:
- Position: BEFORE Playwright install (unit tests fail-fast without browsers or Docker)
- Working directory: `frontend`
- No `if: always()` (unit-test failure blocks Playwright — intentional fail-fast per D-CI-1)
- No env block (unit tests are pure-function)
- No `timeout-minutes:` (node:test runs in <1s; default job timeout is fine)
- No other step modified or removed

## `.github/workflows/e2e.yml` Diff

The "Run unit tests" step is exactly 4 lines (blank line + name + working-directory + run):

```diff
       - name: Install frontend dependencies
         working-directory: frontend
         run: npm ci --legacy-peer-deps
 
+      - name: Run unit tests
+        working-directory: frontend
+        run: npm run test:unit
+
       - name: Install Playwright browsers
         working-directory: frontend
         run: npx playwright install --with-deps chromium
```

This diff was applied in Plan 15-01's commit `4d42a45`.

## CI Validation (Pending First PR Push)

The CI-green validation is gated by Task 2 (checkpoint:human-verify). Once the PR is pushed to GitHub, the `E2E Tests / e2e` workflow will run and execute both phases:

1. **Run unit tests** — expected: 6/6 tests pass in <10 seconds (`# pass 6`, `# fail 0`)
2. **Run E2E tests** — expected: bulk-division.spec.ts contributes 3 new "Bulk Division" passing tests

## HUMAN-UAT Closures (Pending CI green)

The 3 HUMAN-UAT items from Phase 14 (`14-HUMAN-UAT.md`) are covered by `bulk-division.spec.ts` (Plan 15-02). Once CI runs green, they are closed:

| HUMAN-UAT | Closed by | CI gate |
|-----------|-----------|---------|
| Test 1: happy-path Divisão flow | bulk-division.spec.ts Test 1 | Run E2E tests step |
| Test 2: disabled state with 0 connected accounts | bulk-division.spec.ts Test 2 | Run E2E tests step |
| Test 3: transfer silent-skip in mixed selection | bulk-division.spec.ts Test 3 | Run E2E tests step |

`14-HUMAN-UAT.md` can remain as-is — Phase 15 VERIFICATION.md is the new source of truth for these closures.

## Deviations from Plan

### Context: Plan 15-01 executor pre-emptively satisfied Task 1

**1. [Pre-emptive Rule 2 by prior executor] CI gate was added in Plan 15-01**
- **Found during:** Task 1 verification
- **Context:** Plan 15-01's executor recognized that CONTEXT.md D-CI-2 requires `npm run test:unit` to run in CI. Rather than defer to Plan 15-03, it added the step in commit `4d42a45` as a Rule 2 deviation (missing critical CI gate).
- **Impact on Plan 15-03:** Task 1 acceptance criteria are already fully satisfied. No edit was made here (that would create a duplicate step).
- **Commit:** `4d42a45` (test(15-01): add splitMath unit tests (6 node:test cases) and CI gate)

No other deviations — plan executed as written for Task 1 verification.

## Known Stubs

None. The workflow file is complete and functional.

## Threat Flags

None. The `.github/workflows/e2e.yml` change only adds a CI step for test execution — no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- [x] `.github/workflows/e2e.yml` contains "Run unit tests" step (line 26-28)
- [x] Step is correctly ordered: Install frontend deps < Run unit tests < Install Playwright browsers
- [x] YAML is valid (js-yaml parse: no errors)
- [x] Commit `4d42a45` exists in git log: `test(15-01): add splitMath unit tests (6 node:test cases) and CI gate`
- [x] No new files created by this plan (0 modified files — pre-emptively satisfied by 15-01)
- [x] Task 2 checkpoint returned with structured state per checkpoint_return_format
