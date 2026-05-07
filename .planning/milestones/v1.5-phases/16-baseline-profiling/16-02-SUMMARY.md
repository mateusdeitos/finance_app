---
phase: 16-baseline-profiling
plan: 02
subsystem: testing
tags: [react-compiler, vite, performance, profiling, baseline]

# Dependency graph
requires:
  - phase: 16-baseline-profiling
    provides: 16-CONTEXT.md decisions (locked compiler-wiring deferral, prod-only profiling)
provides:
  - 16-PERF-BASELINE.md skeleton with all 5 section headers
  - Compiler Verification section with INACTIVE verdict + grep evidence
  - Locked handoff placeholders for Runbook / Measurements / Hypothesis (16-03 will fill)
affects: [16-03-baseline-capture, 17-useWatch-refactor, 21-perf-comparison]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Empirical compiler-presence verification: vite.config.ts plugin-chain inspection + production-bundle marker grep"

key-files:
  created:
    - .planning/phases/16-baseline-profiling/16-PERF-BASELINE.md
  modified: []

key-decisions:
  - "Compiler verdict: INACTIVE — useMemoCache appears in the bundle as part of React 19's runtime dispatcher, but the compiler-call-site markers (react-compiler-runtime module specifier and _c[<n>] cache-slot reads) are absent"
  - "Disambiguated the lone useMemoCache hit: it is React 19's internal hook surface, not compiler-emitted code; documented inline in the verification section so future readers do not misread it as a positive signal"
  - "vite.config.ts left untouched per locked CONTEXT.md decision; wiring is Phase 17's responsibility"

patterns-established:
  - "Compiler verification pattern: (a) grep vite.config.ts for babel.plugins, (b) run npm run build, (c) grep dist/assets/*.js for react-compiler-runtime + _c[<n>] cache-slot pattern, (d) disambiguate any incidental useMemoCache hits"

requirements-completed: [PROF-02]

# Metrics
duration: ~7min
completed: 2026-05-05
---

# Phase 16 Plan 02: Compiler Verification + Baseline Doc Skeleton Summary

**Empirically confirmed `babel-plugin-react-compiler` is INACTIVE in the production bundle and scaffolded `16-PERF-BASELINE.md` with the verification section locked in for Phase 17 to consume.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-05T17:08:00Z (approx — worktree branch check)
- **Completed:** 2026-05-05T17:15:16Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Verified `frontend/vite.config.ts:23` calls `react()` with no `babel.plugins` argument (zero matches for `babel-plugin-react-compiler` or `babel:` in the file).
- Ran `cd frontend && npm run build` cleanly (vite v6.4.1, 7444 modules, single chunk `index-DJs5eIHx.js`, exit 0).
- Grepped the production bundle: `useMemoCache` present (React 19 runtime dispatcher), `react-compiler-runtime` absent, `_c[<n>]` cache-slot pattern absent (0 matches).
- Disambiguated the `useMemoCache` hit by inspecting context: it lives inside React 19's internal hook dispatcher table (`useActionState:pn,useOptimistic:pn,useMemoCache:pn`), NOT a compiler-emitted call site.
- Wrote `16-PERF-BASELINE.md` (64 lines) with all 5 required section headers: Compiler Verification (filled), Profiling Runbook (handoff), Baseline Measurements (handoff), Hypothesis Verdict (handoff), P19 → P20 Gate Threshold (filled).

## Task Commits

1. **Task 1: Run production build and grep dist for React Compiler markers** — `af7b0cf` (docs)

_No final metadata commit will be added by this executor — orchestrator owns STATE.md / ROADMAP.md updates per worktree-mode contract. SUMMARY.md is committed below as the final commit._

## Files Created/Modified

- `.planning/phases/16-baseline-profiling/16-PERF-BASELINE.md` — Phase 16 baseline doc skeleton; Compiler Verification section locked with INACTIVE verdict + verbatim grep evidence + line citation; remaining sections marked `_Status: pending — 16-03._` for the next plan to fill.

## Decisions Made

