---
phase: 28-split-settings-template-mode
plan: 01
subsystem: ui
tags: [react, typescript, mantine, react-hook-form, vitest]

# Dependency graph
requires:
  - phase: 26-backend-foundation
    provides: domain.SplitSettings shape reused verbatim by TransactionTemplatePayload (frontend split rows have the same connection_id/percentage/amount/date shape a template will store)
provides:
  - "SplitSettingsFields templateMode?: boolean prop (additive, default false)"
  - "Per-row '= R$ X' preview and 'Soma X%' footer suppressed entirely when templateMode is true (no placeholder text, per locked decision D-01)"
  - "%/R$ SegmentedControl toggle remains fully functional in template mode"
  - "Stable testids: SplitRowPreview(rowIndex), SplitSumFooter, SegmentedSplitMode, SegmentSplitMode(mode)"
  - "SplitSettingsFields.template.test.tsx vitest coverage for template-mode suppression, toggle behavior, and non-template regression safety"
affects: [29-frontend-chip-apply-flow, 30-frontend-management-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive boolean prop threaded through 3-level component chain (SplitSettingsFields -> SplitRow -> SplitRowControls), gating existing render guards with `&& !templateMode` rather than branching render paths"
    - "SegmentedControl per-option JSX labels carrying a data-testid span (mirrors TransactionForm.tsx's SegmentTransactionType pattern), enabling deterministic vitest interaction without Mantine-internal selectors"

key-files:
  created:
    - frontend/src/components/transactions/form/SplitSettingsFields.template.test.tsx
  modified:
    - frontend/src/components/transactions/form/SplitSettingsFields.tsx
    - frontend/src/testIds/transactions.ts

key-decisions:
  - "Suppression is explicit (`&& !templateMode`), not incidental to totalAmount === 0 — matches locked decision D-01/D-03 from 28-CONTEXT.md so intent is clear and robust even if a stray amount value ever flows into a template-mode render"
  - "Added SegmentedSplitMode/SegmentSplitMode testids on the %/R$ toggle (not explicitly required by the plan's testid list but permitted under environment_notes) so the vitest suite can drive the toggle deterministically instead of reaching into Mantine radio-input internals"

patterns-established:
  - "When adding a mode-gating boolean prop to a multi-level component tree, thread it as a required prop on every intermediate component's props interface (not optional-with-default at each level) so TypeScript catches any level that forgets to pass it through"

requirements-completed: [MNG-03]

# Metrics
duration: 7min
completed: 2026-07-09
---

# Phase 28 Plan 01: SplitSettingsFields Template Mode Summary

**Additive `templateMode` prop on `SplitSettingsFields` suppresses the derived-value split previews (no placeholder) while keeping the %/R$ toggle fully functional, verified by a focused vitest suite alongside the unchanged existing transaction-form behavior.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-09T19:15:29Z
- **Completed:** 2026-07-09T19:22:33Z
- **Tasks:** 2 completed
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments
- `SplitSettingsFields` now accepts `templateMode?: boolean` (default `false`), threaded through `SplitRow` → `SplitRowControls`
- Per-row `= R$ X` preview and the `Soma X%` footer are hidden entirely in template mode (no neutral placeholder — matches locked decision D-01), while the `%`/`R$` `SegmentedControl` toggle stays visible and functional
- Added stable testids (`SplitRowPreview`, `SplitSumFooter`, `SegmentedSplitMode`, `SegmentSplitMode`) so both the new suite and future e2e coverage can assert presence/absence and drive the toggle without touching Mantine internals
- New `SplitSettingsFields.template.test.tsx` proves all three plan success criteria: previews suppressed, toggle still switches percentage/amount, and non-template behavior is unchanged (regression-safe against the additive default)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add templateMode prop, suppress previews, add testids** - `4184102` (feat)
2. **Task 2: Component test for template mode + non-template regression** - `3d94a2f` (test)

**Plan metadata:** (this commit, below)

## Files Created/Modified
- `frontend/src/components/transactions/form/SplitSettingsFields.tsx` - added `templateMode` prop threaded through `SplitRow`/`SplitRowControls`; gated the per-row preview and `Soma` footer on `!templateMode`; added testids to the preview `Text`, footer `Group`, and the `%`/`R$` `SegmentedControl` (including per-option labels)
- `frontend/src/testIds/transactions.ts` - added `SplitRowPreview(rowIndex)`, `SplitSumFooter`, `SegmentedSplitMode`, `SegmentSplitMode(mode)`
- `frontend/src/components/transactions/form/SplitSettingsFields.template.test.tsx` - new focused vitest suite (3 tests) covering template-mode suppression, toggle functionality, and non-template regression safety

## Decisions Made
- Explicit `&& !templateMode` guard (not relying on the pre-existing `totalAmount > 0` guard alone) — see key-decisions above.
- Added the two `SegmentSplitMode`/`SegmentedSplitMode` testids beyond the plan's minimum list, to give the vitest suite a reliable way to click the `%`/`R$` toggle (the plan's `environment_notes` explicitly permitted this as in-scope).

