# Project Research Summary

**Project:** Couples Finance App — v1.7 Transaction Templates
**Domain:** Brownfield internal feature — personal transaction templates on an existing Go+GORM / React+RHF/Zod finance app
**Researched:** 2026-06-07
**Confidence:** HIGH — all four research files grounded in direct codebase inspection

## Executive Summary

v1.7 adds personal transaction templates to an already-mature couples finance app. The design space is well-constrained by prior art (Quicken memorized payees, Actual Budget tombstone pattern) and by explicit locked decisions in PROJECT.md: a dedicated `transaction_templates` table (never an `is_template` flag), personal per-user scope, hard cap of 3 per user, no amount or date stored, split config persisted as typed JSONB, tags via a separate `template_tags` join table, and a chip-row apply UX that mirrors the existing `DateQuickChips` component. No new dependencies are needed in either `go.mod` or `package.json` — every technical need maps onto existing mechanisms in the codebase.

The recommended implementation approach follows the layered architecture pattern already established in the codebase: migration → domain → entity → repository → service (with 3-cap enforcement) → handler/wiring → frontend query hooks → chip row apply flow → management drawer → e2e tests. This order is driven by hard dependencies (entity must exist before repository; repository before service; service before handler; API must exist before frontend hooks). The entire feature is additive: the dedicated table fully isolates templates from all existing financial query paths, so no existing transaction/balance/charge/settlement code requires modification, with one deliberate exception — `CategoryService.Delete` must be extended to nullify `category_id` on templates when a category is deleted.

The dominant risks are not architectural novelty but implementation correctness on three specific points: (1) split round-trip fidelity — the JSONB column must preserve `percentage` vs. `amount` mode so `SplitSettingsFields` reconstructs the correct edit mode on `reset()`; (2) stale-reference handling at apply time — deleted accounts, categories, and connections must degrade gracefully on the frontend rather than producing confusing backend 400s or panics; and (3) IDOR scoping — every template endpoint must gate on `user_id = authenticatedUser` at the repository layer. The 3-cap race condition (concurrent creates bypassing the count check) is a documented risk acceptable for v1.7 if addressed with a conditional INSERT.

## Key Findings

### Recommended Stack

The entire feature is implemented with zero new dependencies. Backend uses `gorm.io/gorm v1.31.1` and `gorm.io/driver/postgres v1.6.0` (already in `go.mod`). JSONB split storage uses a purpose-built `TemplateSplitSettingsJSON` type implementing `driver.Valuer`/`sql.Scanner` — the same pattern as `backend/internal/entity/user_settings.go` — but typed as `[]domain.SplitSettings` rather than the freeform `map[string]interface{}` used in user settings. The existing `JSONB` type in that file is intentionally NOT reused. Tags use GORM `many2many` via a new `template_tags` join table, mirroring `transaction_tags` exactly. The frontend uses `@tanstack/react-query ^5.71.10`, `zod ^4.3.6`, and `@mantine/core ^9.2.1` — all already present.

**Core patterns reused (with file references):**
- `backend/internal/entity/user_settings.go` — JSONB Scanner/Valuer pattern for `TemplateSplitSettingsJSON`
- `backend/internal/entity/transaction.go` — `many2many:transaction_tags` replicated as `template_tags`
- `backend/internal/repository/charge_repository.go` — IDOR gate (`WHERE id = ? AND user_id = ?`); conditional insert pattern for race guards
- `frontend/src/components/transactions/form/DateQuickChips.tsx` — chip row shape (46 lines, `UnstyledButton` + CSS Module + `data-active`)
- `frontend/src/components/transactions/form/transactionFormSchema.ts` — `splitSettingSchema` and `baseTransactionFields` reused in template Zod schema
- `frontend/src/hooks/useCreateTransaction.ts` — mutation hook pattern for `useCreateTemplate`, `useUpdateTemplate`, `useDeleteTemplate`

**What NOT to add:**
- `gorm.io/datatypes` — not in `go.mod`; hand-rolled JSONB is the codebase standard
- `sql.NullInt64` / `gorm.NullInt64` — not used anywhere; `*int` pointer is the pattern
- DB trigger for 3-template cap — inconsistent with service-layer validation used everywhere else
- `is_template` boolean on `transactions` table — explicitly rejected in PROJECT.md Key Decisions
- Zustand or other client state for templates — templates are server state; TanStack Query cache is correct

### Expected Features

