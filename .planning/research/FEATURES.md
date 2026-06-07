# Feature Research: Transaction Templates (v1.7)

**Domain:** Personal transaction templates / saved payee quick-entry in a couples finance app
**Researched:** 2026-06-07
**Confidence:** HIGH (grounded in codebase inspection + established patterns from Quicken memorized payees, Bluecoins autocomplete, Actual Budget templates, DateQuickChips pattern already in this codebase)

---

## Context: What this feature IS (locked decisions, do not re-litigate)

- Personal templates per user — NOT shared on the connection
- Template NEVER stores amount or date — amount always blank on apply, date defaults to today
- Template stores: `type`, `account_id`, `category_id`, `tags[]`, `description`, `split_settings` (JSONB)
- Max 3 templates per user
- Management UI: dedicated drawer to create / edit / delete + "Save as template" from transaction form
- Apply UX: a row of `UnstyledButton` chips above the form (mirror of `DateQuickChips` pattern), clicking `reset()`s the form to template values, leaving `amount` blank, and calls `setFocus('amount')`

---

## Table Stakes (Users Expect These)

Features without which the template feature feels incomplete or broken.

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Apply template → prefill all stored fields | Core value: no re-typing type/account/category/tags/description/split | LOW | Existing form `reset()` + `setFocus` already used in form |
| Amount field blank after apply, immediately focused | Template's entire value proposition is "type the amount and go" — unfocused blank is friction | LOW | `useFocusFieldOnMount` hook already exists; call `setFocus('amount')` after `reset()` |
| Chip label = template name (user-provided) | User must distinguish "Mercado" from "Farmácia" at a glance | LOW | Template entity needs a `name` field |
| Active chip highlight when applied | User needs confirmation of which template is active (mirrors `data-active` on `DateQuickChips`) | LOW | CSS Module `data-active` attribute, same pattern as `DateQuickChips.module.css` |
| Create template from scratch (management drawer) | Entry point when user hasn't just submitted a transaction | MEDIUM | New drawer + backend POST /api/templates |
| "Save as template" from transaction form | Fastest create path — user is already looking at the right values | LOW | Button in `TransactionFormFooter` or as `extraContent`; POST with current form values minus amount |
| Edit existing template (management drawer) | User's Mercado account changes; they need to update the account field | MEDIUM | Backend PUT /api/templates/:id |
| Delete template | Removing templates no longer needed | LOW | Backend DELETE /api/templates/:id; confirm before delete |
| List templates (chip row + management drawer) | Templates must be loadable; chip row renders them | LOW | Backend GET /api/templates; TanStack Query hook |
| Cap enforcement at 3 (UI + API) | Locked product decision; chip row is designed for exactly 3 | LOW | Backend: 409 when at limit; UI: disable "Save as template" + "Create" when at limit |
| IDOR scope: only owner can read/write | Templates are personal; partner must never see or modify them | LOW | Standard pattern already used for all entities in this codebase |

---

## Differentiators (Competitive Advantage)

Features that make the template UX genuinely delightful rather than merely functional, given the small (max-3) set.

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| Split config preserved and applied | Most finance apps don't save split — this app does because split is a first-class citizen | MEDIUM | Template stores `split_settings` JSONB; apply maps it into `split_settings` array on form |
| Re-apply chip toggles off (second tap clears) | UX polish: if user mis-taps, tapping same chip again returns to blank form (no hard reset needed) | LOW | Track `activeTemplateId` in local state; on same-chip tap, `reset()` to default values and clear active |
| Partial application of split: silently clear if split account deleted | Applied template with a deleted split partner account still fills all other fields; only the split row is omitted | MEDIUM | Requires stale-reference detection at apply time (see Edge Cases section) |
| "Save as template" fills management form with current transaction's values | User gets a pre-filled create form, not a blank one | LOW | Pass current `TransactionFormValues` as `defaultValues` into template management drawer |
| Chip row only shown when user has at least 1 template | No chip row rendered (no empty placeholder row) when zero templates exist | LOW | Conditional render in `TransactionForm`; avoids visual noise for new users |
| Template name auto-suggested from description | When opening "Save as template", pre-fill `name` field with the transaction's `description` | LOW | UX convenience; user can override |