- **Compiler verdict = INACTIVE.** The single `useMemoCache` hit is part of React 19's runtime, not compiler-emitted code. Recorded the disambiguation inline in the doc so Phase 17 (and any reviewer) does not have to redo the analysis.
- **Did not modify `frontend/vite.config.ts`** — explicitly forbidden by 16-CONTEXT.md ("React Compiler wiring (contingency)") and by this plan's must-haves; wiring is Phase 17's responsibility.
- **Did not touch `frontend/src/`** — not in scope for this measurement-only plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed frontend dependencies**
- **Found during:** Task 1, sub-step B (production build)
- **Issue:** First `npm run build` invocation failed with `error TS2307: Cannot find module '@tanstack/react-router'` and similar across many files; `frontend/node_modules/` contained only an empty `.tmp/` directory in the worktree.
- **Fix:** Ran `cd frontend && npm ci --no-audit --no-fund --prefer-offline --legacy-peer-deps`. The `--legacy-peer-deps` was required because `@tanstack/zod-adapter@1.166.9` peer-requires `zod@^3.23.8` while the project uses `zod@^4.3.6` (pre-existing peer-conflict, unrelated to this plan).
- **Files modified:** `frontend/node_modules/` only (gitignored — no tracked file modifications).
- **Verification:** Second `npm run build` invocation completed in 11.68s with exit code 0; bundle was emitted to `frontend/dist/assets/`.
- **Committed in:** N/A — only gitignored `node_modules/` was affected; no source file change.

### Method/Disambiguation Note (NOT a Plan Deviation)

The plan asked for three grep checks. The bundle showed `useMemoCache` matches, which is a positive signal under naive interpretation but is in fact React 19's runtime dispatcher rather than compiler-emitted code. To make the verdict defensible, the executor added two confirmatory greps not strictly required by the plan:

- `grep -o ".\{40\}useMemoCache.\{40\}" dist/assets/index-DJs5eIHx.js | head -5` — to inspect surrounding context (showed dispatcher-table form, not call-site form).
- `grep -oE "[a-z]\.c\([0-9]+\)" dist/assets/index-DJs5eIHx.js` — minified compiler cache-acquire pattern; zero matches, confirming negative.

These additions strengthen the verdict's evidence base without changing the verdict or scope. They are documented in the `Disambiguation of the useMemoCache hit` paragraph in `16-PERF-BASELINE.md` so the reasoning is auditable.

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking dep install)
**Impact on plan:** None on scope. The dep install was a precondition for sub-step B and only touched gitignored paths.

## Issues Encountered

- `npm ci` failed once with `EPEERINVALID` between `@tanstack/zod-adapter@^1.166.9` (peer `zod@^3.23.8`) and the project's `zod@^4.3.6`. Resolved with `--legacy-peer-deps`. This is a pre-existing peer-conflict in `package.json` and is **not** caused or fixed by this plan; flagging it here so Phase 17 (which will wire the compiler in `vite.config.ts`) is aware that fresh `npm ci` invocations need the flag.

## Threat Flags

None. This plan only added a markdown document under `.planning/` and ran read-only inspection (one local build + read-only greps). No new network endpoint, auth path, file-access pattern, or schema change. Threat register from the plan (`T-16-02-01`..`T-16-02-07`, all `accept`) holds.

## Next Phase Readiness

- **For 16-03:** baseline doc exists with the four `_Status: pending — 16-03._` sections in place. 16-03 only edits in place (no creation step needed). Profiling Runbook, Baseline Measurements, and Hypothesis Verdict sections are the targets.
- **For 17 (useWatch refactor):** binary fact established — compiler is INACTIVE, so Phase 17 must wire `babel-plugin-react-compiler` into `vite.config.ts` as its first sub-task. Any post-Phase-17 measurement against post-Phase-21 must be on the same compiler regime.
- **Note for any future fresh-clone executor:** `npm ci` requires `--legacy-peer-deps` due to the `zod`/`@tanstack/zod-adapter` peer-conflict described above.

## Self-Check: PASSED

Verified all claimed artifacts exist:

```
test -f .planning/phases/16-baseline-profiling/16-PERF-BASELINE.md
  → FOUND
git log --oneline | grep -q "af7b0cf"
  → FOUND: af7b0cf docs(16-02): scaffold 16-PERF-BASELINE with compiler INACTIVE verdict
git diff --stat frontend/vite.config.ts
  → empty (no modifications)
git status --short frontend/src/
  → empty (no modifications)
```

All five required section headers verified present in `16-PERF-BASELINE.md`:
- `## Compiler Verification` — FOUND
- `## Profiling Runbook` — FOUND
- `## Baseline Measurements` — FOUND
- `## Hypothesis Verdict` — FOUND
- `## P19 → P20 Gate Threshold` — FOUND

Verdict line `Verdict: INACTIVE` — FOUND. Placeholder count = 1 (the legitimate `<n>` inside a regex code-pattern description, not a `<…>` template hole; well under the plan's threshold of 12).

---
*Phase: 16-baseline-profiling*
*Completed: 2026-05-05*
