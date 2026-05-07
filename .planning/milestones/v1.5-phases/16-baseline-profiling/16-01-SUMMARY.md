---
phase: 16-baseline-profiling
plan: 01
subsystem: testing
tags: [playwright, e2e, csv, fixtures, mulberry32, deterministic, typescript, tsx]

# Dependency graph
requires:
  - phase: (none — first plan in phase 16)
    provides: Establishes the deterministic fixture and shared CSV helper that subsequent plans rely on.
provides:
  - frontend/e2e/helpers/csv.ts — single source of truth for buildCsvContent + CSV header constants + formatDateBR
  - frontend/scripts/genImportFixture.ts — deterministic 100-row CSV generator (mulberry32 PRNG, fixed BASE_DATE)
  - 4 e2e import specs migrated off their inlined helpers
affects: [16-02, 16-03, 21]

# Tech tracking
tech-stack:
  added: []  # no new dependencies; tsx + typescript were already devDependencies
  patterns:
    - "Shared helper at frontend/e2e/helpers/csv.ts is imported by both Playwright specs and dev scripts under frontend/scripts/."
    - "Deterministic fixture generation via seeded mulberry32 PRNG + fixed Date.UTC anchor — reproducible across runs and machines."

key-files:
  created:
    - frontend/e2e/helpers/csv.ts
    - frontend/scripts/genImportFixture.ts
    - .planning/phases/16-baseline-profiling/deferred-items.md
  modified:
    - frontend/e2e/tests/import.spec.ts
    - frontend/e2e/tests/import-installment.spec.ts
    - frontend/e2e/tests/import-shift-select.spec.ts
    - frontend/e2e/tests/import-split-settings.spec.ts

key-decisions:
  - "Helper exports both 3-column CSV_HEADER (default for existing specs) and 4-column CSV_HEADER_WITH_CATEGORY (used by the generator) so e2e behavior is preserved while the generator exercises the optional Categoria column."
  - "Generator uses mulberry32 (public-domain 32-bit PRNG) seeded with 0x16ba5e1e and a fixed BASE_DATE of 2026-01-01 UTC; no nondeterministic randomness source is used. This is what makes phase 21 able to re-run the same fixture for an apples-to-apples comparison."
  - "Documented `Math.random` JSDoc reference was rephrased so the literal acceptance grep (count == 0) passes; semantic intent (no nondeterministic RNG call) is preserved."

patterns-established:
  - "CSV import contract is anchored in one helper (`frontend/e2e/helpers/csv.ts`) — any future test or script that produces import-flow CSV must import from there rather than redeclare the header."
  - "Dev-only scripts live under `frontend/scripts/` and consume `frontend/e2e/helpers/*` via relative imports (`../e2e/helpers/...`); they are invoked ad-hoc with `npx tsx`."

requirements-completed: [PROF-01]

# Metrics
duration: ~5 min
completed: 2026-05-05
---

# Phase 16 Plan 01: Centralize buildCsvContent and add deterministic 100-row CSV generator Summary

**Single-source-of-truth `buildCsvContent` helper + seeded mulberry32 fixture generator that emits a byte-identical 100-row CSV matching the importer's 4-column contract.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-05T17:12:03Z
- **Completed:** 2026-05-05T17:17:25Z
- **Tasks:** 2
- **Files created:** 3 (helper + generator + deferred-items log)
- **Files modified:** 4 (e2e specs)

## Accomplishments

- Extracted `buildCsvContent`, `CSV_HEADER`, `CSV_HEADER_WITH_CATEGORY`, and `formatDateBR` into `frontend/e2e/helpers/csv.ts`.
- Migrated all four target e2e specs (`import.spec.ts`, `import-installment.spec.ts`, `import-shift-select.spec.ts`, `import-split-settings.spec.ts`) to import from the helper — no behavior change (call sites still pass a single `rows` argument and the helper defaults to the 3-column header).
- Added `frontend/scripts/genImportFixture.ts` — produces a deterministic 100-row CSV whose output is byte-identical across runs.
- Verified generator output: 101 lines, header `Data;Descrição;Valor;Categoria`, 100 data rows each starting with `DD/MM/YYYY;`, no `Math.random` call (the only literal match was a JSDoc comment which was rephrased to satisfy the literal acceptance grep).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create frontend/e2e/helpers/csv.ts and migrate the 4 e2e specs to it** — `aaa295d` (refactor)
2. **Task 2: Write deterministic 100-row CSV fixture generator (mulberry32 seed)** — `8a71d84` (feat)

