# Phase 19 — Performance Comparison

**Phase:** 19 — Scope & Debounce Duplicate Check
**Milestone:** v1.5 Import Transactions Performance
**Captured:** 2026-05-07
**Build:** Vite dev server via `cd frontend && just profile` (same recipe as Phases 16/17/18)
**Browser:** Chrome + React DevTools (extension version `version: 5`)
**Fixture:** `frontend/scripts/genImportFixture.ts` (deterministic, mulberry32 SEED=0x16ba5e1e, 100 rows)
**Compiler regime:** INACTIVE in P16/P17/P18/P19 (still skipped per locked decisions)

## Comparison Sources

| Stage | Raw exports |
|-------|-------------|
| P16 baseline | `frontend/profilling/cenario_{1..4}.json` |
| P17 (post-useWatch) | `frontend/profilling/p17_cenario_{1..4}.json` |
| P18 (post-store + options + ref-callback fix) | numbers captured in `18-PERF-COMPARISON.md` |
| P19 (post-row-watch narrowing + duplicate-check enable gating) | `frontend/profilling/p18_cenario_{1..4}.json` (user overwrote the P18 files in place — filename retains the older prefix; the contents are the P19 measurements) |

**Naming caveat:** during P19 the user re-recorded the 4 cenários on top of the existing `p18_cenario_*.json` files. The on-disk files now contain P19 data; the P18 numbers used here come from the locked snapshot already in `18-PERF-COMPARISON.md`. Future phases should land their captures under a fresh prefix (`p19b_*` or `p20_*`) to avoid further name/content drift.

## Headline Results

| # | Scenario                              | P16 ms | P17 ms | P18 ms | P19 ms | P16→P19 speedup |
|---|---------------------------------------|-------:|-------:|-------:|-------:|----------------:|
| 1 | Description keystroke (row 50)        |    761 |    2.9 |    3.7 |   **3.5** |   **218×** |
| 2 | Amount keystroke (row 50)             |    929 |   62.5 |   64.4 |   **5.6** |   **166×** |
| 3 | Checkbox toggle (row 50)              |    791 |  613.4 |  183.9 | **169.9** |   **4.7×** |
| 4 | Shift-click row select (rows 0..50)   |    720 |  622.2 |  455.3 | **466.4** |   **1.5×** |

| # | Scenario                  | P18 fibers | P19 fibers |
|---|---------------------------|-----------:|-----------:|
| 1 | Description keystroke     |         13 |         13 |
| 2 | Amount keystroke          |        401 |     **15** |
| 3 | Checkbox toggle           |      2 936 |      2 937 |
| 4 | Shift-click row select    |     20 992 |     21 041 |

| # | Scenario                  | P18 ImportReviewRow re-rendered | **P19 ImportReviewRow re-rendered** |
|---|---------------------------|---------------------------------:|------------------------------------:|
| 1 | Description keystroke     |                                0 |                          **0** |
| 2 | Amount keystroke          |                                1 |                          **0** ← row no longer subscribes to amount |
| 3 | Checkbox toggle           |                                1 |                          **1** |
| 4 | Shift-click row select    |                               49 |                         **49** |

## Updater List Diff

| # | Scenario                | P18 updaters                                      | **P19 updaters**                                      |
|---|-------------------------|---------------------------------------------------|-------------------------------------------------------|
| 1 | Description keystroke   | `Controller`                                      | `Controller`                                          |
| 2 | Amount keystroke        | `Controller`, `ImportReviewRow2`                  | `Controller`, **`RowDuplicateCheck`**                 |
| 3 | Checkbox toggle         | `ImportReviewRow2`, `ImportTransactionsPage`     | `ImportReviewRow2`, `ImportTransactionsPage`         |
| 4 | Shift-click             | 49× `ImportReviewRow2`, `ImportTransactionsPage` | 49× `ImportReviewRow2`, `ImportTransactionsPage`     |

**Reading the cenário 2 diff:**
- P18 had `Controller` (RHF, owns the amount input) + **`ImportReviewRow2`** (the row itself re-rendering because its outer `useWatch` watched `amount`).
- P19 has `Controller` + **`RowDuplicateCheck`** (the new null-rendering sub-component that owns the date/amount subscription).
- The row outer no longer appears as updater on amount keystrokes — exactly the goal. The 6 Mantine `Select`s, DatePickerInput, Boxes, Inputs etc. inside the row now stay completely silent on amount edits.

## Per-scenario notes

### Scenario 1 — Description keystroke (P19: 3.5 ms)

