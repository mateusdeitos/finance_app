# Phase 16 — Discussion Log

**Phase:** 16 — Baseline Profiling & Diagnostics
**Date:** 2026-05-05
**Mode:** discuss (default), single-pass

This log is for human reference (audits, retrospectives). It is **not** consumed by downstream agents — they read `16-CONTEXT.md` instead.

---

## Pre-discussion scout findings

Surfaced during codebase exploration before any question was asked:

1. **`vite.config.ts` does NOT wire `babel-plugin-react-compiler`** — the package is in `frontend/package.json:46` but the `react()` plugin call has no `babel.plugins` entry. The compiler is almost certainly inactive in the production build. This finding became the basis of gray area #4.
2. **`buildCsvContent` duplicated across 4 e2e files** — `import.spec.ts:17`, `import-installment.spec.ts:27`, `import-shift-select.spec.ts:12`, `import-split-settings.spec.ts` (similar). Consolidating it is cheap and unblocks the fixture generator.
3. **CSV format constraint** — `frontend/src/components/transactions/import/importPayload.ts:CSV_COLUMNS` defines the contract: `Data;Descrição;Valor;Categoria` (semicolon-separated, BR date/amount).

---

## Gray areas presented

```
Phase 16: Baseline Profiling & Diagnostics
Domain: Establish numeric baseline before code changes; verify the assumed root cause.

Gray areas (multiSelect: true):
  ☐ Ambiente de profiling (dev vs prod)
  ☐ Mecanismo da fixture CSV
  ☐ Local e formato do baseline
  ☐ Compiler inativo: o que fazer
```

**User selected: ALL FOUR.** Proceeded to focused per-area questions.

---

## Round 1 — Locked decisions

### Q1: Profiling environment

> "Em que build vamos rodar o profiler para capturar baseline?"

Options offered: prod-only / dev+prod / dev-only.
**User chose: Só prod (preview)**.

### Q2: Fixture mechanism

> "Como gerar/manter as fixtures de 50/200/500 linhas?"

Options offered: TS generator + helper / static .csv files / helper-only.
**User chose: Gerador TS + helper centralizado**.

### Q3: Baseline doc

> "Onde grava o baseline e em que formato?"

Options offered: markdown in phase dir / markdown + JSON exports / `frontend/perf/baseline.md`.
**User chose: Markdown na phase dir**.

### Q4: Compiler-off contingency

> "Se PROF-02 confirmar compiler inativo, como tratamos o wiring?"

Options offered: doc P16 + wire P17 / wire ainda no P16 / nova Phase 16.5 / wire só no P21.
**User chose: Doc no P16 + wire no P17**.

---

## Round 2 — Follow-ups

### Q5: Profiling scenarios

> "Quais cenários entram no baseline?"

Options offered: minimum 4 / 4 + secondary / 200-only / + scroll FPS.
**User answer (freeform):** "o csv pode ter no max 100 linhas, isso é um hard limit atual"

This was a constraint disclosure rather than a scenario selection. It re-framed the entire fixture-size strategy: 50/200/500 became 100-only. Phase 20 (virtualization) ROI is now uncertain. Triggered Round 3.

### Q6: Hypothesis-contradicted contingency

> "Se profiler **não** confirmar a hipótese useWatch — culprit é outra coisa — P16 entrega o quê?"

Options offered: doc + stop / doc + propose replan / ignore (let P17 discover).
**User chose: Documentar + propor replan**.

---

## Round 3 — Constraint-driven adjustments

### Q7: Fixture size given 100-row hard limit

> "Tamanhos das fixtures dado o hard limit de 100 linhas?"

Options offered: 25/50/100 / 50/100 / 100-only.
**User chose: Só 100**.

### Q8: Phase 20 (virtualization) under the new constraint

> "Com 100 linhas como limite, virtualização ainda faz sentido?"

Options offered: keep P20 under P21 review / remove P20 now / decide after P19.
**User chose: Decidir após P19**.

---

## Outcome summary

| Decision | Choice |
|---|---|
| Profiling env | `npm run build && npm run preview` (production preview) |
| Fixture | TS generator script + centralized `buildCsvContent` helper |
| Fixture size | 100 rows only (system hard limit) |
| Baseline doc | Markdown in phase dir (`16-PERF-BASELINE.md`) |
| Compiler wiring | Documented in P16, wired in P17 if inactive |
| Hypothesis contradicted | Produce `16-DIAGNOSIS.md` + replan recommendation; do not auto-edit roadmap |
| Phase 20 (virtualization) | Stays in roadmap, gated post-P19 measurement |

## Deferred ideas

- Secondary baseline scenarios (Mantine `Select` change, popover open/close)
- Scroll-FPS metric
- Performance budget gates in CI
- Lifting `vite.config.ts` for additional bundler optimizations
- Dev-mode profiling alongside prod for diagnostic comparison

## Cross-references

- Locked decisions → `16-CONTEXT.md`
- Affected docs (updated in same commit):
  - `.planning/REQUIREMENTS.md` — PROF-01/02/03 rewritten; VIRT section gated; TEST-01/03 reworked; new Constraints section added
  - `.planning/ROADMAP.md` — Phase 16 success criteria refined; P16 summary line updated; P20 gate annotated; P20 summary line gated
