# Phase 9: Bulk Actions - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add bulk category change and bulk date change actions to the existing transaction selection system. Extend the SelectionActionBar with a dropdown menu, reuse propagation drawer for installments, and show progress via a generalized progress drawer.

</domain>

<decisions>
## Implementation Decisions

### Toolbar Layout
- **D-01:** Replace single "Excluir" button with "Ações" dropdown menu containing: Alterar categoria, Alterar data, Excluir. Cleaner UX, one extra tap.
- **D-02:** SelectionActionBar keeps [X close] [count] [Ações menu] layout. Mantine `Menu` component.

### Progress Drawer
- **D-03:** Generalize BulkDeleteProgressDrawer into a generic BulkProgressDrawer that accepts an action function. Both delete and update operations use the same component.
- **D-04:** Generic drawer accepts: list of items, action fn per item, success/error labels. Same sequential processing + stop-on-error pattern.

### Action Flow UX
- **D-05:** Category action: reuse the CreateCategoryDrawer from import page but in read-only mode (selection only, no create/edit). User taps a category → drawer closes with selected category → propagation check → progress drawer.
- **D-06:** Date action: bottom drawer with DateInput (reuse from transaction form) and "Aplicar" button. User picks date → drawer closes → propagation check → progress drawer.
- **D-07:** Fix bottom drawer content centering — content should be centered but drawer stays full width. Apply to all bottom drawers.

### Propagation
- **D-08:** Same flow as bulk delete: check if any selected tx has `transaction_recurrence_id`, if yes show PropagationSettingsDrawer before executing. Single choice applies to all.

### Selection Filtering
- **D-09:** Silently exclude linked transactions where user ≠ original_user_id from bulk actions. No error shown — just skip them during processing.

### Non-Optimistic Pattern
- **D-10:** (Carried from Phase 8) No optimistic updates for financial state transitions. Wait for server confirmation.

### Claude's Discretion
- Component naming and file organization for generalized BulkProgressDrawer
- Whether to pass category drawer a "readonly" prop or create a separate SelectCategoryDrawer component
- DateInput styling details within the bottom drawer

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Components to Reuse/Extend
- `frontend/src/components/transactions/SelectionActionBar.tsx` — Current toolbar, needs menu dropdown
- `frontend/src/components/transactions/BulkDeleteProgressDrawer.tsx` — Pattern to generalize into BulkProgressDrawer
- `frontend/src/components/transactions/PropagationSettingsDrawer.tsx` — Reuse as-is for installment propagation
- `frontend/src/components/transactions/import/CreateCategoryDrawer.tsx` — Base for read-only category selection drawer

### Integration Points
- `frontend/src/routes/_authenticated.transactions.tsx` — Main page with selection state, handleDeleteClick flow to follow
- `frontend/src/api/transactions.ts` — `updateTransaction()` supports partial payload (category_id, date, propagation_settings)
- `frontend/src/types/transactions.ts` — `UpdateTransactionPayload` interface (lines 175-187)
- `frontend/src/hooks/useCategories.ts` — Category data hook

### Patterns
- `frontend/src/utils/renderDrawer.tsx` — All drawers opened via renderDrawer helper
- `frontend/src/components/transactions/form/TransactionForm.tsx` — DateInput usage reference

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SelectionActionBar` — extend with Mantine Menu component instead of single button
- `BulkDeleteProgressDrawer` — generalize into BulkProgressDrawer (accepts action fn, labels)
- `PropagationSettingsDrawer` — reuse as-is, returns PropagationSetting via renderDrawer
- `CreateCategoryDrawer` — adapt for read-only selection mode (CategoryCard already exists)
- `DateInput` from @mantine/dates — used in TransactionForm, reuse in date picker drawer
- `renderDrawer` — standard pattern for opening drawers and awaiting results

### Established Patterns
- Selection state: `selectedIds` Set + `toggleSelection` callback in transactions page
- Bulk flow: check propagation → build payload → open progress drawer via renderDrawer
- `handleDeleteClick` in transactions page is the exact pattern to replicate for category/date
- Sequential processing with stop-on-error in progress drawer
- App language: Portuguese (pt-BR) for all UI labels

### Integration Points
- SelectionActionBar rendered conditionally when `isSelecting` is true (both mobile and desktop)
- `allTransactions` array in transactions page provides full tx objects for selected IDs
- `invalidateTransactions` callback already exists for post-action cache invalidation
- `currentUserId` available in transactions page for original_user_id filtering

</code_context>

<specifics>
## Specific Ideas

- Category selection: reuse CreateCategoryDrawer but make it readonly — only category selection, no inline create/edit/emoji. User taps CategoryCard to select.
- Date picker: simple bottom drawer with DateInput + "Aplicar" button. Same renderDrawer pattern.
- Bottom drawer centering fix: center drawer content while keeping drawer full width. Applies globally to bottom drawers.
- Menu items: "Alterar categoria", "Alterar data", "Excluir" in dropdown from toolbar.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-bulk-actions*
*Context gathered: 2026-04-17*
