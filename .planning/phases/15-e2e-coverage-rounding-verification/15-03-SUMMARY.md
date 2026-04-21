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
  completed: "2026-04-21"
  tasks: 2
  files: 0
checkpoint:
  status: approved
  approved_at: "2026-04-21T00:27:29Z"
  signal: "approved — CI green on PR 87 commit 9e1de67: unit-tests check (success, 27s), e2e check (success, 7m9s)"
  evidence:
    - "GitHub check `unit-tests` conclusion: success — https://github.com/mateusdeitos/finance_app/actions/runs/24697272619/job/72232634916"
    - "GitHub check `e2e` conclusion: success — https://github.com/mateusdeitos/finance_app/actions/runs/24697272632/job/72232634908"
---

# Phase 15 Plan 03: Wire unit tests into CI + CI-green human verification

**Plan complete: Task 1's CI gate was pre-emptively added by Plan 15-01 (commit 4d42a45) and later refactored into a dedicated `unit-tests.yml` workflow (commit 83ca554). Task 2's human-verify checkpoint is closed — both `unit-tests` and `e2e` CI checks passed on PR 87 commit 9e1de67.**

## Performance

- **Duration:** ~5 min (plus CI-green wait)
- **Started:** 2026-04-20T23:42:47Z
- **Completed:** 2026-04-21T00:27:29Z (checkpoint gate closed by CI-green)
- **Tasks completed:** 2 of 2
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

## CI Validation — CLOSED (2026-04-21)

CI is green on PR 87 head commit `9e1de67`. Both checks passed:

| Check | Conclusion | Duration | Run URL |
|-------|------------|----------|---------|
| `unit-tests` | success | 27s | https://github.com/mateusdeitos/finance_app/actions/runs/24697272619/job/72232634916 |
| `e2e` | success | 7m9s | https://github.com/mateusdeitos/finance_app/actions/runs/24697272632/job/72232634908 |

Note on workflow split: commit `83ca554` moved the `npm run test:unit` step out of `e2e.yml` into its own `unit-tests.yml` workflow so it surfaces as an independent CI check. Unit-test failures are no longer masked by e2e failures, and the unit check completes in seconds without waiting on Playwright browser install or the docker-compose stack. This supersedes the `.github/workflows/e2e.yml` diff shown above — the effective current state of the CI gate is:

- `.github/workflows/unit-tests.yml` — runs `npm run test:unit` (surfaces as `unit-tests` check)
- `.github/workflows/e2e.yml` — runs `npm run e2e:ci` (surfaces as `e2e` check)

Both triggered by `pull_request` on `paths: frontend/**`. D-CI-1's fail-fast intent is preserved per-check: a failing unit test blocks the merge independently of the e2e run.

## HUMAN-UAT Closures — CLOSED

The 3 HUMAN-UAT items from Phase 14 (`14-HUMAN-UAT.md`) are closed by the green `e2e` check on PR 87:

| HUMAN-UAT | Closed by | CI gate |
|-----------|-----------|---------|
| Test 1: happy-path Divisão flow | bulk-division.spec.ts Test 1 | `e2e` check (success) |
| Test 2: disabled state with 0 connected accounts | bulk-division.spec.ts Test 2 | `e2e` check (success) |
| Test 3: transfer silent-skip in mixed selection | bulk-division.spec.ts Test 3 | `e2e` check (success) |

`14-HUMAN-UAT.md` can remain as-is — `15-VERIFICATION.md` is the new source of truth for these closures.

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
