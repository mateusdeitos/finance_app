# Phase 17 — Eliminate Page-Level useWatch Cascade — CONTEXT

**Phase:** 17
**Milestone:** v1.5 Import Transactions Performance
**Date:** 2026-05-06
**Status:** DRAFT — locked decisions below are pre-approved by `/gsd:discuss-phase` carry-overs from P16; any new gray area surfaced during planning must be re-discussed before this file is treated as final.

<domain>
Replace the page-level `useWatch({ control: form.control, name: 'rows' })` subscription at `frontend/src/pages/ImportTransactionsPage.tsx:70` with `compute`-scoped subscriptions and `useFieldArray.fields` reads, so that per-row keystrokes no longer trigger a full-page re-render of the import review screen.

The phase also wires `babel-plugin-react-compiler` into `frontend/vite.config.ts` as its first sub-task, so that all post-P17 measurements (and P18, P19, P21 measurements) are on the same compiler regime. P16's verdict is the single source of truth for "what must change"; this CONTEXT is the contract for "how it changes and what stays untouched".
</domain>

<canonical_refs>
- `.planning/phases/16-baseline-profiling/16-PERF-BASELINE.md` — verdict CONFIRMED, baseline measurements, runbook
- `.planning/phases/16-baseline-profiling/16-CONTEXT.md` — locked profiling decisions (recipe `just profile`, fixture, scenarios, StrictMode 2× caveat)
- `.planning/phases/16-baseline-profiling/deferred-items.md` — P18/P19 carry-overs (non-RHF cascade in scenarios 3/4; intra-row updater in scenario 2)
- `.planning/ROADMAP.md` — Phase 17 success criteria (lines 122–131)
- `frontend/CLAUDE.md` §5 — RHF + Zod conventions: "Use `useWatch` instead of `form.watch`"; "use `compute` for derived values"
- `frontend/src/pages/ImportTransactionsPage.tsx` — refactor target (line 70 `useWatch` to remove; lines 53–60 existing `compute` example to extend)
- `frontend/src/components/transactions/import/ImportReviewRow.tsx` — memoized row consumer (must stay reference-stable across page re-renders)
- `frontend/vite.config.ts:23` — `react()` plugin call to be re-wired with `babel.plugins: ['babel-plugin-react-compiler']`
- `frontend/package.json:45-46,49` — `@vitejs/plugin-react@^4.3.4` (Babel flavor) + `babel-plugin-react-compiler@^1.0.0` (already declared, just unwired) + `eslint-plugin-react-hooks@^7.0.1` (carries the compiler lint rule)
- `frontend/profilling/cenario_{1..4}.json` — raw P16 baseline (single source of truth for ms numbers)
- `frontend/justfile` — `just profile` recipe (must be re-used end-to-end here)
</canonical_refs>

<code_context>
**Current shape of `ImportTransactionsPage` `rows` consumers** (read from `frontend/src/pages/ImportTransactionsPage.tsx`):

| Site | Code | Refactor target |
|------|------|-----------------|
| L53–60 | `useWatch({ ..., name: 'rows', compute: (rows) => ({ totalSuccess, total }) })` | **Keep + extend** — compute already returns scalars; expand it to also return `errorCount` and `toImportPendingCount` |
| L70 | `const rows = useWatch({ control: form.control, name: 'rows' })` (broad) | **Remove** — this is the smoking gun |
| L128 | `handleSelectAll = () => setSelected(new Set(rows.map((_, i) => i)))` | Use `fields.length` (from existing `useFieldArray` at L62–65); replace `rows.map((_, i) => i)` with `Array.from({ length: fields.length }, (_, i) => i)` |
| L204 | `toImportRows = rows.filter(...)` | **Eliminate** — only `.length` and one nested filter are consumed (lines 326, 331); replace both with scalars from the compute |
| L205 | `errorCount = toImportRows.filter(...).length` | Move into the L53–60 compute |
| L326 | `{toImportRows.length}` | Replace with the existing `total` scalar (same filter) |
| L331 | `toImportRows.filter((r) => r.import_status !== 'success').length` | New scalar `toImportPendingCount` from the compute |

