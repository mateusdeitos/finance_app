# Requirements: Couples Finance App — v1.5

**Defined:** 2026-05-05
**Source:** Approved plan at `/root/.claude/plans/precisamos-melhorar-a-performance-logical-sonnet.md`
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.

## v1.5 Requirements

Eliminate per-keystroke lag on the transaction-import review screen and keep the experience fluid for large CSVs (200+ rows). Backend and the import payload contract are unchanged — every fix is in `frontend/`. The work is structured profile-then-fix: a numeric baseline first, then targeted root-cause fixes (subscriptions, query derivations, debounce), then virtualization for scale, then verification against the baseline.

### Profiling & Diagnostics

- [ ] **PROF-01**: A reproducible CSV fixture (TS generator script under `frontend/scripts/`) produces a deterministic 100-row test input that the existing import flow accepts end-to-end without manual editing. The 100-row size matches the system's current hard-limit on import row count, so the fixture represents the production worst case
- [ ] **PROF-02**: `babel-plugin-react-compiler` is empirically checked in the production build pipeline (`vite.config.ts` plugin chain inspection + `npm run build` output inspection for compiler-emitted markers); the result (active or inactive) is documented inline in the baseline artifact. If inactive, the wiring change is **not** done in Phase 16 — it is absorbed into Phase 17
- [ ] **PROF-03**: A baseline profile (commit duration in ms + rendered component count for: 1 description keystroke, 1 amount keystroke, 1 checkbox toggle, 1 row select via shift-click, all on a fixed mid-list row of the 100-row fixture) is captured via React DevTools Profiler in production preview mode (`npm run build && npm run preview`) and persisted to `.planning/phases/16-baseline-profiling/16-PERF-BASELINE.md`. If the page-level `useWatch({ name: 'rows' })` hypothesis is contradicted by the profiler, an additional `16-DIAGNOSIS.md` naming the actual culprit and recommending replan changes is produced

### Re-render Reduction