**Must have (table stakes — P1 for v1.7):**
- Apply template via chip row: `reset()` to template values, `amount: 0`, `date: today`, `setFocus('amount')` — core value prop
- Chip label = user-provided template name; active chip highlight via `data-active`; re-tap to clear
- Template management drawer: create / edit / delete
- "Save as template" button in `CreateTransactionDrawer` via `extraContent` prop (reads `getValues()`, opens management drawer pre-filled, disabled when at cap)
- Split config preserved and applied — percentage vs. fixed-amount mode preserved in JSONB
- Stale reference handling at apply time: account (EC-1), category (EC-2), split connection (EC-4) — silent clear with optional inline warning for account
- Cap enforcement: backend 400 with `TEMPLATE.LIMIT_REACHED` tag + UI disables create when at cap (EC-5)
- IDOR scoping: templates are personal; partner never sees or modifies them
- Chip row rendered only when `templates.length > 0`
- Chip ordering: `created_at ASC` (deterministic; preserves muscle memory on a mobile touch target)
- Full `reset()` on chip tap regardless of prior form state (EC-8)

**Should have (differentiators — P2):**
- Template name auto-suggested from transaction description in "Save as template" flow
- Inline warning when template's account is stale on apply (EC-1)
- Tag stale-reference silent drop (EC-3)

**Defer to v2+:**
- Shared / connection-wide templates
- More than 3 templates per user
- Recurrence/installment settings on templates
- Template usage analytics / last-used ordering
- Searchable template picker modal
- Auto-apply based on description match (conflicts with existing `DescriptionAutocomplete`)

### Architecture Approach

The feature follows the existing four-layer backend pattern (handler → service → repository → PostgreSQL/GORM) with no cross-layer shortcuts. The new `transaction_templates` table has no FK to `transactions` and is invisible to all existing financial query paths (`transactionRepository.Search`, `GetBalance`, `FindOrphanedSettlementTransactions`, `GetGroupedByRecurrences`, `GetSourceTransactionIDs`, `NullifyCategory`, `ReassignCategory` — all confirmed to query only the `transactions` table). Tags are stored via a `template_tags` join table (NOT in JSONB) to preserve FK integrity and enable tag-delete cascades. Split config is stored as a typed JSONB column on the template row, because split settings are not a first-class entity in this codebase and the template table is the first place they need to be round-tripped. On the frontend, `TemplateQuickChips` uses `useFormContext` to call `reset()` directly — no prop drilling — because `TransactionForm` is always wrapped in `FormProvider` by its parent drawer.

**Major components:**

1. **DB migration** (`backend/migrations/<ts>_create_transaction_templates_table.sql`) — `transaction_templates` + `template_tags` tables; `account_id`/`category_id` nullable with `ON DELETE SET NULL`; `split_settings JSONB NOT NULL DEFAULT '[]'`; `user_id` index; isolation comment
2. **Domain + Entity layer** (`backend/internal/domain/transaction_template.go`, `backend/internal/entity/transaction_template.go`) — typed `TemplateSplitSettingsJSON`; `ToDomain()`/`FromDomain()`; reuses `domain.SplitSettings` and `entity.Tag`
3. **Repository** (`backend/internal/repository/template_repository.go`) — IDOR-scoped CRUD; `CountByUserID`; `Association("Tags").Replace()`; `ORDER BY created_at ASC`
4. **Service** (`backend/internal/service/template_service.go`) — 3-cap via conditional INSERT; IDOR ownership check on update/delete; `TEMPLATE.*` error tags
5. **Handler + wiring** (`backend/internal/handler/template_handler.go`) — four routes under `/api/transaction-templates`; `userID` from auth context only; Swagger annotations; wired in `cmd/server/main.go`
6. **`CategoryService.Delete` extension** — `templateRepo.NullifyCategory(ctx, id)` added alongside `transactionRepo.NullifyCategory`
7. **Frontend API + hooks** (`frontend/src/api/templates.ts`, `src/hooks/useTemplates.ts` + three mutation hooks) — `QueryKeys.TransactionTemplates: 'transaction-templates'` in `src/utils/queryKeys.ts`
8. **`TemplateQuickChips`** (`frontend/src/components/transactions/form/TemplateQuickChips.tsx`) — `useFormContext` + `reset()` + `setTimeout(() => setFocus('amount'), 0)`; stale-ref validation; conditional render; mounted in `TransactionForm.tsx`
9. **Template management UI** (`TemplatesManagementDrawer.tsx`, `TemplateForm.tsx`, `templateFormSchema.ts`) — `renderDrawer` pattern; Zod schema is strict subset (no amount/date/recurrence)
10. **Test IDs** (`frontend/src/testIds/templates.ts`) — `TemplateChip(id)`, `BtnSaveAsTemplate`, `DrawerManage`, etc.

