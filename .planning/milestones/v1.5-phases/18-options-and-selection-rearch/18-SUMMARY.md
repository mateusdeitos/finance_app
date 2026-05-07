---
phase: 18-options-and-selection-rearch
plan: ad-hoc
subsystem: frontend
tags: [zustand, react-memo, tanstack-query, performance, refactor, import-flow]

# Dependency graph
requires:
  - phase: 17-eliminate-page-usewatch-cascade
    provides: page-level useWatch cascade eliminated for keystrokes; baseline numbers (P17) for comparison; same just profile recipe
provides:
  - Selection cascade eliminated for cenários 3 & 4 (single-row toggle re-renders only the toggled row)
  - Shift-click range expansion re-renders exactly the rows that flipped state (no over-rendering)
  - Stable Mantine Select.data references via `useCategoryOptions`/`useAccountOptions`/`useSharedAccounts`
  - selectionStore (Zustand) keyed by field.id, eliminating a latent index-shift bug in handleRemoveSelected
  - 18-PERF-COMPARISON.md with full P16 → P17 → P18 numbers per scenario
  - Documentation of the React.memo + forwardRef ref-callback gotcha (root cause of P18 v1 measurement)
affects: [19-debounce-duplicate-check, 20-virtualization, 21-perf-comparison]

# Tech tracking
tech-stack:
  added: ["zustand@^5.0.13"]
  patterns:
    - "Colocated Zustand store per feature (selectionStore.ts in import/)"
    - "Per-slot subscription via Zustand selectors: `useStore(s => s.selected.has(fieldId))` so only the affected row re-renders"
    - "Top-level select functions for TanStack Query select callbacks ensure stable function identity across renders"
    - "useMemo over useFieldArray.fields for stable per-index ref callbacks (keeps React.memo effective)"

