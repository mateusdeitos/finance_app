# Phase 29: Frontend Chip Apply Flow - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the **template chip apply flow** on the transaction create form: a row of chips (one per saved template, styled like `DateQuickChips`) at the top of the form; clicking a chip fills the form from the template, leaves the amount blank, moves focus to the amount field, prefills the (editable) split, and silently degrades when a referenced account/category/tag was deleted.

**In scope:**
- **Data layer:** `Transactions.Template` + `Transactions.TemplatePayload` types; `src/api/transactionTemplates.ts` (`fetchTransactionTemplates` — `GET /api/transaction-templates`); `useTransactionTemplates` list query hook (with `select` generic); `QueryKeys.TransactionTemplates`.
- **UI:** presentational `TemplateQuickChips` component (mirrors `DateQuickChips`), rendered at the top of the create form; hidden when the user has 0 templates (APPLY-01 conditional).
- **Apply logic:** a pure `buildTemplateFormPatch(payload, { accounts, categories, tags })` that maps a template payload → `TransactionFormValues` fields, clearing stale references (APPLY-04); the form wires it via `setValue` per field + `setFocus("amount")` (mirroring the existing `handleSuggestionSelect` precedent).
- Testids + vitest coverage (pure patch mapping incl. stale-ref; chip row render/conditional).

**Out of scope (later phases):** create/edit/delete mutations + management drawer + "Save as template" (Phase 30, MNG-01/02); E2E (Phase 31). This phase only READS templates (list) and applies them; no write/mutation hooks.

Requirements covered: **APPLY-01, APPLY-02, APPLY-03, APPLY-04**.
</domain>

<decisions>
## Implementation Decisions