### Critical Pitfalls

1. **Split round-trip infidelity (CP-1)** — `SplitSettingsFields` detects mode from `looksFixed = initial.some(r => (r.amount ?? 0) > 0 && r.percentage == null)`. If JSONB stores a percentage-mode split with `amount: 0`, it initializes in percentage mode (correct). If split config is stored as raw `json.RawMessage` or with the wrong shape, mode detection fails silently and the backend returns 400 ("split_setting percentage and amount cannot be used together"). Prevention: use named `TemplateSplitSettingsJSON` type over `[]domain.SplitSettings`; write a round-trip unit test; write a frontend test asserting split mode after template apply. Address in Phase 1 (DB model) and Phase 5 (chip apply).

2. **Stale `connection_id` causes backend panic (CP-4)** — If a connection is deleted after a template is saved, applying the template sets a stale `connection_id`. On submit, `injectUserConnectionsOnSplitSettings` in `transaction_create.go:~444` iterates `conns[i]` assuming index alignment. If the connection is gone, `Search` returns fewer results and the code panics (500 instead of 400). Two-layer defense: (a) frontend clears `split_settings: []` if connection IDs are stale before `reset()`; (b) backend adds a length check after `injectUserConnectionsOnSplitSettings`. Address in Phase 2 (backend guard) and Phase 5 (frontend validation).

3. **IDOR on template endpoints (CP-2)** — Every template query at the repository layer must scope by `WHERE user_id = ?`. Follow the `chargeRepository` pattern: `GetByID(ctx, userID, id)` uses `WHERE id = ? AND user_id = ?`; return 404 on mismatch. Address in Phase 2.

4. **3-template cap race condition (CP-3)** — Two concurrent POSTs both read `count = 2`, both pass, both insert → user has 4 templates. Use a conditional INSERT and check `RowsAffected == 0`. Address in Phase 2.

5. **Missing `CategoryService.Delete` extension (CP-8)** — Deleting a category does not nullify `category_id` on templates after v1.7. A user who applies a template with a deleted category gets a backend 400 with no highlighted field. `CategoryService.Delete` must call `templateRepo.NullifyCategory(ctx, id)`. Include in Phase 1 to avoid shipping a latent bug.

**Open design decision — `SplitSettingsFields` in template context:**

`SplitSettingsFields` displays live percentage-of-total or amount calculations that require `amount` to be set. The template management form has no `amount` field. It is unresolved whether to add a `hideAmountDisplay` / `templateMode` prop, or accept "R$0,00" as the display when amount is 0. Must be decided before implementing `TemplateForm.tsx`. Resolve by reading `frontend/src/components/transactions/form/SplitSettingsFields.tsx` and `frontend/src/hooks/useSyncSplitAmount.ts`.

## Implications for Roadmap

Based on research, the confirmed build order and suggested phase structure:

### Phase 1: Backend Foundation — Migration, Domain, Entity, CategoryService Extension

**Rationale:** All subsequent backend phases depend on the DB schema and Go types existing. The migration establishes the isolation boundary (separate table, isolation comment, `ON DELETE SET NULL`). `CategoryService.Delete` extension ships here to avoid a latent bug from the first deploy.

**Delivers:** `transaction_templates` + `template_tags` tables migrated; `domain.TransactionTemplate`, `entity.TransactionTemplate`, `TemplateSplitSettingsJSON` implemented; `CategoryService.Delete` extended with `templateRepo.NullifyCategory`.

**Pitfalls avoided:** CP-1 (typed JSONB from the start), CP-6 (separate `template_tags`), CP-8 (CategoryService.Delete), CP-5 (isolation comment).

**Research flag:** Standard patterns — no research phase needed.

---

### Phase 2: Backend Repository, Service, Handler, Wiring

**Rationale:** Repository, service, and handler form a self-contained unit for a 4-endpoint CRUD feature. Grouping them delivers a smoke-testable API in one phase. The 3-cap conditional INSERT, IDOR scoping, and defensive guard for stale connection IDs all belong here.

