# Phase 16 — Performance Baseline

**Phase:** 16 — Baseline Profiling & Diagnostics
**Milestone:** v1.5 Import Transactions Performance
**Captured:** 2026-05-06
**Build:** Vite dev server via `cd frontend && just profile` (`npm run dev`, port 5173). The non-minified React dev bundle is required because the production build strips profiler instrumentation. See `16-CONTEXT.md` "Addendum 2026-05-05 — REVISED COMMAND" for the rationale and the rejected `vite build --mode development` attempt.
**Browser:** Chrome + React DevTools (extension version embedded in profiler exports as `version: 5`). Raw exports committed under `frontend/profilling/cenario_{1..4}.json` — single source of truth for every number in this document.
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

Reproducible end-to-end recipe. Phase 21 **must** re-run with the same recipe (same fixture, same dev-server build, same StrictMode regime) so the before/after comparison is internally consistent. Absolute milliseconds are not directly comparable to production — see "Caveats" below.

### Prerequisites
- Chrome with the **React DevTools** extension installed.
- Repo on the branch under measurement, with no local edits to `frontend/vite.config.ts` (compiler stays unwired in P16; see `16-CONTEXT.md` → "React Compiler wiring (contingency)").
- Backend running locally (`docker-compose up` or equivalent) so the import flow can authenticate.

### Step-by-step

1. **Boot the profiling stack:**
   ```bash
   cd frontend && just profile
   ```
   This regenerates `/tmp/fixture-100.csv` from the deterministic seed (`scripts/genImportFixture.ts`) and starts `vite dev` on `http://localhost:5173/`. Confirm the printed `✓ fixture: 101 lines` and `✓ header: ...` lines.
2. **Open Chrome** at `http://localhost:5173/`, log in, and navigate to the import flow.
3. **Open DevTools → React Profiler tab**. Confirm the Profiler is enabled (no "Profiling not supported" banner). If you see the banner, you are on a production bundle — re-check step 1.
4. **Import the fixture:** trigger the file picker on the import page and select `/tmp/fixture-100.csv`. Wait until all 100 rows are visible in the review table.
5. **Scroll row 50 into view** (the locked target row, per `16-CONTEXT.md` → "Profiling scenarios").
6. **For each scenario, follow this exact recording pattern:**
   1. Focus the relevant input/control on row 50 **before** pressing Record (so focus traversal does not show up in the recording).
   2. In React DevTools, click the blue ● **Record** button.
   3. Perform the single scenario action (one keystroke / one click) — nothing else.
   4. Click ● again to stop.
   5. From the gear menu in the Profiler tab, **Save profile…** to `frontend/profilling/cenario_<N>.json`.
   6. Refresh the page and re-import the fixture before the next scenario, so each recording starts from the same clean state.
7. **The 4 locked scenarios:**
   - **Scenario 1 — Description keystroke (row 50):** focus row 50's description input, press one letter (e.g. `x`).
   - **Scenario 2 — Amount keystroke (row 50):** focus row 50's `CurrencyInput`, press one digit (e.g. `5`).
   - **Scenario 3 — Checkbox toggle (row 50):** single-click row 50's selection checkbox.
   - **Scenario 4 — Shift-click row select:** click row 0's checkbox **before** Record (to seed the anchor), start Record, then shift-click row 50's checkbox to multi-select rows 0..50.

### Caveats — read before interpreting numbers

1. **`<StrictMode>` doubles every dev render** (`frontend/src/main.tsx:14`). Commit-duration ms and rendered fiber counts are ~2× what users would feel in production. *Which* components re-render and the *relative ordering* across scenarios are NOT affected — both are sufficient to validate or refute the hypothesis.
2. **HMR + Vite dev server add runtime overhead** vs. minified production. Treat absolute ms as upper-bound estimates of pre-fix pain.
3. **Apples-to-apples for P21:** the only valid comparison is "P21 numbers from `just profile` vs. P16 numbers from `just profile`". Do not compare these against any production-build measurement.
4. The hypothesis is judged on **commit composition** (which fibers re-rendered, why they re-rendered) — not on absolute ms. The composition reading survives both caveats above.

## Baseline Measurements

All numbers below are read from the largest commit in each scenario's saved profile (`frontend/profilling/cenario_{1..4}.json`). The largest commit is the one that contains the user-action work — small commits at the start of each recording (≤2 ms, 7–11 fibers) are React's own state-settling traffic and are excluded.

Values are **raw dev-mode** (StrictMode 2× still in effect; HMR overhead included). Divide by ~2 for a rough production estimate.