Plan-level metadata commit (SUMMARY.md + deferred-items.md) follows this file.

## Files Created/Modified

- `frontend/e2e/helpers/csv.ts` (created) — exports `buildCsvContent`, `CSV_HEADER`, `CSV_HEADER_WITH_CATEGORY`, `formatDateBR`. Single source of truth for the CSV import contract.
- `frontend/scripts/genImportFixture.ts` (created) — deterministic 100-row CSV generator using mulberry32 PRNG with fixed seed `0x16ba5e1e` and fixed `BASE_DATE` of 2026-01-01 UTC.
- `frontend/e2e/tests/import.spec.ts` (modified) — removed inlined `CSV_HEADER`, `buildCsvContent`, and `formatDateBR`; now imports `buildCsvContent, formatDateBR` from `../helpers/csv`.
- `frontend/e2e/tests/import-installment.spec.ts` (modified) — removed inlined `CSV_HEADER` and `buildCsvContent`; now imports `buildCsvContent` from `../helpers/csv`.
- `frontend/e2e/tests/import-shift-select.spec.ts` (modified) — same migration.
- `frontend/e2e/tests/import-split-settings.spec.ts` (modified) — same migration.
- `.planning/phases/16-baseline-profiling/deferred-items.md` (created) — logs the out-of-scope discovery of a 5th spec that also duplicates `buildCsvContent`, plus the pre-existing `npm run lint` environment failure.

## Verification Commands and Output

Run from `frontend/`:

```
$ npx tsc --noEmit
(exit 0, no output)

$ grep -rn "function buildCsvContent\|const buildCsvContent" e2e/tests/
e2e/tests/import-enhancements.spec.ts:16:function buildCsvContent(rows: string[][], header = CSV_HEADER): string {
# (the 4 target specs are clean; the 5th spec is logged in deferred-items.md — see Deviations below)

$ grep -l "from '../helpers/csv'" e2e/tests/import.spec.ts e2e/tests/import-installment.spec.ts e2e/tests/import-shift-select.spec.ts e2e/tests/import-split-settings.spec.ts | wc -l
4

$ npx tsx scripts/genImportFixture.ts > /tmp/f1.csv
$ npx tsx scripts/genImportFixture.ts > /tmp/f2.csv
$ diff -q /tmp/f1.csv /tmp/f2.csv
(exit 0, no output — files identical)

$ wc -l < /tmp/f1.csv
101

$ head -1 /tmp/f1.csv
Data;Descrição;Valor;Categoria

$ head -3 /tmp/f1.csv
Data;Descrição;Valor;Categoria
01/01/2026;Cinema #001;-719,78;Saúde
02/01/2026;Padaria #002;-347,96;Saúde

$ tail -2 /tmp/f1.csv
09/01/2026;Internet #099;-215,70;
10/01/2026;Conta de água #100;-617,53;Transporte

$ grep -c '^[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9];' /tmp/f1.csv
100

$ grep -c "Math.random" scripts/genImportFixture.ts
0

$ grep -c "mulberry32" scripts/genImportFixture.ts
4
```

## Decisions Made

- **Optional `header` parameter on `buildCsvContent`:** Defaults to `CSV_HEADER` (3-column) so existing single-arg call sites keep working unchanged; generator opts in to `CSV_HEADER_WITH_CATEGORY` (4-column).
- **Deterministic anchor:** `BASE_DATE = Date.UTC(2026, 0, 1)` plus `i % 90` day spread keeps the fixture reproducible regardless of when/where the script runs (matches the root-CLAUDE.md "all times are UTC" cross-cutting convention).
- **JSDoc rewrite:** The plan-supplied source said `* - No \`Math.random()\` is used anywhere` in the generator's docstring, which would make the acceptance grep `grep -c "Math.random"` report `1`. Rephrased to "No nondeterministic randomness source (the standard library RNG) is used" to satisfy the literal acceptance criterion while preserving intent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc comment caused acceptance criterion `grep -c "Math.random" == 0` to fail**
- **Found during:** Task 2 verification.
- **Issue:** The plan's literal source for the generator embedded the string `Math.random()` inside its own docstring; the same plan's acceptance criterion required `grep -c "Math.random"` to report `0`. Self-contradicting as written.
- **Fix:** Rephrased the docstring line so the literal `Math.random` token is absent, while preserving the semantic claim ("no nondeterministic RNG").
- **Files modified:** `frontend/scripts/genImportFixture.ts`
- **Verification:** `grep -c "Math.random" frontend/scripts/genImportFixture.ts` now reports `0`. Determinism still verified via `diff -q` on two consecutive runs.
- **Committed in:** Folded into `8a71d84` (Task 2 commit) — the fix lives in the same commit as the script's introduction.

