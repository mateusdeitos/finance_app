---
phase: 17-eliminate-page-usewatch-cascade
plan: ad-hoc
subsystem: frontend
tags: [react-hook-form, useWatch, performance, refactor, import-flow]

# Dependency graph
requires:
  - phase: 16-baseline-profiling
    provides: hypothesis CONFIRMED, page-level useWatch identified at ImportTransactionsPage.tsx:70 as dominant trigger; baseline numbers for 4 scenarios; just profile recipe
provides:
  - Page-level useWatch cascade eliminated for keystroke scenarios (1 & 2)
  - Description keystroke 261× faster (761 ms → 2.9 ms raw dev)
  - Amount keystroke 15× faster (929 ms → 62.5 ms raw dev)
  - 17-PERF-COMPARISON.md with full P16-vs-P17 numbers per scenario
  - Confirmation that P19→P20 gate threshold is already met for keystrokes
affects: [18-component-memoization, 19-state-scoping, 20-virtualization, 21-perf-comparison]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single `compute`-scoped useWatch returning multiple scalars instead of multiple broad subscriptions"
    - "useFieldArray.fields.length / fields.map for cardinality + index reads (no useWatch needed)"
    - "Profiler-driven before/after comparison: raw exports under frontend/profilling/, comparison doc at .planning/phases/<n>/<n>-PERF-COMPARISON.md"

key-files:
  created:
    - frontend/profilling/p17_cenario_1.json (15MB — committed by user)
    - frontend/profilling/p17_cenario_2.json (16MB)
    - frontend/profilling/p17_cenario_3.json (35MB)
    - frontend/profilling/p17_cenario_4.json (35MB)
    - .planning/phases/17-eliminate-page-usewatch-cascade/17-CONTEXT.md
    - .planning/phases/17-eliminate-page-usewatch-cascade/17-PERF-COMPARISON.md
    - .planning/phases/17-eliminate-page-usewatch-cascade/17-SUMMARY.md
  modified:
    - frontend/src/pages/ImportTransactionsPage.tsx (broad useWatch removed; compute expanded with 4 scalars; handleSelectAll switched to fields.map)
    - .planning/ROADMAP.md (SC4 typo fix: "200-row" → "100-row" + scope clarification on scenarios 3/4)

key-decisions:
  - "Refactor scope: only useWatch consumers in ImportTransactionsPage.tsx. selected/setSelected, ImportReviewRow internals, useFieldArray topology, schema, and bulk-toolbar handlers all stay untouched (deferred to P18/P19 per 16/deferred-items.md)."
  - "Compiler wiring SKIPPED in P17 (user opted out — option 2). Both P16 and P17 measurements are on compiler-INACTIVE regime, so the entire delta is attributable to the useWatch refactor. Compiler wiring becomes its own follow-up phase if needed."
  - "Single compute callback returns 4 scalars (total, totalSuccess, errorCount, toImportPendingCount) computed from one shared toImport slice — clearer than 4 separate filter chains."

patterns-established:
  - "When a page-level useWatch needs multiple derived counts, expand the existing compute to return all of them as scalars rather than introducing a second broad subscription"
  - "Cardinality reads (length, indices) come from useFieldArray.fields, not from useWatch — fields auto-updates on add/remove and the array reference is stable across keystrokes"
  - "Perf-comparison doc layout (3 tables: ms/fibers, fiber counts, instance counts; updater-list diff for the verdict-decisive evidence; per-scenario notes) — re-usable for P19 and P21 comparisons"

requirements-completed: [RR-01, RR-02]

# Metrics
duration: ~1h (planning + 1 commit refactor + comparison doc)
completed: 2026-05-07
---

# Phase 17 Summary

**Eliminated the page-level `useWatch({ name: 'rows' })` cascade in `ImportTransactionsPage`. Description keystroke went from 761 ms → 2.9 ms raw dev (262×). Amount keystroke went from 929 ms → 62.5 ms (15×). Both scenarios no longer have `ImportTransactionsPage` in the React DevTools updaters list — SC4 PASSED.**

## Performance

- **Duration:** ~1 hour (CONTEXT draft + refactor + measurement + writeup)
- **Started:** 2026-05-06
- **Completed:** 2026-05-07
- **Tasks:** 1 ad-hoc (no formal plan — small, well-scoped change)
- **Files modified:** 2 source files + 5 markdown/JSON artifacts created

## Accomplishments

- Removed the broad `useWatch({ control: form.control, name: 'rows' })` at `ImportTransactionsPage.tsx:70`.
- Expanded the existing `compute`-scoped `useWatch` (`ImportTransactionsPage.tsx:53`) to return 4 scalars instead of 2: `total`, `totalSuccess`, `errorCount`, `toImportPendingCount` — all derived from one shared `toImport` filter pass.
- Switched `handleSelectAll` from `rows.map((_, i) => i)` to `fields.map((_, i) => i)` (cardinality from useFieldArray, no broad watch).
- Removed the per-render `toImportRows` derivation and inline filter at `ImportConfirmButton`'s `toImportCount` prop — both replaced by scalars from `compute`.
- Fixed ROADMAP.md SC4 typo: "200-row baseline" → "100-row baseline" + added explicit scope-clarification note that scenarios 3 & 4 are out of P17 scope per `16/deferred-items.md`.
- Captured 4 post-refactor profiler scenarios with the same `just profile` recipe used in P16 — apples-to-apples comparison.
- Wrote `17-PERF-COMPARISON.md` with: per-scenario ms/fiber tables, updater-list diff, P19→P20 gate analysis, compiler-regime note.

