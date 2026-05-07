# Phase 17 — Performance Comparison

**Phase:** 17 — Eliminate Page-Level useWatch Cascade
**Milestone:** v1.5 Import Transactions Performance
**Captured:** 2026-05-07
**Build:** Vite dev server via `cd frontend && just profile` (same recipe as Phase 16 for apples-to-apples comparison)
**Browser:** Chrome + React DevTools (extension version `version: 5` — same as Phase 16)
**Fixture:** `frontend/scripts/genImportFixture.ts` (deterministic, mulberry32 SEED=0x16ba5e1e, 100 rows — same as Phase 16)
**Compiler regime:** INACTIVE in both P16 and P17 (user opted to skip the wiring sub-task per CONTEXT.md → Order of operations)

## Comparison Sources

| Stage | Raw exports |
|-------|-------------|
| P16 baseline (pre-refactor) | `frontend/profilling/cenario_{1..4}.json` |
| P17 after (post-refactor) | `frontend/profilling/p17_cenario_{1..4}.json` |

All numbers are read from the **largest commit** in each scenario's recording (the user-action commit). Small commits at the start of each recording (≤2 ms, 7–11 fibers) are React's own state-settling traffic and are excluded.

Values are **raw dev-mode** (StrictMode 2× in effect; HMR overhead included). The same caveats and recipe were used for P16 — so the comparison is internally consistent. Divide by ~2 for a rough production estimate.

## Headline Results

| # | Scenario                              | P16 ms | P17 ms | Δ ms        | Δ %       | Speedup |
|---|---------------------------------------|-------:|-------:|------------:|----------:|--------:|
| 1 | Description keystroke (row 50)        |    761 |  **2.9** |   -758.1 |  **-99.6%** | **262×** |
| 2 | Amount keystroke (row 50)             |    929 |   **62.5** |   -866.7 |  **-93.3%** |  **15×** |
| 3 | Checkbox toggle (row 50)              |    791 |    613.4 |   -177.6 |    -22.5% |   1.3× |
| 4 | Shift-click row select (rows 0..50)   |    720 |    622.2 |    -97.8 |    -13.6% |   1.2× |

| # | Scenario                              | P16 fibers | P17 fibers | Δ fibers   | Δ %         |
|---|---------------------------------------|-----------:|-----------:|-----------:|------------:|
| 1 | Description keystroke                 |     40 288 |       **13** | -40 275 | **-99.97%** |
| 2 | Amount keystroke                      |     40 288 |      **401** | -39 887 |  **-99.0%** |
| 3 | Checkbox toggle                       |     40 287 |     40 287 |          0 |       0.0%  |
| 4 | Shift-click row select                |     40 287 |     40 287 |          0 |       0.0%  |

| # | Scenario                              | P16 rows re-rendered | P17 rows re-rendered |
|---|---------------------------------------|---------------------:|---------------------:|
| 1 | Description keystroke                 |        200 (100×2)   |             **0** (not in render set) |
| 2 | Amount keystroke                      |        200 (100×2)   |             **1** (only the edited row) |
| 3 | Checkbox toggle                       |        200 (100×2)   |        200 (100×2)   |
| 4 | Shift-click row select                |        200 (100×2)   |        200 (100×2)   |

## Updater List Diff (the verdict-decisive evidence)

The React DevTools Profiler `updaters` field tells us **which component was the source of the update** for each commit. Phase 17's success criterion (SC4) is "`ImportTransactionsPage` does NOT re-render on a single description keystroke in any row" — i.e., it must be absent from the `updaters` list for keystroke scenarios.

| # | Scenario                | P16 updaters                                              | P17 updaters                              | SC4 verdict for this scenario |
|---|-------------------------|-----------------------------------------------------------|-------------------------------------------|-------------------------------|
| 1 | Description keystroke   | `Controller` (RHF), **`ImportTransactionsPage`**          | `Controller` (RHF only)                   | **PASS** — page gone |
| 2 | Amount keystroke        | `Controller`, `ImportReviewRow2`, **`ImportTransactionsPage`** | `Controller`, `ImportReviewRow2`     | **PASS** — page gone |
| 3 | Checkbox toggle         | `ImportTransactionsPage` (only)                           | `ImportTransactionsPage` (only)           | **OUT OF SCOPE** — caused by `setSelected`, deferred to P18/P19 |
| 4 | Shift-click row select  | `ImportTransactionsPage` (only)                           | `ImportTransactionsPage` (only)           | **OUT OF SCOPE** — same `setSelected` cascade |

