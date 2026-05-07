# Phase 21 — Verification & E2E Coverage — CONTEXT

**Phase:** 21
**Milestone:** v1.5 Import Transactions Performance
**Date:** 2026-05-07

<domain>
Closing phase of the v1.5 milestone. Validates that:
1. The four perf measurements (P16 baseline → P19 final) form a coherent before/after chain with documented numbers
2. Static gates pass (lint, build, typecheck)
3. Existing e2e import suite still passes — no behavioral regression from the refactor pipeline (P17–P19)
4. A manual smoke run confirms the user-perceived behavior matches v1.4

P20 (virtualization) was **SKIPPED** by orchestrator decision after P19 measurements showed the keystroke axes (cenários 1 & 2) below the 16ms gate. Cenários 3 & 4 are above the gate but the residual cost is intrinsic Mantine internals on the row(s) that legitimately need to update — not row-count waste. Virtualization's expected benefit is too low for the 100-row hard limit. Documented in `19-PERF-COMPARISON.md` → "P19 → P20 Gate Decision".

ROADMAP SC3 (a new e2e test for virtualization-specific risk of stale form state) is **N/A** — there is no virtualization to test. Replaced with: confirm the existing import e2e suite still passes against the new selection store + RowDuplicateCheck architecture.
</domain>

<canonical_refs>
- `.planning/ROADMAP.md` — Phase 21 SC1–SC4 (lines 180–184)
- `.planning/phases/16-baseline-profiling/16-PERF-BASELINE.md` — milestone baseline numbers
- `.planning/phases/17-eliminate-page-usewatch-cascade/17-PERF-COMPARISON.md`
- `.planning/phases/18-options-and-selection-rearch/18-PERF-COMPARISON.md`
- `.planning/phases/19-scope-debounce-duplicate-check/19-PERF-COMPARISON.md`
- `frontend/CLAUDE.md` — frontend conventions (e2e isolation per test, testid policy)
- `frontend/e2e/tests/import.spec.ts` and `import-installment|shift-select|split-settings|enhancements.spec.ts` — existing import e2e coverage
- `frontend/profilling/cenario_*.json`, `p17_cenario_*.json`, `p18_cenario_*.json` — raw profiler exports (note: `p18_*` filenames now contain P19 measurements; P18 numbers preserved in 18-PERF-COMPARISON.md per the naming caveat)
</canonical_refs>

<code_context>
**SC interpretation given milestone reality:**

