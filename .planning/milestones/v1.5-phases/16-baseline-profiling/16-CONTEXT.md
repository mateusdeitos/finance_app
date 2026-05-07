# Phase 16 — Baseline Profiling & Diagnostics — CONTEXT

**Phase:** 16
**Milestone:** v1.5 Import Transactions Performance
**Date:** 2026-05-05

<domain>
Establish a numeric performance baseline for the transaction-import review screen and verify the assumed root cause **before** any code changes. Output is read by Phases 17–21 to compare against, and read by the orchestrator to decide whether the v1.5 plan still holds.

This phase produces measurement artifacts only. No source code under `frontend/src/` is changed.
</domain>

<canonical_refs>
- `/root/.claude/plans/precisamos-melhorar-a-performance-logical-sonnet.md` — approved milestone plan (root cause hypothesis + phase strategy)
- `.planning/PROJECT.md` — v1.5 Current Milestone section
- `.planning/REQUIREMENTS.md` — PROF-01..PROF-03 (this phase's reqs), VIRT-* (downstream review)
- `.planning/ROADMAP.md` — Phase 16 success criteria
- `frontend/CLAUDE.md` — frontend conventions (form rules, e2e helpers, `data-testid` policy)
- `frontend/src/pages/ImportTransactionsPage.tsx` — `useWatch({ name: 'rows' })` at line 70 (hypothesis target)
- `frontend/src/components/transactions/import/ImportReviewRow.tsx` — memoized row, options recreated per render
- `frontend/src/components/transactions/import/importPayload.ts` — `CSV_COLUMNS` defines the import contract (`Data;Descrição;Valor;Categoria`)
- `frontend/vite.config.ts` — current plugin chain (no React Compiler wired — see decisions below)
- `frontend/e2e/tests/import.spec.ts:17` — first appearance of `buildCsvContent` (duplicated across 4 spec files)
</canonical_refs>

<code_context>
**CSV format (locked by importer):** `Data;Descrição;Valor;Categoria` semicolon-separated. Date `DD/MM/AAAA`, amount BR with comma (`-100,00`), negative = expense, positive = income. Categoria optional.

**System constraint discovered during discussion:** the import flow has a **hard limit of 100 rows per CSV**. Bigger CSVs are rejected. This re-frames v1.5: the lag the user feels is **almost certainly the re-render cascade**, not DOM weight. Phase 20 (virtualization) value is no longer obvious — see decisions.

**`buildCsvContent` duplicated:** 4 e2e files each define a private copy. v1.5 centralizes it in `frontend/e2e/helpers/csv.ts` and the new fixture generator imports from the same helper.

**React Compiler wiring:** `babel-plugin-react-compiler@^1.0.0` is in `frontend/package.json` (line 46) but **not** wired into `frontend/vite.config.ts`. The `react()` plugin call has no `babel.plugins` entry. PROF-02 should empirically confirm "inactive" (the docs change has not been merged or the wiring was never done). This is a major data point for v1.5.

**Reusable assets in this phase:**
- `buildCsvContent` (e2e/tests/import.spec.ts:17) — to be lifted to `frontend/e2e/helpers/csv.ts`
- React DevTools Profiler (browser extension) — primary measurement tool, no code dep
- `npm run preview` — production preview server is already wired (vite.config.ts:18)
</code_context>

<decisions>

### Profiling environment
- **Locked: production build only** — `npm run build && npm run preview`
- Rationale: dev mode includes `<StrictMode>` double-renders, HMR overhead, and dev-only warnings; numbers would not represent what users feel. Prod preview is the single source of truth for v1.5 metrics.
- No dev-mode capture is required by Phase 16. If P21 wants dev-mode comparison later, it can add it.

#### Addendum 2026-05-05 (during Wave 2 execution) — REVISED COMMAND
**Discovered constraint:** the standard production build (`npm run build`) bundles `react-dom.production.min.js`, which strips React's profiling instrumentation. React DevTools shows: *"Profiling not supported. Profiling support requires either a development or profiling build of React v16.5+."*

**First attempt — REJECTED:** `vite build --mode development && vite preview`. Vite's `--mode development` flag controls `.env` resolution, NOT `process.env.NODE_ENV` for the bundle. The build still picked the React production bundle and the profiler stayed blocked. Lesson: getting React's dev bundle into a Vite **build** requires either an explicit `define` override or the profiling-alias pattern; `--mode` alone is insufficient.

**Second (final) revision (LOCKED):** `cd frontend && just profile` → runs `npm run dev` (Vite dev server, port 5173) plus regenerates `/tmp/fixture-100.csv` first. Profiler works out-of-the-box.
- Sem mudar `vite.config.ts` ✓ (decisão original "compiler not wired in P16" preservada)
- Profiler funciona sem fricção ✓
- Trade-offs aceitos:
  - **HMR adiciona runtime overhead vs prod**. Os ms absolutos não representam prod. Aceito porque Phase 21 vai medir com o mesmo recipe (`just profile`), então a comparação before/after é interna-consistente.
  - **`<StrictMode>` em `main.tsx:14` duplica todo render em dev React.** Commit duration ~2x, rendered count ~2x. *Quais* componentes re-renderizam e a ordem relativa entre cenários NÃO são afetados — ambas as métricas chave para validar/refutar a hipótese permanecem corretas.

**Phase 21 implication:** o re-run de comparação em P21 deve usar o mesmo `just profile` para apples-to-apples. Documentado também na Profiling Runbook section de `16-PERF-BASELINE.md`.

### Fixture mechanism
- **Locked: TS generator script + centralized helper**
- Create `frontend/scripts/genImportFixture.ts` — deterministic (fixed seed, no `Math.random()` without seed), produces a 100-row CSV via `npx tsx frontend/scripts/genImportFixture.ts > fixture-100.csv`
- Centralize `buildCsvContent` in `frontend/e2e/helpers/csv.ts`. Update the 4 e2e files (`import.spec.ts`, `import-installment.spec.ts`, `import-shift-select.spec.ts`, `import-split-settings.spec.ts`) to import from the helper instead of duplicating
- Generator imports from the same helper — single source of truth for CSV format
- Output format strictly follows `CSV_COLUMNS` in `importPayload.ts` (`Data;Descrição;Valor;Categoria`, `DD/MM/AAAA`, BR amounts)

### Fixture size
- **Locked: 100 rows only** (max allowed by import flow)
- Hard limit confirmed by user during discussion. Smaller fixtures (25/50) add no signal because the lag manifests at the limit; the 100-row fixture **is** the production worst case for this milestone
- All baseline measurements are captured against the 100-row fixture
- Phase 21 re-runs against the **same** fixture (deterministic via seed) for an apples-to-apples comparison

### Profiling scenarios
- **Locked: 4 minimum scenarios on the 100-row fixture**
  1. **Description keystroke** — type one character into a row's description input (mid-list row, e.g. row 50)
  2. **Amount keystroke** — type one digit into a row's CurrencyInput (mid-list row)
  3. **Checkbox toggle** — single-click toggle on a mid-list row's selection checkbox
  4. **Row select via shift-click** — shift-click on a mid-list row to multi-select (existing behavior in `handleToggleSelect` at `ImportTransactionsPage.tsx:90`)
- For each scenario, capture: **commit duration (ms)** and **rendered component count** as reported by React DevTools Profiler
- Scroll-FPS is **not** in scope (the user complaint is about state-change lag, not scroll smoothness; 100-row scroll is also not heavy)

### Baseline artifact
- **Locked: markdown table in the phase directory**
- File path: `.planning/phases/16-baseline-profiling/16-PERF-BASELINE.md`
- Format: markdown table — columns: scenario, commit duration (ms), rendered component count, notes
- Raw React DevTools profiler JSON exports are **optional**; if exported, they go alongside in the same directory and are referenced from the markdown
- Phase 21 reads this file and writes `.planning/phases/21-.../21-PERF-COMPARISON.md` against it

### React Compiler wiring (contingency)
- **Locked: document in Phase 16; wire in Phase 17**
- Phase 16 confirms whether `babel-plugin-react-compiler` is active in the production build (PROF-02). It documents the finding — no wiring change.
- If inactive (highly likely given `vite.config.ts` inspection): Phase 17 absorbs wiring as a sub-task. The phase plan for P17 must include "wire `babel-plugin-react-compiler` into `vite.config.ts`" before any `useWatch` change, so that the post-Phase-17 measurement is on the same compiler regime as the post-Phase-21 measurement.
- This decision keeps Phase 16 pure measurement and prevents the baseline from being polluted by an unrelated config change.

### Hypothesis-contradicted contingency
- **Locked: produce a diagnosis doc + replan recommendation, do NOT auto-edit the roadmap**
- Phase 16 success criterion 4 (validate or contradict the `useWatch` hypothesis) is binding. If the profiler shows that page-level `useWatch({ name: 'rows' })` is **not** the dominant culprit:
  1. Phase 16 produces an additional file `.planning/phases/16-baseline-profiling/16-DIAGNOSIS.md` naming the actual culprit and citing the profiler evidence
  2. The diagnosis includes a **replan recommendation** — which v1.5 phase scope changes, and how
  3. ROADMAP.md is **not** auto-edited; orchestrator (the user / next session) reviews the diagnosis and decides whether to invoke `/gsd:phase` to amend phases 17–21
- If the hypothesis is confirmed: no diagnosis doc is needed, and the baseline alone is the deliverable

### Phase 20 (Virtualization) gate — IMPORTANT
- **Locked: P20 stays in the roadmap but is gated post-P19 measurement**
- Constraint discovered: 100-row hard limit means DOM weight is not catastrophic. Virtualization's expected ROI is ~10x DOM-node reduction, not 50x as originally framed
- After Phase 19 ships and is measured: if the 100-row fixture is already fluid (description keystroke commit duration < ~16ms, no perceptible lag), Phase 20 is **skipped or downsized** at the orchestrator's call
- This decision is captured here so Phase 16 mentions it in `16-PERF-BASELINE.md` (as a P19→P20 gate threshold), and so REQUIREMENTS.md's VIRT-* items are tagged "scope under review"

</decisions>

<deferred_ideas>
- Adicionar cenários secundários ao baseline (transaction_type Select change, RecurrencePopover open/close, action change to skip) — defer to Phase 21 or a follow-up if main 4 don't surface enough signal
- Scroll FPS metric — defer (not relevant for 100-row hard limit + state-change lag)
- Performance budget gates in CI (e.g. fail PR if commit duration regresses > X%) — defer; only viable after v1.5 numbers stabilize
- Lifting `vite.config.ts` to enable additional optimizations (e.g. `@vitejs/plugin-react-swc`, manual `rollupOptions.output.manualChunks`) — out of scope for v1.5
- Capture dev-mode profile alongside prod for diagnostic comparison — defer to a follow-up if the prod baseline alone is hard to interpret
</deferred_ideas>

<follow_ups_for_planner>
The Phase 16 plan must:

1. **Order of operations** — generator + helper extraction first; then baseline capture. The generator is a hard dependency (no fixture = no measurement).

2. **Helper extraction is non-trivial** — 4 e2e files currently inline `buildCsvContent`. The plan must include updating each file's import. CI must stay green after the extraction.

3. **PROF-02 (compiler check) is concrete** —
   - Inspect `frontend/vite.config.ts` for `babel.plugins` containing `babel-plugin-react-compiler` in the `react()` plugin call
   - Run `npm run build` and grep the output for compiler-emitted markers (e.g. `_c =` cache slots in transformed JS) on a known-renderable component
   - Document both checks in `16-PERF-BASELINE.md` under a "Compiler verification" section

4. **Profiling is a manual procedure** — no automated test captures it. The plan must include a step-by-step "how to capture" runbook in `16-PERF-BASELINE.md` (e.g. open Chrome → React DevTools → Profiler tab → press Record → perform scenario → stop → read commit duration). This makes Phase 21 reproducible.

5. **Mid-list row index** — measurements use a fixed mid-list row (row 50 of 100). The plan must document this so Phase 21 measures the same row. Edge rows (row 0, row 99) may exhibit different behavior due to virtualization — but virtualization is not yet in v1.5 at this point, so middle is fine.

6. **No source code changes under `frontend/src/`** — only `frontend/scripts/`, `frontend/e2e/helpers/`, and the 4 e2e test imports. Reviewer should bounce a PR that touches `frontend/src/`.

7. **Run order** — production build (`npm run build`) once, profiling done against `npm run preview`. Browser: Chrome (React DevTools available). Document Chrome version in baseline for reproducibility.
</follow_ups_for_planner>

---

_Context captured 2026-05-05. Next: `/gsd:plan-phase 16`._
