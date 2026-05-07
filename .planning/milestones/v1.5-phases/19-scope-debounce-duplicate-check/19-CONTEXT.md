# Phase 19 — Scope & Debounce Duplicate Check — CONTEXT

**Phase:** 19
**Milestone:** v1.5 Import Transactions Performance
**Date:** 2026-05-07

<domain>
Eliminate cenário 2's residual ~64 ms commit duration on amount keystrokes by narrowing the per-row subscriptions that fire on `[date, amount]` changes, and add `enabled: action === 'import'` gating to `useDuplicateTransactionCheck` so skip/duplicate rows do not subscribe at all.

ROADMAP-locked goals are about network burst mitigation. Investigation during P19 setup confirms the hook **already** uses `useDebouncedValue(value, 500ms)` for both date and amount, so the network burst is already prevented (the existing 500ms debounce holds). The real perf gap surfaced in P18 cenário 2 (`ImportReviewRow2` updater alongside Controller) is the row's outer `useWatch` subscribing to `amount` and `date`, which makes the entire row's Mantine subtree re-render on every keystroke.

**Scope expansion:** in addition to the debounce/enabled goals from ROADMAP, this phase extracts a `<RowDuplicateCheck>` sub-component that subscribes to `[date, amount]` internally so the row outer no longer does. This is the actual fix for cenário 2's 64 ms.
</domain>

<canonical_refs>
- `.planning/phases/18-options-and-selection-rearch/18-PERF-COMPARISON.md` — cenário 2 still at 64 ms after P18 (intra-row updater identified as P19 territory)
- `.planning/ROADMAP.md` — Phase 19 SC1–SC4 (lines 147–156)
- `frontend/CLAUDE.md` §3 (TanStack Query patterns), §4 (no useEffect in components — hooks live in src/hooks/)
- `frontend/src/hooks/import/useDuplicateTransactionCheck.ts` — current hook (already debounced 500ms via Mantine `useDebouncedValue`, has eslint-disable on exhaustive-deps for the stable RHF callbacks)
- `frontend/src/components/transactions/import/ImportReviewRow.tsx` — caller at lines 90–98; current row useWatch at lines 71–86 watches 10 fields including `date` and `amount`
- `frontend/src/components/transactions/import/SplitPopover.tsx` — current `rowAmount: number` prop is redundant because `handleOpen` reads the live amount via `parentForm.getValues(rowPath).amount`
</canonical_refs>

<code_context>
**Current hook signature** (`useDuplicateTransactionCheck.ts`):

```ts
interface Args {
  date: string
  amount: number
  accountId: number
  getCurrentAction: () => 'import' | 'skip' | 'duplicate'
  setAction: (action: 'import' | 'duplicate') => void
  debounceMs?: number  // default 500
}
```

Internally:
- `useDebouncedValue(date, 500ms)` and `useDebouncedValue(amount, 500ms)` from `@mantine/hooks`
- `useEffect([debouncedDate, debouncedAmount])` runs `checkDuplicateTransaction` and conditionally flips `action`
- Initial mount skip via `initialRef` so the backend's pre-computed duplicate status isn't overridden

**Why the row re-renders on amount keystroke** (cenário 2, P18 measurement):
The row's outer `useWatch` subscribes to 10 fields including `amount` and `date`. Each keystroke flips amount → row re-renders → Mantine subtree (3× Select, 1× DatePickerInput, 1× CurrencyInput, 1× TextInput, several Boxes/Inputs/Wrappers) all re-execute. Top self-time in P18 cenário 2: `@mantine/core/Box` 15.5 ms, `Option` 6.6 ms, `OptionsDropdown` 2.5 ms, `Select` 2.1 ms — sum ~45 ms of the 64 ms total.

**Where `amount` and `date` are actually consumed** at row scope:
- `amount` → `<SplitPopover rowAmount={amount as number}>` (line 388). Popover's `rowAmount` prop is redundant: `handleOpen` reads via `parentForm.getValues(rowPath).amount`; the prop only feeds `defaultValues` on mount which is overwritten on every popover open.
- `date` → `useDuplicateTransactionCheck`. No JSX usage at row scope (the cell uses Controller, which has its own subscription).

Both can move into sub-components subscribing internally.

