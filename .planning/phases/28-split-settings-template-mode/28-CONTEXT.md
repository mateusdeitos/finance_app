# Phase 28: SplitSettingsFields Template Mode - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `SplitSettingsFields` render correctly in a **no-amount (template) context**. Today the component is always embedded in the transaction form, where an `amount` field exists and drives the live split preview. The v1.7 template form (Phase 30) has **no amount field** — a template stores *how* to split, never a total. This phase adds an **additive `templateMode` prop** so the component can be embedded without showing a misleading live calculation, ahead of Phase 29/30 consuming it.

**In scope:**
- Add `templateMode?: boolean` (default `false`) to `SplitSettingsFields`, threaded down to `SplitRow` → `SplitRowControls`.
- In template mode: **suppress the derived-value previews** — the per-row `= R$ X` (percentage×total) and the footer `Soma X% (R$ …)`.
- Keep the `%`/`R$` mode toggle fully functional (a template may store a percentage split **or** a fixed-amount split — P26 stores percentage XOR amount per row).
- Keep everything else identical: connection Select, add/remove person, per-row percentage or amount input, split date.
- Add stable `data-testid`s for the suppressed elements so tests can assert their presence/absence.
- Component-level (vitest) coverage: template mode hides previews + toggle still works; non-template behavior unchanged.

**Out of scope (later phases):** the `TemplateForm` itself and the "Save as template" action (Phase 30); the chip apply flow (Phase 29); E2E (Phase 31). This phase does **not** create any new form or route — it only makes the existing shared component template-aware.

Requirements covered: **MNG-03**.
</domain>

<decisions>
## Implementation Decisions

- **D-01 (LOCKED by user): Suppress, don't replace.** In template mode the derived-value previews are **hidden entirely** — no "R$ 0,00", no neutral placeholder text. This matches the component's existing behavior when `totalAmount === 0` and keeps the template UI clean; the user only picks `%` or `R$` per person, with no meaningless derived total. (Chosen over a neutral "definido ao aplicar" indicator.)
- **D-02: Additive prop, non-breaking.** `templateMode` defaults to `false`; when omitted the component behaves exactly as today. No existing call site (`TransactionAccordionSections`, `SplitPopover`, `BulkEditDrawer`, `BulkDivisionDrawer`) changes. Success criterion 3 (existing behavior unchanged) is satisfied structurally by the default.
- **D-03: Explicit suppression, not incidental.** Although `totalAmount` is `0` in template context (so the previews are already hidden by the existing `totalAmount > 0` guards), the suppression is gated on `templateMode` explicitly — so intent is clear and the behavior is robust even if a stray amount value ever flows in. Both the per-row preview guard and the footer guard gain `&& !templateMode`.
- **D-04: Toggle stays.** The `%`/`R$` `SegmentedControl` is NOT hidden in template mode (that is the `onlyPercentage` prop's job, which remains a separate concern for Bulk/Import). A template author must be able to choose how the split is stored.
- **D-05: Test at the component layer.** Verify with vitest (`vitest run`), reusing the existing `MantineProvider` + `QueryClientProvider` + `FormProvider` harness from `TransactionForm.split.test.tsx`. No new E2E here (that is Phase 31).

### Claude's Discretion
- Exact `data-testid` names/kind (static vs parametric) for the preview + footer, following `src/testIds/` conventions.
- Whether to add the template-mode test to the existing `TransactionForm.split.test.tsx` or a focused new `SplitSettingsFields.template.test.tsx` (rendering `SplitSettingsFields` standalone inside a `FormProvider`). New focused file preferred for clarity.
- Whether any `SplitSettingsFields.module.css` tweak is needed (likely none).
</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` §"Phase 28: SplitSettingsFields Template Mode" — goal + 3 success criteria
- `.planning/REQUIREMENTS.md` — MNG-03
- `frontend/CLAUDE.md` — RHF+Zod forms, `useWatch` over `watch`, testid conventions (`src/testIds/`), component size rules, "no `any`" (note: this file is on the "known divergences" list for pre-existing `useEffect`/`any` — do NOT introduce new ones, but do not refactor the pre-existing ones as part of this phase)
- `frontend/src/components/transactions/form/SplitSettingsFields.tsx` — the component being modified (per-row preview ~L110-112; footer `Soma` ~L406-413; prop interface ~L266-273)
- `frontend/src/components/transactions/form/TransactionForm.split.test.tsx` — existing vitest harness to mirror
- `frontend/src/testIds/transactions.ts` — where split testids live (`InputSplitAmount`, `InputSplitPercentage`, `BtnAddSplitRow`, `InputSplitDate`)
</canonical_refs>

<code_context>
## Existing Code Insights

- The previews are **already** guarded by `totalAmount > 0`, so template context (amount absent → `totalAmount = 0`) mostly renders them empty today. This phase makes the suppression explicit via `templateMode` and adds testids + coverage — it is a small, low-risk, additive change.
- `SplitSettingsFields` → `SplitRow` → `SplitRowControls`: the per-row `= R$ X` preview lives in `SplitRowControls`; the `Soma X%` footer lives directly in `SplitSettingsFields`. `templateMode` must thread through both `SplitRow` and `SplitRowControls`.
- The existing `onlyPercentage` prop (Bulk/Import) is a separate concern and must not be conflated with `templateMode`.
- `frontend/package.json` → `test:component` runs `vitest run`; `npm run lint` runs ESLint; `npm run build` type-checks + builds.
</code_context>

<specifics>
## Specific Ideas

- Guard change (per-row preview): `mode === "percentage" && totalAmount > 0 && !templateMode ? "= R$ …" : ""`.
- Guard change (footer): render the `Soma …` group only when `fields.length > 0 && totalAmount > 0 && !templateMode`.
- Add testids, e.g. `SplitRowPreview(rowIndex)` (parametric) on the per-row preview `Text` and `SplitSumFooter` (static) on the footer group — so a test can assert they are absent in template mode and present in transaction mode.
</specifics>

<deferred>
## Deferred Ideas
- The actual `TemplateForm` that passes `templateMode` — Phase 30.
- Applying a template's split to the transaction form — Phase 29.
- E2E coverage — Phase 31.
</deferred>

---

*Phase: 28-split-settings-template-mode*
*Context gathered: 2026-07-09*
