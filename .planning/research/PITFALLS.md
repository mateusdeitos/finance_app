# Pitfalls Research: Transaction Templates (v1.7)

**Domain:** Adding personal transaction templates to an existing couples finance app (Go + GORM backend, React/RHF/Zod frontend)
**Researched:** 2026-06-07
**Confidence:** HIGH — based on direct codebase inspection of all relevant files

---

## Critical Pitfalls

### CP-1: Split Round-Trip Infidelity — Template Cannot Reconstruct the Exact Form Input

**What goes wrong:**
The template stores a JSONB split config. When applied, it must reconstruct the exact `split_settings` array that `SplitSettingsFields` renders and that the `createTransaction` API payload builder consumes. The form's split section uses three distinct field shapes depending on how the user originally configured the split:

- **Percentage mode:** `{ connection_id, percentage, amount: 0, date: null }` — `amount` is set by `useSyncSplitAmount`; `percentage` drives the display
- **Fixed-amount mode:** `{ connection_id, amount: <cents>, date: null }` — no `percentage` present
- **With custom settlement date:** either of the above plus `date: "YYYY-MM-DD"`

The backend wire format (`SplitSettings` in `domain/transaction.go`) has `Percentage *int`, `Amount *int64`, and `Date *Date`. The backend rejects 400 if both `percentage` and `amount` are set on the same row (`ErrSplitSettingPercentageAndAmountCannotBeUsedTogether`). The frontend also enforces this in `splitSettingSchema` (`percentage` and `amount` are both optional but only one should be set).

The critical constraint is `connection_id` which must be a valid, current `UserConnection.ID`. If the template stores `connection_id: 5` and that connection no longer exists or belongs to a different user, applying the template silently sends an invalid `connection_id` to the service, which calls `injectUserConnectionsOnSplitSettings` → `UserConnection.Search({ IDs: [5] })` and blows up mid-create.

The `splitPercentagesToCents` utility in `frontend/src/utils/splitMath.ts` strips `percentage` and emits only `{ connection_id, amount }`. This is the **bulk-split path**. The regular transaction form path sends whichever is set from the form — either `percentage` or `amount`. The template's stored JSONB must preserve which mode was used so the form's `SplitSettingsFields` can detect the correct mode on `reset()` (it reads `looksFixed` from `fields` during initialization).

**Concrete checks for implementation:**
1. JSONB column must store `{ connection_id, percentage?, amount?, date? }` matching `domain.SplitSettings` JSON tags — not the wire-only shape that strips `percentage`.
2. The template-apply `reset()` must set `split_settings` with the correct mode indicator. `SplitSettingsFields` detects mode from `looksFixed = initial.some(r => (r.amount ?? 0) > 0 && r.percentage == null)`. If the template stores a percentage-mode split with `amount: 0`, the field initializes in percentage mode (correct). If it stores only `amount`, it initializes in amount mode (correct).
3. The `date` field inside each split row is `string | null` in the frontend Zod schema (`splitSettingSchema`). The backend stores it as `*Date`. The JSONB must serialize/deserialize the date the same way the form emits it.
4. The "last split absorbs rest" logic from v1.4 (`PAY-01` in `TransactionsPage.tsx:436`) applies only in the bulk-split path, not in the regular form path. Do not apply it during template-apply.

**Why it happens:**
Split config is not persisted on transactions — it is consumed at create-time and turned into settlements + linked transactions. This is by design. Templates are the first place split config must be round-tripped. The JSONB schema is implicit and must exactly match what the form can reconstitute.

**How to avoid:**
Define a named Go struct `TemplateSplitSetting` (mirroring `domain.SplitSettings` with JSON tags) and use it for the JSONB column type. Do not use a raw `json.RawMessage`. Write a unit test that round-trips a split config through the JSONB encode/decode and verifies the output fields. On the frontend, write a test that applies a template with a split config and asserts the resulting form state has the expected `split_settings` fields.

**Warning signs:**
- Backend returns 400 "split_setting percentage and amount cannot be used together" on template-apply
- Applying a percentage-mode template shows 0% in the UI (mode detection failed)
- Settlement date from template is lost on apply

**Phase to address:** DB migration + backend template model (Phase 1), and frontend apply logic (Phase 3 / chip row phase).

