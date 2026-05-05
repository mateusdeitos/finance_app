---
phase: 13-bulkdivisiondrawer-form
plan: 01
subsystem: frontend/components/transactions
tags:
  - frontend
  - drawer
  - react-hook-form
  - zod
  - bulk-actions
  - split-settings
requires:
  - frontend/src/components/transactions/form/SplitSettingsFields.tsx
  - frontend/src/utils/renderDrawer.tsx
  - frontend/src/hooks/useAccounts.ts
  - frontend/src/hooks/useMe.ts
  - frontend/src/types/transactions.ts
provides:
  - BulkDivisionDrawer component (frontend/src/components/transactions/BulkDivisionDrawer.tsx)
  - Drawer-as-promise contract returning raw `Transactions.SplitSetting[]`
  - Phase-14 integration point for bulk "Divisão" action
affects:
  - frontend/src/components/transactions/BulkDivisionDrawer.tsx (new)
tech-stack:
  added:
    - "@hookform/resolvers/zod — Zod resolver for the drawer's RHF form"
    - "zod — schema + Σ=100 refine"
  patterns:
    - "Percentage-only split form owned by the drawer itself (no amount field)"
    - "Live sum badge + disabled submit button gated on Σ === 100"
    - "Loading guard before useForm to prevent stale defaults"
    - "Drawer returns raw Transactions.SplitSetting[] (no wrapper object)"
key-files:
  created:
    - frontend/src/components/transactions/BulkDivisionDrawer.tsx
  modified: []
decisions:
  - "D-01 honored: SplitSettingsFields reused as-is (no fork, no modification)"
  - "D-02 honored: Drawer's schema has no `amount` field — percentage-only"
  - "D-03 honored: Zod `.refine(Σ===100)` for sum-to-100 gate"
  - "D-04 honored: Live sum badge + Submit disabled until isSumValid"
  - "D-05 honored: Row-level 1 <= percentage <= 100 + connection_id >= 1"
  - "D-06 honored: 1-account seed uses conn's stored default_split_percentage with isFrom check"
  - "D-07 honored: 2+-account seed is { connection_id: 0, percentage: 0 }"
  - "D-09 honored: Bottom drawer styles mirror SelectDateDrawer.tsx"
  - "D-10 honored: close() resolves with raw Transactions.SplitSetting[] (no wrapper)"
  - "D-11 honored: onClose calls reject() so callers can try/catch the dismissal"
  - "D-12 honored: Title 'Alterar divisão'"
  - "D-13 honored: Submit label 'Aplicar'"
metrics:
  duration_minutes: ~10
  tasks_completed: 1
  files_created: 1
  files_modified: 0
  completed_date: 2026-04-20
---

# Phase 13 Plan 01: BulkDivisionDrawer Component Summary

BulkDivisionDrawer is a standalone, percentage-only, bottom-anchored drawer that collects a split-settings configuration and returns a raw `Transactions.SplitSetting[]` array via the `renderDrawer` promise contract; it reuses `SplitSettingsFields` as-is with `onlyPercentage={true}`, seeds its first row from the connected account's stored `default_split_percentage` when exactly one connected account exists, and enforces Σ=100 via a Zod `.refine` plus a live sum badge that disables the Aplicar button until the total is exactly 100%.

## Requirements Covered

- **UI-03** — When the user has exactly 1 connected account, the drawer seeds `defaultValues.split_settings[0]` with `{ connection_id: <that-id>, percentage: <stored default_split_percentage> }`, using the same `isFrom` check as `SplitSettingsFields.tsx:62-64`.
- **UI-04** — When the user has 2+ connected accounts, `defaultValues.split_settings[0]` is `{ connection_id: 0, percentage: 0 }` — the user picks and types explicitly.
- **FORM-01** — RHF form with dynamic split rows via `useFieldArray` (delegated to `SplitSettingsFields` which uses it internally on the `split_settings` name).
- **FORM-02** — `onlyPercentage={true}` hides the fixed-amount toggle; schema has no `amount` field at all.
- **FORM-03** — Submit is blocked until `Σ percentage === 100` via both the Zod `.refine` message and the `disabled={!isSumValid}` prop driven by `useWatch` on `split_settings`.

