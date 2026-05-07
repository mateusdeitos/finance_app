# Phase 18 — Memoize Options + Rearch Selection — CONTEXT

**Phase:** 18
**Milestone:** v1.5 Import Transactions Performance
**Date:** 2026-05-07

<domain>
Two interventions in one phase, both attacking the residual ~620 ms commit duration in Phase 16 scenarios 3 & 4 (checkbox toggle, shift-click) and the intra-row updater seen in scenario 2:

1. **Move per-row option derivations to TanStack Query `select` callbacks** so `Mantine Select.data` receives stable references across row renders (per `frontend/CLAUDE.md` §3).
2. **Re-architect row selection state** using a Zustand store keyed by `field.id`, so toggling row N re-renders only row N (and the page-level header/toolbar derivations) instead of cascading through all 100 `ImportReviewRow` instances.

Both target the same scenarios (3 & 4) and the deferred carry-overs from `16/deferred-items.md`. Bundling them in one phase is justified because the residual cost is shared between both root causes.
</domain>

<canonical_refs>
- `.planning/phases/16-baseline-profiling/16-PERF-BASELINE.md` — Phase 16 baseline + verdict
- `.planning/phases/16-baseline-profiling/deferred-items.md` — items #1 (non-RHF cascade) and #2 (intra-row updater) come due here
- `.planning/phases/17-eliminate-page-usewatch-cascade/17-PERF-COMPARISON.md` — P17 baseline (cenário 3 = 613 ms / cenário 4 = 622 ms — P18 must lower these)
- `.planning/ROADMAP.md` — Phase 18 success criteria (lines 133–141) — note: scope expanded by user-approved decision below
- `frontend/CLAUDE.md` §3 — "Derived state from queries goes through a `select` callback"; "Calling the same query hook multiple times is fine and encouraged"
- `frontend/CLAUDE.md` §4 — `useEffect` allowed inside hooks under `src/hooks/`, never inline in components
- `frontend/src/pages/ImportTransactionsPage.tsx` — current `useState<Set<number>>(selected)` at L40; bulk handlers L131–192; `handleToggleSelect` at L93
- `frontend/src/components/transactions/import/ImportReviewRow.tsx` — current inline option derivations at L62–72; `selected` prop at L43; `onToggleSelect` callback prop at L45
- `frontend/src/hooks/useAccounts.ts` — `useAccounts<T>(select?)` already exposes the generic `select` parameter
- `frontend/src/hooks/useCategories.ts` — `useFlattenCategories<T>(select?)` already exposes the generic `select` parameter
</canonical_refs>

<code_context>
**Per-row option derivations today** (`ImportReviewRow.tsx:62–72`):

```ts
const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.emoji ? `${c.emoji} ${c.name}` : c.name }))
const accountOptions  = accounts.map((a) => ({ value: String(a.id), label: a.name }))
const sharedAccounts  = accounts.filter((a) => a.user_connection?.connection_status === 'accepted')
```

Three new array allocations per row per render. With 100 rows × StrictMode 2× = 600 fresh arrays per page render. Mantine `Select` may diff `data` by reference and re-render even when content is unchanged.

**Selection state today** (`ImportTransactionsPage.tsx:40,93–126,128–129,168–172`):

```ts
const [selected, setSelected] = useState<Set<number>>(new Set())
// ...handleToggleSelect with shift-range logic, all setSelected calls
const handleSelectAll = () => setSelected(new Set(fields.map((_, i) => i)))
const handleClearSelection = () => setSelected(new Set())
const handleRemoveSelected = () => {
  const sorted = [...selected].sort((a, b) => b - a)
  sorted.forEach((i) => remove(i))
  setSelected(new Set())
}
```

Every `setSelected` call re-renders `ImportTransactionsPage`, which in turn re-renders all 100 `ImportReviewRow` children (memoized but the `selected` prop value changes for each row, so the memo bails). Hence the cascade in P16 cenários 3 & 4 (`ImportTransactionsPage` is the only updater for those commits).

**Shift-click range expansion** (`handleToggleSelect`): looks for the nearest selected index above the clicked row and fills the gap. Currently keyed by index. After the refactor, the **input** stays index-based (the click handler knows `rowIndex`) but the **storage** is keyed by `field.id`. The store action takes `(rowIndex, shiftKey, fieldIds)` and resolves indices to ids internally.

**Index-vs-id keying bug latent today:** `handleRemoveSelected` removes rows by index from `useFieldArray`, then clears `selected` to a new empty Set. If the clear were not there, the surviving rows' indices would shift and stale entries in `selected` would point to wrong rows. Moving to `field.id` keying eliminates this latent bug.

**Existing convention checks:**
- `useAccounts<T>(select?: (data) => T)` — already follows §3
- `useFlattenCategories<T>(select?: (data) => T)` — already follows §3
- `eslint-plugin-react-hooks@^7.0.1` — Compiler lint rule available but disabled (carry-over P17)

**Roadmap typo carry-over:** ROADMAP.md SC4 of P18 references "200-row baseline" (line 141) — same fix applied in P17 must be applied here too. Single 100-row fixture is the v1.5 standard.
</code_context>

<decisions>

### Library: Zustand (LOCKED — user-approved 2026-05-07)
- **Add `zustand` as a dependency.** ~1.2 kB gzipped. Idiomatic React store with selectors and shallow-equality re-render gating built in.
- Alternative considered: zero-dep `useSyncExternalStore` + custom EventEmitter. Rejected — same semantics, more boilerplate, code-review friction.
- ESLint compiler-rule still NOT wired (carry-over P17). Zustand is React-Compiler-compatible.