After refactor: **zero new `useWatch({ name: 'rows' })` broad calls; one expanded compute callback returning 4 scalars; `fields.length` for cardinality reads.**

**Compiler wiring shape** (`frontend/vite.config.ts:23`):

Current:
```ts
react()
```
Target:
```ts
react({
  babel: {
    plugins: ['babel-plugin-react-compiler'],
  },
})
```
No second argument needed; `babel-plugin-react-compiler@^1.0.0` reads sensible defaults. Optional `target: '19'` can be passed if React 19 features need to be enabled explicitly — defer unless the build complains.

**ESLint side:** `eslint-plugin-react-hooks@^7.0.1` ships `react-compiler/react-compiler`. The eslint config at `frontend/eslint.config.mjs` does NOT enable it currently. Wiring the rule is a strict scope expansion (it will surface compiler-incompatible patterns across the whole codebase, not just `ImportTransactionsPage`). **Decision: defer the lint rule to a follow-up; P17 only wires the build-time compiler.**

**`@eslint/js` peer issue (carry-over from P16):** `npm run lint` fails with `Cannot find package '@eslint/js'`. Pre-existing, deferred in `16/deferred-items.md`. P17 must not block on it; if a clean lint run is needed, install the missing peer as a side fix and call it out in the SUMMARY.

**Roadmap typo to flag:** ROADMAP.md line 130 references "the **200**-row baseline" for SC4 verification. This is a typo — P16 locked a 100-row fixture (system hard limit). Planner must read SC4 as "100-row fixture" and call out the discrepancy in the plan.

**Reusable assets:**
- `frontend/scripts/genImportFixture.ts` (P16) — fixture generator, no change
- `frontend/justfile` (P16) — `just profile` recipe, no change
- React DevTools profiler — primary measurement tool, no code dep
- 4 raw P16 profiler exports — reference baseline for "before" comparison
</code_context>

<decisions>

### Order of operations (LOCKED)
- **Sub-task A:** wire `babel-plugin-react-compiler` into `frontend/vite.config.ts:23`. Land in its own commit. Run `cd frontend && just profile`, capture all 4 P16 scenarios again, save under `frontend/profilling/p17-mid/cenario_{1..4}.json`. This is the **intermediate measurement** (compiler-on, useWatch-old).
- **Sub-task B:** refactor `ImportTransactionsPage.tsx` per the table in `<code_context>`. Land in its own commit.
- **Sub-task C:** capture all 4 P16 scenarios again with `just profile`, save under `frontend/profilling/p17-after/cenario_{1..4}.json`. Write `17-PERF-COMPARISON.md` with three columns: P16 baseline, post-A intermediate, post-B final. Per scenario: commit duration, fiber count, updaters list.
- **Rationale for the intermediate measurement:** isolates the compiler's contribution from the refactor's contribution. Cheap (4 profiler captures = ~5 min) and prevents P21 from seeing one combined delta and not knowing which intervention earned it. Without sub-task A's mid measurement, if P17 numbers are great we cannot tell whether the refactor mattered or the compiler did all the work.

### Refactor scope: only `useWatch` (LOCKED)
- **In scope:** the 5 `rows` consumers in `ImportTransactionsPage.tsx` listed in `<code_context>`. Goal: zero broad `useWatch({ name: 'rows' })` calls remain.
- **Out of scope (LOCKED — do NOT touch in P17):**
  - `useState<Set<number>>` for `selected` at L40 — owns the cascade in scenarios 3 & 4. Belongs to P18/P19 per `16/deferred-items.md`.
  - `ImportReviewRow.tsx` internals — the intra-row updater in scenario 2 belongs to P17/P18 audit per `16/deferred-items.md`, but rewriting the row is its own intervention. P17 only inspects to confirm `React.memo` is in place and the `onToggleSelect` callback identity is stable; **no behavioral change**.
  - `useFieldArray` topology — the existing `fields` / `remove` shape is already correct and is the lever P17 uses; do not introduce a new pattern.
  - Form schema (`importFormSchema`) — unchanged.
  - Bulk-toolbar handlers (`handleBulkSetAction` etc.) — they read via `form.setValue` / `form.getValues`, not via `rows`, so they are not consumers of L70 and stay untouched.