- [ ] **RR-01**: The page-level `const rows = useWatch({ control: form.control, name: 'rows' })` at `frontend/src/pages/ImportTransactionsPage.tsx:70` is removed; remaining page-level derivations come from `useWatch({ ..., compute })` returning only the scalars the page actually renders (`toImportCount`, `errorCount`)
- [ ] **RR-02**: After RR-01, React DevTools Profiler shows that a single description keystroke in any row of a 200-row CSV does NOT trigger a re-render of `ImportTransactionsPage`
- [ ] **RR-03**: `useFlattenCategories` exposes a `select<T>` generic parameter (matching the `useAccounts` convention documented in `frontend/CLAUDE.md` §3); `ImportReviewRow` consumes `categoryOptions` and `accountOptions` via `select`-derived data — never via inline `categories.map(...)`/`accounts.map(...)` per render
- [ ] **RR-04**: After RR-03, Mantine `Select.data` arrays passed inside `ImportReviewRow` are reference-stable across an isolated row re-render (verified with the profiler — the row's commit cost decreases vs. the post-RR-02 measurement)

### Network & Duplicate-Check Behavior

- [ ] **NET-01**: `useDuplicateTransactionCheck` is gated by `enabled: action === 'import'` so rows already marked `skip` or `duplicate` do not contribute subscriptions or checks
- [ ] **NET-02**: The hook applies a debounce (200–300ms) on the `[date, amount]` dependency before triggering any cache lookup or network call; editing a single row's amount on a 500-row CSV does not produce a sustained burst of duplicate-check calls (verified via Network panel or instrumentation), while true duplicates are still detected and flip `action` to `duplicate` on the debounced trigger

### Virtualization (scope under review post-Phase 19)

> **Gate:** the import flow has a 100-row hard limit. With root-cause fixes in Phases 17–19, the 100-row fixture may already be fluid, in which case Phase 20 is downsized or skipped. The orchestrator decides at the P19 → P20 transition based on Phase 19 measurements vs. the Phase 16 baseline. If kept, the requirements below stand as-is.

- [ ] **VIRT-01**: `@tanstack/react-virtual` is installed and `ImportTransactionsPage` uses `useVirtualizer` over the `useFieldArray` `fields`, with sensible `overscan` and `estimateSize` for the row layout
- [ ] **VIRT-02**: The Mantine `Table` block is replaced by a CSS-grid layout — the header row and each `ImportReviewRow` use the same `grid-template-columns` so columns align without a `<table>` element; `forwardRef` on `ImportReviewRow` is preserved for the existing `rowRefs` mechanism
- [ ] **VIRT-03**: Validation-error scroll behavior still works end-to-end: when `handleConfirm` finds the first invalid row index, the page calls `virtualizer.scrollToIndex(firstErrorIndex)` (waiting for the row to mount if needed) before invoking the existing ref-based `scrollIntoView`. All popovers/portals (`SplitPopover`, `RecurrencePopover`, `DatePickerInput`) continue to render correctly above virtualized content, including for rows near the viewport edges

### Verification & Testing

- [ ] **TEST-01**: If Phase 20 ships, a new Playwright e2e test imports the 100-row fixture, scrolls to a row that was never in the initial viewport, edits a field in that row, scrolls back, and asserts the edit persisted — proving form state survives virtualization unmount/remount. If Phase 20 is skipped at the P19 gate, this requirement is dropped
- [ ] **TEST-02**: The existing import e2e suite (`frontend/e2e/tests/import*.spec.ts`) and `npm run lint` + `npm run build` all pass against the v1.5 code
- [ ] **TEST-03**: Phase 21 re-runs the Phase 16 profile scenarios on the same 100-row fixture; the comparison artifact (post vs. baseline) is saved alongside the baseline and shows measurable improvement on at least the description-keystroke commit duration

## Future Requirements

- Per-row manual `useMemo`/`useCallback` audit (defer — `babel-plugin-react-compiler` is active; only revisit if profiling shows the compiler missing a hot path)
- Aggregating duplicate-check calls into a single batch endpoint (defer — only pursue if NET-02's debounce + `enabled` is insufficient)
- Performance budget gates in CI (defer until v1.5 measurements are stable enough to define thresholds)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend changes (import payload, duplicate-detection API, etc.) | The bottleneck is entirely client-side rendering and subscriptions |
| Replacing React Hook Form or Mantine | Performance fixes work within the existing stack; rewrite cost outweighs perceived ceiling |
| Switching off `<table>` semantics globally | Only the import review screen migrates to CSS-grid virtualization; other tables stay on Mantine `Table` |
| Speculative manual `useMemo`/`useCallback` everywhere | `babel-plugin-react-compiler` already auto-memoizes; manual hooks add noise unless profiler proves a hot path the compiler missed |
| Server-side pagination of the review screen | Users need bulk operations across the entire CSV in a single review pass; pagination would break selection/bulk flows |
| Generic perf framework / shared virtualization helper | YAGNI — virtualize this one screen first; extract later if a second screen needs it |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROF-01 | Phase 16 | Pending |
| PROF-02 | Phase 16 | Pending |
| PROF-03 | Phase 16 | Pending |
| RR-01 | Phase 17 | Pending |
| RR-02 | Phase 17 | Pending |
| RR-03 | Phase 18 | Pending |
| RR-04 | Phase 18 | Pending |
| NET-01 | Phase 19 | Pending |
| NET-02 | Phase 19 | Pending |
| VIRT-01 | Phase 20 | Pending |
| VIRT-02 | Phase 20 | Pending |
| VIRT-03 | Phase 20 | Pending |
| TEST-01 | Phase 21 | Pending |
| TEST-02 | Phase 21 | Pending |
| TEST-03 | Phase 21 | Pending |

**Coverage:**
- v1.5 requirements: 15 total
- Mapped to phases: 15 (Phase 16: 3 · Phase 17: 2 · Phase 18: 2 · Phase 19: 2 · Phase 20: 3 · Phase 21: 3)
- Unmapped: 0

## Constraints

- **Hard limit: 100 rows per CSV import.** This is a system constraint of the existing import flow; v1.5 does not change it. The 100-row figure is treated as the production worst case for all baseline and verification metrics.
- **Frontend-only milestone.** Backend code, the import payload contract, and the duplicate-detection API are unchanged.
- **Production preview is the measurement environment.** All before/after metrics are captured via `npm run build && npm run preview`. Dev mode (Vite dev server with `<StrictMode>` double-render) is not authoritative for v1.5 numbers.

---
*Requirements defined: 2026-05-05*
*Last updated: 2026-05-05 — Phase 16 context locked: 100-row hard limit, prod-build measurement, P20 gated post-P19, compiler wiring deferred to P17*
