# Phase 18 — Performance Comparison

**Phase:** 18 — Memoize Options + Rearch Selection
**Milestone:** v1.5 Import Transactions Performance
**Captured:** 2026-05-07
**Build:** Vite dev server via `cd frontend && just profile` (same recipe as Phases 16/17)
**Browser:** Chrome + React DevTools (extension version `version: 5`, same as Phases 16/17)
**Fixture:** `frontend/scripts/genImportFixture.ts` (deterministic, mulberry32 SEED=0x16ba5e1e, 100 rows)
**Compiler regime:** INACTIVE in P16, P17, and P18 (user opted to skip wiring across all three phases)

## Comparison Sources

| Stage | Raw exports |
|-------|-------------|
| P16 baseline (pre any refactor) | `frontend/profilling/cenario_{1..4}.json` |
| P17 (post-useWatch refactor) | `frontend/profilling/p17_cenario_{1..4}.json` |
| P18 final (post options + selection-store + ref-callback fix) | `frontend/profilling/p18_cenario_{1..4}.json` |

All numbers are read from the **largest commit** in each scenario's recording (the user-action commit). Values are **raw dev-mode** (StrictMode 2× in effect; HMR overhead included). Same recipe + caveats across all three stages — comparison is internally consistent.

## Headline Results

| # | Scenario                              | P16 ms | P17 ms | P18 ms | P16→P18 Δ % | P16→P18 speedup |
|---|---------------------------------------|-------:|-------:|-------:|------------:|----------------:|
| 1 | Description keystroke (row 50)        |    761 |    2.9 |  **3.7** |  -99.5%   |   **206×** |
| 2 | Amount keystroke (row 50)             |    929 |   62.5 |   **64.4** |  -93.1%   |    **14×** |
| 3 | Checkbox toggle (row 50)              |    791 |  613.4 |  **183.9** |  -76.7%   |   **4.3×** |
| 4 | Shift-click row select (rows 0..50)   |    720 |  622.2 |  **455.3** |  -36.8%   |   **1.6×** |

| # | Scenario                  | P16 fibers (visited) | P17 fibers | P18 fibers |
|---|---------------------------|---------------------:|-----------:|-----------:|
| 1 | Description keystroke     |               40 288 |         13 |         13 |
| 2 | Amount keystroke          |               40 288 |        401 |        401 |
| 3 | Checkbox toggle           |               40 287 |     40 287 |  **2 936** |
| 4 | Shift-click row select    |               40 287 |     40 287 | **20 992** |

| # | Scenario                  | ImportReviewRow re-rendered (P16) | (P17) | **(P18, actually executed)** |
|---|---------------------------|-----------------------------------:|------:|-----------------------------:|
| 1 | Description keystroke     |                                100 |     0 |                            **0** |
| 2 | Amount keystroke          |                                100 |     1 |                            **1** |
| 3 | Checkbox toggle           |                                100 |   100 |                            **1** |
| 4 | Shift-click row select    |                                100 |   100 |                           **49** |

The "actually executed" column is read from `changeDescriptions` (which only includes fibers that React reconciled with prop/state changes — memo bails are excluded). For P18 this is the truth-of-record.

## Updater List Diff

| # | Scenario                | P16 updaters                                                | P17 updaters                              | P18 updaters                                              |
|---|-------------------------|-------------------------------------------------------------|-------------------------------------------|-----------------------------------------------------------|
| 1 | Description keystroke   | `Controller`, `ImportTransactionsPage`                      | `Controller`                              | `Controller`                                              |
| 2 | Amount keystroke        | `Controller`, `ImportReviewRow2`, `ImportTransactionsPage` | `Controller`, `ImportReviewRow2`         | `Controller`, `ImportReviewRow2`                          |
| 3 | Checkbox toggle         | `ImportTransactionsPage`                                    | `ImportTransactionsPage`                  | `ImportReviewRow2` (id 10491), `ImportTransactionsPage`   |
| 4 | Shift-click             | `ImportTransactionsPage`                                    | `ImportTransactionsPage`                  | 49× `ImportReviewRow2`, `ImportTransactionsPage`          |

**Reading the diff:**
- P17 broke the keystroke cascade (cenários 1 & 2): page no longer in updaters; page-level useWatch gone.
- P18 broke the selection cascade (cenários 3 & 4): page is still re-rendered (it subscribes to `selected.size` via Zustand for cardinality reads — `someSelected`/`allSelected`), but the **children no longer re-render** thanks to `React.memo` finally being effective. In cenário 3 only the toggled row 50 re-renders. In cenário 4 only the 49 rows that flipped state (range expansion 0→50) re-render.

## Per-scenario notes

### Scenario 1 — Description keystroke (P18: 3.7 ms)

Identical to P17 — the page-level useWatch fix (P17) was already optimal. P18 doesn't move the needle here because there was no needle left to move. ✓

### Scenario 2 — Amount keystroke (P18: 64.4 ms)