---

## Anti-Features (Commonly Requested, Often Problematic)

| Anti-Feature | Why Requested | Why Problematic | What to Do Instead |
|--------------|---------------|-----------------|--------------------|
| Store amount on template | "I always pay R$49.90 for Netflix" | Breaks the mental model: templates are for structure, not for amounts that change. Storing amounts leads to stale amounts (price changes, promotions) and defeats the purpose of re-engagement with each entry | Keep amount always blank. If the user wants a fixed-amount shortcut, a recurring transaction is the right primitive |
| Unlimited templates | "I have more than 3 payees" | With 3 chips, the row is scan-at-a-glance. With 10 chips it becomes a scrollable list requiring a different layout. The cap is a deliberate UX constraint for v1.7 | Enforce the 3-template cap. If demand is high for more, v2 can add a searchable template picker modal |
| Shared / connection templates | "My partner and I always split Mercado the same way" | Templates are personal preferences. Partner's account list, split configuration, and naming conventions may differ. Sharing introduces sync complexity and consent ambiguity | Keep personal. The split config saved on a personal template already encodes the partner's split amount; that's sufficient |
| Recurrence/installment settings on template | "Mercado Parcelado" always in 3 installments | Recurrence is contextual (number of remaining installments varies per purchase). Storing it on a template would almost always be wrong for the next use | Recurrence fields stay blank on apply; user fills them when relevant. Out of scope per PROJECT.md |
| Auto-apply template based on description match | "When I type 'Mercado', auto-fill the template" | Creates invisible mutations to form state that confuse users; conflicts with `DescriptionAutocomplete` already doing suggestion-based fills | `DescriptionAutocomplete` already handles description-triggered suggestions. Chips are explicit user intent; don't automate them |
| Template versioning / history | "Show me what this template looked like before I edited it" | Gross over-engineering for a 3-template personal list | Simple overwrite on edit is correct |
| Apply template in bulk-create mode | "Apply template to 10 transactions at once" | Bulk creation is not a current feature; bulk actions operate on existing transactions | Out of scope per PROJECT.md |
| Template ordering / drag-to-reorder | "I want Mercado first" | With max 3 chips, any ordering scheme adds management overhead for marginal benefit | Use creation-order or last-used-order; document the choice so users know what to expect |

---

## Feature Dependencies

```
Template CRUD API
  └──requires──> transaction_templates DB table (migration)
  └──requires──> Template domain type + entity + repository + service interfaces

Template chip row (TransactionForm)
  └──requires──> useTemplates() query hook (GET /api/templates)
  └──requires──> Template apply logic (reset() + setFocus('amount'))
  └──requires──> Stale-reference resolution at apply time

"Save as template" button
  └──requires──> Template CRUD API (POST /api/templates)
  └──requires──> Template management drawer (can share the create form)

Template management drawer (create/edit/delete)
  └──requires──> Template CRUD API (all verbs)
  └──requires──> Accounts query (account selector in template form)
  └──requires──> Categories query (category selector in template form)
  └──requires──> Tags query (tags input in template form)
  └──requires──> SplitSettingsFields (reusable from TransactionForm — split config editor)

Split on template apply
  └──requires──> SplitSettingsFields reads from form state (already via useFormContext)
  └──requires──> Stale split account detection (see Edge Cases)
```

### Dependency Notes

- **Template form reuses `SplitSettingsFields`:** The component reads from `useFormContext` and only needs a `splitApplicable` boolean. The template management drawer must provide `FormProvider` wrapping and the relevant account data. Complexity is MEDIUM because this form has no `amount` (split percentage mode requires a total to show % of — the template form will need to render split config without the amount validation).
- **"Save as template" button depends on the management drawer:** The button opens the management drawer pre-filled with form values; it doesn't do a direct POST. This keeps the user in control and allows them to set or modify the template name before saving.
- **Chip row is purely a read + apply surface:** It does not mutate templates. Management is always via the management drawer.

