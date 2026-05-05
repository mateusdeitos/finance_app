# Requirements: Couples Finance App — v1.5

**Defined:** 2026-05-05
**Source:** Approved plan at `/root/.claude/plans/precisamos-melhorar-a-performance-logical-sonnet.md`
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.

## v1.5 Requirements

Eliminate per-keystroke lag on the transaction-import review screen and keep the experience fluid for large CSVs (200+ rows). Backend and the import payload contract are unchanged — every fix is in `frontend/`. The work is structured profile-then-fix: a numeric baseline first, then targeted root-cause fixes (subscriptions, query derivations, debounce), then virtualization for scale, then verification against the baseline.

### Profiling & Diagnostics

- [ ] **PROF-01**: A reproducible CSV fixture (or generator script) under `frontend/scripts/` produces deterministic 50-row, 200-row, and 500-row test inputs that the existing import flow accepts end-to-end without manual editing
- [ ] **PROF-02**: `babel-plugin-react-compiler` is empirically verified active in the dev/build pipeline (Vite config inspection + build-output inspection); the result is documented inline in the baseline artifact
- [ ] **PROF-03**: A baseline profile (component re-render count + commit duration for: 1 description keystroke, 1 amount keystroke, 1 checkbox toggle, 1 row select, all on the 200-row fixture) is captured via React DevTools Profiler and persisted to a referenceable artifact in `.planning/`

### Re-render Reduction

- [ ] **RR-01**: The page-level `const rows = useWatch({ control: form.control, name: 'rows' })` at `frontend/src/pages/ImportTransactionsPage.tsx:70` is removed; remaining page-level derivations come from `useWatch({ ..., compute })` returning only the scalars the page actually renders (`toImportCount`, `errorCount`)
- [ ] **RR-02**: After RR-01, React DevTools Profiler shows that a single description keystroke in any row of a 200-row CSV does NOT trigger a re-render of `ImportTransactionsPage`
- [ ] **RR-03**: `useFlattenCategories` exposes a `select<T>` generic parameter (matching the `useAccounts` convention documented in `frontend/CLAUDE.md` §3); `ImportReviewRow` consumes `categoryOptions` and `accountOptions` via `select`-derived data — never via inline `categories.map(...)`/`accounts.map(...)` per render
- [ ] **RR-04**: After RR-03, Mantine `Select.data` arrays passed inside `ImportReviewRow` are reference-stable across an isolated row re-render (verified with the profiler — the row's commit cost decreases vs. the post-RR-02 measurement)

### Network & Duplicate-Check Behavior

- [ ] **NET-01**: `useDuplicateTransactionCheck` is gated by `enabled: action === 'import'` so rows already marked `skip` or `duplicate` do not contribute subscriptions or checks
- [ ] **NET-02**: The hook applies a debounce (200–300ms) on the `[date, amount]` dependency before triggering any cache lookup or network call; editing a single row's amount on a 500-row CSV does not produce a sustained burst of duplicate-check calls (verified via Network panel or instrumentation), while true duplicates are still detected and flip `action` to `duplicate` on the debounced trigger

### Virtualization

- [ ] **VIRT-01**: `@tanstack/react-virtual` is installed and `ImportTransactionsPage` uses `useVirtualizer` over the `useFieldArray` `fields`, with sensible `overscan` and `estimateSize` for the row layout
- [ ] **VIRT-02**: The Mantine `Table` block is replaced by a CSS-grid layout — the header row and each `ImportReviewRow` use the same `grid-template-columns` so columns align without a `<table>` element; `forwardRef` on `ImportReviewRow` is preserved for the existing `rowRefs` mechanism
- [ ] **VIRT-03**: Validation-error scroll behavior still works end-to-end: when `handleConfirm` finds the first invalid row index, the page calls `virtualizer.scrollToIndex(firstErrorIndex)` (waiting for the row to mount if needed) before invoking the existing ref-based `scrollIntoView`. All popovers/portals (`SplitPopover`, `RecurrencePopover`, `DatePickerInput`) continue to render correctly above virtualized content, including for rows near the viewport edges

### Verification & Testing

- [ ] **TEST-01**: A new Playwright e2e test imports a >100-row CSV, scrolls to a row that was never in the initial viewport, edits a field in that row, scrolls back, and asserts the edit persisted — proving form state survives virtualization unmount/remount
- [ ] **TEST-02**: The existing import e2e suite (`frontend/e2e/tests/import*.spec.ts`) and `npm run lint` + `npm run build` all pass against the v1.5 code
- [ ] **TEST-03**: Phase-21 re-runs the Phase-16 profile scenarios on the same 50/200/500-row fixtures; the comparison artifact (post vs. baseline) is saved alongside the baseline and shows measurable improvement on at least the 200-row description-keystroke commit duration

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

---
*Requirements defined: 2026-05-05*
*Last updated: 2026-05-05 — roadmap created (Phases 16–21)*
