---
phase: 14-bulk-action-wiring-cent-exact-conversion
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - frontend/src/utils/splitMath.ts
  - frontend/src/components/transactions/SelectionActionBar.tsx
  - frontend/src/routes/_authenticated.transactions.tsx
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the three files delivered by Phase 14 (`splitPercentagesToCents` helper, `SelectionActionBar` menu-item extension, and the `_authenticated.transactions.tsx` route wiring). Implementation faithfully follows the phase plan and enforces the documented invariants (`Σ amount === total` via last-split-absorbs-remainder, no `percentage` on the wire, silent-skip for transfers and linked-not-owned txs, full payload via `buildFullPayload`).

No critical security or correctness issues found. One warning concerns defensive handling of edge-case inputs to `splitPercentagesToCents` where `percentages` do not sum to 100 — the helper silently "corrects" by dumping the remainder into the last split, which could mask upstream bugs if the helper is ever called from a caller that does not validate percentages first (today only `BulkDivisionDrawer` with a Zod `refine` guards this). Five info-level items cover minor accessibility, code-quality, and defensive-code observations.

## Warnings

### WR-01: `splitPercentagesToCents` silently masks invalid percentage inputs

**File:** `frontend/src/utils/splitMath.ts:43-44`
**Issue:** The algorithm guarantees `Σ amount === total` by construction — the last split is assigned `amount - runningSum` regardless of the percentages. When the input percentages do NOT sum to 100 (e.g. `[{pct:30},{pct:50}]`), the helper silently produces a "working" output (first=30%, last=total-30% absorbing everything else), violating the user's intent but not the sum invariant. Today the drawer's Zod `refine` enforces sum===100, so this path is unreachable from production code, but the helper is advertised as standalone and will be unit-tested in Phase 15 (TEST-02). A caller outside the drawer context (or a future refactor that bypasses the drawer) could silently produce wrong splits without any signal.

Additionally, with `splits.length === 1` the for-loop is skipped and the single row always receives `amount = total - 0 = total` regardless of its `percentage` value. This is correct for a `100%` single-row case but silently "corrects" a single-row `50%` input — again, unreachable today via the drawer but brittle for standalone use.

**Fix:** Add a defensive assertion or explicit documentation in the JSDoc that the caller MUST validate percentages sum to 100 before calling. Optionally throw when the invariant is violated so callers get a loud failure:
```ts
// Add near the top of splitPercentagesToCents:
if (process.env.NODE_ENV !== 'production') {
  const pctSum = splits.reduce((s, r) => s + (r.percentage ?? 0), 0);
  if (splits.length > 0 && pctSum !== 100) {
    console.warn(
      `splitPercentagesToCents: percentages sum to ${pctSum}, expected 100. ` +
      `The last split will absorb the mismatch.`,
    );
  }
}
```
Or update the JSDoc `@param splits` to explicitly state: "Caller MUST ensure Σ percentage === 100; otherwise the last split silently absorbs the delta." This keeps the helper pure but makes the precondition part of the contract.

## Info

### IN-01: Redundant `onClick` guard alongside `disabled` prop

**File:** `frontend/src/components/transactions/SelectionActionBar.tsx:61`
**Issue:** `onClick={connectedAccountsCount === 0 ? undefined : onDivisaoChange}` is redundant with `disabled={connectedAccountsCount === 0}` — Mantine's `Menu.Item` already blocks clicks when `disabled`. Belt-and-suspenders is harmless but duplicates the condition.
**Fix:** Simplify to `onClick={onDivisaoChange}` — the `disabled` prop already prevents invocation. Minor readability gain.

### IN-02: Disabled-hint `<Text>` is not linked to the `Menu.Item` via ARIA

**File:** `frontend/src/components/transactions/SelectionActionBar.tsx:67-71`
**Issue:** When the Divisão item is disabled, the explanatory hint renders as a sibling `<Text>` inside `Menu.Dropdown`. Screen readers may read it as an unrelated block rather than as the reason the preceding menu item is disabled. The disabled `Menu.Item` has no `aria-describedby` pointing at the hint.
**Fix:** Give the hint an `id` and reference it from the disabled item:
```tsx
<Menu.Item
  leftSection={<IconShare size={14} />}
  onClick={onDivisaoChange}
  disabled={connectedAccountsCount === 0}
  data-testid="btn_bulk_division"
  aria-describedby={connectedAccountsCount === 0 ? 'hint-bulk-division' : undefined}
>
  Divisão
</Menu.Item>
{connectedAccountsCount === 0 && (
  <Text id="hint-bulk-division" size="xs" c="dimmed" px="sm" pb="xs" data-testid="hint_bulk_division_no_connection">
    Conecte uma conta para usar esta ação.
  </Text>
)}
```
Alternatively, wrap the disabled item in `<Tooltip label="Conecte uma conta..." disabled={connectedAccountsCount > 0}>` which Mantine announces via ARIA automatically.

### IN-03: `allTransactions.find(...)` scans on every iteration inside bulk handlers

**File:** `frontend/src/routes/_authenticated.transactions.tsx:93, 100, 109, 170, 179, 215, 226, 266, 283, 325, 336`
**Issue:** Both the eligibility helpers and every `BulkProgressDrawer` `action` callback call `allTransactions.find((t) => t.id === item.id)`. For a selection of N items over M transactions this is O(N*M). Not a correctness bug and not a v1 performance concern per review scope, but noting for future cleanup.
**Fix:** Build a `Map<number, Transaction>` once in the component:
```ts
const txById = useMemo(
  () => new Map(allTransactions.map((t) => [t.id, t])),
  [allTransactions],
);
// ...then allTransactions.find(t => t.id === id) → txById.get(id)
```

### IN-04: `BulkProgressDrawer` action silently no-ops when tx disappears from cache

**File:** `frontend/src/routes/_authenticated.transactions.tsx:179-181, 227-228, 284-285, 337-338`
**Issue:** Inside each bulk action's `action` callback, `const tx = allTransactions.find(...); if (!tx) return;` silently returns success when the transaction is not found in the cache. If the query was invalidated mid-flow or `selectedIds` outlives the cache, the drawer will report a successful update that never happened. Mirrors the existing category/date/delete pattern — not a regression introduced by Phase 14.
**Fix:** Either throw (so `BulkProgressDrawer` surfaces the error) or log-and-continue:
```ts
const tx = allTransactions.find((t) => t.id === item.id);
if (!tx) {
  throw new Error(`Transaction ${item.id} not found in cache`);
}
```
Consider addressing across all four bulk handlers at once rather than scoping the fix to Phase 14.

### IN-05: `currentUserId` defaults to `0` while `useMe` is loading

**File:** `frontend/src/routes/_authenticated.transactions.tsx:60, 101`
**Issue:** `const currentUserId = meQuery.data ?? 0`. The eligibility filter `tx?.original_user_id === currentUserId` then compares against `0` during the loading window. In practice the `_authenticated` route guard preloads `me` via `ensureQueryData`, so `meQuery.data` is populated before the component mounts and this branch is never taken. However, the `?? 0` fallback is a latent foot-gun if the route guard contract ever changes — a production tx with `original_user_id === 0` (unlikely in the DB, but possible via test fixtures) would pass the eligibility filter incorrectly.
**Fix:** Either render a loading state until `meQuery.data` is defined, or fail-closed on the filter:
```ts
return tx?.original_user_id == null || (meQuery.data != null && tx?.original_user_id === meQuery.data);
```
Preexisting pattern across the route, not introduced by Phase 14 — flagging for awareness, not urgency.

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