---

## Edge Cases That Must Become Explicit Requirements

These are candidate acceptance criteria, not optional considerations.

### EC-1: Stale account reference (template account was deleted or deactivated)

**What happens:** User saved a template pointing to "Nubank Pessoal" (account_id: 42). Later they deactivated that account. When they click the chip, `reset()` sets `account_id: 42` but the account no longer appears in the account dropdown.

**Expected behavior:** The chip apply still works. The account field renders blank (no pre-selected value) or shows an error state, but all other fields (type, category, tags, description, split) are populated correctly. The form is not blocked — user selects a different account and submits normally.

**Implementation approach:** At apply time, check whether the resolved `account_id` exists in the current `useAccounts()` data. If not, apply all other fields but leave `account_id` null. Optionally show a one-time inline warning: "A conta do template não está disponível. Selecione uma conta."

**Must-have:** Yes — applying a chip and getting a blank account with no explanation is confusing.

---

### EC-2: Stale category reference (template category was deleted)

**What happens:** Template has `category_id: 7` ("Alimentação"). User deleted that category. On apply, the category select shows blank with no selection.

**Expected behavior:** Same graceful degradation as EC-1 — all other fields populate; category field is blank. No error thrown. User picks a category.

**Implementation approach:** At apply time, validate `category_id` against the current `useFlattenCategories()` data. If not found, apply other fields and leave `category_id: null`.

**Must-have:** Yes — silent failures are worse than explicit blanks.

---

### EC-3: Stale tag references (one or more template tags were deleted)

**What happens:** Template has `tags: ["viagem", "necessidade"]`. User later deleted the "viagem" tag. On apply, "necessidade" should appear but "viagem" is gone.

**Expected behavior:** Apply the subset of tags that still exist. Do not apply the deleted tag name (it would create a new tag with that name, which is probably not desired). If all tags are gone, `tags` field is empty array.

**Implementation approach:** Tags on the form are stored as `string[]` (tag names). Check each tag name against the current tags list. Apply only names that match an existing tag. Dead names are silently dropped — no warning needed (less visible than account/category).

**Must-have:** MEDIUM priority — silent drop of unknown tag names is acceptable behavior, but this must be explicitly decided rather than accidentally leaving stale names in.

---

### EC-4: Stale split configuration (split partner's account in template no longer valid)

**What happens:** Template stores `split_settings: [{ connection_id: 3, percentage: 50 }]`. Later the user dissolves the connection (or the connection account changes). On apply, `split_settings` is populated but the connection no longer exists.

**Expected behavior:** At apply time, validate whether the `connection_id` in each split setting still corresponds to an active accepted connection. If not, apply all other fields but clear `split_settings` entirely. The form's own `splitApplicable` logic will hide the split section if no connection is active.

**Implementation approach:** Check `connection_id` against the user's active connections. If stale, apply `split_settings: []`. This is the same silent-clear behavior used elsewhere in the codebase (e.g., selecting a shared account clears split settings automatically).

**Must-have:** Yes — applying a template and having the form submit fail with a split validation error would be a bad experience.

---

### EC-5: Template at capacity — "Save as template" button behavior

**What happens:** User has 3 templates. They click "Save as template" from the transaction form.

**Expected behavior:** The button is disabled (greyed out) with a tooltip like "Limite de 3 templates atingido". The management drawer still opens for editing/deleting existing templates. The backend also enforces the cap (409) as a safety net.

**Must-have:** Yes — failing silently or showing a confusing API error is wrong.

---

### EC-6: Template name uniqueness

**What happens:** User creates two templates both named "Mercado".

**Expected behavior:** Two templates with the same name is allowed. The name is purely a UI label for the chip, not a unique identifier. The backend should not enforce name uniqueness — it would be frustrating to enforce this on a personal 3-item list.

**Must-have:** Decision must be explicit (allow duplicates) — backend must NOT add a unique constraint on `(user_id, name)`.

---

### EC-7: Chip row ordering

**What happens:** User has templates created in order: "Mercado" (first), "Farmácia" (second), "Academia" (third). What order do chips appear?

