---
phase: 16-baseline-profiling
plan: 03
subsystem: testing
tags: [react, profiling, performance, baseline, useWatch, react-hook-form]

# Dependency graph
requires:
  - phase: 16-baseline-profiling
    provides: 16-PERF-BASELINE.md skeleton with Compiler Verification filled, three "_Status: pending — 16-03._" sections to fill (16-02), genImportFixture.ts and CSV helper (16-01), locked CONTEXT decisions (Profiling scenarios, Baseline artifact, Hypothesis-contradicted contingency, dev-mode profiling environment)
provides:
  - 16-PERF-BASELINE.md fully populated (Profiling Runbook, Baseline Measurements, Hypothesis Verdict)
  - Hypothesis verdict locked as CONFIRMED (no 16-DIAGNOSIS.md needed)
  - Two new deferred items in deferred-items.md targeting P18/P19 (non-RHF cascade in scenarios 3/4, intra-row updater in scenario 2)
  - Reproducible profiling recipe (`cd frontend && just profile`) and 4 raw React DevTools profiler exports under frontend/profilling/
affects: [17-useWatch-refactor, 18-component-memoization, 19-state-scoping, 20-virtualization, 21-perf-comparison]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reproducible profiling recipe via `just profile` (Vite dev server) — chosen over production preview after `vite build --mode development` was empirically confirmed to NOT swap React's bundle to the dev variant"
    - "React DevTools profiler export analysis via Python: parse fiberActualDurations + changeDescriptions + updaters from saved JSON to attribute re-renders to specific component instances and identify root-cause subscriptions"

key-files:
  created:
    - frontend/justfile
    - frontend/profilling/cenario_1.json (35MB raw profiler export — committed by user)
    - frontend/profilling/cenario_2.json (35MB)
    - frontend/profilling/cenario_3.json (35MB)
    - frontend/profilling/cenario_4.json (35MB)
    - .planning/phases/16-baseline-profiling/16-03-SUMMARY.md
  modified:
    - .planning/phases/16-baseline-profiling/16-PERF-BASELINE.md (3 pending sections filled + header)
    - .planning/phases/16-baseline-profiling/16-CONTEXT.md (2026-05-05 addendum revised; rejected first-attempt documented)
    - .planning/phases/16-baseline-profiling/deferred-items.md (2 items appended for P18/P19)

key-decisions:
  - "Profiling environment second revision: `npm run dev` via `just profile` (Vite dev server, port 5173). The first revision (`vite build --mode development`) was empirically rejected — Vite's --mode flag controls .env resolution only, not process.env.NODE_ENV for the bundle, so React's production bundle was still emitted and the profiler stayed blocked."
  - "Hypothesis CONFIRMED: page-level `useWatch({ name: 'rows' })` at ImportTransactionsPage.tsx:70 is the dominant re-render trigger for keystroke scenarios; ImportTransactionsPage appears as updater in all 4 scenarios re-rendering all 100 ImportReviewRow instances per event."
  - "Two secondary findings deferred to P18/P19 (NOT 16-DIAGNOSIS.md): (a) scenarios 3 & 4 are caused by page-level useState<Set<number>> for `selected` (line 40), not useWatch — P17 alone won't fix them; (b) scenario 2 lists ImportReviewRow2 as an additional updater, suggesting an intra-row subscription beyond the RHF Controller boundary."
  - "16-DIAGNOSIS.md NOT produced — verdict is CONFIRMED, no replan required for P17 main intervention."

patterns-established:
  - "Profiler-driven hypothesis verification: capture 4 reproducible scenarios → save raw JSON profiler exports as artifacts → analyse `updaters` and `changeDescriptions` programmatically → judge composition (which fibers + why) over absolute ms (which carry StrictMode 2× and HMR overhead)"
  - "Caveat-aware baseline: explicit StrictMode 2× and HMR overhead caveats in the document so P21 re-measurement uses the same recipe and comparisons stay internally consistent rather than chasing absolute production numbers"
  - "Deferred-items as P18/P19 input: secondary findings that surface during P16 measurement but lie outside P17's locked scope are recorded in deferred-items.md with file:line citations and follow-up suggestions, instead of expanding P17 scope or producing a contradicted-hypothesis diagnosis"