Identical to P18 (within ±0.2 ms noise). Description keystroke goes through its own RHF `Controller`; nothing in P19 affects this path. Stays well below the 16 ms perceptual gate. ✓

### Scenario 2 — Amount keystroke (P19: 5.6 ms) — **the win**

The phase's headline result. P18 was 64.4 ms because the row's outer `useWatch` subscribed to `amount` (and `date`). On a single keystroke, that triggered the row's entire Mantine subtree (3× Select, DatePickerInput, OptionsDropdown × 3, Box × ~95) to re-execute — ~45 ms of self-time across Mantine internals.

P19's row-watch narrowing extracts a `<RowDuplicateCheck>` sub-component (returns `null`, no DOM) that subscribes to `[date, amount, action]` internally. The row outer drops `date` and `amount` from its `useWatch` array (was 10 fields, now 8). Result:

- Row outer NOT in updater list
- Only `Controller` (legitimate, owns the input value) + `RowDuplicateCheck` (returns null)
- Total fibers in commit: 401 → **15**
- Commit duration: 64.4 ms → **5.6 ms** (11.5× faster vs P18, 166× vs P16)
- **Below the 16 ms gate**

### Scenario 3 — Checkbox toggle (P19: 169.9 ms)

Marginal change vs P18 (-7.6%, within noise). The single toggled row + page-cardinality subscriber still re-render. Total cost is dominated by Mantine internals of the one row. P19 doesn't address this axis.

### Scenario 4 — Shift-click 0..50 (P19: 466.4 ms)

Flat vs P18 (+2.4%, within noise). 49 rows legitimately need to flip selection state — that's real work, not waste. P19 doesn't address this axis either; further reductions would need either virtualization (P20) or a row-internal optimization that lets selected-state changes bail out of Mantine `Select.data` reconciliation.

## P19 SC verification

ROADMAP P19 success criteria:
1. **`enabled: action === 'import'` gating** — ✓ added to `useDuplicateTransactionCheck`. `RowDuplicateCheck` passes `enabled: action === 'import'` so skip/duplicate rows short-circuit before any backend call.
2. **Debounce 200–300ms** — kept at 500ms (existing). The roadmap figure was outdated; 500ms is more conservative and the actual cenário 2 cost was structural row re-render, not network burst. Documented in CONTEXT under "Hook signature change".
3. **500-row CSV doesn't burst duplicate-check calls** — covered by existing 500ms debounce + new enabled gating. Not re-verified at 500 rows here (system hard limit is 100).
4. **Detection still correct E2E** — needs the user's manual smoke test (edit amount → verify duplicate flip; mark "skip" → verify no network call). E2E import specs were not re-run as part of this analysis; a future re-run should confirm.

## P19 → P20 Gate Decision

Per `16-PERF-BASELINE.md`:
> If the 100-row fixture is fluid after Phase 19 (description-keystroke commit duration < ~16ms, no perceptible lag), Phase 20 is **skipped or downsized** at the orchestrator's call.

**Gate met for keystroke axes:**
- Description keystroke: 3.5 ms ✓
- Amount keystroke: 5.6 ms ✓ (this was the hard one)

**Above the gate, but not laggy in practice:**
- Checkbox toggle: 169.9 ms — single click on row 50; 99/100 rows correctly bail. Cost is the toggled row's deep Mantine subtree. Halved for prod estimate (~85 ms) is in the perceptible range but not laggy.
- Shift-click 0..50: 466.4 ms — 49 rows actually changing state, no waste. Halved (~230 ms) for a multi-row select is noticeable but not blocking.

**Recommendation: SKIP Phase 20** (virtualization).
- The 100-row hard limit caps DOM weight regardless of virtualization
- Cenários 1 & 2 are already fluid
- Cenários 3 & 4 are "real work" costs — virtualization would only help if rows OUTSIDE the viewport dominated cost, which they don't here (memo bails are working)
- Phase 21 (verification + e2e coverage) absorbs the wrap-up work

The orchestrator (the user) can override this if they have UX evidence that 170 ms toggle / 466 ms shift-click is unacceptable.

## Compiler Regime Note

P16/P17/P18/P19 all on compiler-INACTIVE regime. Every delta in this document is attributable to manual refactor. Wiring `babel-plugin-react-compiler` remains a clean follow-up if needed (would isolate cleanly on top of these numbers).

## Commit anchor

- P19 implementation: `253acd3`
- P19 profiler exports (committed by user, overwriting `p18_cenario_*.json` filenames): latest commit on `claude/optimize-import-performance-ouNOx` containing the new `frontend/profilling/p18_cenario_{1..4}.json` content