- **Rationale for narrow scope:** P21's apples-to-apples comparison depends on attributing the delta to a single intervention. Adding row-internal or `selected`-state changes in P17 would muddy that. P18/P19 absorb them in their own measurement window.

### Re-baseline methodology (LOCKED)
- All measurements use `cd frontend && just profile` exactly as P16 did. Same fixture, same StrictMode regime, same browser session pattern.
- Three captures land in the repo: `frontend/profilling/` (P16, already committed), `frontend/profilling/p17-mid/` (post-A), `frontend/profilling/p17-after/` (post-B). Each directory carries 4 JSONs (`cenario_{1..4}.json`).
- Comparison artifact: `.planning/phases/17-eliminate-page-usewatch-cascade/17-PERF-COMPARISON.md`. Three-column table per scenario; updater-list diff for the page-level fiber (id 144 in P16 — verify the id is still `ImportTransactionsPage` after the refactor; with the compiler wired the fiber id may shift).

### Verification gate (LOCKED)
- ROADMAP SC4: "`ImportTransactionsPage` does NOT re-render on a single description keystroke in any row" — read this as **`ImportTransactionsPage` (or its compiler-wrapped equivalent) is NOT in the `updaters` list of the user-action commit** for scenarios 1 (description keystroke) and 2 (amount keystroke).
- Scenarios 3 & 4 are **expected to still show ImportTransactionsPage as updater** (those are `setSelected` cascades, not in P17 scope). This is acceptable and must be explicitly noted in `17-PERF-COMPARISON.md` to prevent a false-negative reading of the gate.
- ROADMAP SC4 says "200-row baseline" — read as "100-row baseline" (P16 fixture). Planner must reflect this correction in the plan and update the ROADMAP line in the same commit, with the rationale citing 16-CONTEXT.md "Fixture size".

### Compiler wiring side effects (LOCKED)
- The `react-compiler` ESLint rule is **NOT** enabled in P17. It would raise issues across the whole codebase, not just the import flow. Tracked as a follow-up.
- If wiring the compiler breaks the build (e.g. via a previously-buggy hook), P17 fixes the **specific** breakage in `frontend/src/pages/ImportTransactionsPage.tsx` and `frontend/src/components/transactions/import/`. Any breakage outside those paths is recorded in `17/deferred-items.md` and the plan adapts (either skip wiring or scope-expand with explicit user approval).
- Production bundle inspection: after sub-task A, run the same grep checks from P16 (`react-compiler-runtime`, `_c[<n>]` cache slots) on `frontend/dist/assets/*.js` to confirm the compiler is now ACTIVE. Document the verdict flip (INACTIVE → ACTIVE) in `17-PERF-COMPARISON.md`.

### `@eslint/js` peer issue
- Pre-existing carry-over from P16. Not blocking unless the plan needs `npm run lint` to pass for verification. **Decision: install `@eslint/js` as a side-fix only if the plan requires lint to pass; otherwise skip.** The carry-over stays in `16/deferred-items.md`.

