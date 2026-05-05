---
phase: 14-bulk-action-wiring-cent-exact-conversion
plan: "01"
subsystem: frontend
tags:
  - frontend
  - bulk-actions
  - split-settings
  - cents
  - wiring
dependency_graph:
  requires:
    - "Phase 13 BulkDivisionDrawer (13-01)"
  provides:
    - "splitPercentagesToCents pure helper (frontend/src/utils/splitMath.ts)"
    - "Divisao menu item in SelectionActionBar"
    - "handleDivisionClick bulk handler wired end-to-end"
  affects:
    - "frontend/src/routes/_authenticated.transactions.tsx"
    - "frontend/src/components/transactions/SelectionActionBar.tsx"
tech_stack:
  added:
    - "frontend/src/utils/splitMath.ts (new pure utility)"
  patterns:
    - "Last-split-absorbs-remainder for cent-exact percentage conversion"
    - "getDivisionEligibleIds sibling helper to avoid getEligibleIds side effects"
    - "renderDrawer promise chain: input drawer → propagation drawer → progress drawer"
key_files:
  created:
    - "frontend/src/utils/splitMath.ts"
  modified:
    - "frontend/src/components/transactions/SelectionActionBar.tsx"
    - "frontend/src/routes/_authenticated.transactions.tsx"
decisions:
  - "Used Approach A (getDivisionEligibleIds sibling) to avoid regressing category/date/delete handlers by adding transfer filter to getEligibleIds globally"
  - "Used Text component for disabled-state hint rather than Tooltip to match plan's inline example and avoid hover-only interaction on mobile"
  - "Comments-only references to 'percentage' inside handleDivisionClick - no code constructs objects with percentage field"
metrics:
  duration: "4m 10s"
  completed_date: "2026-04-20"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 2
---

# Phase 14 Plan 01: Bulk Action Wiring & Cent-Exact Conversion Summary

**One-liner:** Wired BulkDivisionDrawer as a "Divisão" bulk action with IconShare, percentage-to-cents conversion via last-split-absorbs-remainder, and sequential PUT through BulkProgressDrawer with transfer/linked-non-owned silent skip.

## Requirements Covered

All 8 Phase 14 requirements are now closed:

| Requirement | Description | Status |
|-------------|-------------|--------|
| UI-01 | "Divisão" menu item in SelectionActionBar before Excluir divider | Done |
| UI-02 | Disabled state + Portuguese hint when 0 connected accounts | Done |
| PAY-01 | Cent-exact percentage→amount conversion (Math.round + last-absorbs-rest) | Done |
| PAY-02 | Outgoing split_settings carries only connection_id + amount (no percentage) | Done |
| PAY-03 | Full transaction payload via existing buildFullPayload (no partial PUTs) | Done |
| BULK-01 | BulkProgressDrawer drives sequential per-tx progress, testIdPrefix="bulk_division" | Done |
| BULK-02 | Transfers and linked-non-owned transactions silently skipped | Done |
| BULK-03 | Income transactions processed via generic code path (no special-casing) | Done |

## Files

### Created
- `frontend/src/utils/splitMath.ts` — Pure `splitPercentagesToCents(amount, splits)` helper. Non-last splits use `Math.round(total * pct / 100)`; last split gets `total - runningSum`. Output objects contain only `{ connection_id, amount }` — no `percentage` field (PAY-02). No React imports, trivially unit-testable.

### Modified
- `frontend/src/components/transactions/SelectionActionBar.tsx` — Added `onDivisaoChange: () => void` and `connectedAccountsCount: number` props. New `Menu.Item` "Divisão" with `IconShare`, `data-testid="btn_bulk_division"`, positioned immediately before the existing `Menu.Divider`. Disabled when `connectedAccountsCount === 0` with a Portuguese hint "Conecte uma conta para usar esta ação."
- `frontend/src/routes/_authenticated.transactions.tsx` — Added imports for `BulkDivisionDrawer` and `splitPercentagesToCents`. Added `connectedAccountsCount` computed from accepted connections. Added `getDivisionEligibleIds()` sibling helper (extends `getEligibleIds()` to also exclude transfers). Added `handleDivisionClick` mirroring `handleCategoryChange` structure. Wired both mobile and desktop `<SelectionActionBar>` call sites with `onDivisaoChange` and `connectedAccountsCount`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 5f04e45 | feat(14-01): add splitPercentagesToCents pure cent-exact helper |
| 2 | f9bd635 | feat(14-01): extend SelectionActionBar with Divisão menu item |
| 3 | c08d3bd | feat(14-01): wire handleDivisionClick and SelectionActionBar props in transactions route |

## Deviations from Plan

None - plan executed exactly as written. Approach A (getDivisionEligibleIds sibling) was selected as recommended by the plan. Text component was used for the disabled hint as shown in the plan's example. All three approach options aligned with plan guidance.

## Phase 15 Integration Points

- **TEST-02 (unit tests):** `splitPercentagesToCents` in `frontend/src/utils/splitMath.ts` is ready for unit tests. Suggested file: `frontend/src/utils/splitMath.test.ts`. Key cases: even split, odd amount with last-absorbs-rest, single 100% split, three-way split with 33/33/34.
- **TEST-01 (Playwright e2e):** The bulk division flow is fully wired. E2E should cover: (a) 1+ selected + 1 connected account → Divisão enabled → drawer opens → submit → progress drawer → splits applied; (b) 0 connected accounts → Divisão disabled; (c) mixed selection with transfer → transfer silently excluded from progress drawer.

## Known Stubs

None. Phase 14 fully closes all 8 requirements. Tests are Phase 15's scope.

## Self-Check

**Checking created files exist:**
- `frontend/src/utils/splitMath.ts` — created in Task 1, committed 5f04e45
- `frontend/src/components/transactions/SelectionActionBar.tsx` — modified in Task 2, committed f9bd635
- `frontend/src/routes/_authenticated.transactions.tsx` — modified in Task 3, committed c08d3bd

**Checking commits exist:** 5f04e45, f9bd635, c08d3bd — all confirmed via `git log`.

**Build:** `cd frontend && npm run build` exits 0.

## Self-Check: PASSED