---

### CP-2: IDOR on Template Endpoints — Missing user_id Scope

**What goes wrong:**
The template CRUD endpoints (`GET /api/templates`, `POST /api/templates`, `PUT /api/templates/:id`, `DELETE /api/templates/:id`) must scope every query by the authenticated user's ID. Without this, user A can read, update, or delete user B's templates.

**Why it happens:**
The IDOR pattern is consistent in this codebase — every handler does `userID := appcontext.GetUserIDFromContext(c.Request().Context())` and passes it to the service, which passes it to the repository as a `WHERE user_id = ?` clause. The `chargeRepository.Search` explicitly comments `// IDOR gate: UserID must always be set by the caller`. New repositories frequently miss this if built from scratch without following the pattern.

**Concrete check:** In `templateRepository.Search`, the query must always include `WHERE user_id = ?` with the caller's `userID`. In `templateRepository.GetByID` (used for update/delete), it must use `WHERE id = ? AND user_id = ?`. Using only `WHERE id = ?` is the bug.

**How to avoid:**
Follow the charge repository pattern exactly. The service method signature should be `GetByID(ctx, userID, templateID int)`. The repository enforces the user scope. The service verifies the result is non-nil (returns `pkgErrors.NotFound("template")` / `pkgErrors.Forbidden(...)` on mismatch). Add a handler test that calls update/delete with a mismatched user ID and asserts 403 or 404.

**Warning signs:**
- Template GET endpoint returns all templates for all users
- Update/delete succeeds for a user who does not own the template (test this in integration tests)

**Phase to address:** Backend CRUD API phase (Phase 1 or 2).

---

### CP-3: 3-Template Cap Race Condition

**What goes wrong:**
Two concurrent `POST /api/templates` requests for the same user both read `count = 2`, both pass the `count < 3` check, and both insert — leaving the user with 4 templates.

**Why it happens:**
Naively checking count then inserting is a read-check-write window. The `chargeRepository` solved the analogous double-accept problem with a conditional UPDATE (`UPDATE charges SET status='paid' WHERE id=? AND status='pending'` checking `RowsAffected`). The same pattern must be applied here.

**How to avoid:**
Add a `UNIQUE` partial index or use a DB-level constraint. The cleanest option is a `CHECK` constraint with a per-user count enforced at the DB layer, but PostgreSQL does not have deferred count constraints natively. Instead: enforce with a DB-level unique constraint on a `(user_id, slot)` column where `slot` is 1–3 (template "slots" pattern), OR use a conditional INSERT:

```sql
INSERT INTO transaction_templates (user_id, ...)
SELECT $1, ...
WHERE (SELECT COUNT(*) FROM transaction_templates WHERE user_id = $1) < 3
```

Check `RowsAffected == 0` to detect the cap was hit, and return `pkgErrors.BadRequest("template limit reached")` with a stable error tag (e.g. `TEMPLATE.MAX_TEMPLATES_REACHED`).

Alternatively, add a partial unique index `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL` on `(user_id, name)` to prevent exact duplicates, but this does not enforce the cap.

**Warning signs:**
- Integration test: two goroutines create templates concurrently; assert total count is exactly 3

**Phase to address:** Backend CRUD API (DB migration + service layer cap check).

---

### CP-4: Stale connection_id in Split Config — Connection Deleted After Template Created

**What goes wrong:**
A template stores `split_settings: [{ connection_id: 7, percentage: 50 }]`. The user later disconnects from their partner (deletes the user_connection with id=7). When the user applies the template, the form renders with a split row that references connection_id=7. On submit, `injectUserConnectionsOnSplitSettings` calls `UserConnection.Search({ IDs: [7] })` — which returns 0 results because the connection is deleted — and the service returns an error (index panic or `ErrSplitSettingInvalidConnectionID(0)`).