### Out-of-scope discoveries (logged, not fixed)

**[Out of scope] A 5th e2e spec duplicates `buildCsvContent`.** `frontend/e2e/tests/import-enhancements.spec.ts` (lines 13–24) inlines the same helpers. The plan's `<files>` for Task 1 lists only 4 specs and the action explicitly forbids touching others. The plan's truth statement ("only definition in the repo") is therefore in tension with the explicit scope. The duplicate is benign — identical signature, no risk to phase 16-03 — and is logged for follow-up in `.planning/phases/16-baseline-profiling/deferred-items.md`.

**[Pre-existing, out of scope] `npm run lint` fails with `Cannot find package '@eslint/js'`.** Reproduced cleanly on the worktree base before any 16-01 changes (confirmed by stashing my work, running lint, then unstashing). Not caused by this plan; logged in `deferred-items.md`. `npx tsc --noEmit` passes cleanly, so the type contract that matters for downstream consumers (16-03) is intact.

---

**Total deviations:** 1 auto-fixed (1 bug in plan-supplied source) + 2 logged out-of-scope discoveries.
**Impact on plan:** No scope creep. The auto-fix was needed to satisfy the plan's own acceptance criterion.

## Issues Encountered

- **Worktree path confusion (operator-side, recovered):** Initial Task 1 edits inadvertently went to the main checkout (`/home/user/finance_app/...`) instead of the worktree (`/home/user/finance_app/.claude/worktrees/agent-af12b1fee090bdc87/...`). Detected before the first commit attempt; reverted the main checkout (`git checkout --` and `rm` for the new files) and re-applied identical edits in the worktree. No commits landed on `main` and no work was lost.

## User Setup Required

None — no external service configuration required. The generator is a developer-local script invoked ad-hoc; no secrets, no network surface (matches the threat-model assessment in the plan).

## Next Phase Readiness

- **16-02 ready:** Helper and generator are in place. The CSV-format contract is locked behind a single helper, so 16-02's profiling runbook can rely on it without redocumenting.
- **16-03 ready:** Plan 16-03 can run `npx tsx frontend/scripts/genImportFixture.ts > fixture-100.csv` (or pipe equivalently) and feed the resulting CSV directly into the production-preview import flow at the 100-row hard limit. Determinism is verified.
- **No blockers.**

## Self-Check: PASSED

- [x] `frontend/e2e/helpers/csv.ts` exists and exports `buildCsvContent`, `CSV_HEADER`, `CSV_HEADER_WITH_CATEGORY`, `formatDateBR`.
- [x] `frontend/scripts/genImportFixture.ts` exists; `npx tsx scripts/genImportFixture.ts` succeeds and produces 101 lines with header `Data;Descrição;Valor;Categoria`.
- [x] All 4 target spec files import from `../helpers/csv`.
- [x] `grep -rn "function buildCsvContent\|const buildCsvContent" frontend/e2e/tests/` returns 0 matches in the 4 target specs (1 hit in `import-enhancements.spec.ts` is logged as deferred).
- [x] `grep -rn "function formatDateBR\|const formatDateBR" frontend/e2e/tests/import.spec.ts` returns 0 matches.
- [x] `cd frontend && npx tsc --noEmit` exits 0.
- [x] `diff -q /tmp/f1.csv /tmp/f2.csv` reports identical (determinism).
- [x] `grep -c "Math.random" frontend/scripts/genImportFixture.ts` reports 0.
- [x] `grep -c "mulberry32" frontend/scripts/genImportFixture.ts` reports ≥ 2 (actual: 4).
- [x] No file under `frontend/src/` modified (verified — only `frontend/e2e/`, `frontend/scripts/`, and `.planning/`).
- [x] Commits `aaa295d` and `8a71d84` exist on branch.

---
*Phase: 16-baseline-profiling*
*Completed: 2026-05-05*