| ROADMAP SC | Original target | Actual scope for P21 |
|------------|-----------------|----------------------|
| SC1 — re-capture profiles for 50/200/500-row scenarios | Compare to baseline | Already done via P17/P18/P19 PERF-COMPARISON docs (4× 100-row capture per locked fixture). 50/200/500 was speculative roadmap text; the system hard-limit (100) defines the canonical size. |
| SC2 — lint, build, e2e:import all pass | Gate | Lint + build + tsc verified clean (this session). E2E suite needs the user to run against a local backend (not available in the agent's container). |
| SC3 — new e2e for virtualization stale-state | Gate | **N/A — P20 skipped.** Replaced with: confirm import e2e suite still passes against the new architecture. |
| SC4 — manual smoke: upload, edit, scroll, edit, shift-click, bulk, confirm | Gate | User responsibility. Documented checklist below. |

**Static gates (this session, all PASS):**
- `npm run lint` → exit 0
- `npm run build` → exit 0 (1,094 kB / gzip 333 kB)
- `npx tsc --noEmit` → exit 0

**Pending user gates:**
- E2E suite: `cd frontend && npm run test:e2e -- --grep import` (requires backend running via `docker-compose up` or equivalent)
- Manual smoke (checklist below)

**Manual smoke checklist (SC4):**
1. Upload a real CSV → review screen renders 100 rows without parse errors
2. Edit description on a visible row → input updates immediately, no global lag
3. Scroll to bottom row → edit its amount → no lag, value persists
4. After 500ms, if amount triggers duplicate (real backend collision) → action flips to `duplicate` automatically
5. Mark a row as "Não importar" → editing its amount does NOT trigger network call (verify in Network tab)
6. Shift-click a row near the top, then shift-click row 50 → range fills correctly; only those rows show as selected
7. Use bulk toolbar to set category for selected rows → category updates; selection clears
8. Open a SplitPopover → confirm the popover's amount matches the row's current amount
9. Click "Importar" → import loop runs, status icons update; redirects to /transactions on success
10. No console errors during the entire flow
</code_context>

<decisions>

### P20 (virtualization) — OFFICIALLY SKIPPED (LOCKED)
- Documented in `19-PERF-COMPARISON.md` → "P19 → P20 Gate Decision"
- ROADMAP marked accordingly in P19 closeout
- Rationale: keystroke axes already below 16ms gate; cenário 3/4 cost is per-row Mantine internals not DOM weight; ROI low for 100-row hard limit
- Remains a follow-up if user-feedback says cenário 3 (170ms toggle) or cenário 4 (466ms shift-click) is laggy in practice

### E2E gate strategy (LOCKED)
- I (the agent) cannot run the e2e suite — no backend / no docker daemon in this environment
- The user runs `npm run test:e2e -- --grep import` against their local stack and reports back
- If any spec fails, P21 stays open until fixes land. Likely candidates for failure:
  - `import-shift-select.spec.ts` — selection logic moved to Zustand; testids preserved but timing may shift slightly
  - `import-split-settings.spec.ts` — SplitPopover dropped `rowAmount` prop; behavior should be identical (handleOpen reads via getValues)
  - `import.spec.ts` — duplicate-check now gated by `enabled: action === 'import'`; only affects rows with action !== 'import'
- If a regression surfaces, the fix lands in P21 (not deferred)

### Manual smoke responsibility (LOCKED)
- User runs the checklist in `<code_context>` above against a local stack
- Reports back with `smoke-passed` / `smoke-failed: <details>`
- A failure here is treated as a regression to fix in P21

### Compiler wiring — NOT scope-creeping into P21
- Still carry-over from P17/P18/P19. If wiring becomes desirable post-v1.5, it gets its own follow-up phase (cleanly attributable delta on top of P19)

### Retrospective doc
- Write `.planning/milestones/v1.5-RETROSPECTIVE.md` summarising the milestone:
  - Headline numbers (P16 → P19 trajectory)
  - Decisions made (compiler skip, P20 skip, scope expansions of P18/P19)
  - Patterns established (sub-component extraction for narrowing watch scope, ref-callback gotcha, store-keyed-by-id)
  - Lessons (the diagnosis-first profile-then-fix loop worked; the ref-callback false-negative measurement was a learnable moment)
- This doc is read by future v1.6+ planning, NOT by the executor again

</decisions>

<deferred_ideas>
- React Compiler wiring — still pending follow-up phase
- Cancel in-flight `checkDuplicateTransaction` requests on debounced changes (current fire-and-forget treats stale results as ok)
- Performance budget gate in CI for cenário 1/2 commit duration (raw dev <16ms threshold)
- Migrate other selection-heavy pages (Transactions list bulk-select) to the Zustand pattern
- E2E test that explicitly counts re-renders (would catch a future regression to the pre-P17 cascade) — interesting but high-effort and brittle
</deferred_ideas>

<follow_ups_for_planner>
1. **No source code changes expected in P21** — verification only. If a regression is found via e2e or smoke test, the fix counts as P21 work (don't punt to a follow-up unless the fix is genuinely out of scope).
2. **Archive milestone**: after SC2/SC4 pass, move `.planning/phases/16..19` to `.planning/milestones/v1.5-phases/` and copy `ROADMAP.md` (+ trim) to `.planning/milestones/v1.5-ROADMAP.md` per the convention used for v1.0–v1.4.
3. **Update STATE.md** to reflect milestone shipped + completed_phases=5 (counting P20 as N/A).
</follow_ups_for_planner>

---

_Context drafted 2026-05-07. Static gates verified inline; E2E + smoke pending user._