| # | Scenario                              | Commit duration (ms) | Rendered components (fibers) | Page re-rendered? | All 100 rows re-rendered?       | Notes |
|---|---------------------------------------|---------------------:|-----------------------------:|-------------------|---------------------------------|-------|
| 1 | Description keystroke (row 50)        |                  761 |                       40 288 | Yes               | Yes — 200 `ImportReviewRow2` (100 × StrictMode 2×) | Updaters: `Controller` (RHF, id 7510) + `ImportTransactionsPage` (id 144). Top self-time dominated by `@mantine/core/Box` (222 ms) and per-row `Select`/`Combobox` (≈85 ms). |
| 2 | Amount keystroke (row 50)             |                929.2 |                       40 288 | Yes               | Yes — 200 `ImportReviewRow2`     | Updaters: `Controller` (RHF, id 7525) + `ImportReviewRow2` (id 7469) + `ImportTransactionsPage` (id 144). The intra-row `ImportReviewRow2` updater is **additional** to the page-level cascade — see "Secondary findings" in the Verdict. |
| 3 | Checkbox toggle (row 50)              |                  791 |                       40 287 | Yes               | Yes — 200 `ImportReviewRow2`     | **Single updater: `ImportTransactionsPage` (id 144).** Pure non-RHF state cascade — `setSelected` at `frontend/src/pages/ImportTransactionsPage.tsx:40` re-renders the entire page. |
| 4 | Shift-click row select (rows 0..50)   |                  720 |                       40 287 | Yes               | Yes — 200 `ImportReviewRow2`     | **Single updater: `ImportTransactionsPage` (id 144).** Same root cause as scenario 3: `setSelected` cascade. |

Aggregate: every scenario re-renders all 100 review rows and produces a commit of 720–929 ms (raw dev). Even halved for prod estimate, that is **~360–465 ms per single-keystroke / single-click event** — far above the 16 ms threshold required for fluid interaction.

## Hypothesis Verdict

**Verdict:** CONFIRMED — page-level `useWatch({ name: 'rows' })` is the dominant re-render trigger.

The page-level subscription `useWatch({ control: form.control, name: 'rows' })` at `frontend/src/pages/ImportTransactionsPage.tsx:70` is the dominant re-render trigger for both keystroke scenarios — and the page-level cascade pattern (`ImportTransactionsPage` as updater of every row) is reproduced even in non-RHF scenarios.

### Evidence per scenario

- **Scenarios 1 & 2 (keystrokes on row 50)** — `ImportTransactionsPage` (fiber id 144) appears in the React DevTools Profiler `updaters` list of the user-action commit, alongside the input's RHF `Controller`. The RHF `Controller` is the *expected* per-input subscriber; `ImportTransactionsPage` is the *unexpected* page-level subscriber. The only `useWatch` call at page scope that returns the full `rows` array is line 70 (the `compute`-scoped call at lines 53–60 returns scalar counts that did not change for a single keystroke and is therefore not the trigger). The page commit re-renders all 200 `ImportReviewRow2` fibers (= 100 rows × StrictMode 2×) and 40 288 fibers in total.

- **Scenarios 3 & 4 (checkbox toggle / shift-click)** — `ImportTransactionsPage` is the **only** updater. There is no RHF `Controller` involved, which rules out `useWatch` for these two cases and points to the local `useState<Set<number>>` for `selected` at `frontend/src/pages/ImportTransactionsPage.tsx:40` (mutated by `handleToggleSelect` at line 90). The same 200-row re-render fan-out is observed.

- **Top self-time aggregation across all 4 scenarios** is dominated by `@mantine/core/Box` (220–270 ms), `@mantine/core/Select`/`OptionsDropdown`/`ComboboxOption` (~85–110 ms combined), and `@mantine/core/Input*` (~30 ms). Each `ImportReviewRow` mounts a Mantine `Select` + multiple `Box`/`Input` wrappers, so page-level invalidation amplifies into a deep per-row subtree — this is why the absolute commit duration is catastrophic, not just the row count.

### Secondary findings (input for P18/P19, not blockers for P17)

These were not part of the original hypothesis but surfaced from the same profiler captures:

1. **Scenarios 3 & 4 are not caused by `useWatch`.** They are caused by the page-level `useState<Set<number>>` for `selected` (`ImportTransactionsPage.tsx:40`). Phase 17's planned `useWatch`/`compute` rewrite will not fix them. P18 or P19 must address: (a) lifting `selected` into a context or per-row subscription, or (b) memoizing the row subtree so a top-level state change does not invalidate children that don't depend on `selected`.
2. **Scenario 2 also lists `ImportReviewRow2` as an updater** (in addition to `Controller` and `ImportTransactionsPage`). This suggests a per-row internal subscription is firing on amount keystrokes beyond the RHF `Controller` boundary. To investigate during P17/P18: inspect `frontend/src/components/transactions/import/ImportReviewRow.tsx` for any `useWatch` / `watch` on row-scoped state, and confirm whether the row component re-renders even when memoized.
3. **The 100-row fixture is at the lower end of plausible real usage.** A bank statement import easily produces 200–500 rows; the linear scaling implied by these measurements means production users with larger imports will see proportionally worse latency. P19 / P20 (virtualization) should re-visit the gate threshold against a 500-row variant of the fixture if P17+P18 do not bring 100-row commit duration well under 16 ms (raw dev) / 8 ms (prod estimate).

### Outcome
- `16-DIAGNOSIS.md` **not produced** — hypothesis confirmed, no replan required.
- Phase 17 (replace page-level `useWatch({ name: 'rows' })` with `compute`-scoped subscriptions) is the correct next intervention.
- The two secondary findings above are recorded as **deferred items** and must be reflected in `deferred-items.md`.

## P19 → P20 Gate Threshold

Per the locked Phase 20 (Virtualization) gate decision in `16-CONTEXT.md`:

> If the 100-row fixture is fluid after Phase 19 (description-keystroke commit duration < ~16ms,
> no perceptible lag), Phase 20 is **skipped or downsized** at the orchestrator's call.

Phase 21 will compare its re-measured numbers against this baseline and apply the gate.