key-files:
  created:
    - frontend/src/components/transactions/import/selectionStore.ts
    - frontend/src/hooks/import/useImportOptions.ts
    - frontend/profilling/p18_cenario_{1..4}.json (committed by user — final post-fix recordings)
    - .planning/phases/18-options-and-selection-rearch/18-CONTEXT.md
    - .planning/phases/18-options-and-selection-rearch/18-PERF-COMPARISON.md
    - .planning/phases/18-options-and-selection-rearch/18-SUMMARY.md
  modified:
    - frontend/package.json (+ zustand@^5.0.13)
    - frontend/src/pages/ImportTransactionsPage.tsx (selection store integration; useMemo'd ref callbacks; bulk handlers iterate fields)
    - frontend/src/components/transactions/import/ImportReviewRow.tsx (consumes new option hooks; reads selection from store via fieldId; +fieldId/-selected prop)
    - .planning/ROADMAP.md (P18 scope expanded; SC4 typo fix)

key-decisions:
  - "Library: Zustand@^5.0.13 (~1.5 kB gzipped). User-approved 2026-05-07 over zero-dep useSyncExternalStore alternative."
  - "Selection keyed by field.id (stable from useFieldArray), NOT row index. Fixes a latent bug where index-based selection would have stale entries after handleRemoveSelected if the post-action clear were ever removed."
  - "ESLint disable for react-hooks/preserve-manual-memoization on the rowRefCallbacks useMemo. The rule is conservative; pattern is necessary for React.memo to bail correctly. Scoped comment explains rationale."
  - "Compiler wiring still SKIPPED. P16/P17/P18 all on compiler-INACTIVE regime; deltas attributable to refactor only."
  - "Cenário 2's intra-row updater (`ImportReviewRow2` alongside Controller) is NOT addressed by option memoization. Likely cause: useDuplicateTransactionCheck subscribing to [date, amount]. Confirmed scope of Phase 19."

patterns-established:
  - "When options/data passed to Mantine Select/Combobox come from queries, derive them inside a TanStack Query select callback with a top-level (file-scope) const function. Compose the result in a domain hook (useCategoryOptions, useAccountOptions, useSharedAccounts)."
  - "When migrating a useState-based collection to a store, key the store by a stable identifier (field.id, entity uuid) — not by array index. Indices shift; ids don't."
  - "After installing React.memo, audit forwarded refs and callback props for inline arrows in parent map iterations. A new ref function per render breaks memo silently and the React DevTools `changeDescriptions` reason 'props=[\"ref\"]' is the diagnostic giveaway."
  - "Page-level state subscriptions (e.g., subscribing to size of a Set) cause page re-renders, but with properly memoized children that's bounded — the page function executes once, header/toolbar derive booleans, children bail."

requirements-completed: [RR-03, RR-04]

# Metrics
duration: ~3h (CONTEXT + 2 commits + ref-callback debug cycle + lint fix + writeup)
completed: 2026-05-07
---

# Phase 18 Summary

**Eliminated the row-selection cascade. Cenário 3 (single checkbox toggle): 791 ms → 183.9 ms (4.3× faster) with only the toggled row re-rendering instead of all 100. Cenário 4 (shift-click 0..50): 720 ms → 455.3 ms with 49 rows re-rendering — the actual rows that changed. Cenário 2 keystroke unchanged (intra-row updater is P19 territory).**

## Performance

- **Duration:** ~3 hours (CONTEXT draft + first refactor + measurement + ref-callback bug discovery + fix + lint cleanup + final measurement + writeup)
- **Started:** 2026-05-07
- **Completed:** 2026-05-07
- **Tasks:** ad-hoc (no formal plan file)
- **Files modified:** 4 source files; 3 created (store + hook + perf-comparison)

## Accomplishments

- Added `zustand@^5.0.13` as dependency (~1.5 kB gzipped contribution to bundle).
- Created `frontend/src/components/transactions/import/selectionStore.ts`: Zustand store keyed by `field.id` (string), with actions `toggle(rowIndex, shiftKey, fieldIds)`, `selectAll(fieldIds)`, `clear()`. Shift-click range-fill logic preserved inside the `toggle` action.
- Created `frontend/src/hooks/import/useImportOptions.ts`: `useCategoryOptions`, `useAccountOptions`, `useSharedAccounts` — each backed by a top-level select function passed to the existing `useFlattenCategories`/`useAccounts` query hooks. Stable function identities ensure TanStack Query's per-subscriber memoization works.
- Refactored `ImportTransactionsPage.tsx`:
  - Removed `useState<Set<number>>(selected)`; subscriptions now via `useSelectionStore`.
  - Bulk handlers (`handleBulkSet*`, `handleRemoveSelected`) iterate `fields` and check store membership.
  - `handleToggleSelect` is `useCallback([toggleSelection, fields])` — stable for the common toggle path; only re-creates on row add/remove.
  - Per-row ref callbacks now memoized via `useMemo([fields])` instead of inline arrow per `fields.map` iteration. **This was the critical fix** that unblocked `React.memo`.
- Refactored `ImportReviewRow.tsx`:
  - Consumes new option hooks instead of inline `categories.map`/`accounts.map`/`accounts.filter`.
  - Subscribes to its own slot via `useSelectionStore(s => s.selected.has(fieldId))`.
  - Props change: removed `selected: boolean`; added `fieldId: string`. Net prop count unchanged.
- Updated `ROADMAP.md` Phase 18: scope expanded from "options only" to "options + selection rearch"; SC4 200-row → 100-row typo fixed.
- Captured 4 post-refactor profiler scenarios; user committed under `frontend/profilling/p18_cenario_{1..4}.json`.
- Wrote `18-PERF-COMPARISON.md` with full P16 → P17 → P18 numbers, updater-list diff, and per-scenario notes.

## Headline Numbers

| # | Scenario              | P16 ms | P17 ms | P18 ms | P16→P18 speedup | Rows actually re-rendering (P18) |
|---|-----------------------|-------:|-------:|-------:|----------------:|---------------------------------:|
| 1 | Description keystroke |    761 |    2.9 |    3.7 |  **206×**       |  0 |
| 2 | Amount keystroke      |    929 |   62.5 |   64.4 |   **14×**       |  1 |
| 3 | Checkbox toggle       |    791 |  613.4 |  183.9 |  **4.3×**       |  **1** (the toggled row) |
| 4 | Shift-click 0..50     |    720 |  622.2 |  455.3 |  **1.6×**       |  **49** (the rows that flipped) |

Composition is now correct: every scenario re-renders exactly the rows that changed, plus the page-level cardinality subscriber. No more cascade.

## Task Commits

1. `4a0cc6d` — `docs(17): draft Phase 17 CONTEXT` (P17 setup; included for context)
2. `681603f` — `refactor(18): memoize Select options + rearch row selection via Zustand` (P18 v1 — initial implementation)
3. `4fee0ff` — `fix(18): stabilize ImportReviewRow ref callback to unblock React.memo` (P18 v2 — ref-callback gotcha fix)
4. `299f753` — `fix(18): satisfy react-hooks lint rules for ref callbacks` (lint cleanup)
5. (next) — final commit with `18-PERF-COMPARISON.md` + `18-SUMMARY.md` + ROADMAP/STATE updates

## Decisions Made

- **Zustand for state**: chosen over `useSyncExternalStore` + custom EventEmitter for ergonomics and code-review clarity. ~1.5 kB cost.
- **Field-id keying**: selection store uses `field.id` (stable from `useFieldArray`) instead of row index. Eliminates a latent bug after row removals.
- **Compiler wiring still skipped**: maintains the clean P16/P17/P18 attribution chain. Wiring becomes its own follow-up phase if needed.
- **Out-of-scope items deferred to P19**:
  - Cenário 2's intra-row updater (likely `useDuplicateTransactionCheck`)
  - Bulk-action perf (currently iterates `fields` linearly; not measured as a cenário but should regress sanely)

## Deviations from Plan

### P18 v1 incorrect measurement → P18 v2 (final)

The first profiler capture showed cenários 3 & 4 still cascading through all 200 `ImportReviewRow2` instances. Initial diagnosis pointed at the Zustand subscription. Deeper analysis of `changeDescriptions` revealed `props=['ref']` as the change reason for 199 of 200 rows — the inline `ref={(el) => rowRefs.current.set(i, el)}` callback was a fresh function identity per page render, breaking `React.memo`'s prop comparison.

The fix replaced the inline arrow with a memoized array of per-index callbacks (`useMemo([fields])`). After the fix, the architecture works as originally designed.

This is documented in detail in `18-PERF-COMPARISON.md` → "P18 v1 → P18 v2: the ref-callback gotcha". Treated as a deviation worth recording (lesson for future memo-wrapped row patterns).

### `react-hooks/preserve-manual-memoization` lint disable

The React Compiler's pre-flight lint rule flagged the `useMemo` for `rowRefCallbacks`. Pattern is correct and necessary — disabled with a scoped comment. Recorded here so a future compiler-wiring phase doesn't accidentally remove the disable.

### `npm run lint` actually works now

P16-02-SUMMARY noted `npm run lint` failed with `Cannot find package '@eslint/js'`. After P18's `npm ci --legacy-peer-deps` installation, the issue resolved itself (likely the dep was added transitively at some point). The `16/deferred-items.md` entry can be marked obsolete; tracked here.

---

**Total deviations:** 1 measurement do-over (ref-callback gotcha), 1 scoped lint disable, 1 unrelated infra resolution.

## Issues Encountered

- **Ref-callback identity instability** — described above. The diagnostic signal (React DevTools `changeDescriptions` showing `props=['ref']`) is the canonical way to detect it. Worth pattern-establishing for v1.6+ work.
- **Lint rule false positives**: `react-hooks/preserve-manual-memoization` is overly strict for pre-Compiler manually-memoized patterns. Disable with explanation; revisit if the Compiler is wired in a future phase.

## Threat Flags

None. Frontend-only refactor, colocated state, no new network endpoint or auth path. Type signatures of `selectionStore` and `useImportOptions` are concrete (no `any`). No e2e regressions expected — all `data-testid` markers preserved on checkboxes and selects.

## Next Phase Readiness

- **For P19 (debounce duplicate check)**: cenário 2's intra-row updater (`ImportReviewRow2` triggered by amount keystrokes) is the remaining cost. Hypothesis: `useDuplicateTransactionCheck` at `frontend/src/hooks/import/useDuplicateTransactionCheck.ts` is firing on every `[date, amount]` change. P19's locked scope (debounce + `enabled: action === 'import'`) directly addresses this. Expected outcome: cenário 2 drops from ~64 ms to <16 ms, removing the last keystroke-axis bottleneck.
- **For P20 (virtualization)**: post-P19 re-measure; if cenários 1–3 are all under 16 ms and cenário 4 is under ~150 ms, **P20 is a clear skip** for the 100-row hard limit. The orchestrator decides post-P19 measurement.
- **For P21 (final verification)**: baseline of record advanced. P21 re-runs the 4 cenários with `just profile` against post-P19 (or post-P18 if P19 is skipped) numbers and writes the milestone-final comparison.

## Self-Check: PASSED

ROADMAP.md success criteria for Phase 18:

- **SC1** — `useFlattenCategories<T>(select?)` already exposed pre-P18, verified ✓
- **SC2** — `ImportReviewRow.tsx` consumes `useCategoryOptions()` / `useAccountOptions()`, NOT inline `categories.map` ✓ (`grep -nE "categories\.map|accounts\.map|accounts\.filter" frontend/src/components/transactions/import/ImportReviewRow.tsx` → 0)
- **SC3** — `useSharedAccounts()` returns reference-stable derivation; `accounts.filter` removed from row ✓
- **SC4** — `useState<Set<number>>` for `selected` removed from `ImportTransactionsPage`; selection state lives in `selectionStore.ts`, keyed by `field.id` ✓ (`grep -n "useState<Set<number>>" frontend/src/pages/ImportTransactionsPage.tsx` → 0)
- **SC5** — Profiler measurements:
  - Cenário 2: 62.5 ms → 64.4 ms — **NOT improved by P18** (intra-row updater is P19's domain). Recorded as a known carry-over, not a regression.
  - Cenário 3: 791 ms → 183.9 ms; only the toggled row re-renders ✓
  - Cenário 4: 720 ms → 455.3 ms; 49 rows actually re-render (matches range expansion) ✓
  - The cascade pattern is broken; SC5's intent is met.

Build verification:
```
npm run lint   → exit 0
npm run build  → exit 0 (1,093 kB / gzip 333 kB; +1.5 kB vs P17 from zustand)
npx tsc --noEmit → exit 0
```

Phase 18 is complete. Hand-off to Phase 19.

---
*Phase: 18-options-and-selection-rearch*
*Completed: 2026-05-07*
