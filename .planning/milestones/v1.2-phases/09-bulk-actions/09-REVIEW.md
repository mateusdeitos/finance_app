---
phase: 09-bulk-actions
reviewed: 2026-04-17T12:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - frontend/src/components/transactions/BulkProgressDrawer.tsx
  - frontend/src/components/transactions/PropagationSettingsDrawer.tsx
  - frontend/src/components/transactions/SelectCategoryDrawer.tsx
  - frontend/src/components/transactions/SelectDateDrawer.tsx
  - frontend/src/components/transactions/SelectionActionBar.tsx
  - frontend/src/routes/_authenticated.transactions.tsx
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-04-17T12:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

The bulk actions feature introduces selection state, sequential progress drawers, and three bulk operations (delete, category change, date change). The architecture is clean -- drawers use the `renderDrawer` pattern correctly, progress tracking is well-implemented, and the propagation settings flow is properly sequenced. Five issues were found: one authorization gap in the delete flow, one potential key collision, one code duplication concern, and two minor items.

## Warnings

### WR-01: Delete handler skips SEL-02 eligible-ID filter (authorization gap)

**File:** `frontend/src/routes/_authenticated.transactions.tsx:101`
**Issue:** `handleDeleteClick` builds `txsToDelete` from `[...selectedIds]` directly, bypassing `getEligibleIds()`. The `handleCategoryChange` (line 136) and `handleDateChange` (line 188) both call `getEligibleIds()` to filter out transactions where `original_user_id` differs from `currentUserId` (the SEL-02 silent skip). The delete handler does not apply this filter, so it will attempt to delete transactions the current user did not originally create. The backend may reject these calls, but the frontend should be consistent and not send requests it knows will fail.
**Fix:**
```tsx
// Line 101: replace [...selectedIds] with getEligibleIds()
const eligibleIds = getEligibleIds()
const txsToDelete = eligibleIds.map((id) => {
  const tx = allTransactions.find((t) => t.id === id)
  return {
    id,
    description: tx?.description ?? String(id),
    propagationSettings: tx?.transaction_recurrence_id != null ? propagation : undefined,
  }
})
if (txsToDelete.length === 0) return
```

### WR-02: Duplicate transaction descriptions used as React keys

**File:** `frontend/src/components/transactions/BulkProgressDrawer.tsx:172`
**File:** `frontend/src/components/transactions/BulkDeleteProgressDrawer.tsx:165`
**Issue:** The "remaining" error list renders items with `key={label}` (BulkProgressDrawer) and `key={desc}` (BulkDeleteProgressDrawer). If two transactions share the same description, React will produce duplicate keys, potentially causing rendering issues (wrong items updated/removed during reconciliation).
**Fix:** Use the index as part of the key since this is a static display-only list:
```tsx
{errorInfo.remaining.map((label, idx) => (
  <Text key={`${idx}-${label}`} size="xs" c="dimmed" pl="sm">
    {"\u2022"} {label}
  </Text>
))}
```

### WR-03: BulkDeleteProgressDrawer is largely a duplicate of BulkProgressDrawer

**File:** `frontend/src/components/transactions/BulkDeleteProgressDrawer.tsx:1-180`
**Issue:** `BulkDeleteProgressDrawer` (~180 lines) duplicates nearly the entire structure of `BulkProgressDrawer` (~186 lines). The only material difference is that delete builds its action internally (calling `deleteTransaction`) while the generic version accepts an `action` prop. Having two copies means bug fixes (e.g., the key issue in WR-02) must be applied twice, and the components can drift apart over time.
**Fix:** Refactor `handleDeleteClick` to use `BulkProgressDrawer` directly, passing a `deleteTransaction`-based action callback -- the same pattern used by `handleCategoryChange` and `handleDateChange`. This would allow removing `BulkDeleteProgressDrawer` entirely.

## Info

### IN-01: Module-level `now` captures time at import, not at navigation

**File:** `frontend/src/routes/_authenticated.transactions.tsx:29`
**Issue:** `const now = new Date()` is evaluated once when the module loads. If the app runs past midnight (common on mobile where tabs stay alive), the default month/year will be stale. This is a very minor edge case since navigation typically forces a fresh page load, and the zod schema uses this only for defaults.
**Fix:** Move into a function if this ever becomes an issue:
```ts
const transactionSearchSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).default(() => new Date().getMonth() + 1),
  year: z.coerce.number().int().default(() => new Date().getFullYear()),
  // ...
})
```

### IN-02: `hasRecurring` recomputed on every render without memoization

**File:** `frontend/src/routes/_authenticated.transactions.tsx:81-84`
**Issue:** `hasRecurring` iterates `selectedIds` and calls `.find()` on `allTransactions` for each, running on every render. With typical selection sizes this is negligible, but it could be wrapped in `useMemo` for consistency with the rest of the component's callback memoization (`useCallback` for `toggleSelection` and `clearSelection`).
**Fix:** Optional -- wrap in `useMemo` if the selection set or transaction list grows large:
```ts
const hasRecurring = useMemo(
  () => [...selectedIds].some((id) => {
    const tx = allTransactions.find((t) => t.id === id)
    return tx?.transaction_recurrence_id != null
  }),
  [selectedIds, allTransactions]
)
```

---

_Reviewed: 2026-04-17T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