## Per-scenario notes

### Scenario 1 — Description keystroke (P16: 761 ms / P17: 2.9 ms)

The most extreme delta. P17's commit re-renders **13 fibers** (the RHF `Controller` and its immediate descendants for the focused input). `ImportTransactionsPage` is not in the render set at all — the page-level cascade is fully eliminated. This is the canonical case the P16 hypothesis predicted, and it landed cleanly.

Even at raw dev with StrictMode 2×, 2.9 ms is **far below** the 16 ms perceptual threshold. The keystroke now feels immediate.

### Scenario 2 — Amount keystroke (P16: 929 ms / P17: 62.5 ms)

15× faster, with 99% fewer fibers re-rendered. `ImportTransactionsPage` is gone from the updater list. **One** `ImportReviewRow2` instance re-renders (the row containing the edited amount input) — down from 200.

`ImportReviewRow2` still appears in `updaters` alongside `Controller`. This is the deferred carry-over from P16 (`16/deferred-items.md` → "Scenario 2 lists ImportReviewRow2 as an additional updater"): there's an intra-row subscription that fires on amount keystrokes beyond the RHF `Controller` boundary. The blast radius is now 1 row, not 100, so the perf cost is acceptable. P18 audit in `ImportReviewRow.tsx` will determine whether it can be narrowed further.

The 62.5 ms is above the 16 ms gate. Likely candidates for the residual cost (deferred to P18 audit):
- Mantine `Select` / `Combobox` re-render for the row's category dropdown
- Currency-formatting work in `CurrencyInput`

### Scenario 3 — Checkbox toggle (P16: 791 ms / P17: 613.4 ms)

Marginal improvement (~22%). `ImportTransactionsPage` is **still** the only updater, and all 200 `ImportReviewRow2` instances still re-render. **Expected and out of scope** per `17-CONTEXT.md` → Refactor scope: only useWatch.

The cascade is owned by `useState<Set<number>>` for `selected` at `frontend/src/pages/ImportTransactionsPage.tsx:40` (mutated by `handleToggleSelect`). Phase 18/19 must address this — the deferred item in `16/deferred-items.md` ("Scenarios 3 & 4 are NOT caused by useWatch") covers it.

The ~22% improvement we DO see comes from the page body being slightly cheaper to render now that `toImportRows` and the inline filter at the JSX level are gone (replaced by scalars from `compute`). Each top-level re-render now does less per-pass work, even though the same fibers still get invalidated.

### Scenario 4 — Shift-click row select (P16: 720 ms / P17: 622.2 ms)

Same shape as scenario 3, same root cause, same out-of-scope verdict.

## P19 → P20 Gate Implications

Per `16/16-PERF-BASELINE.md` → P19 → P20 Gate Threshold:

> If the 100-row fixture is fluid after Phase 19 (description-keystroke commit duration < ~16ms,
> no perceptible lag), Phase 20 is **skipped or downsized** at the orchestrator's call.

P17 alone already brings description-keystroke to **2.9 ms raw dev** (≈1.5 ms prod estimate). That is **5×** below the 16 ms gate. Unless P18/P19 introduce regression, the gate is already met for the keystroke axis.

The toggle/shift-click axis (scenarios 3 & 4) is still 600+ ms raw dev. P18 (memoization / store-based selection) is the hinge for those scenarios; if P18 brings them under 16 ms too, **Phase 20 (virtualization) becomes a clear "skip"** for the v1.5 hard limit of 100 rows.

P21 should re-assess this gate against the post-P18/P19 measurements.

## Compiler Regime Note

P16 verdict was INACTIVE; P17 did NOT wire `babel-plugin-react-compiler` (user-approved scope decision per CONTEXT.md → Order of operations, option 2). Both measurements are therefore on the **same regime** — every delta above is attributable to the `useWatch` refactor alone. If a future phase wires the compiler, the post-wire measurement will isolate the compiler's contribution as a clean delta on top of these numbers.

## Commit anchor

- P17 refactor: `5c97c5f`
- P17 profiler exports committed by user: `a025431`