## Deviations from Plan

**1. [Rule 3 - Blocking] Installed frontend dependencies before verification**
- **Found during:** Task 1 verification
- **Issue:** `node_modules` did not exist in the environment; `npx tsc`/`npm run lint` could not run without it
- **Fix:** Ran `npm ci --legacy-peer-deps` (plain `npm ci` failed on a pre-existing `zod@4` vs `@tanstack/zod-adapter` peer conflict unrelated to this plan)
- **Files modified:** none tracked (node_modules only)
- **Verification:** `npx tsc --noEmit` and `npm run lint` ran cleanly afterward
- **Committed in:** not committed (node_modules is gitignored)

**2. [Rule 1 - Bug] Added `afterEach(cleanup)` and removed unavailable `toBeInTheDocument` matcher in the new test file**
- **Found during:** Task 2 verification
- **Issue:** First draft of `SplitSettingsFields.template.test.tsx` used `@testing-library/jest-dom`'s `toBeInTheDocument()` matcher, which is not installed/configured in this project (confirmed via `CalculatorKeypad.test.tsx` precedent, which avoids it), and lacked `afterEach(cleanup)`, causing DOM from earlier tests in the file to leak into later tests' queries (`getByTestId` "multiple elements found")
- **Fix:** Switched assertions to `toBeTruthy()` / `.textContent` checks (matching the existing `CalculatorKeypad.test.tsx` convention) and added `afterEach(cleanup)` mirroring that same file's pattern
- **Files modified:** `frontend/src/components/transactions/form/SplitSettingsFields.template.test.tsx`
- **Verification:** `npx vitest run src/components/transactions/form/SplitSettingsFields.template.test.tsx` — 3/3 tests pass
- **Committed in:** `3d94a2f` (Task 2 commit; issue found and fixed before the commit was made, so no separate fix commit)

**3. [Rule 1 - Bug] Fixed stale ROADMAP.md Progress table row for Phase 27**
- **Found during:** ROADMAP.md update after Task 2
- **Issue:** The `## Progress` table's Phase 27 row still read "2/4, In Progress" even though Phase 27 is complete per STATE.md (4/4 plans, confirmed 2026-07-09)
- **Fix:** Corrected the row to "4/4, Complete, 2026-07-09" alongside adding the new Phase 28 row
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** Cross-checked against STATE.md's "Phase 27 (complete)" position marker
- **Committed in:** final metadata commit (docs)

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug in new test file, 1 stale-doc bug)
**Impact on plan:** All auto-fixes were necessary to get the plan's own verification commands running and to keep planning docs internally consistent. No scope creep — no production code beyond what the plan specified was touched.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `SplitSettingsFields` is ready to be embedded in the Phase 30 `TemplateForm` with `templateMode` set, and by the Phase 29 chip-apply flow when rendering split rows without a live amount.
- No blockers. Phase 28 (1/1 plans) is complete; Phase 29 (Frontend Chip Apply Flow) can proceed — its dependency on "SplitSettingsFields mode resolved" is satisfied.

---
*Phase: 28-split-settings-template-mode*
*Completed: 2026-07-09*

## Self-Check: PASSED
- FOUND: frontend/src/components/transactions/form/SplitSettingsFields.template.test.tsx
- FOUND: .planning/phases/28-split-settings-template-mode/28-01-SUMMARY.md
- FOUND: commit 4184102 (Task 1)
- FOUND: commit 3d94a2f (Task 2)