### Selection store shape (LOCKED)
- Keyed by `field.id` (string from `useFieldArray.fields[*].id`), NOT by row index. Fixes the latent index-shift bug after `handleRemoveSelected`.
- State: `selected: Set<string>`. Actions: `toggle(rowIndex, shiftKey, fieldIds)`, `selectAll(fieldIds)`, `clear()`.
- Store lives at `frontend/src/components/transactions/import/selectionStore.ts` (colocated with the import feature; not a global store).
- Page subscribes via selectors: `useSelectionStore(s => s.selected.size)` for cardinality reads. Only re-renders when size changes; the rest of page state is unaffected by toggles.
- Each `ImportReviewRow` subscribes via `useSelectionStore(s => s.selected.has(fieldId))` — Zustand's default referential equality on the boolean return means only the row whose slot flipped re-renders.
- `clear()` is called explicitly: after `form.reset` in the upload-step handler, after import finishes, after each bulk-action handler. Same lifecycle as today's `setSelected(new Set())`.

### Shift-click logic preservation (LOCKED)
- Keep the existing range-fill semantics (find nearest selected index above; fill the gap). Move it inside the `toggle` store action; signature is `(rowIndex: number, shiftKey: boolean, fieldIds: string[])` — index for ordering, ids for storage.
- Page passes `fieldIds` via a `useCallback([])` + `useRef(fields)` pattern so the callback identity stays stable for `React.memo`.

### Options derivation pattern (LOCKED)
- New file `frontend/src/hooks/import/useImportOptions.ts` exposes:
  - `useCategoryOptions()` → `Array<{ value: string; label: string }>` (uses `useFlattenCategories(toCategoryOptions)` with a top-level const select fn)
  - `useAccountOptions()` → `Array<{ value: string; label: string }>` (uses `useAccounts(toAccountOptions)`)
  - `useSharedAccounts()` → `Array<Account>` (uses `useAccounts(toSharedAccounts)`)
- Top-level select functions ensure stable function identity across renders — critical for TanStack Query's per-subscriber memoization.
- `ImportReviewRow` consumes these hooks instead of inline `categories.map` / `accounts.map` / `accounts.filter`. The result references are stable across the row's renders, so Mantine `Select.data` no longer triggers downstream re-renders.

### `ImportReviewRow` props change (LOCKED)
- Remove `selected: boolean` prop (now read from store).
- Add `fieldId: string` prop (needed for store subscription).
- Keep `onToggleSelect: (index, shiftKey) => void` — page provides a stable callback via `useCallback([])` that delegates to the store; row contract unchanged from the click-handler perspective.
- Net prop change: `-selected, +fieldId`. Same prop count.
- `React.memo` wrapper stays. Should remain effective as long as `onToggleSelect` is stable.

### `useEffect` for `totalRows` sync — NOT NEEDED (LOCKED)
- Considered storing `totalRows` (= fields.length) inside the store and pre-computing `allSelected`/`someSelected` booleans. Rejected: post-P17 the page is already cheap on re-render (no broad `useWatch`, memoized rows). The page can subscribe to `selected.size` directly and compute booleans locally:
  ```ts
  const totalSelected = useSelectionStore((s) => s.selected.size)
  const someSelected = totalSelected > 0
  const allSelected = fields.length > 0 && totalSelected === fields.length
  ```
- Page re-renders on every toggle, but children are properly memoized so cost is bounded (one page-fn call + small Mantine internals). Profiler will validate.

### Compiler wiring — STILL skipped
- Carry-over decision from P17. Both P17 and P18 measurements stay on compiler-INACTIVE regime. Wiring becomes its own follow-up phase if needed.

### ROADMAP correction (LOCKED)
- Same fix as P17: amend `.planning/ROADMAP.md` SC4 of P18 from "200-row baseline" to "100-row baseline" with rationale citing P16 fixture. Apply in the same commit as the refactor.

</decisions>

<deferred_ideas>
- Wire `react-compiler/react-compiler` ESLint rule (still deferred — codebase-wide impact)
- Convert other selection-heavy pages to the same store pattern (Transactions list bulk-select) — out of scope, separate phase
- Add `data-testid` markers on the new store-driven elements if e2e tests need them (likely none — testids on the actual checkboxes already exist)
- Investigate `useSplitSummary` / `useDuplicateTransactionCheck` for additional intra-row updaters — defer to a follow-up profile after P18 ships
</deferred_ideas>

<follow_ups_for_planner>
1. **Two distinct interventions, single phase, single commit OR two commits — TBD by executor.** Recommend two commits for clean attribution: one for option-stabilization, one for selection store.
2. **Re-baseline with `just profile` after the refactor.** Capture all 4 cenários to `frontend/profilling/p18_cenario_{1..4}.json`. Compare against P17 numbers in `18-PERF-COMPARISON.md`.
3. **Expected P18 outcomes:**
   - Cenário 2 commit duration drops further (intra-row updater fix from option-stabilization)
   - Cenário 3 & 4 page-level cascade gone — `ImportTransactionsPage` no longer in `updaters` for those commits
   - Page-level still re-renders on toggle (subscribed to `selected.size`), but the cascade through all 100 rows is broken
4. **Verification gates:**
   - `grep -n "categories\.map\|accounts\.map\|accounts\.filter" frontend/src/components/transactions/import/ImportReviewRow.tsx` returns 0 matches
   - `grep -n "useState<Set<number>>" frontend/src/pages/ImportTransactionsPage.tsx` returns 0 matches
   - `npx tsc --noEmit` exits 0; `npx vite build` succeeds
   - Profiler: `ImportTransactionsPage` NOT in `updaters` for any of the 4 cenários (or, if it is, ONLY because of the count-subscription which is acceptable as long as `ImportReviewRow2` instance count drops to 1 in cenário 3 and ~50 in cenário 4)

</follow_ups_for_planner>

---

_Context drafted 2026-05-07. Executing inline._