**Delivers:** Fully functional `GET/POST/PUT/DELETE /api/transaction-templates`; IDOR-scoped; 3-cap via conditional INSERT; defensive length check in `injectUserConnectionsOnSplitSettings`; `TEMPLATE.*` error constants; Swagger docs; mocks regenerated.

**Pitfalls avoided:** CP-2 (IDOR), CP-3 (conditional INSERT for race), CP-4 (backend length check).

**Research flag:** Standard patterns — follows charge/tag handler patterns exactly.

---

### Phase 3: Frontend Types, API Client, Query Hooks

**Rationale:** Pure plumbing required by all subsequent frontend phases. Establishes type contracts and cache keys before any UI touches template data.

**Delivers:** `frontend/src/types/templates.ts`; `frontend/src/api/templates.ts`; `useTemplates.ts` + three mutation hooks; `QueryKeys.TransactionTemplates`; `TemplatesTestIds`.

**Research flag:** Standard patterns — mirrors `src/api/tags.ts` and existing mutation hook patterns.

---

### Phase 4: SplitSettingsFields Template Mode Decision

**Rationale:** Open design decision gates `TemplateForm.tsx`. Resolving it discretely keeps the decision explicit and reviewable.

**Delivers:** `SplitSettingsFields` accepts a prop that suppresses or adapts live-amount display in template context; decision documented.

**Research flag:** Read `SplitSettingsFields.tsx` and `useSyncSplitAmount.ts` before implementing. No external research needed.

---

### Phase 5: Frontend Chip Row Apply Flow

**Rationale:** Highest-value user surface; most technically specific. Can be tested with API-seeded templates before the management drawer exists. Depends on Phases 2 (API), 3 (hooks).

**Delivers:** `TemplateQuickChips.tsx` + `.module.css`; mounted in `TransactionForm.tsx`; stale-ref validation at apply time (account EC-1, category EC-2, split EC-4); `reset()` with explicit `amount: 0`, `date: localDateStr(new Date())`, `recurrenceEnabled: false`; `setTimeout(() => setFocus('amount'), 0)`; active chip highlight; conditional render; re-tap to clear.

**Pitfalls avoided:** CP-1 (correct split mode after reset), CP-4 (stale connection cleared), CP-7 (explicit amount + date in reset), CP-9 (stale account cleared).

**Research flag:** Read `CurrencyInput.tsx` before implementing to confirm `amount: 0` display behavior (see Gaps). Standard patterns otherwise.

---

### Phase 6: Frontend Template Management UI

**Rationale:** Depends on Phases 3 (hooks), 4 (SplitSettingsFields mode resolved), 5 (chip row exists to verify invalidation on mutations).

**Delivers:** `templateFormSchema.ts` (Zod subset — no amount/date/recurrence); `TemplateForm.tsx`; `TemplatesManagementDrawer.tsx` (`renderDrawer` pattern, list + CRUD, cap in UI); `SaveAsTemplateButton` in `CreateTransactionDrawer` via `extraContent`; mutation hooks wired with invalidation.

**Pitfalls avoided:** "Save as template" strips amount/date from payload; `TEMPLATE.LIMIT_REACHED` mapped to localized message.

**Research flag:** Standard patterns — `renderDrawer` + RHF + Zod subset.

---

### Phase 7: E2E Tests

**Rationale:** Acceptance gate; covers interactions unit tests cannot (focus, chip highlight, form reset, cross-component cache invalidation).

**Delivers:** E2e tests: create template → chip appears; click chip → amount focused and blank, date is today; save-as-template → chip updates; 4th create blocked; delete → chip updates; apply template with stale account → account blank, other fields populated; balance unaffected after 3 templates created.

**Research flag:** Standard Playwright patterns already in `frontend/e2e/`.

---

### Phase Ordering Rationale

- Backend before frontend: API must exist before frontend hooks are testable against real data
- Types + hooks before UI components: prevents circular dependency
- SplitSettingsFields decision (Phase 4) before management form (Phase 6): `TemplateForm` embeds the component; prop interface must be settled first
- Chip apply (Phase 5) before management drawer (Phase 6): apply is the highest-value feature; surfaces `reset()` + split mode issues before full management UI exists
- CategoryService.Delete extension in Phase 1: avoids shipping a known latent bug
- Conditional INSERT for cap in Phase 2: addresses race condition at the point the service is written

### Research Flags