requirements-completed: [PROF-03]

# Metrics
duration: ~30min (developer-side profiler capture + analysis + writeup)
completed: 2026-05-06
---

# Phase 16 Plan 03: Baseline Capture + Hypothesis Verdict Summary

**Captured the 4-scenario React DevTools profiler baseline against the 100-row fixture and confirmed the page-level `useWatch` hypothesis. Two secondary findings (non-RHF cascade in scenarios 3/4; intra-row updater in scenario 2) recorded as P18/P19 input.**

## Performance

- **Duration:** ~30 min (excludes the user's manual profiler-capture session in Chrome)
- **Started:** 2026-05-05 (recipe revision) → 2026-05-06 (capture + writeup)
- **Completed:** 2026-05-06
- **Tasks:** 2 (Task 1 — fixture + preview verify; Task 2 — capture + writeup)
- **Files modified:** 3 (modified) + 5 (created)

## Accomplishments

- Empirically rejected the first profiling-environment revision (`vite build --mode development`) — Vite's `--mode` flag does NOT swap React's bundle to the dev variant, so the production bundle was still emitted and the profiler stayed blocked.
- Locked the second revision: `cd frontend && just profile` (Vite dev server, port 5173). Recipe regenerates `/tmp/fixture-100.csv` deterministically and starts the server in one command.
- Captured 4 reproducible profiler scenarios on row 50 of the 100-row fixture: description keystroke, amount keystroke, checkbox toggle, shift-click row select. Raw exports committed under `frontend/profilling/cenario_{1..4}.json`.
- Filled the three "_Status: pending — 16-03._" sections of `16-PERF-BASELINE.md`:
  - **Profiling Runbook**: step-by-step recipe + 4 caveats (StrictMode 2×, HMR overhead, P21 apples-to-apples requirement, composition over ms judgement).
  - **Baseline Measurements**: 4-row markdown table with commit duration, fiber count, page re-rendered, all 100 rows re-rendered, and per-scenario notes citing fiber updater IDs.
  - **Hypothesis Verdict**: CONFIRMED with per-scenario evidence + 2 secondary findings + outcome.
- Updated the document header (`Captured: 2026-05-06`, `Build: just profile`, `Browser: Chrome + React DevTools` referencing the committed raw exports).
- Recorded 2 new items in `deferred-items.md` for P18/P19: non-RHF state cascade and intra-row updater.
- Revised `16-CONTEXT.md` Addendum 2026-05-05 with the rejected-first-attempt evidence so future readers (and any retry) do not repeat the same mistake.

## Task Commits

1. **Task 1 — Fixture + preview verify (recipe revision)**:
   - `b617c54` docs(16): revise profiling environment for dev-mode build (first revision, later rejected)
   - `28e1d8a` chore(frontend): add justfile with `profile` recipe
   - `a67e9c0` fix(16): switch profiling recipe to vite dev server (final revision)
2. **Task 2 — Capture + writeup**:
   - `e7e03ce` profilling cenarios (user-committed raw profiler exports)
   - `bb3a530` docs(16): fill profiling runbook, baseline measurements and verdict

## Files Created/Modified

- `frontend/justfile` — `profile` recipe: regenerates fixture deterministically and runs `npm run dev` on port 5173. Caveats baked into header comments (StrictMode 2×, HMR overhead, Phase 21 apples-to-apples constraint).
- `frontend/profilling/cenario_{1..4}.json` — raw React DevTools profiler exports (35MB each), one per locked scenario. Single source of truth for every number in `16-PERF-BASELINE.md`.
- `.planning/phases/16-baseline-profiling/16-PERF-BASELINE.md` — Profiling Runbook + Baseline Measurements + Hypothesis Verdict sections filled; header `Captured`, `Build`, `Browser` lines populated; no `_Status: pending — 16-03._` placeholders remain.
- `.planning/phases/16-baseline-profiling/16-CONTEXT.md` — Addendum 2026-05-05 expanded with rejected-first-attempt narrative (`vite build --mode development` empirically does NOT swap the React bundle).
- `.planning/phases/16-baseline-profiling/deferred-items.md` — 2 items appended under "From 16-03 execution (2026-05-06)": non-RHF cascade in scenarios 3/4 (P18/P19 target) and intra-row updater in scenario 2 (P17/P18 audit).
- `.planning/phases/16-baseline-profiling/16-03-SUMMARY.md` — this file.

## Decisions Made

- **Profiling environment (second revision, LOCKED):** `just profile` → `npm run dev` (Vite dev server). Trade-offs accepted: (a) StrictMode 2× doubles dev renders — divides ms by 2 for prod estimate, but composition (which fibers, why) is unaffected; (b) HMR runtime overhead — Phase 21 must use the same recipe so before/after is internally consistent.
- **Hypothesis verdict: CONFIRMED.** ImportTransactionsPage appears as `updater` in the largest commit of all 4 scenarios. For scenarios 1 & 2 the page-level `useWatch({ name: 'rows' })` at line 70 is the trigger (alongside the expected RHF Controller). For scenarios 3 & 4 the page-level `useState<Set<number>>` for `selected` (line 40, mutated by `handleToggleSelect` at line 90) is the only updater — same fan-out (200 ImportReviewRow2 fibers) but different root cause.
- **No 16-DIAGNOSIS.md.** Hypothesis confirmed; P17's planned scope (replace page-level `useWatch` with `compute`-scoped subscriptions) is the correct intervention for the dominant case (keystroke scenarios). The non-`useWatch` root cause for scenarios 3 & 4 is recorded as a deferred item rather than as a contradiction, because P17 was never claimed to address checkbox/shift-click — those are P18/P19's territory.
- **Did not modify any frontend/src/, frontend/scripts/, frontend/e2e/, or frontend/vite.config.ts file** — preserved by all 5 phase commits per task acceptance criteria.

## Deviations from Plan

### Method change (NOT a plan deviation, but a locked-decision revision)

The original plan specified `npm run build && npm run preview` (production preview) as the build target. This was revised twice in CONTEXT.md (first to `vite build --mode development`, then to `npm run dev`) before any measurement was taken. Both revisions are documented in CONTEXT.md addenda; both were accepted by the user before the recipe ran.

### Acceptance-criteria discovery: Verdict line format

The acceptance criterion uses regex `^\*\*Verdict:\*\* (CONFIRMED|CONTRADICTED)` which requires the verdict word OUTSIDE the bold span. The first writeup put the word inside the bold (`**Verdict: CONFIRMED.**`), which produced 0 regex matches. Corrected in the same commit cycle to `**Verdict:** CONFIRMED — page-level useWatch...`. Recorded here so the next executor matching a similar regex AC reads the regex carefully.

---

**Total deviations:** 0 plan deviations; 1 self-discovered AC-format fix (Verdict line bold span).
**Impact on plan:** None. Recipe revisions were CONTEXT.md amendments approved before execution.

## Issues Encountered

- **`vite build --mode development` does NOT enable React's dev bundle.** Discovered while attempting the first recipe revision. Vite's `--mode` flag controls `.env.<mode>` resolution and the `import.meta.env.MODE` value, but `process.env.NODE_ENV` is set independently — `vite build` defaults `NODE_ENV=production` regardless of `--mode`. The build emitted `react-dom.production.min.js` and the profiler stayed blocked. Documented in CONTEXT.md so it is not retried in P21.
- **Profiler exports are large** (~35MB each, ~138MB total committed). Acceptable because the JSON is the single source of truth for every measurement claim and the cost is one-time. P21 will produce a comparable set; older P16 exports stay as the baseline of record.

## Threat Flags

None. This plan added local-development tooling (`justfile` recipe), markdown documentation, and read-only profiler artifacts. No new network endpoint, auth path, schema change, or runtime code path. Threat register from the plan (`T-16-03-01`..`T-16-03-05`, all `accept`) holds.

## Next Phase Readiness

- **For 17 (useWatch refactor):** dominant culprit confirmed at `frontend/src/pages/ImportTransactionsPage.tsx:70` — `useWatch({ control: form.control, name: 'rows' })` with no `compute`. The existing call at lines 53–60 already demonstrates the `compute` pattern locally; P17 must replicate it (or restructure consumers so they subscribe via per-row Controllers/useWatch with `compute`). P17 must also wire `babel-plugin-react-compiler` into `vite.config.ts` as a sub-task BEFORE the `useWatch` change so post-P17 measurements are on the same compiler regime as P21.
- **For 18 / 19 (memoization, state scoping):** scenarios 3 & 4 will NOT be fixed by P17. Root cause = page-level `useState<Set<number>>` for `selected` at `ImportTransactionsPage.tsx:40`. Suggested interventions (one of): lift `selected` into a context with per-index subscription, or `React.memo(ImportReviewRow)` with stable callback identities so a top-level `selected` change does not invalidate children that don't depend on it.
- **For 20 (virtualization gate):** the P19→P20 gate threshold of "description-keystroke commit duration < ~16 ms" is referenced as raw dev-mode milliseconds. Current baseline is 761 ms raw dev (≈380 ms prod estimate). If P17+P18 do not bring this under the gate threshold, virtualization is required. P20 should also re-visit the threshold against a 500-row variant of the fixture (per secondary finding #3 in the verdict).
- **For 21 (re-measurement):** must use `cd frontend && just profile` for apples-to-apples comparison. Re-capture all 4 scenarios with the same fixture and the same StrictMode regime. Compare composition first (which fibers re-render, why) and ms second.

## Self-Check: PASSED

All 16-03 acceptance criteria verified:

```
grep -c "_Status: pending — 16-03._" 16-PERF-BASELINE.md
  → 0 (AC: must be 0)
grep -c "^| [0-9] |" 16-PERF-BASELINE.md
  → 4 (AC: must be 4 — one row per scenario)
grep -cE '^\*\*Verdict:\*\* (CONFIRMED|CONTRADICTED)' 16-PERF-BASELINE.md
  → 1 (AC: exactly one match)
grep -E "^\*\*Captured:\*\*|^\*\*Browser:\*\*" 16-PERF-BASELINE.md
  → both lines populated, no `<...>` placeholders
test -f 16-DIAGNOSIS.md
  → absent (AC: must be absent when verdict is CONFIRMED)
git diff --stat .planning/ROADMAP.md
  → empty (AC: ROADMAP.md unchanged — no auto-edit)
git log --oneline 7b84956..HEAD -- frontend/src/ frontend/scripts/ frontend/e2e/ frontend/vite.config.ts
  → empty (AC: no commits in 16-03 scope touch these paths)
```

All four required section headers in `16-PERF-BASELINE.md` are populated:
- `## Compiler Verification` — filled by 16-02 (INACTIVE)
- `## Profiling Runbook` — filled by 16-03
- `## Baseline Measurements` — filled by 16-03
- `## Hypothesis Verdict` — filled by 16-03 (CONFIRMED)
- `## P19 → P20 Gate Threshold` — filled by 16-02

Phase 16 is complete. Hand-off to Phase 17.

---
*Phase: 16-baseline-profiling*
*Completed: 2026-05-06*
