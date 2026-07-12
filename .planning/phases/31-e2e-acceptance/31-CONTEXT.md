# Phase 31: E2E Acceptance - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Playwright acceptance coverage for the full transaction-templates lifecycle: **chip apply** (incl. stale-reference degradation), **management CRUD**, **cap enforcement**, and **"Save as template"**. A `frontend/e2e/tests/transaction-templates.spec.ts` (+ a `TransactionTemplatesPage` page object) picked up automatically by `testDir: ./e2e/tests`. Cross-cutting acceptance for TMPL-01..05, APPLY-01..04, MNG-01..03, SAFE-01..02.

**In scope:** the spec + page object, following the per-user pattern (`getAuthTokenForUser` + `apiFetchAs` + `openAuthedPage` + `page.close()`), reusing the existing `formFields.ts` classes and the template testids already in `src/testIds/transactions.ts`.

**Out of scope:** running the suite locally (no Docker in the sandbox — CI's `e2e` job runs it via `docker-compose.e2e.yml`). Any product code changes (all shipped in phases 26–30). If the spec surfaces a real bug, fix it minimally and note it.

Requirements: cross-cutting acceptance (no new REQ-IDs).
</domain>

<decisions>
## Implementation Decisions
- **D-01: One fresh user per test** (CLAUDE.md rule), via `getAuthTokenForUser` + `apiFetchAs`. Seed accounts/categories/tags/templates by API; verify via API and/or visible `TemplateRow(id)`. Split cases use `createUserAndPartner` (accepted connection).
- **D-02: New `TransactionTemplatesPage` page object** for the template drawers (the existing `TransactionsPage` doesn't model them). Reuse `formFields.ts` classes constructed with the template drawer locator as `root` (the template form reuses transaction field testids). Scope field lookups to the specific drawer (`getByTestId(TemplateFormDrawer)`), since create + template drawers share field testids.
- **D-03: Assert via testids + API, no toasts.** After save, assert the form error alert is not visible then the drawer hides; verify persistence via `GET /api/transaction-templates` or the row appearing.
- **D-04: Cover the acceptance-critical paths** (see specifics), not every permutation — the CI `e2e` job already gates the branch green; this adds the dedicated template scenarios.
- **D-05: Verify compilation** with the e2e TypeScript config / `playwright test --list` (compiles specs without the running stack). Do NOT attempt a full `playwright test` run (needs Docker/stack). State clearly that execution is delegated to CI.

### Claude's Discretion
- Page-object method granularity; whether stale-ref uses account-delete or category-delete (account is the clearest).
- Exact number of tests (aim ~6–8 focused cases).
</decisions>

<canonical_refs>
## Canonical References
- `.planning/ROADMAP.md` §"Phase 31"
- `frontend/CLAUDE.md` §"E2E tests" (per-user isolation, testid-only selectors, `formFields.ts` mandatory)
- The Phase 31 E2E map (below)
- `frontend/e2e/helpers/api.ts`, `frontend/e2e/helpers/createUserAndPartner.ts`, `frontend/e2e/helpers/formFields.ts`
- `frontend/e2e/tests/shared-account-expenses.spec.ts` (per-user pattern to mirror), `frontend/e2e/pages/TransactionsPage.ts`
- `frontend/src/testIds/transactions.ts` (all template testids)
</canonical_refs>

<code_context>
## E2E Map (from codebase exploration)

**Harness:** `getAuthTokenForUser(email)` → token (auto-onboards); `apiFetchAs(token, path, opts)` → authed fetch (throws on non-2xx); `openAuthedPage(browser, token)` → Page. `apiListTransactions(m,y,{token})`. Config `testDir: ./e2e/tests`, chromium, `fullyParallel`. Mirror `shared-account-expenses.spec.ts` (`{ browser }`, `await page.close()`), NOT the older `transactions.spec.ts` beforeAll pattern.

**Reusable Page-Object methods (`TransactionsPage.ts`):** `openCreateForm()`, `selectType`, `fillAmount`, `fillDescription`, `selectAccount(id)`, `selectCategory(id)`, `expandExtraSection('split')`, `submitForm()`, `assertNoFormErrors()`. Split field testids touched inline. `formDrawer = getByTestId(DrawerCreate='drawer_create_transaction')`.

**Template testids (`src/testIds/transactions.ts`):**
- Chips: `TemplateChipsRow='row_template_chips'`, `TemplateChip(id)='chip_template_${id}'`.
- Management: `MenuItemManageTemplates='menu_item_manage_templates'`, `TemplatesManagementDrawer='drawer_templates_management'`, `TemplateBtnNew='btn_template_new'`, `TemplateRow(id)`, `TemplateBtnEdit(id)`, `TemplateBtnDelete(id)`, `TemplateBtnConfirmDelete(id)`, `TemplateFormDrawer='drawer_template_form'`, `TemplateInputName='input_template_name'`, `TemplateBtnSave='btn_template_save'`, `TemplateFormError='alert_template_form_error'`.
- Save-as-template: `BtnSaveAsTemplate='btn_save_as_template'`, `SaveAsTemplateDrawer='drawer_save_as_template'`, `SaveAsTemplateInputName='input_save_as_template_name'`, `TemplateBtnConfirmSaveAsTemplate='btn_confirm_save_as_template'`, `SaveAsTemplateError='alert_save_as_template_error'`.
- Menu trigger `BtnMoreOptions='btn_more_options'`. Reused form ids: `SegmentedTransactionType`+`SegmentTransactionType(t)`, `SelectAccount`+`OptionAccount(id)`, `SelectCategory`+`OptionCategory(id)`, `TagsInput`, split ids.

**Click paths:** manage = `BtnMoreOptions` → `MenuItemManageTemplates` → `TemplatesManagementDrawer` → `TemplateBtnNew` → `TemplateFormDrawer` (fill `TemplateInputName` + fields scoped to the drawer) → `TemplateBtnSave` → assert `TemplateFormError` hidden + drawer hides + `TemplateRow(id)` appears. Delete = `TemplateBtnDelete(id)` → inline confirm `TemplateBtnConfirmDelete(id)`. Chip apply = `openCreateForm` → `TemplateChip(id)` visible → click → amount focused/blank, other fields set. Save-as-template = create form footer `BtnSaveAsTemplate` → `SaveAsTemplateDrawer` → `SaveAsTemplateInputName` (prefilled from description) → `TemplateBtnConfirmSaveAsTemplate`.

**Backend setup (apiFetchAs):** `POST /api/accounts {name,initial_balance}`, `POST /api/categories {name}`, `POST /api/tags {name}`, `POST /api/transaction-templates {name, payload:{type,account_id?,category_id?,destination_account_id?,description,tag_ids?,split_settings?}}`, `GET /api/transaction-templates`, `DELETE /api/transaction-templates/:id`, `DELETE /api/accounts/:id` (for stale-ref). Split templates need `createUserAndPartner` → `userConnAccountId`/`connectionId`.

**renderDrawer nuance:** template drawers mount in isolated portals; scope field lookups to the drawer locator (shared field testids). Option portals attach to body → `SelectField.pick` resolves from Page.

**CI:** `.github/workflows/e2e.yml` → `docker compose -f docker-compose.e2e.yml up -d --wait` then `npm run e2e:ci` (`playwright test --reporter=github`, base `:3100`, backend `:8090`). New spec auto-discovered.
</code_context>

<specifics>
## Acceptance scenarios (target ~6–8 tests)
1. **Manage create (MNG-01):** open management drawer → "Novo" → fill name/type/account/category → save → `TemplateRow(id)` appears; verify via `GET`.
2. **Manage edit (MNG-01/TMPL-03):** seed template → edit → change name → save → row shows new name; `GET` confirms.
3. **Manage delete (MNG-01/TMPL-04):** seed template → delete → confirm → row gone; `GET` empty.
4. **Chip apply (APPLY-01/02/03):** seed template (account+category+tags) → open create form → `TemplateChip` visible → click → account/category/description filled, amount empty + focused.
5. **Stale-ref apply (APPLY-04):** seed template referencing an account → `DELETE` that account → open create form → apply chip → no error/crash, account field cleared, description/type preserved.
6. **Save as template (MNG-02):** fill create form → `BtnSaveAsTemplate` → confirm name (prefilled from description) → `GET` shows the new template; the new chip appears.
7. **Cap (SAFE-01 UI):** seed 3 templates → open management → `TemplateBtnNew` disabled; and/or in create form `BtnSaveAsTemplate` disabled.
8. (optional) **Split template round-trip (TMPL-05):** `createUserAndPartner` → seed template with a percentage split → apply chip → split panel shows the row/percentage.
</specifics>

<deferred>
## Deferred Ideas
- Visual/screenshot assertions; mobile-viewport template flows — not needed for acceptance.
</deferred>

---

*Phase: 31-e2e-acceptance*
*Context gathered: 2026-07-10*
