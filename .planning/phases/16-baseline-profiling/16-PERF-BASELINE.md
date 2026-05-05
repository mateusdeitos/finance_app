# Phase 16 — Performance Baseline

**Phase:** 16 — Baseline Profiling & Diagnostics
**Milestone:** v1.5 Import Transactions Performance
**Captured:** _pending — 16-03 will fill the actual capture date_
**Build:** `npm run build && npm run preview` (production preview)
**Browser:** _pending — 16-03 will fill the Chrome version_
**Fixture:** `frontend/scripts/genImportFixture.ts` (deterministic, mulberry32 SEED=0x16ba5e1e, 100 rows)

## Compiler Verification

**Verdict:** INACTIVE

**Evidence — vite.config.ts plugin chain:**

- File: `frontend/vite.config.ts`
- `grep -n "babel-plugin-react-compiler\|babel:" frontend/vite.config.ts` → no matches (exit code 1)
- `grep -n "react(" frontend/vite.config.ts` → `23:    react(),`
- The `react()` plugin call does not include a `babel: { plugins: [...] }` option. Citation: `frontend/vite.config.ts:23`. The full plugins array (`frontend/vite.config.ts:21-60`) wires only `tanstackRouter(...)`, `react()` (no arguments), and `VitePWA({ ... })`.

**Evidence — production bundle inspection:**

- Build command: `cd frontend && npm run build`
- Build exit code: `0` (vite v6.4.1, 7444 modules, single chunk `dist/assets/index-DJs5eIHx.js` 1,092.35 kB / gzip 332.17 kB)
- `grep -l "useMemoCache" frontend/dist/assets/*.js` → `dist/assets/index-DJs5eIHx.js` (exit code 0)
- `grep -l "react-compiler-runtime" frontend/dist/assets/*.js` → no matches (exit code 1)
- `grep -c "_c\[[0-9]" frontend/dist/assets/*.js` → `0` (exit code 1)

**Disambiguation of the `useMemoCache` hit:** Inspection of the surrounding context (`grep -o ".\{40\}useMemoCache.\{40\}"`) shows the matches occur inside React 19's internal hook dispatcher table (e.g. `useActionState:pn,useOptimistic:pn,useMemoCache:pn` and `useMemoCache:Zy,useCacheRefresh:hT`). These are React's runtime hook surface declarations, not compiler-emitted call sites. The compiler-specific patterns — `react-compiler-runtime` module specifier and `_c[<n>]` cache-slot reads — are both absent (0 occurrences across the bundle). Additional checks: `grep -c "_c\[" → 0`, `grep -oE "[a-z]\.c\([0-9]+\)" → no matches`. So the bundle contains React 19's compiler-aware runtime helpers but no transformed call sites that use them.

**Conclusion:** All three compiler-call-site markers are absent from the production bundle, and `vite.config.ts:23` does not pass `babel-plugin-react-compiler` to the `react()` plugin. The lone `useMemoCache` hit is part of React 19's own dispatcher table (the runtime is shipped in React 19 in case the compiler is wired downstream) and does not indicate compiler activity. The compiler is therefore **INACTIVE** in the production build at the time of this measurement.

**Per locked Phase 16 decision (`16-CONTEXT.md` → "React Compiler wiring (contingency)"), no wiring change is performed in this phase.** Phase 17 absorbs the wiring as a sub-task before any `useWatch` change so post-Phase-17 measurements are on the same compiler regime as post-Phase-21 measurements.

## Profiling Runbook

> Filled by 16-03-PLAN.md execution. This section will document the step-by-step procedure
> a developer follows to capture the 4-scenario baseline (Chrome → React DevTools → Profiler tab
> → press Record → perform scenario → stop → record commit duration + rendered count).

_Status: pending — 16-03._

## Baseline Measurements

> Filled by 16-03-PLAN.md execution. Markdown table — columns: scenario, commit duration (ms),
> rendered component count, notes.

_Status: pending — 16-03._

## Hypothesis Verdict

> Filled by 16-03-PLAN.md execution. Either CONFIRMED (page-level useWatch is the dominant
> re-render trigger) or CONTRADICTED (in which case `16-DIAGNOSIS.md` is also produced).

_Status: pending — 16-03._

## P19 → P20 Gate Threshold

Per the locked Phase 20 (Virtualization) gate decision in `16-CONTEXT.md`:

> If the 100-row fixture is fluid after Phase 19 (description-keystroke commit duration < ~16ms,
> no perceptible lag), Phase 20 is **skipped or downsized** at the orchestrator's call.

Phase 21 will compare its re-measured numbers against this baseline and apply the gate.