- **D-01 (LOCKED by user): Overwrite directly.** Clicking a chip applies the template immediately, overwriting any current input — no confirm-if-dirty dialog. The chip is a fast-entry shortcut.
- **D-02 (LOCKED by user): No persistent active state.** Chips are one-shot action buttons; no `data-active` highlight (unlike `DateQuickChips`). Once applied, the user edits freely and "active" would be misleading.
- **D-03: Apply is `setValue` per field + `setFocus("amount")`, inside `TransactionForm`.** The form consumes `useFormContext` and already exposes `setValue`/`setFocus`; the existing `handleSuggestionSelect` (setValue per field + reset `split_settings`) is the exact precedent. No `reset()` (that lives on the drawer's `methods`), no new `useEffect` (event handler only).
- **D-04: Amount blanked, date/recurrence untouched.** The patch sets `amount: 0` (blank) so the next keystroke enters the amount (APPLY-02). It does NOT touch `date` (form already defaults to today) or the recurrence fields. Template carries neither amount nor date (P26 D-02).
- **D-05: Fields the patch sets** (from `TemplatePayload`): `transaction_type` ← `type`; `description`; `account_id` (stale-guarded); `category_id` (stale-guarded); `destination_account_id` (stale-guarded); `tags` ← `tag_ids` mapped to tag NAMES via `useTags`, dropping ids with no live tag; `split_settings` ← passthrough (editable, APPLY-03).
- **D-06: Stale-reference handling (APPLY-04) is pure + tested.** `buildTemplateFormPatch` validates each id against live query data: unknown `account_id`/`destination_account_id` → cleared (`undefined`); unknown `category_id` → `null`; `tag_ids` with no matching tag are dropped from the resulting names. No error, no crash, all other fields preserved. `split_settings` connection staleness is out of APPLY-04's named scope — passthrough as-is (SplitSettingsFields renders a blank Select for an unknown connection, non-fatal).
- **D-07: Chips only in CREATE mode.** `TransactionForm` gains an additive `showTemplateChips?: boolean` (default `false`); `CreateTransactionDrawer` passes `true`. The edit/update flow does NOT show chips (applying a template — which blanks the amount — would corrupt an edit). Additive, non-breaking.
- **D-08: `TemplateQuickChips` is presentational.** Props `{ templates: Transactions.Template[]; onApply: (t) => void }`, returns `null` when `templates.length === 0` (mirrors `SplitSettingsFields`/`DateQuickChips` dumb-component style). All data + apply orchestration live in `TransactionForm`. This keeps the component trivially unit-testable.
- **D-09: API client error style.** `fetchTransactionTemplates` mirrors `src/api/accounts.ts` (`throw new Error(...)` on `!res.ok`); no tag-based error surfacing needed for a GET.

### Claude's Discretion
- Exact testid names (`TemplateChip(id)` factory + a `TemplateChipsRow` container id), CSS (reuse/copy `DateQuickChips.module.css`).
- Whether `buildTemplateFormPatch` lives in `applyTemplate.ts` next to the form or under `utils/`.
- `useTransactionTemplates` `staleTime` (mirror `useAccounts`, 5 min).
</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` §"Phase 29" — goal + 4 success criteria
- `.planning/REQUIREMENTS.md` — APPLY-01..04
- `frontend/CLAUDE.md` — data-fetching (query hook + `select` generic; API in `src/api/`), forms (RHF + `useWatch`), no `any`, no new `useEffect`, testid conventions
- The Phase 29 implementation map (below) — precise file:line integration points
- `frontend/src/components/transactions/form/DateQuickChips.tsx` — the chip component to mirror
- `backend/internal/handler/transaction_template_handler.go` + `backend/internal/domain/transaction_template.go` — the JSON contract (Phase 27)
</canonical_refs>

<code_context>
## Implementation Map (from codebase exploration)

**TransactionForm** (`src/components/transactions/form/TransactionForm.tsx`):
- Consumes `useFormContext<TransactionFormValues>()` (~L172-180): `control, handleSubmit, setValue, setError, clearErrors, setFocus, formState`. `handleSuggestionSelect` (~L225-239) is the apply precedent (setValue per field + reset split_settings).
- `DateQuickChips` renders mid-form (~L353-371). The **top of the visible stack** is inside `<Stack gap="md">` right after `{headerContent}` (~L291) and before the `generalError`/`transaction_type` block (~L292-298) — insert `TemplateQuickChips` there.
- Amount Controller (~L336-351): `<CurrencyInput ref={field.ref} data-testid={TransactionsTestIds.InputAmount}/>`. Focus via RHF `setFocus("amount")` (CurrencyInput exposes `focus()` via `useImperativeHandle`; form already uses `useFocusFieldOnMount`).
- `accounts` (`useAccounts`) + `categories` (`useFlattenCategories`) already available (~L166-170); `useTags()` is NOT imported here yet — add it for the tag_id→name mapping.

**transactionFormSchema** (`src/components/transactions/form/transactionFormSchema.ts`): `TransactionFormValues` = `{ transaction_type, description, amount, account_id, category_id, destination_account_id, split_settings: SplitSetting[], recurrence*, date: string, tags: string[] }`. NOTE `tags` are NAMES; template stores `tag_ids`. `splitSettingSchema` = `{ connection_id, percentage?, amount?, date? }` — matches backend.

**Data-layer mirrors:** `src/api/accounts.ts` (fetch wrapper: `fetch(\`${import.meta.env.VITE_API_URL ?? 'http://localhost:8080'}/api/...\`, { credentials:'include', headers:{'Content-Type':'application/json'} })`, `throw new Error` on `!res.ok`); `src/hooks/useAccounts.ts` (query hook + `select` generic + `invalidate`); `src/utils/queryKeys.ts` (flat `as const`, add `TransactionTemplates: 'transaction-templates'`).

**Backend contract:** `GET /api/transaction-templates` → 200 JSON array of `{ id, user_id, name, payload, created_at, updated_at }`; `payload` = `{ type, account_id?, category_id?, destination_account_id?, description, tag_ids?: number[], split_settings?: SplitSettings[] }` (no amount/date). Frontend has NO `Transactions.Template` type yet.

**Types** (`src/types/transactions.ts`): `TransactionType`, `Account {id,...,is_active,user_connection?}`, `Category {id,...,parent_id?}`, `Tag {id,user_id,name}`, `SplitSetting {connection_id, percentage?, amount?, date?}` — reuse `SplitSetting` in `TemplatePayload`.

**Form instantiation** (`src/components/transactions/CreateTransactionDrawer.tsx`): `useForm<TransactionFormValues>({ resolver, defaultValues })` + `<FormProvider>` around `<TransactionForm focusField="amount" .../>`. Pass the new `showTemplateChips` here.
</code_context>

<specifics>
## Specific Ideas
- `buildTemplateFormPatch(payload, { accounts, categories, tags }): Partial<TransactionFormValues>` — pure, exhaustively unit-tested for stale-ref (APPLY-04).
- `TemplateQuickChips` returns `null` when `templates.length === 0` (APPLY-01 conditional render); chips are `UnstyledButton`s with `TemplateChip(id)` testids inside a `Group` with a `TemplateChipsRow` container testid.
- Apply handler: `const patch = buildTemplateFormPatch(t.payload, {accounts, categories, tags}); (Object.entries(patch)).forEach(([k,v]) => setValue(k, v)); setValue("amount", 0); setFocus("amount");` (type the entries carefully — no `any`).
</specifics>

<deferred>
## Deferred Ideas
- Template create/edit/delete mutations + management drawer + "Save as template" — Phase 30.
- E2E coverage of the chip apply flow — Phase 31.
- Filtering stale split-row connections — not in APPLY-04 scope; revisit if it surfaces.
</deferred>

---

*Phase: 29-frontend-chip-apply-flow*
*Context gathered: 2026-07-09*
