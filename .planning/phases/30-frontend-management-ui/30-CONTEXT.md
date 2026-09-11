# Phase 30: Frontend Management UI - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the template self-service lifecycle on the frontend: a **management drawer** to create/edit/delete templates, a **TemplateForm**, and a **"Save as template"** action inside the create-transaction form. Closes MNG-01 and MNG-02 (the last two v1.7 requirements).

**In scope:**
- **Mutation data layer:** `createTransactionTemplate` / `updateTransactionTemplate` / `deleteTransactionTemplate` in `src/api/transactionTemplates.ts`; `useCreateTransactionTemplate` / `useUpdateTransactionTemplate` / `useDeleteTransactionTemplate` in `src/hooks/useTransactionTemplates.ts` (each returns `{ mutation }`, caller owns invalidation). A pure `buildTemplatePayloadFromForm(values, tags)` (inverse of `buildTemplateFormPatch`).
- **TemplateForm** (`src/components/transactions/templates/`): name + type + account + category + tags + description + split (`SplitSettingsFields` in **`templateMode`**, Phase 28). RHF + zod. Reuses the transaction form's field JSX (fields are inline in `TransactionForm`, not extractable — copy the Controller blocks).
- **TemplatesManagementDrawer**: lists the user's templates (name + type + account), "+ Novo" opens the TemplateForm to create, per-row edit opens TemplateForm with the template, per-row delete confirms then deletes. Opened from the transactions toolbar "more options" menu.
- **"Save as template"** action in the create-transaction form: a button that snapshots the current form values, opens a small confirm-name mini-drawer (name pre-filled from `description`), then creates the template. Disabled when the user already has 3 templates.
- Testids + vitest coverage for the pure payload builder and the presentational pieces.

**Out of scope:** E2E (Phase 31). No backend changes (Phase 27 API is complete).

Requirements covered: **MNG-01, MNG-02**.
</domain>

<decisions>
## Implementation Decisions

- **D-01 (UX, decided): Entry point = the existing "more options" (IconDots) menu** on the transactions toolbar (`TransactionsPage.tsx`), a new `Menu.Item` "Gerenciar modelos" next to "Importar transações". Works desktop + mobile, no new toolbar real estate.
- **D-02 (UX, decided): "Save as template" opens a mini confirm-name drawer.** Name pre-filled from `description` (editable), one confirm button. The action button is **disabled when `templates.length >= 3`** (backend also enforces the cap → defense in depth).
- **D-03: Management surface is a drawer via `renderDrawer`** (not a route), mirroring the accounts flow (`AccountsPage` dispatch + `AccountDrawer` shell + `DeleteCategoryModal` confirm). Nested `renderDrawer` calls are fine — each mounts its own isolated root.
- **D-04: Mutation hooks follow the repo convention** — `{ mutation }` only, `onSuccess` passed by the caller; the caller calls the `useTransactionTemplates().invalidate` so the chip row AND the management list refresh immediately (TanStack dedupes on `QueryKeys.TransactionTemplates`). Satisfies success criteria 2/3/4 "updates immediately".
- **D-05: `buildTemplatePayloadFromForm(values, tags)` is pure + tested** and mirrors `buildTransactionPayload`'s transfer handling: `tag_ids` resolved from names via `tags` (drop names with no id — templates can't create tags); `category_id`/`split_settings` omitted for transfers; `destination_account_id` only for transfers; NO amount/date. Produces `Transactions.TemplatePayload`.
- **D-06: TemplateForm reuses transaction-form field JSX by copying the Controller blocks** (type SegmentedControl, account/category Selects, TagsInput, DescriptionAutocomplete, SplitSettingsFields). The map confirms these are inline in `TransactionForm`/`TransactionAccordionSections`, not standalone. Field names match `TransactionFormValues` where they overlap, but the TemplateForm's own schema omits amount/date/recurrence and adds `name`.
- **D-07: PUT is a full replace** (backend D-06). Editing sends the whole `{ name, payload }`.
- **D-08: Delete confirms first** (mirror `DeleteCategoryModal`) — no silent delete.

### Claude's Discretion
- Exact testid names (management drawer, list rows, form fields, save-as-template button + mini-drawer), following `src/testIds/` conventions (add to `transactions.ts` or a new `templates.ts`).
- TemplateForm zod schema shape (reuse `baseTransactionFields` subset vs a fresh schema); folder (`src/components/transactions/templates/`).
- Whether the save-as-template mini-drawer is a `renderDrawer` or a small inline popover — `renderDrawer` preferred for consistency.
- Whether to split the management list row into its own component (recommended if the drawer grows past ~200 lines).
</decisions>

<canonical_refs>
## Canonical References
- `.planning/ROADMAP.md` §"Phase 30" — goal + 5 success criteria
- `.planning/REQUIREMENTS.md` — MNG-01, MNG-02
- `frontend/CLAUDE.md` — renderDrawer (§8), data-fetching (query/mutation hooks), forms (RHF+zod), no `any`, no new `useEffect`, testid conventions
- The Phase 30 implementation map (below)
- Phase 29 artifacts: `useTransactionTemplates` (query + `invalidate`), `Transactions.Template`/`TemplatePayload`, `applyTemplate.ts` (`buildTemplateFormPatch` — the inverse), `TemplateQuickChips`
</canonical_refs>