Phases with well-documented patterns (no `/gsd-research-phase` needed):
- **Phase 1:** Migration, domain, entity — exact existing patterns
- **Phase 2:** Repository, service, handler — follows charge/tag handler patterns
- **Phase 3:** API client and hooks — mirrors `src/api/tags.ts` and mutation hook patterns
- **Phase 5:** Chip apply — mirrors `DateQuickChips` exactly
- **Phase 6:** Management UI — standard `renderDrawer` + RHF + Zod pattern
- **Phase 7:** E2e — standard Playwright patterns

Phases requiring a targeted codebase read before implementation (not external research):
- **Phase 4:** Read `SplitSettingsFields.tsx` and `useSyncSplitAmount.ts` to determine minimal prop change for template context
- **Phase 5:** Read `CurrencyInput.tsx` to confirm `amount: 0` display behavior before writing the `reset()` call

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct inspection of `go.mod`, `package.json`, entity files, and component files. Zero new dependencies confirmed. |
| Features | HIGH | Locked decisions in PROJECT.md eliminate ambiguity. Edge cases EC-1 through EC-10 grounded in existing form and service behavior. |
| Architecture | HIGH | Layer pattern verified against multiple existing features. JSONB and many2many patterns confirmed in codebase. |
| Pitfalls | HIGH | All pitfalls from direct inspection of `transaction_create.go`, `category_service.go`, `SplitSettingsFields.tsx`, `transactionFormSchema.ts`, `charge_repository.go`. Concrete line references provided. |

**Overall confidence:** HIGH

### Gaps to Address

- **`CurrencyInput` zero-display behavior (MEDIUM):** Not confirmed whether `amount: 0` renders visually blank or "0,00". If `CurrencyInput` does not visually clear on zero, chip apply may need `amount: undefined` with a Zod schema adjustment. Resolve in Phase 5 by reading `frontend/src/components/transactions/form/CurrencyInput.tsx`.
- **`SplitSettingsFields` template mode (MEDIUM):** Open design decision on rendering without `amount` is unresolved. Must be decided in Phase 4. Read `SplitSettingsFields.tsx` and `useSyncSplitAmount.ts`.
- **`domain.SplitSettings.UserConnection` pointer in JSONB (MEDIUM):** The `UserConnection *UserConnection` field has no json tag and serializes to `null` — safe, but verify with a round-trip unit test.
- **`ORDER BY created_at ASC` on template search:** GORM does not add ordering without an explicit `.Order()` call. Ensure the repository `Search` method includes `.Order("created_at ASC")` to guarantee EC-7 (creation-order chip display).

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `backend/internal/entity/user_settings.go` — JSONB Scanner/Valuer pattern; `gorm.io/datatypes` absence confirmed
- `backend/internal/entity/transaction.go` — `many2many:transaction_tags`; `SplitSettings` struct and JSON tags
- `backend/internal/service/transaction_create.go` — `injectUserConnectionsOnSplitSettings`; index-alignment risk at ~line 444
- `backend/internal/repository/transaction_repository.go` — `Search`, `GetBalance`, `FindOrphanedSettlementTransactions` confirmed to query only `transactions` table
- `backend/internal/repository/charge_repository.go` — IDOR gate comment; `WHERE id = ? AND user_id = ?` pattern
- `backend/internal/service/category_service.go` — `NullifyCategory` on delete; no template nullification (gap confirmed)
- `frontend/src/components/transactions/form/DateQuickChips.tsx` — 46-line chip component; definitive reference
- `frontend/src/components/transactions/form/transactionFormSchema.ts` — `splitSettingSchema`, `baseTransactionFields`, field constraints
- `frontend/src/components/transactions/form/SplitSettingsFields.tsx` — `looksFixed` mode detection; `SplitMode` enum
- `frontend/src/utils/splitMath.ts` — `splitPercentagesToCents` strips `percentage`; bulk-split path only
- `frontend/src/utils/queryKeys.ts` — `Templates` key absent; must be added
- `backend/go.mod` — `gorm.io/gorm v1.31.1`, `gorm.io/driver/postgres v1.6.0`; `gorm.io/datatypes` absent
- `frontend/package.json` — all required packages at current versions confirmed

### Secondary (MEDIUM confidence — external references)
- Actual Budget PR #3510 "Ignore deleted categories when running templates" — tombstone/stale-ref pattern
- Quicken memorized payees documentation — confirms "no amount" is the correct model
- QuickBooks memorized transactions — anti-pattern reference (block-on-delete is UX hostile)
- Bluecoins autocomplete — description-based fill; anti-feature context for auto-apply

---
*Research completed: 2026-06-07*
*Ready for roadmap: yes*