Identical to P17. The intra-row updater (`ImportReviewRow2`) is still firing alongside `Controller` for amount edits. Option-stabilization did NOT address this. The likely culprit is `useDuplicateTransactionCheck` at `frontend/src/hooks/import/useDuplicateTransactionCheck.ts`, which subscribes to `[date, amount]` and triggers a per-keystroke duplicate-check fetch — which is exactly **Phase 19's** locked scope (debounce + `enabled: action === 'import'` gating).

P18 SC2 said "cenário 2 commit duration drops further (intra-row updater fix from option-stabilization)". This sub-criterion is **not met**. The verdict is that option-stabilization, while architecturally correct, does not address this specific updater. P19 will.

### Scenario 3 — Checkbox toggle (P18: 183.9 ms)

**The big win.** P16: 791ms with 100 rows re-rendering. P18: 183.9ms with **only the toggled row** re-rendering. The `changeDescriptions` count of 2 936 (vs 40 287 in P16/P17) reflects the deep but narrow subtree under the one row + the small page-level change.

The page itself does re-render (it subscribes to `selected.size`), and that re-render walks the row list during reconciliation — but `React.memo` correctly bails out for the 99 rows whose props haven't changed. Only row 50's slot changed (`selected.has(fieldId50)` flipped false→true), so only row 50 actually executes its render function.

Updaters list: `ImportReviewRow2` (id 10491 = the toggled row) + `ImportTransactionsPage`. Page is in the list because of its own update (cardinality), not because it's the source of a cascade. This is the correct shape.

### Scenario 4 — Shift-click row select rows 0..50 (P18: 455.3 ms)

Range expansion fills 49 rows (rows 1..49 between the anchor at row 0 and the click at row 50). All 49 rows flip from `selected.has(...)=false` to `=true`, so 49 rows legitimately need to re-render. **The cost is real work, not waste.**

Updaters list: 49× `ImportReviewRow2` + `ImportTransactionsPage`. Composition matches the action. The remaining commit duration (~9ms per row × 49 + page overhead) is the floor for this interaction without additional row-level optimizations.

If P19 narrows row-internal subscriptions further (e.g., `useDuplicateTransactionCheck` with debounce), this scenario benefits proportionally. P20 (virtualization) would also help — only the visible window of rows would be in the DOM. With the 100-row hard limit, P20 remains a "skip-or-downsize" decision per the gate in `16-PERF-BASELINE.md`.

## P18 v1 → P18 v2: the ref-callback gotcha

Initial P18 measurements (committed but discarded) showed cenários 3 & 4 still cascading through all 200 `ImportReviewRow2` instances despite the Zustand store. Investigation revealed the root cause: the inline `ref={(el) => rowRefs.current.set(i, el)}` callback in `fields.map` was a **new function reference per page render**. With `React.memo + forwardRef`, React DevTools reported `props=['ref']` as the change reason for 199 of 200 rows.

**Lesson:** the per-slot subscription pattern is correct, but `React.memo` cannot bail out if any prop (including the forwarded ref callback) is unstable. The fix was to memoize the ref callbacks per row index via `useMemo` keyed on `fields`. After the fix, the architecture works as designed.

This is committed as `4fee0ff` (initial fix) + `299f753` (lint cleanup) and is the difference between P18 v1 and P18 v2 in this document. Only P18 v2 (final) is reflected in the headline tables above.

## P19 → P20 Gate Analysis

Per `16-PERF-BASELINE.md` → "If the 100-row fixture is fluid after Phase 19 (description-keystroke commit duration < ~16ms, no perceptible lag), Phase 20 is skipped or downsized".

After P18:
- **Description keystroke: 3.7 ms** — well below the 16 ms gate. ✓
- **Amount keystroke: 64.4 ms** — above the gate. P19's debounce on the duplicate check is the locked intervention for this axis.
- **Checkbox toggle: 183.9 ms** — above the gate. The toggled-row's deep Mantine subtree is the dominant cost. Marginal improvement still possible via row-internal optimizations or `Select`/`Combobox` deferred mount, but is below the threshold of "perceptibly laggy" in real interaction. Likely acceptable for v1.5.
- **Shift-click 0..50: 455.3 ms** — above the gate. 49 rows of real work; only virtualization (P20) or further row-internal narrowing (P19) can move this.

**Recommendation for the orchestrator:** P19 stays in scope (it has a clear, narrow target — the duplicate-check). After P19 measurements, re-evaluate cenários 2/3/4. If P19 brings cenário 2 close to/under 16 ms and cenário 4 under ~150 ms, **P20 is a clear skip** for the 100-row hard limit. Otherwise, downsize P20 to a minimal `react-window` integration only on the rendered table body.

## Compiler Regime Note

P16/P17/P18 are all on compiler-INACTIVE regime. Every delta in this document is attributable to the manual refactor pipeline. If a future phase wires `babel-plugin-react-compiler`, its delta will isolate cleanly on top of these numbers.

## Commit anchor

- P18 store + options + initial implementation: `681603f`
- P18 ref-callback bug fix: `4fee0ff`
- P18 lint cleanup: `299f753`
- User-committed P18 final exports: latest commit on `claude/optimize-import-performance-ouNOx` containing `frontend/profilling/p18_cenario_{1..4}.json`