## Task Commits

1. **CONTEXT draft** — `4a0cc6d` docs(17): draft Phase 17 CONTEXT with locked decisions from P16 carry-over
2. **Refactor + ROADMAP fix** — `5c97c5f` refactor(17): eliminate page-level useWatch cascade in ImportTransactionsPage
3. **Profiler exports (user-committed)** — `a025431` profilling
4. **Comparison + summary** — this commit (TBD hash)

## Headline Numbers

| # | Scenario              | P16 ms | P17 ms | Speedup | ImportTransactionsPage in updaters? |
|---|-----------------------|-------:|-------:|--------:|-------------------------------------|
| 1 | Description keystroke |    761 |  **2.9** | **262×** | **No** ✓ |
| 2 | Amount keystroke      |    929 |   **62.5** |  **15×** | **No** ✓ |
| 3 | Checkbox toggle       |    791 |  613.4 |    1.3× | Yes — out of P17 scope |
| 4 | Shift-click select    |    720 |  622.2 |    1.2× | Yes — out of P17 scope |

ImportReviewRow re-renders for keystrokes:
- Scenario 1: 100 rows → **0** (page not in render set)
- Scenario 2: 100 rows → **1** (only the edited row)

Full numbers and updater-list diff: `17-PERF-COMPARISON.md`.

## Decisions Made

- **Compiler wiring: SKIPPED** in P17 (user-chosen option 2). Both regimes are compiler-INACTIVE, so the entire P16→P17 delta is the refactor. If compiler wiring lands later, its contribution will be cleanly isolatable.
- **Refactor scope: only useWatch.** Did NOT touch `selected`/`setSelected`, `ImportReviewRow.tsx`, `useFieldArray` topology, `importFormSchema`, or bulk-toolbar handlers. Per `17-CONTEXT.md` → Refactor scope decision.
- **No formal plan file (`17-XX-PLAN.md`)** — the change is small (one source file, ~14 lines net), well-scoped, and the success criteria from ROADMAP.md SC1–SC4 served as the spec. The CONTEXT.md plus the perf-comparison doc cover the "what + why + how + verification" loop.

## Deviations from Plan

### Profiler artifact naming

`17-CONTEXT.md` recommended `frontend/profilling/p17-after/cenario_{1..4}.json`. The user committed flat as `frontend/profilling/p17_cenario_{1..4}.json`. Functionally equivalent — analysis and comparison doc reference the actual filenames. No re-naming required.

---

**Total deviations:** 1 cosmetic (filename pattern).
**Impact on plan:** None.

## Issues Encountered

- **`node_modules` missing** — same carry-over issue documented in P16-02. `npm ci --legacy-peer-deps` resolved it. Pre-existing peer conflict between `@tanstack/zod-adapter@^1.166.9` (peer `zod@^3.23.8`) and the project's `zod@^4.3.6`.

## Threat Flags

None. Source-code change is scoped to one page component with no new network endpoints, auth paths, or schema changes. Threat register from `17-CONTEXT.md` (T-17-* if any were defined; none in this case) holds trivially.

## Next Phase Readiness

- **For P18 (component memoization / state scoping):** the deferred items from P16 are now the live work. `16/deferred-items.md` lists:
  1. Scenarios 3 & 4 cascade — page-level `useState<Set<number>>` for `selected` at line 40. P17's residual ~620 ms commit on these scenarios is the floor P18 must lower.
  2. Scenario 2 intra-row updater — `ImportReviewRow2` still in updaters alongside `Controller`. P18 audits `ImportReviewRow.tsx` for the source.
- **For P20 (virtualization, gated):** description-keystroke is **already at 2.9 ms raw dev**, well below the 16 ms gate. If P18 brings scenarios 3 & 4 under the gate too, P20 is a clear "skip" for the 100-row hard limit.
- **For P21 (final verification):** baseline of record updated. P21 re-measures with the same `just profile` recipe and compares against the P17 numbers (or post-P18/P19 numbers) as the new "before".

## Self-Check: PASSED

ROADMAP.md success criteria for Phase 17:

- **SC1** — `useWatch({ control: form.control, name: 'rows' })` (the broad subscription at line 70) is removed → ✓ `grep -E "useWatch\(\{[^}]*name: 'rows'[^}]*\}\)" frontend/src/pages/ImportTransactionsPage.tsx | grep -v "compute:"` returns 0 matches.
- **SC2** — `handleSelectAll` derives count from `useFieldArray.fields` instead of a watched array → ✓ `frontend/src/pages/ImportTransactionsPage.tsx:128` reads `fields.map((_, i) => i)`.
- **SC3** — `toImportRows`/`errorCount` derived inside `useWatch({ ..., compute })` returning only scalars → ✓ Compute at lines 53–65 returns `{ total, totalSuccess, errorCount, toImportPendingCount }`. No raw row array escapes.
- **SC4** — Profiler re-run on the 100-row baseline shows `ImportTransactionsPage` does NOT re-render on a single description keystroke in any row → ✓ `p17_cenario_1.json` updaters list = `[Controller]` only. Same for `p17_cenario_2.json` (`[Controller, ImportReviewRow2]`, no `ImportTransactionsPage`).

Build verification:
```
npx tsc --noEmit  → exit 0
npx vite build    → exit 0, 1,092.33 kB / gzip 332.15 kB (= P16 baseline within 0.02 kB)
```

Phase 17 is complete. Hand-off to Phase 18.

---
*Phase: 17-eliminate-page-usewatch-cascade*
*Completed: 2026-05-07*