### Hypothesis-not-confirmed contingency
- Same shape as P16: if post-B measurements show `ImportTransactionsPage` STILL in the updaters list after the refactor, produce `17-DIAGNOSIS.md` with profiler citations and a replan recommendation. **ROADMAP.md is NOT auto-edited** — orchestrator decides whether to invoke `/gsd:plan-phase` to amend the remaining v1.5 phases.
- This is unlikely (P16's verdict pinpointed L70 with high confidence) but the contingency is preserved as a forcing function.

</decisions>

<deferred_ideas>
- Enable `react-compiler/react-compiler` ESLint rule across the codebase (follow-up; P17 only wires the build-time compiler)
- Add `target: '19'` (or equivalent) to the compiler config if a future React-19-specific feature requires it
- Audit `ImportReviewRow.tsx` for the intra-row updater seen in P16 scenario 2 (carry-over from `16/deferred-items.md`); if the audit finds an obvious sub-300-LoC fix, P18 or P17.5 may absorb it. Otherwise stays in P18.
- Performance budget gate in CI based on the `17-PERF-COMPARISON.md` numbers — defer to v1.6 or later
- Replace `@vitejs/plugin-react` with `@vitejs/plugin-react-swc` — out of scope; would invalidate the compiler wiring
- Centralized perf-comparison schema (re-usable across P17, P19, P21 comparison docs) — defer; let P19 surface the need
</deferred_ideas>

<follow_ups_for_planner>
The Phase 17 plan(s) must:

1. **Three commits, three measurements** — sub-task A (wire compiler) → measure → sub-task B (refactor) → measure. The comparison doc reads three columns. Do not collapse A and B into one commit; the attribution is the whole point.

2. **Compiler-active grep checks** — after sub-task A, the production bundle MUST contain compiler-emitted markers (e.g. `_c[<n>]` cache-slot reads or `react-compiler-runtime` module specifier). The plan includes these greps as acceptance criteria. If absent, sub-task A failed and the plan blocks before proceeding to B.

3. **No broad `useWatch` survivors** — `grep -n "useWatch.*name: 'rows'" frontend/src/pages/ImportTransactionsPage.tsx` after sub-task B should return ONLY the compute-scoped call (one match, with `compute:` on the same useWatch). The broad subscription must be gone.

4. **`fields.length` swap is exact** — `handleSelectAll` no longer reads `rows`. Verified by `grep -n "rows.map\|rows.filter" frontend/src/pages/ImportTransactionsPage.tsx` returning 0 matches inside the page after sub-task B.

5. **ImportReviewRow unchanged** — `git diff sub-task-B^..sub-task-B -- frontend/src/components/transactions/import/ImportReviewRow.tsx` must be empty. Same for any file outside `ImportTransactionsPage.tsx`. Sub-task A may modify only `frontend/vite.config.ts`. Sub-task B may modify only `frontend/src/pages/ImportTransactionsPage.tsx` (or `.tsx` files where `rows` array reads exist; per audit there are none).

6. **ROADMAP correction** — sub-task B (or its commit) must also amend ROADMAP.md line 130 from "200-row baseline" to "100-row baseline" with a one-line rationale citing 16-CONTEXT.md "Fixture size".

7. **CI guardrails** — `cd frontend && npm run build` must succeed after both A and B. `npx tsc --noEmit` must pass after B. e2e tests under `frontend/e2e/tests/import*.spec.ts` should still pass — if any breaks because of the refactor, the plan owns fixing them in B (not deferred).

8. **Capture browser version & timestamp** — same protocol as P16, recorded inside `17-PERF-COMPARISON.md` header.

9. **Profiler artifacts naming** — `frontend/profilling/p17-mid/cenario_{1..4}.json` and `frontend/profilling/p17-after/cenario_{1..4}.json`. These are large (~35MB each); the plan acknowledges the repo size cost (140MB total per stage × 2 stages = 280MB added in P17) and confirms the user accepts this cost as the price of attribution.

10. **One plan or two** — recommended split: **17-01-PLAN.md** for sub-task A (wire + intermediate measurement) and **17-02-PLAN.md** for sub-task B (refactor + final measurement). Each plan has a single human-verify checkpoint at its end. This mirrors P16's split granularity and lets the user inspect the intermediate measurement before committing to B's refactor.
</follow_ups_for_planner>

---

_Context drafted 2026-05-06. Next: review with user, then `/gsd:plan-phase 17`._