**Roadmap reference (SC):**
1. `enabled: action === 'import'` gating (locked)
2. Debounce 200–300ms on `[date, amount]` (already at 500ms — keep)
3. Editing amount in 500-row CSV does not generate sustained duplicate-check burst (already met by existing debounce + new enabled gating)
4. Detection still correct E2E (regression-test boundary)
</code_context>

<decisions>

### Hook signature change (LOCKED)
- Add optional `enabled?: boolean` (default `true`). When `false`, the hook short-circuits in the effect and does NOT call the backend. Also short-circuits the initial-mount skip logic to avoid stale initialRef behavior on later enable.
- **No change to `debounceMs` default** (stays at 500ms). The roadmap's "200-300ms" figure was written before the actual debounce was discovered — 500ms is more conservative and still well under "perceptibly delayed" UX.
- Hook does NOT change its return shape (still `void`).

### Row-watch narrowing (LOCKED — scope expansion vs ROADMAP)
- Extract a `<RowDuplicateCheck rowIndex={i} accountId={...} />` component at the bottom of `ImportReviewRow.tsx`. It subscribes to `[date, amount, action]` via its own `useWatch`, runs the hook, and returns `null` (no JSX).
- Drop `date` and `amount` from the row's outer `useWatch` (lines 71–86). Row outer subscribes to 8 fields instead of 10.
- The row no longer re-renders on amount/date keystrokes. Only the `<RowDuplicateCheck>` sub-component (which has no DOM output), the amount Controller (legitimate; it owns the input value), and any open SplitPopover re-render.

### `rowAmount` prop removal (LOCKED)
- Drop `rowAmount: number` from `SplitPopover` interface. `handleOpen` already reads the live amount via `parentForm.getValues`. The `defaultValues.amount` on local form mount becomes `0` — overwritten by `localForm.reset` in `handleOpen` whenever the popover opens.
- This unblocks step 2 above (no need to keep amount in row's outer useWatch).

### Compiler wiring — STILL skipped
- Carry-over from P17/P18. Maintains clean attribution chain.

### Testing
- E2E specs under `frontend/e2e/tests/import*.spec.ts` cover the duplicate-check + bulk action flows. Run `npm run test:e2e -- --grep import` after the refactor to catch regressions. If an e2e fails because of this refactor, fix it inside P19. (If it fails for unrelated pre-existing reasons, document and defer.)
- No new unit tests required for this refactor (the hook's behavior is unchanged when `enabled=true`; the gate is a trivial early-return).

</decisions>

<deferred_ideas>
- React Compiler wiring — still pending follow-up phase
- Lower debounceMs to 300ms if user feedback says 500ms feels sluggish — defer until real user complaints
- Cancel in-flight `checkDuplicateTransaction` requests on subsequent debounced changes — current behavior fires-and-forgets and treats older results as "stale ok". Acceptable for v1.5; revisit if duplicate-flicker is observed
- Migrate `useDuplicateTransactionCheck` to a TanStack Query mutation/query for built-in cancellation + dedupe — defer; current shape is fine
- Performance budget gate in CI for cenário 2 commit duration — defer to v1.6+
</deferred_ideas>

<follow_ups_for_planner>
1. **One commit, three coordinated changes** — hook signature, RowDuplicateCheck extraction, SplitPopover prop removal. Coupled change; splitting them mid-flight risks an inconsistent intermediate state.
2. **Verification:**
   - `grep -nE "name: \[[^]]*\\.amount" frontend/src/components/transactions/import/ImportReviewRow.tsx` shows `amount` ONLY in the duplicate-check sub-component or the SplitPopover, NOT in the row outer's useWatch
   - `grep -n "rowAmount" frontend/src/components/transactions/import/` returns 0 matches
   - `npm run lint`, `npx tsc --noEmit`, `npm run build` all exit 0
3. **Re-measure with `just profile`.** Capture the 4 cenários to `frontend/profilling/p19_cenario_{1..4}.json`. Cenários 1, 3, 4 should be unchanged (or marginally changed). Cenário 2 should drop dramatically — target: <16 ms (matching the P19→P20 gate threshold).
4. **If cenário 2 is at <16 ms after P19**, the P19→P20 gate is **fully met for keystroke + checkbox axes**. Cenário 4 (shift-click) at ~455 ms is the only remaining "perceptibly slow" path. P20 (virtualization) becomes a clear "skip" decision for the 100-row hard limit. P21 absorbs final verification.
</follow_ups_for_planner>

---

_Context drafted 2026-05-07. Executing inline._