<code_context>
## Implementation Map (from codebase exploration)

**renderDrawer** (`src/utils/renderDrawer.tsx`): `useDrawerContext<T>()` → `{ opened, close(value), reject(err?) }`; `renderDrawer<T>(factory)` → `Promise<T>`.

**Mirror flow = Accounts:**
- `src/pages/AccountsPage.tsx` — `handleAdd`: `void renderDrawer(() => <AccountDrawer />)`; `handleEdit(account)`: `renderDrawer(() => <AccountDrawer account={account} />)`; `const { invalidate } = useAccounts()` passed to mutations' `onSuccess`.
- `src/components/accounts/AccountDrawer.tsx` (62 lines) — `const { opened, close, reject } = useDrawerContext<Transactions.Account | void>()`; create: `createMutation.mutate(payload, { onSuccess: async (created) => { await invalidate(); close(created) } })`; `<ResponsiveDrawer opened={opened} onClose={reject} title={account ? 'Editar' : 'Novo'}>`.
- `src/components/categories/DeleteCategoryModal.tsx` — confirm pattern: `<Modal opened onClose={reject}>`, Cancel→`reject`, Confirm→`mutation.mutate(...)`, `data-testid={CategoriesTestIds.BtnConfirmDelete}`.

**Entry point:** `src/pages/TransactionsPage.tsx` — the `IconDots` `Menu.Dropdown` (~L678-697) currently has one item "Importar transações" (`MenuItemImportTransactions='menu_item_import_transactions'`, target `BtnMoreOptions='btn_more_options'`). Add a sibling `Menu.Item` "Gerenciar modelos" → `void renderDrawer(() => <TemplatesManagementDrawer />)`.

**Reusable field JSX (all inline — copy):** type SegmentedControl (`TransactionForm.tsx` ~L332-368, `SegmentTransactionType`/`SegmentedTransactionType`), account Select (~L442-473, `useGroupedAccountOptions`, `SelectAccount`/`OptionAccount`), category Select (~L528-551, `useFlattenCategories`, `SelectCategory`), TagsInput (`TransactionAccordionSections.tsx` ~L255-270, `useTags`, `TagsInput`), `DescriptionAutocomplete` (standalone, reusable), `SplitSettingsFields` (standalone; pass `templateMode`).

**Payload builder:** existing `src/utils/buildTransactionPayload.ts` maps `values.tags` (names) → `[{id?,name}]`; the template needs `tag_ids: number[]` only (resolve via `useTags()` → `Tag[]`, drop unmatched). `Transactions.TemplatePayload = { type, account_id?, category_id?, destination_account_id?, description, tag_ids?, split_settings? }` (no amount/date).

**Mutation/API mirror:** `src/hooks/useCategories.ts` (useCreate/Update/DeleteCategory → `{ mutation }`, caller `onSuccess`); `src/api/categories.ts` (POST/PUT/DELETE with `credentials:'include'`, JSON headers, `throw new Error(data.message ?? ...)` on `!res.ok`). Current `src/api/transactionTemplates.ts` has ONLY `fetchTransactionTemplates` — ADD create/update/delete. Backend: `POST {name,payload}` → 201 template; `PUT /:id {name,payload}` → 204; `DELETE /:id` → 204.

**Save-as-template:** children of the create form are inside `FormProvider` (CreateTransactionDrawer) → use `useFormContext().getValues()` to snapshot. Button fits in `TransactionFormFooter.tsx` (desktop `Group` with "Salvar e criar outra" + "Salvar") or near `TemplateQuickChips`. Count via `useTransactionTemplates()` → disable at `>=3`. Description field name is `description`.

**Chip refresh:** `useTransactionTemplates().invalidate()` (queryKey `QueryKeys.TransactionTemplates`) after any mutation refreshes chips + list. Chip testids already at `src/testIds/transactions.ts` (`TemplateChipsRow`, `TemplateChip(id)`).
</code_context>

<specifics>
## Specific Ideas
- 3 plans: (01) mutation data layer + `buildTemplatePayloadFromForm` + unit test; (02) TemplateForm + TemplatesManagementDrawer + toolbar entry point; (03) "Save as template" mini-drawer + footer button. 02 and 03 both edit `testIds/transactions.ts` → serialize (waves 1→2→3).
- Management list row shows: name (primary), type badge, account name.
- Save-as-template disabled tooltip: "Você já tem 3 modelos" when at cap.
</specifics>

<deferred>
## Deferred Ideas
- E2E coverage (Phase 31).
- Reordering / raising the 3-cap / shared templates (future milestone).
</deferred>

---

*Phase: 30-frontend-management-ui*
*Context gathered: 2026-07-10*
