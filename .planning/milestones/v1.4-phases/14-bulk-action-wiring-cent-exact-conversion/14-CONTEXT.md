# Phase 14: Bulk Action Wiring & Cent-Exact Conversion - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the `BulkDivisionDrawer` (built in Phase 13) into the transactions route, add a "Divisão" menu item to `SelectionActionBar`, handle the 0-connected-accounts disabled state, implement the percentage→cents per-transaction conversion (last-split-absorbs-rest), and route the per-tx PUT through the existing `BulkProgressDrawer`. Silently skip transactions that cannot accept a bulk split change (linked, transfer).

**In scope (this phase):** UI-01, UI-02, PAY-01, PAY-02, PAY-03, BULK-01, BULK-02, BULK-03.

**Out of scope (Phase 13):** BulkDivisionDrawer component, form, validation (DONE).
**Out of scope (Phase 15):** e2e tests, cent-exact unit tests.

</domain>

<decisions>
## Implementation Decisions

### Menu Integration (UI-01, UI-02)

- **D-01:** New menu item "Divisão" in `SelectionActionBar.tsx` placed **before** the `Menu.Divider` that precedes "Excluir" (issue #86 precise position).
- **D-02:** Icon: `IconShare` from `@tabler/icons-react` — matches the existing split/"Divisão" icon used in `frontend/src/components/transactions/import/ImportCSVBulkToolbar.tsx:63` (keeps split semantics visually consistent across the app).
- **D-03:** Handler prop: `onDivisaoChange: () => void` on `SelectionActionBar` (mirrors `onCategoryChange`/`onDateChange` naming). Route's `handleDivisionClick` passes it in.
- **D-04:** `data-testid="btn_bulk_division"` on the menu item (matches `btn_bulk_category` / `btn_bulk_date` / `btn_bulk_delete` convention).
- **D-05:** **UI-02 disabled state:** When the user has 0 connected accounts (count of `accounts.filter(a => a.user_connection?.connection_status === "accepted")` === 0), the "Divisão" menu item is rendered with Mantine's `disabled` prop and displays an explanatory tooltip/text. The `SelectionActionBar` computes `connectedAccountsCount` either from a prop passed by the route (preferred — route already has accounts) or by calling `useAccounts` itself.
  - **Preferred:** pass `connectedAccountsCount: number` as a new prop on `SelectionActionBar`; the route computes it once. Keeps `SelectionActionBar` pure.

### Route Handler (`handleDivisionClick` in `frontend/src/routes/_authenticated.transactions.tsx`)

- **D-06:** Handler mirrors `handleCategoryChange`/`handleDateChange` structure exactly:
  1. `const splits = await renderDrawer<Transactions.SplitSetting[]>(() => <BulkDivisionDrawer />)`
  2. If `hasRecurring`, `await renderDrawer<PropagationSetting>(() => <PropagationSettingsDrawer actionLabel="alterar" />)` — **propagation drawer IS shown** when the selection has recurring txs (user-selected, matches category/date patterns).
  3. `const items = getEligibleIds()...` — reuse existing linked-tx filter; also extend the filter to exclude `tx.type === 'transfer'` (see D-09).
  4. `void renderDrawer(() => <BulkProgressDrawer items={items} action={async (item) => { ... }} ... />)`.
- **D-07:** Wrap in `try { ... } catch { /* dismissal — silent exit */ }` — mirrors `handleCategoryChange` exactly. The user dismissing any drawer in the chain (drawer, propagation, or simply backing out) is NOT an error.

### Cent-Exact Conversion (PAY-01)

- **D-08:** Extract a pure helper function `splitPercentagesToCents(amount: number, splits: Transactions.SplitSetting[]): Transactions.SplitSetting[]` in a **new file** `frontend/src/utils/splitMath.ts`.
  - Signature: takes the total `amount` in cents and the array of `{ connection_id, percentage }` from the drawer; returns an array of `{ connection_id, amount }` (no `percentage` in output — PAY-02).
  - Algorithm: for each split at index `i < splits.length - 1`, compute `amount = Math.round(total * percentage / 100)`. The **last split** (index `splits.length - 1`) gets `amount = total - sum_of_previous_amounts` — absorbs rounding remainder. Guarantees `Σ amount === total` exactly for any percentage mix.
  - "Last" = the last element in the form's order (issue #86 literal wording). Deterministic, no sort step.
- **D-09:** The helper lives in its own file for unit-testability in Phase 15 (TEST-02). The route handler imports it and calls per tx: `const perTxSplits = splitPercentagesToCents(tx.amount, rawSplits)`.

### Transfer Handling (BULK-02 extension)

- **D-10:** Extend `getEligibleIds()` (or introduce a new helper `getDivisionEligibleIds()`) so that transactions with `tx.type === 'transfer'` are **silently excluded** from the bulk division flow. Transfers cannot carry `split_settings` (`buildFullPayload` already sets `split_settings = undefined` for transfers). Silent skip matches BULK-02 (linked txs) and the SEL-02 pattern from v1.2.
- **D-11:** The silent-skip filter ordering: (a) user ownership (existing `original_user_id` check), then (b) type !== 'transfer', then (c) build items. If after filtering `items.length === 0`, return early without opening the progress drawer.

### Payload Shape (PAY-02, PAY-03, Override Semantics)

- **D-12:** `buildFullPayload(tx, { split_settings: perTxSplits })` — reuse the existing helper. Pass `perTxSplits` as the override so the existing splits on `tx` are **replaced** (PAY-02 implied by "aplicar"; override, not merge — see deferred for why merge was rejected).
- **D-13:** Wire format verification: `perTxSplits[*]` has only `connection_id: number` and `amount: number` — no `percentage` field (PAY-02). `splitPercentagesToCents` MUST NOT return `percentage` in its output objects. The backend rejects (400) if both `amount` and `percentage` are present.
- **D-14:** `buildFullPayload` already sends the full transaction payload (PAY-03 handled by existing code; no change needed to `buildFullPayload` for this phase).

### Progress Drawer (BULK-01, BULK-03)

- **D-15:** Reuse `BulkProgressDrawer` exactly like `handleCategoryChange` does. Titles:
  - `processing: 'Alterando divisão...'`
  - `success: 'Transações atualizadas'`
  - `error: 'Erro ao atualizar'`
  - `successMessage: (n) => n === 1 ? '1 transação atualizada com sucesso' : '${n} transações atualizadas com sucesso'`
  - `testIdPrefix: 'bulk_division'`
- **D-16:** Income transactions (`tx.type === 'income'`) are **not filtered** — they pass through the same `updateTransaction` call with `split_settings`. Backend already supports income splits (per PR #57 / commit `ffc70da`). BULK-03 is satisfied by the existing generic code path — no special case needed. Tests in Phase 15 should cover at least one income tx in a mixed selection.

### Claude's Discretion

- Exact Portuguese copy for progress-drawer titles — the strings above mirror category/date conventions; planner can refine.
- Whether to inline the transfer-skip filter into `getEligibleIds()` (adds `type !== 'transfer'`) or introduce a new dedicated helper. Both are fine; prefer the latter if it'd make `getEligibleIds` confusing for other handlers.
- Exact tooltip copy for the disabled "Divisão" menu item (e.g. "Conecte uma conta para usar esta ação").
- Whether to add a `disabled` prop to `SelectionActionBar` that accepts a feature-scoped object, or just add a new `canDivide: boolean` prop. Keep it simple.
- Where the `splitPercentagesToCents` helper's unit tests live (planner/Phase 15 to decide; prefer `frontend/src/utils/splitMath.test.ts` co-located).

### Folded Todos

None.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Spec

- `.planning/REQUIREMENTS.md` §v1.4 — requirement IDs UI-01, UI-02, PAY-01, PAY-02, PAY-03, BULK-01, BULK-02, BULK-03
- `.planning/ROADMAP.md` §"Phase 14" — phase goal + success criteria
- GitHub issue #86 — feature source (mentions `IconArrowsSplit2` but we overrode to `IconShare` per D-02 to match existing split/"Divisão" iconography)

### Code to reuse / extend

- `frontend/src/routes/_authenticated.transactions.tsx` — add `handleDivisionClick`, pass new props to `SelectionActionBar`. Key existing helpers: `getEligibleIds`, `buildFullPayload`, `hasRecurring`, `updateTransaction`, `invalidateTransactions`, `clearSelection`, `currentUserId`.
- `frontend/src/components/transactions/SelectionActionBar.tsx` — add "Divisão" `Menu.Item` before the `Menu.Divider` (line 57 currently). Add `onDivisaoChange` and `connectedAccountsCount` props.
- `frontend/src/components/transactions/BulkDivisionDrawer.tsx` — produced in Phase 13, contract is `useDrawerContext<Transactions.SplitSetting[]>` returning `[{ connection_id, percentage }]` on submit or rejecting on dismiss.
- `frontend/src/components/transactions/BulkProgressDrawer.tsx` — reused (no changes).
- `frontend/src/components/transactions/PropagationSettingsDrawer.tsx` — reused with `actionLabel="alterar"` (no changes).
- `frontend/src/api/transactions.ts` — `updateTransaction(id, payload)` (no changes).
- `frontend/src/components/transactions/import/ImportCSVBulkToolbar.tsx:63` — precedent for `IconShare` + "Divisão" labeling.

### Conventions

- `frontend/CLAUDE.md` — drawers via `renderDrawer`, TypeScript namespaces (`Transactions.SplitSetting`), custom hooks for queries/mutations.
- `CLAUDE.md` (root) — cents as int64 end-to-end (THIS PHASE is where cents actually enter the wire for split changes).

### Contracts

- `frontend/src/types/transactions.ts` — `Transactions.SplitSetting` (has both optional `percentage` and `amount`; we only set `amount` on the wire per PAY-02). `Transactions.UpdateTransactionPayload` (has `split_settings?`).
- Backend: `PUT /api/transactions/{id}` — rejects 400 when both `percentage` and `amount` are sent together; accepts `amount`-only. Existing validator from v1.2.

### Existing Phase 13 artifacts

- `.planning/phases/13-bulkdivisiondrawer-form/13-CONTEXT.md` — upstream drawer decisions (D-01..D-13 in that file). Notable: drawer returns raw percentage values; conversion is Phase 14's job.
- `.planning/phases/13-bulkdivisiondrawer-form/13-01-SUMMARY.md` — confirms the Phase 14 integration point: `await renderDrawer<Transactions.SplitSetting[]>(() => <BulkDivisionDrawer />)`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`handleCategoryChange` / `handleDateChange`** in `_authenticated.transactions.tsx` — textbook pattern to mirror. `handleDivisionClick` copies the structure, swaps the input drawer, and inserts the percentage→cents conversion step before `BulkProgressDrawer`.
- **`getEligibleIds()`** (line 93) — already filters out linked transactions where the current user is not the original creator. Phase 14 extends it (or adds a sibling) to also exclude transfers.
- **`buildFullPayload(tx, overrides)`** (line 100) — already does PAY-03. Pass `{ split_settings: perTxSplits }` as overrides.
- **`BulkProgressDrawer`** — already supports the exact execution model needed (sequential, stop-on-error, progress UI, remaining-items list on failure).
- **`PropagationSettingsDrawer`** — already accepts `actionLabel` and handles the three propagation modes. Reused as-is.
- **`SelectionActionBar`** — already has `onCategoryChange` / `onDateChange` / `onDelete` props. Adding `onDivisaoChange` is a mechanical extension.
- **`ImportCSVBulkToolbar.tsx:63`** — establishes `IconShare` as the split/"Divisão" icon. Reuse the same icon for visual consistency across bulk-action surfaces.

### Established Patterns

- **Route handler flow:** input drawer → optional propagation drawer → eligibility filter → progress drawer.
- **Silent-skip filtering:** `getEligibleIds()` at the top of handlers, applied consistently across category/date/delete. Phase 14 extends for transfers.
- **Menu items:** `Menu.Item` with `leftSection`, `onClick` prop, `data-testid`. Divider placement is stable: everything above the divider is "update", everything below is "destructive" (Excluir).
- **`data-testid` prefixes:** `btn_bulk_<action>`, `bulk_<action>` for progress drawer.

### Integration Points

- **SelectionActionBar props surface:** extend with `onDivisaoChange: () => void` and `connectedAccountsCount: number`. Do NOT add a `disabled` prop with multiple booleans — keep it targeted.
- **Route handler:** new `handleDivisionClick` positioned alongside the existing handlers.
- **New file:** `frontend/src/utils/splitMath.ts` with `splitPercentagesToCents`. No new hooks or API clients needed.

</code_context>

<specifics>
## Specific Ideas

- The helper `splitPercentagesToCents` uses `Math.round(total * percentage / 100)` for non-last splits, then the last split gets `total - Σ(previous amounts)`. This is the literal issue #86 prescription.
- The last-split order is the drawer's form order (the array RHF returns). Do NOT sort. Keep determinism trivial.
- Propagation drawer IS shown for recurring txs (user chose consistency with category/date over "splits don't propagate conceptually"). The handler passes the captured `PropagationSetting` to each recurring tx's payload via `payload.propagation_settings = propagation` — mirroring category/date handlers.
- Icon: `IconShare` (not `IconArrowsSplit2` from the issue) — matches the app's existing split iconography.
- Test IDs: `btn_bulk_division`, `bulk_division`.

</specifics>

<deferred>
## Deferred Ideas

- **Merge existing splits into bulk splits** — rejected. Produces near-always-invalid state. Not revisited.
- **Skip txs that already have splits** — rejected as surprising UX.
- **Convert transfers to expenses on the fly** — rejected as out of scope for #86.
- **Propagation-drawer variant for split actions specifically** — e.g. a drawer that explains "this split applies only to this installment, not the series". Considered but not needed; the standard PropagationSettingsDrawer with `actionLabel="alterar"` is clear enough.
- **Per-tx error recovery / retry** — BulkProgressDrawer stops on first error with a "remaining: [...]" list. Good enough for v1.4. A retry-failed-items button would be useful for a future polish phase.
- **Preview of what splits look like for a representative tx** — rejected in Phase 13; not reconsidered here.

</deferred>

---

*Phase: 14-bulk-action-wiring-cent-exact-conversion*
*Context gathered: 2026-04-20*