**Expected behavior:** Insertion order (by `created_at ASC`). This is deterministic, predictable, and requires no management UI. The 3-cap means the ordering never becomes overwhelming.

**Alternative considered:** Last-used-first ordering. Rejected because it causes chips to reorder on every use, breaking muscle memory on a mobile touch target.

**Must-have:** Document and implement creation-order. Do not leave ordering undefined.

---

### EC-8: Apply template when form is already dirty (user started typing)

**What happens:** User partially fills out a form (typed an amount, selected an account), then clicks a chip.

**Expected behavior:** The chip apply performs a full `reset()` with template values. The amount typed by the user is wiped. This is consistent with what `DateQuickChips` does — it unconditionally replaces the date value regardless of what the user typed. The user is explicitly clicking "use this template" — implicit merge would be more confusing.

**Must-have:** The behavior must be explicit. Do not attempt smart merge; full reset is correct.

---

### EC-9: "Save as template" when form has split settings in percentage mode vs. amount mode

**What happens:** The existing `SplitSettingsFields` component allows both percentage and fixed-amount modes. If a user saves from a fixed-amount split, the template stores `amount` in cents for the split. On the next use with a different transaction amount, the stored cents amount may be irrelevant.

**Expected behavior:** Save whatever split config the form holds (percentage or amount). At apply time, apply as-is. This is consistent with how split works: the user sees the pre-filled split and can adjust before submitting. The form's split validation will catch any inconsistencies at submit time.

**Must-have:** No special handling needed, but this edge case must be noted in implementation comments so future developers don't "fix" it.

---

### EC-10: Template apply on the Update transaction form

**What happens:** The chip row would only be rendered on the Create form (new transaction). The Update form does not have template chips.

**Expected behavior:** Template chips are only shown in the Create (`TransactionForm` used for new entries). The Update drawer (`UpdateTransactionDrawer`) does not render the chip row. This is correct behavior — applying a template over an existing transaction's data would be unexpected.

**Must-have:** Must be explicitly scoped to the create form only. `TransactionForm` already accepts `headerContent` and `extraContent` props — template chips would be passed as one of these so the Update caller simply doesn't pass them.

---

## Field Mapping: Template → Form Apply

Exact field correspondence between template entity and `TransactionFormValues`:

| Template Field | Form Field | Apply Behavior |
|----------------|------------|----------------|
| `type` | `transaction_type` | Set directly |
| `account_id` | `account_id` | Set if account still exists; null otherwise (EC-1) |
| `category_id` | `category_id` | Set if category still exists; null otherwise (EC-2) |
| `tags` | `tags` (string[]) | Set subset of names that still exist as tags (EC-3) |
| `description` | `description` | Set directly |
| `split_settings` | `split_settings` | Set if connection still active; `[]` otherwise (EC-4) |
| _(not on template)_ | `amount` | Always left as `0` or blank; `setFocus('amount')` called after reset |
| _(not on template)_ | `date` | Always today (form default is today anyway; reset() restores default) |
| _(not on template)_ | `recurrenceEnabled` | Always `false` (form default) |
| _(not on template)_ | `destination_account_id` | Always `null` (not stored on template; transfers can have templates but destination is left blank) |

---

## MVP Definition for v1.7

### Must ship (table stakes that are also in scope)

- [ ] `transaction_templates` table with CRUD API (POST, GET, PUT/:id, DELETE/:id) — personal, IDOR-scoped, max 3 cap
- [ ] Template chip row in `TransactionForm` (create only), mirrors `DateQuickChips` structure
- [ ] Apply: `reset()` to template values + `setFocus('amount')` + active chip highlight
- [ ] Stale reference handling for account (EC-1), category (EC-2), split (EC-4) — silent field clear with optional inline warning for account
- [ ] Template management drawer: create / edit / delete
- [ ] "Save as template" button in transaction form (opens management drawer pre-filled; disabled when at cap — EC-5)
- [ ] Cap enforcement: backend 409 + UI disables create path (EC-5)
- [ ] Chip ordering: creation-order ascending (EC-7)
- [ ] Full reset on chip tap (EC-8); second tap on active chip resets to blank form