## File Created

- `frontend/src/components/transactions/BulkDivisionDrawer.tsx` (194 lines)
  - Exports `BulkDivisionDrawer` (named).
  - Zod module-level schema `bulkDivisionSchema` with the Σ=100 refine and per-row `1 <= percentage <= 100`, `connection_id >= 1` guards.
  - Loading guard (`meQuery.isLoading || accountsQuery.isLoading`) renders a minimal loading drawer body and does NOT mount `useForm`, preventing stale defaults.
  - Inner `BulkDivisionDrawerForm` component mounts only after loading resolves — this guarantees `useForm`'s `defaultValues` are computed from fully-fetched data.
  - Drawer-as-promise contract: `useDrawerContext<Transactions.SplitSetting[]>()` → `close(array)` on submit, `reject()` on dismissal.
  - Defensive fallback: when `connectedAccounts.length === 0`, the drawer renders a yellow Alert instead of the form (Phase 14 UI-02 prevents reaching this path from the menu, but the guard is cheap).
  - Data-test IDs: `drawer_bulk_division`, `btn_apply_bulk_division`, `badge_bulk_division_sum`. Row-level IDs come from `SplitSettingsFields` (not duplicated).

## Integration Point for Phase 14

Phase 14 will call:

```ts
try {
  const splits = await renderDrawer<Transactions.SplitSetting[]>(() => <BulkDivisionDrawer />);
  // splits: [{ connection_id, percentage }, ...]
  // For each selected tx, convert percentage -> cents:
  //   Math.round(tx.amount * pct / 100), with the last split absorbing the remainder (PAY-01).
} catch {
  // user dismissed
}
```

The drawer does NOT:
- Perform any network calls.
- Convert percentages to cents.
- Handle linked-transaction skip (BULK-02).
- Wire the menu in `SelectionActionBar.tsx`.
- Handle `BulkProgressDrawer` integration.

All of those are Phase 14 concerns.

## Verification

- All 11 grep assertions from Task 1's `<verify>` block passed:
  1. `title="Alterar divisão"` ✓
  2. `position="bottom"` ✓
  3. `onClose={reject}` ✓
  4. `maxHeight: "80dvh"` ✓
  5. `useDrawerContext<Transactions.SplitSetting[]>()` ✓
  6. `onlyPercentage={true}` ✓
  7. `from "./form/SplitSettingsFields"` ✓
  8. `FormProvider`, `zodResolver`, `useForm` ✓
  9. `.refine(` and `=== 100` ✓
  10. `Aplicar` and `disabled={!isSumValid}` ✓
  11. Pre-selection (`from_default_split_percentage`, `to_default_split_percentage`), empty-row seed (`connection_id: 0`), `connection_status === "accepted"`, and data-test IDs ✓
- `cd frontend && npm run build` exits 0 (tsc -b + vite build both succeed).

## Deviations from Plan

None — plan executed exactly as written, with one non-functional refactor: the `BulkDivisionDrawerForm` inner component was extracted so the `useForm` call physically lives past the loading-guard early-return. This honors the plan's guidance ("early-return a `<Drawer>` with a loading state while either query is loading") while keeping React's Rules-of-Hooks valid (hooks in the inner component only run once the outer guard resolves). No behavioral or contract change — the drawer's surface (title, testids, close/reject, schema, return shape) is identical to the plan.

## Known Stubs

None. No hardcoded empty data, no "coming soon" placeholders. The `<Alert>` fallback for 0 connected accounts is intentional and defensive; the happy path wires real data from `useAccounts` and `useMe`.

## Self-Check

- FOUND: frontend/src/components/transactions/BulkDivisionDrawer.tsx (194 lines, exports `BulkDivisionDrawer`)
- FOUND: build pass — `tsc -b && vite build` exited 0
- FOUND: all 11 grep assertions pass

## Self-Check: PASSED
