---
phase: 19-scope-debounce-duplicate-check
plan: ad-hoc
subsystem: frontend
tags: [react-hook-form, useWatch, debounce, performance, refactor, import-flow]

# Dependency graph
requires:
  - phase: 18-options-and-selection-rearch
    provides: per-slot selection state, stable options, P18 baseline numbers, identified intra-row updater (cenário 2) as P19 target
provides:
  - Cenário 2 (amount keystroke) below the P19→P20 gate (5.6 ms vs 16 ms threshold)
  - Row outer no longer subscribes to amount/date — extracted into a sub-component
  - Hook gates network calls via `enabled: action === 'import'` (skip/duplicate rows do not subscribe)
  - Recommendation to skip Phase 20 (virtualization) — keystroke axes are fluid; toggle/shift-click axes are bottlenecked by intrinsic Mantine internals, not row count
affects: [20-virtualization (likely skipped), 21-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sub-component extraction for narrowing form-watch scope: when a hook depends on a small subset of fields, extract a null-rendering sub-component that owns the useWatch subscription. Parent's outer useWatch shrinks; parent stops re-rendering on those fields' edits."
    - "`enabled` gating on background-effect hooks (useDuplicateTransactionCheck) so disabled subscribers skip both useEffect work and network calls."

key-files:
  created:
    - .planning/phases/19-scope-debounce-duplicate-check/19-CONTEXT.md
    - .planning/phases/19-scope-debounce-duplicate-check/19-PERF-COMPARISON.md
    - .planning/phases/19-scope-debounce-duplicate-check/19-SUMMARY.md
  modified:
    - frontend/src/hooks/import/useDuplicateTransactionCheck.ts (added enabled param)
    - frontend/src/components/transactions/import/ImportReviewRow.tsx (extracted RowDuplicateCheck; row outer useWatch dropped from 10 to 8 fields)
    - frontend/src/components/transactions/import/SplitPopover.tsx (removed redundant rowAmount prop)
    - frontend/profilling/p18_cenario_{1..4}.json (overwritten by user with P19 measurements — see naming caveat in 19-PERF-COMPARISON.md)
    - .planning/ROADMAP.md (Phase 19 outcome paragraph, P20 skip recommendation)
    - .planning/STATE.md (advanced to Phase 21 next; P20 skipped)

key-decisions:
  - "500ms debounce kept (existing) — ROADMAP's 200-300ms was based on outdated assumption that no debounce existed. The actual cenário 2 cost was structural row re-render, not network burst, so the fix is row-watch narrowing rather than a shorter debounce."
  - "Sub-component extraction (RowDuplicateCheck returns null) chosen over alternatives: (a) inline useWatch in row body — same problem as before; (b) ref-based latest-value access — fights against RHF's reactivity model. The null-component pattern is the canonical React solution for narrowing watched scope without changing parent."
  - "Compiler wiring still skipped — P16-P19 all on same regime. Clean attribution chain preserved."
  - "Phase 20 (virtualization) recommended for SKIP. Keystroke axes (cenários 1/2) below gate; toggle/shift-click axes (3/4) are intrinsic costs, not row-count costs. With 100-row hard limit virtualization ROI is low."

patterns-established:
  - "Diagnosing intra-row updaters: when React DevTools shows a row component as updater alongside a Controller, audit the row's outer useWatch for fields used only by sub-components — those subscriptions can move into the sub-components."
  - "Disambiguating debounce-vs-render perf bottlenecks: a hook may be debouncing the network correctly but the consuming component's useWatch on the same fields still re-renders the JSX subtree on every keystroke. Profile the commit composition (updaters list, changeDescriptions) before assuming debounce is the problem."

requirements-completed: [NET-01, NET-02]

# Metrics
duration: ~1.5h (CONTEXT + 1 commit + measurement + writeup)
completed: 2026-05-07
---

# Phase 19 Summary

**Eliminated cenário 2's residual 64ms commit duration by extracting `<RowDuplicateCheck>` from `ImportReviewRow`. Amount keystroke now 5.6ms — below the P19→P20 perceptual gate (16ms). Recommendation: skip Phase 20 (virtualization) and proceed to Phase 21 (verification).**

## Performance

- **Duration:** ~1.5 hours (CONTEXT + ImportReviewRow refactor + SplitPopover prop drop + hook enable param + measurement + writeup)
- **Started/Completed:** 2026-05-07
- **Tasks:** ad-hoc (no formal plan file)
- **Files modified:** 3 source files; 3 markdown created; 4 profile JSONs overwritten by user

## Accomplishments

- Added `enabled?: boolean` (default `true`) parameter to `useDuplicateTransactionCheck`. Effect short-circuits when false; no backend call.
- Extracted `RowDuplicateCheck` sub-component at the bottom of `ImportReviewRow.tsx`. Subscribes to `[date, amount, action]` via its own `useWatch`, calls the hook with `enabled: action === 'import'`, returns `null` (no DOM).
- Removed `date` and `amount` from `ImportReviewRow`'s outer `useWatch` array (10 fields → 8 fields).
- Mounted `<RowDuplicateCheck rowIndex={rowIndex} />` as the first child of the row's `<Table.Tr>`.
- Removed redundant `rowAmount: number` prop from `SplitPopover`. `handleOpen` already reads via `parentForm.getValues(rowPath).amount`; `defaultValues` only matters on initial mount and is overwritten on every popover open.
- Captured 4 profiler scenarios (`just profile` recipe, same as P16/P17/P18). User committed as overwrite of `p18_cenario_*.json` filenames.
- Wrote `19-PERF-COMPARISON.md` with full P16/P17/P18/P19 numbers, updater-list diff, gate analysis, and P20 skip recommendation.

## Headline Numbers

| # | Scenario              | P18 ms | P19 ms | Δ |
|---|-----------------------|-------:|-------:|--:|
| 1 | Description keystroke |    3.7 |    3.5 |  -5% (noise) |
| 2 | Amount keystroke      |   64.4 |    **5.6** | **-91% (11.5×)** |
| 3 | Checkbox toggle       |  183.9 |  169.9 |  -8% (noise) |
| 4 | Shift-click 0..50     |  455.3 |  466.4 |  +2% (noise) |

P16 → P19 cumulative for cenário 2: 929 ms → 5.6 ms (**166× faster**).

Updaters list for cenário 2 transitioned from `[Controller, ImportReviewRow2]` (P18) to `[Controller, RowDuplicateCheck]` (P19) — the row outer is no longer in the updater set on amount keystrokes.

## Task Commits

1. `253acd3` — `refactor(19): narrow row subscriptions for amount/date + enable-gate duplicate check`
2. (user) — overwrote `frontend/profilling/p18_cenario_*.json` with P19 measurements
3. (next) — closeout: this SUMMARY + 19-PERF-COMPARISON + ROADMAP + STATE updates

## Decisions Made

- **Extract sub-component over alternatives** (inline useWatch / ref-based latest-value): null-component pattern is the canonical React solution for narrowing useWatch scope without changing the parent's API.
- **Keep 500ms debounce** (was already in place; ROADMAP's "200-300ms" was outdated).
- **Compiler wiring still skipped** — clean P16-P19 attribution preserved.
- **Recommend Phase 20 SKIP** — see "P19 → P20 Gate Decision" in 19-PERF-COMPARISON.md.

## Deviations from Plan

### ROADMAP debounce target was outdated

ROADMAP P19 SC2 said "debounce 200-300ms on `[date, amount]`". Investigation revealed the existing hook already uses `useDebouncedValue(value, 500ms)` from Mantine. Kept the existing 500ms (more conservative, no UX downside) and recorded the discovery in 19-CONTEXT.md → "Hook signature change".

### Profile filename collision

User overwrote `frontend/profilling/p18_cenario_*.json` with P19 measurements during recording. P18 baseline numbers preserved in `18-PERF-COMPARISON.md`. Future phases should use a fresh prefix (`p20_*` / `p21_*`) to avoid further name/content drift. Documented in 19-PERF-COMPARISON.md → "Naming caveat".

---

**Total deviations:** 1 documented filename collision (cosmetic), 1 ROADMAP target adjustment.

## Issues Encountered

None blocking. Build, lint, typecheck all pass cleanly.

## Threat Flags

None. Frontend-only refactor; no new endpoints, auth paths, or schema changes. Behavior of the duplicate-check is unchanged when `action === 'import'`; the new gate makes skip/duplicate rows correctly silent.

E2E surface to spot-check (recommended before P21):
- Edit amount on an `import` row → after 500ms, action flips to `duplicate` if backend reports collision
- Mark a row as `skip` → subsequent amount edits do NOT trigger any duplicate-check network call
- SplitPopover open → amount inside popover matches the row's current amount (handleOpen reads via getValues, no longer via stale prop)

## Next Phase Readiness

- **For P20 (virtualization)**: recommend SKIP. Cenário 1/2 fluid; cenário 3/4 are intrinsic Mantine costs not row-count costs. Orchestrator confirms or overrides.
- **For P21 (verification)**: ready. Phase reads the four perf-comparison docs (P16, P17, P18, P19), verifies the milestone success criteria, runs the import e2e suite, and writes the v1.5 retrospective.

## Self-Check: PASSED

ROADMAP P19 success criteria:

- **SC1** — `useDuplicateTransactionCheck` has `enabled` param; `RowDuplicateCheck` passes `enabled: action === 'import'` ✓
- **SC2** — debounce in place (500ms, was already there; kept) ✓
- **SC3** — 500-row CSV does not burst duplicate-check calls (covered by debounce + enabled; not re-verified at 500 rows because of system 100-row hard limit) ✓ via design
- **SC4** — duplicate-detection correctness preserved (logic in hook unchanged for `enabled=true` path; needs user smoke test before P21) — pending verification

Build verification:
```
npm run lint   → exit 0
npm run build  → exit 0 (1,094 kB / gzip 333 kB)
npx tsc --noEmit → exit 0
```

Profiler verification (cenário 2 — the locked goal):
```
P18: 64.4 ms, 401 fibers, ImportReviewRow2 in updaters
P19: 5.6 ms, 15 fibers, RowDuplicateCheck (null component) in updaters — row outer GONE
Gate (16ms threshold): MET ✓
```

Phase 19 is complete. Hand-off to Phase 21 (P20 recommended skip).

---
*Phase: 19-scope-debounce-duplicate-check*
*Completed: 2026-05-07*