**Why it happens:**
`connection_id` is a logical foreign key into `user_connections`. The template table does not have a DB-level FK on it (JSONB columns can't enforce FK). The connection can be deleted at any time independently of the template.

**How to avoid:**
Two-layer defense:
1. **At template-apply time (frontend):** Before calling `reset()`, check whether each `connection_id` in the template's split config is present in the current `useAccounts()` result (which includes `user_connection.id`). If a connection_id is missing, either strip that split row and show a warning, or prevent apply with a toast.
2. **At submit time (backend):** The existing `injectUserConnectionsOnSplitSettings` already calls `UserConnection.Search({ IDs: connIDs })` and iterates with `conns[i]` assuming the result is index-aligned with `splitSettings` after sorting. If the connection is gone, the `Search` returns fewer results than `splitSettings`, causing an index-out-of-bounds panic. This is a pre-existing fragility; the template feature makes it reachable from stored data instead of live user input.

Prevention:
- Frontend: validate connection_ids exist before apply; show "Este split não é mais válido" inline on the chip.
- Backend: add a length check after `injectUserConnectionsOnSplitSettings` (`if len(conns) != len(splitSettings) { return error }`) to prevent the panic.

**Warning signs:**
- User with a deleted connection applies an old template and gets a 500 (backend panic) instead of a 400 (validation error)
- The `conns[i]` indexing in `transaction_create.go:444` panics if the connection count doesn't match

**Phase to address:** Backend service (defensive check in `injectUserConnectionsOnSplitSettings`, Phase 1/2) and frontend chip-apply logic (Phase 3).

---

### CP-5: Query Leakage Confirmed Absent — Dedicated Table Design is Sound

**What goes wrong (risk assessed):**
The concern was that templates might accidentally appear in transaction listing, balance calculation, charge creation, or settlement queries.

**Evidence from codebase that this risk is neutralized:**

The dedicated `transaction_templates` table design fully isolates templates from all financial reads. Specifically:

- `transactionRepository.Search` (`repository/transaction_repository.go:94`) queries `FROM transactions` with explicit `WHERE transactions.user_id = ?`. No JOIN or UNION to any other table is present.
- `transactionRepository.GetBalance` (`repository/transaction_repository.go:334`) is a raw SQL query on `FROM transactions WHERE deleted_at IS NULL AND user_id = ?` plus a `FROM settlements` UNION. No reference to any other table.
- `transactionRepository.FindOrphanedSettlementTransactions` (`repository/transaction_repository.go:225`) queries `FROM settlements s JOIN transactions t ON t.id = s.source_transaction_id`. No other tables involved.
- The `Repositories` struct (`repository/interfaces.go`) lists every repository explicitly. A `TemplateRepository` would be a new field; it cannot accidentally be included in existing queries.
- GORM does not auto-discover tables — it only queries the struct passed to `.Find(&ents)` or `.Table("name")`. A new `transaction_templates` table is invisible to existing repository calls.

**Conclusion:** The dedicated-table choice (vs. an `is_template` flag on the `transactions` table) fully eliminates query leakage. An `is_template` approach would require `WHERE is_template = false` on every single query (`Search`, `GetBalance`, `FindOrphanedSettlements`, `GetGroupedByRecurrences`, `GetSourceTransactionIDs`, `NullifyCategory`, `ReassignCategory`) — 7 call sites, each a latent bug if missed. The dedicated table requires none of these changes and provides structural isolation.

**Remaining risk (minor):** If a future developer adds a UNION or JOIN across `transaction_templates` in any of the above methods, leakage would occur. Mitigate with a comment on the template table migration: `-- This table is intentionally isolated from transactions queries. Do not JOIN or UNION with the transactions table in financial read paths.`

**Phase to address:** DB migration (document the isolation intent in a comment).

---

### CP-6: Tags Many2Many — Wrong Join Table Reuse

**What goes wrong:**
The `entity.Transaction` uses `gorm:"many2many:transaction_tags;joinForeignKey:transaction_id;joinReferences:tag_id"`. If the template entity naively uses the same join table name (`transaction_tags`) for its own tags relationship, GORM will write template tag associations into the `transaction_tags` table. This does not cause a foreign key violation (no FK exists from `transaction_tags.transaction_id` to `transactions.id` — GORM's many2many does not add FKs by default), but it silently puts rows in `transaction_tags` with a `transaction_id` that is actually a `template_id`. Any query that joins `transaction_tags` on `transactions.id` would then see template-associated tags appearing against non-existent transaction IDs.

The `tag_repository.go:Delete` does a hard `DELETE FROM tags WHERE id = ?`. GORM automatically handles the join table cleanup for `many2many` associations when `.Association("Tags").Replace(...)` or `.Unscoped().Delete(...)` is used on the parent. But if the join table is shared between transactions and templates, deleting a tag hard-deletes the tag row itself, which cascades on any GORM-managed association cleanup — removing the tag from both transactions and templates consistently. This is not a bug per se, but the shared join table means no isolation.

**How to avoid:**
Use a **separate join table** `template_tags` with `(template_id, tag_id)`. Define the template entity as:
```go
Tags []Tag `gorm:"many2many:template_tags;joinForeignKey:template_id;joinReferences:tag_id"`
```
This matches the pattern already used for `linked_transactions` vs. a hypothetical separate `template_links` join.

**How tags are stored on templates vs. transactions:** Tags on `transactions` are stored by ID via the join table. Tags on templates should follow the same pattern — store by tag ID, not by name string. The JSONB split config approach works for split settings because split settings are not an entity — tags ARE entities with their own table. Use the same many2many pattern.

**Warning signs:**
- `template_tags` rows appear in `transaction_tags` (wrong join table name in entity definition)
- Deleting a tag removes it from templates unexpectedly (verify: after tag delete, re-fetch template and check tags array)

**Phase to address:** DB migration + backend template entity definition (Phase 1).

---

### CP-7: amount/date NOT NULL on transactions vs. NULL on templates — Apply Mapping Pitfalls

**What goes wrong:**
When applying a template, the form `reset()` call must set `amount` to either `0` or `undefined`, and `date` to today's date. The `transactionFormSchema` enforces `amount: z.number().int().min(1, "Valor deve ser maior que zero")` — so `amount: 0` will fail validation immediately, preventing premature submission. The `date` field must be set to today (the design spec says "date defaults to today at apply time").

Two concrete pitfalls:

1. **amount left blank vs. zero:** If `reset()` sets `amount: undefined`, the Zod schema will coerce it to `0` (depending on zod `.int()` behavior with undefined), which will fail validation but may or may not focus the field. If `reset()` sets `amount: 0`, validation fails immediately on submit but the user sees an error state before they type. The correct behavior is `amount: 0` with `setFocus("amount")` immediately after `reset()` — consistent with the spec ("leaving the amount field blank and focused").

2. **date not set to today:** If `reset()` passes the template's stored date (undefined/null — templates don't store dates), the date field will be empty. The `transactionFormSchema` enforces `date: z.string().min(1, "Data é obrigatória")`. The chip must explicitly set `date` to `localDateStr(new Date())` (the same utility `DateQuickChips` uses for `offsetDays: 0`).

**How to avoid:**
The apply function must explicitly construct the reset values:
```typescript
reset({
  ...templateFields,    // type, account_id, category_id, description, split_settings, tags
  amount: 0,            // intentionally zero; user must fill in
  date: localDateStr(new Date()),  // today
  recurrenceEnabled: false,  // templates don't store recurrence (out of scope)
  // ... other form defaults
})
setFocus("amount")
```

Do not pass `amount: undefined` or omit `date` from the reset object — RHF's `reset` with partial values keeps the prior field value for missing keys.

**Warning signs:**
- Date field is empty after applying a template
- Amount validation fires immediately on template apply before user types
- Form submits with today's date without user realizing it was pre-set

**Phase to address:** Frontend chip-apply logic (Phase 3 / TemplateQuickChips implementation).

---

### CP-8: category_id NULL on Apply — category is Optional on Transactions but Required for Non-Transfer

**What goes wrong:**
The `transactionFormSchema` enforces `category_id` is required for non-transfer transactions (`applySharedRefinements`: "Selecione uma categoria"). Templates may store a `category_id`. But if the category was deleted between template creation and apply, the reset value `category_id: 7` renders as a selected option in the dropdown that no longer exists. On submit, `transactionService.Create` calls `s.services.Category.GetByID(ctx, userID, transaction.CategoryID)` which returns `pkgErrors.NotFound("category")`, producing a backend 400 that maps to no tagged field error in the frontend (the tag would be `CATEGORY.NOT_FOUND` which may not have a field mapping).

Category deletion in `categoryService.Delete` calls `transactionRepo.NullifyCategory` — nullifying the category on existing transactions. But it does NOT nullify or invalidate templates (since templates don't exist yet). After v1.7, a category delete must also nullify `category_id` on any template that references it.

**How to avoid:**
1. **Backend:** Extend `CategoryService.Delete` to also nullify `category_id` on `transaction_templates` where `category_id = id`. Add `templateRepo.NullifyCategory(ctx, id)` alongside `transactionRepo.NullifyCategory(ctx, id)`.
2. **Frontend:** When applying a template, validate that `category_id` still exists in the current `useFlattenCategories()` data before calling `reset()`. If it doesn't, clear it and let the user pick.

**Warning signs:**
- User applies template, hits Submit, gets a generic "bad request" error with no field highlighted
- Category dropdown shows no selection after apply even though template had one

**Phase to address:** Backend (extend `CategoryService.Delete` in Phase 1 backend model), frontend (validate on apply in Phase 3).

---

### CP-9: account_id on Template References a Deactivated Account

**What goes wrong:**
`AccountService.Delete` calls `accountRepo.Deactivate` — accounts are soft-deleted by setting `is_active = false`, not hard-deleted. The `transactionRepository.Search` filter joins accounts and filters `WHERE accounts.is_active = true` (unless explicit account IDs are passed). However, `transactionService.Create` calls `s.services.Account.GetByID(ctx, userID, transaction.AccountID)` which searches with `AccountSearchOptions{ UserIDs: []int{userID}, IDs: []int{id} }` — this does NOT filter by `is_active`, so the create succeeds for a deactivated account.

The `splitApplicable` logic in `TransactionForm.tsx` checks `!isSharedAccount` but not `is_active`. The account Select in `TransactionForm` renders options from `useAccounts()` which calls `accountRepo.GetByUserID` — need to check if that filters inactive accounts.

**Evidence:** `accountRepository.GetByUserID` likely returns all accounts (active + inactive). The form's account Select would show a deactivated account as an option if the template's `account_id` is still in the accounts list. This is a UX issue more than a hard failure — the transaction create would succeed (backend does not check `is_active` in `GetByID`), but the account would be "hidden" in the normal flow.

**How to avoid:**
Frontend: When applying a template, check that `account_id` is present in active accounts. If not, clear it and optionally show a warning. This is consistent with how the form already omits inactive accounts from the dropdown.

**Warning signs:**
- Template apply pre-selects an account that doesn't appear in the dropdown (deactivated)
- User can submit a transaction to a deactivated account by applying a template

**Phase to address:** Frontend chip-apply validation logic (Phase 3).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse `transaction_tags` join table for templates | Saves one migration | Template tags silently pollute `transaction_tags`; tag delete queries become ambiguous | Never — always use a separate `template_tags` join table |
| Store split config as raw `json.RawMessage` instead of typed struct | Faster to implement | Schema drift: frontend and backend diverge on field names; hard to validate | Never for financial config — use a named typed struct |
| Enforce 3-template cap only at the service layer (no DB guard) | Simpler code | Race condition allows cap bypass under concurrent requests | Acceptable for v1.7 if concurrent template creation is considered unlikely, but document the risk |
| Apply template without validating stale references (connection, category, account) | Simpler apply logic | User gets confusing backend 400s on submit | Never — validate on apply, not on submit |
| Skip `CategoryService.Delete` extension for template nullification | Saves one phase task | Applying a template with a deleted category silently pre-selects a ghost category | Never — extend delete at the same phase as the template table migration |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GORM JSONB | Using `datatypes.JSON` without a custom scan/value type | Define a concrete Go struct with JSON tags and implement `driver.Valuer` / `sql.Scanner` on it, or use GORM's `datatypes.JSONType[T]` if available |
| RHF `reset()` with partial values | Omitting `amount` and `date` from the reset object — RHF keeps prior values for missing keys | Always pass a complete form values object to `reset()`; derive `date` from `localDateStr(new Date())` and set `amount: 0` explicitly |
| GORM `many2many` join table naming | Using the same join table for two different parent models | Use `gorm:"many2many:template_tags;..."` explicitly in the entity definition |
| Tag service `Create` deduplication | Tag names are normalized and deduplicated by `tagService.Create` — templates store tags by ID, not by name string | On template apply, pass tags as `[{ id, name }]` objects, not raw name strings, so the transaction form's tag field can match them |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Template GET returns all users' templates (missing `WHERE user_id = ?`) | Data leakage between partners or any users | Always scope `templateRepository.Search` with `user_id = authenticatedUserID` — no exception |
| Template update/delete without ownership check | User A deletes User B's template | Service `GetByID(userID, id)` must use `WHERE id = ? AND user_id = ?`; return 404 (not 403) on mismatch to avoid confirming existence |
| Template CRUD endpoints on unauthenticated route group | Any anonymous caller can CRUD templates | Register all template routes under the `/api` group that has `authMiddleware.RequireAuth` |
| Storing sensitive description text on templates accessible to partner | Templates are personal; partners should not see them | Since templates are per-user and IDOR-scoped, the partner's template endpoint returns only their own — this is correct by design, but confirm there is no "list all templates in a connection" endpoint |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Chip apply clears amount but does not focus it | User applies template, types amount, but cursor is not in the amount field — extra tap/click required | Call `setFocus("amount")` immediately after `reset()` in the chip `onClick` handler |
| Applying a template with a stale split shows error only on submit | User fills in amount, submits, gets backend 400 — unclear which split row is invalid | Validate split connection_ids against current accounts on chip click; show inline warning on the chip if stale |
| Template list shows chip row even when user has 0 templates | Chip row appears as empty space | Conditionally render the chip row only when `templates.length > 0` |
| "Save as template" from transaction form copies the current amount | Templates must never store an amount — copying from a filled-in form is the bug | The "Save as template" action must explicitly exclude `amount` and `date` from the payload sent to `POST /api/templates` |
| Cap error (4th template attempt) shows a generic API error | User doesn't know why the create failed | Map `TEMPLATE.MAX_TEMPLATES_REACHED` error tag to a localized Portuguese message in the frontend error tag mapping |

---

## "Looks Done But Isn't" Checklist

- [ ] **Template CRUD API:** Verify that `GET /api/templates` without authentication returns 401, not an empty list
- [ ] **IDOR:** Verify that `PUT /api/templates/:id` with another user's template ID returns 404 (not 200 or 403)
- [ ] **3-template cap:** Verify that a fourth `POST /api/templates` returns a tagged error (`TEMPLATE.MAX_TEMPLATES_REACHED`), not a 500
- [ ] **Category nullification:** Verify that after deleting a category, templates that referenced it have `category_id: null` (not the deleted ID)
- [ ] **Template apply — date:** Verify that clicking a chip sets the date field to today, not empty
- [ ] **Template apply — amount:** Verify that clicking a chip focuses the amount field
- [ ] **Template apply — split:** Verify that a template with a percentage-mode split pre-fills `split_settings` in percentage mode (not amount mode)
- [ ] **Template apply — split date:** Verify that a template with a custom settlement date (`split_settings[0].date`) pre-fills that date in the split row
- [ ] **Chip row visibility:** Verify that the chip row does not render when the user has 0 templates
- [ ] **"Save as template" exclusions:** Verify that the saved template has no `amount` and no `date` — inspect the DB row
- [ ] **Soft-delete consistency:** Verify that template soft-delete (if used) excludes soft-deleted templates from the list and cap count
- [ ] **Tags join table:** Verify that `template_tags` table exists and is separate from `transaction_tags` — query both after creating a templated with tags
- [ ] **Balance unaffected:** Verify that creating 3 templates does not change the balance for any account in any period

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Split round-trip infidelity (CP-1) | HIGH | Data migration required if templates were saved with wrong JSONB shape; add a migration that normalizes existing template split configs |
| IDOR on template endpoints (CP-2) | HIGH | Immediately add `WHERE user_id = ?` scoping; if data was leaked, notify affected users |
| Tag join table reuse (CP-6) | MEDIUM | Create `template_tags` table, migrate rows from `transaction_tags` where `transaction_id IN (SELECT id FROM transaction_templates)`, add FK and remove stale rows |
| Missing CategoryService.Delete extension (CP-8) | LOW | One-off SQL: `UPDATE transaction_templates SET category_id = NULL WHERE category_id IN (SELECT id FROM categories WHERE deleted_at IS NOT NULL)` |
| 3-cap race condition (CP-3) | LOW | One-off SQL to delete duplicate templates per user; add DB-level guard in follow-up migration |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CP-1: Split round-trip fidelity | Phase 1 (DB model + JSONB struct) + Phase 3 (frontend apply) | Unit test round-trips split config through encode/decode; integration test applies template with split and verifies form state |
| CP-2: IDOR on endpoints | Phase 2 (backend CRUD API) | Handler test: update with mismatched user_id returns 404 |
| CP-3: 3-cap race condition | Phase 2 (backend CRUD API, conditional INSERT) | Concurrent goroutines test; assert count <= 3 after parallel creates |
| CP-4: Stale connection_id | Phase 2 (backend defensive check) + Phase 3 (frontend apply validation) | Integration test: delete connection, apply template, assert graceful 400 not 500 |
| CP-5: Query leakage (confirmed absent) | Phase 1 (migration comment documenting isolation) | Run balance query after creating 3 templates; assert balance unchanged |
| CP-6: Tags join table | Phase 1 (entity definition uses `template_tags`) | DB inspection: no rows in `transaction_tags` with non-existent transaction IDs after creating tagged template |
| CP-7: amount/date apply mapping | Phase 3 (frontend TemplateQuickChips) | E2E test: click chip, assert amount field is focused and empty, assert date field is today |
| CP-8: category_id stale on apply | Phase 1 (extend CategoryService.Delete) + Phase 3 (frontend apply validation) | Integration test: delete category, apply template, assert `category_id` is null in reset values |
| CP-9: Deactivated account on apply | Phase 3 (frontend apply validation) | E2E test: deactivate account, apply template that references it, assert account field is cleared |

---

## Sources

- Direct inspection: `backend/internal/domain/transaction.go` — `SplitSettings` struct, `TransactionCreateRequest` shape (HIGH confidence)
- Direct inspection: `backend/internal/service/transaction_create.go` — `injectUserConnectionsOnSplitSettings`, `calculateAmount`, split creation flow (HIGH confidence)
- Direct inspection: `backend/internal/repository/transaction_repository.go` — `Search`, `GetBalance`, `FindOrphanedSettlementTransactions` — all query only `transactions` table; no leakage surface (HIGH confidence)
- Direct inspection: `backend/internal/repository/interfaces.go` — `Repositories` struct lists no template repo; existing repos cannot reference templates (HIGH confidence)
- Direct inspection: `backend/internal/repository/charge_repository.go` — IDOR gate comment and `options.UserID` enforcement pattern (HIGH confidence)
- Direct inspection: `backend/internal/entity/transaction.go` — `many2many:transaction_tags` join table name; risk of reuse identified (HIGH confidence)
- Direct inspection: `backend/internal/service/category_service.go` — `NullifyCategory` called on delete; no template nullification (HIGH confidence)
- Direct inspection: `frontend/src/components/transactions/form/SplitSettingsFields.tsx` — `looksFixed` mode detection on init; `SplitMode` enum; `useSyncSplitAmount` (HIGH confidence)
- Direct inspection: `frontend/src/components/transactions/form/transactionFormSchema.ts` — `splitSettingSchema`, `amount: z.number().int().min(1)`, `date: z.string().min(1)` (HIGH confidence)
- Direct inspection: `frontend/src/utils/splitMath.ts` — `splitPercentagesToCents` strips `percentage`; bulk-split path only (HIGH confidence)
- Direct inspection: `frontend/src/components/transactions/form/DateQuickChips.tsx` — `localDateStr` utility used; same utility needed for template apply `date` default (HIGH confidence)
- Direct inspection: `frontend/src/api/transactions.ts` — `createTransaction` payload shape; `localMidnightISO` date conversion (HIGH confidence)
- Direct inspection: `backend/internal/service/account_service.go` — `Delete` soft-deletes via `Deactivate`; `GetByID` does not filter `is_active` (HIGH confidence)

---
*Pitfalls research for: Transaction Templates (v1.7) — couples finance app*
*Researched: 2026-06-07*