### Defer (out of scope per PROJECT.md)

- [ ] Tag stale-reference warning UI (silent drop is sufficient — EC-3)
- [ ] Template sharing across connection
- [ ] More than 3 templates
- [ ] Recurrence settings on templates
- [ ] Template usage analytics / last-used ordering

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Chip row + apply (all fields) | HIGH | LOW | P1 |
| Amount blank + focused on apply | HIGH | LOW | P1 |
| Template management drawer | HIGH | MEDIUM | P1 |
| "Save as template" from form | HIGH | LOW | P1 |
| Split config preserved in template | HIGH | MEDIUM | P1 |
| Stale account/category/split clear (EC-1,2,4) | HIGH | LOW | P1 |
| Cap enforcement (EC-5) + disabled UI | MEDIUM | LOW | P1 |
| Active chip state + re-tap to clear (EC-8) | MEDIUM | LOW | P1 |
| Chip ordering = creation order (EC-7) | LOW | LOW | P1 — must be explicit |
| Tag stale-reference silent drop (EC-3) | LOW | LOW | P2 |
| Template name from description (auto-suggest) | LOW | LOW | P2 |
| Inline warning for stale account (EC-1) | LOW | LOW | P2 |

---

## Competitor / Prior Art Analysis

| Pattern | Source | How This App Should Adapt |
|---------|--------|--------------------------|
| Memorized payees storing type + account + category + memo (not amount) | Quicken for Windows | Identical to our locked decision; confirms "no amount" is the right call |
| Auto-name template from description / payee name | Quicken memorized payees | Auto-suggest template name from transaction description in the Save drawer |
| Tombstone check before processing template (filter deleted categories from template run) | Actual Budget (PR #3510) | Validate all FK references at apply time; clear stale FKs silently |
| Autocomplete from previous transaction (description triggers category + account fill) | Bluecoins SMS autocomplete | `DescriptionAutocomplete` already does this; do NOT duplicate with template auto-apply (anti-feature) |
| Chip/shortcut row at top of entry form | DateQuickChips (this codebase) | Exact pattern to mirror — `UnstyledButton` in a `Group`, `data-active` attribute, CSS Module |
| QuickBooks: block account deletion when referenced by a memorized template | QuickBooks (community forum) | Do NOT follow this pattern — it is UX hostile. Instead use graceful degradation (EC-1, EC-2, EC-4) |
| Amount stored on saved templates | Various apps (Monefy, etc.) | Anti-feature for this use case; amounts go stale immediately |

---

## Sources

- Actual Budget PR #3510 "Ignore deleted categories when running templates": https://github.com/actualbudget/actual/pull/3510 — tombstone pattern for stale category references (HIGH confidence)
- Quicken memorized payees documentation: https://www.quicken.com/support/how-use-memorized-payee-list-quicken-windows/ — field model and apply behavior (MEDIUM confidence; page returned 403 on fetch but description confirmed by community sources)
- QuickBooks memorized transactions (block-deletion pattern to avoid): https://quickbooks.intuit.com/learn-support/en-us/help-article/memorize-transactions/create-edit-delete-memorized-transactions/L9kERjiUf_US_en_US — anti-pattern reference (MEDIUM confidence)
- Bluecoins autocomplete / smart entry: https://www.bluecoinsapp.com/transactions/ — description-based autocomplete (MEDIUM confidence)
- DateQuickChips.tsx in this codebase: `/home/user/finance_app/frontend/src/components/transactions/form/DateQuickChips.tsx` — definitive reference for chip pattern (HIGH confidence)
- transactionFormSchema.ts in this codebase: `/home/user/finance_app/frontend/src/components/transactions/form/transactionFormSchema.ts` — authoritative field list and types (HIGH confidence)
- PROJECT.md v1.7 section: `/home/user/finance_app/.planning/PROJECT.md` — locked decisions (HIGH confidence)

---
*Feature research for: Transaction Templates (v1.7) — personal quick-entry templates for a couples finance app*
*Researched: 2026-06-07*
