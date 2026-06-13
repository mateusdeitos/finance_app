# Phase 26: Backend Foundation - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the **data foundation** for transaction templates: the `transaction_templates` table (migration) and the Go `domain` + `entity` types. The template's form fields are stored as an **opaque JSONB `payload`** — the backend persists and returns it without parsing per-field. Outcome: templates are persistable and structurally isolated from every financial query path (balance, listing, charges, settlements) from the first deploy.

**In scope:** schema (`id`, `user_id`, `name`, `payload JSONB`, timestamps), domain/entity types with opaque payload, isolation guarantee.
**Out of scope (later phases):** repository CRUD + cap + IDOR (Phase 27), apply + format validation / stale-field silent drop (Phase 29), management UI (Phase 30). No HTTP endpoints, no per-field backend validation, no referential integrity.

Requirements covered: **TMPL-01**, **TMPL-05**.

</domain>

<decisions>
## Implementation Decisions

### Storage model — opaque JSONB payload
- **D-01:** The template's transaction fields are stored in a **single opaque `payload JSONB NOT NULL` column** (the form payload: `type`, `account_id`, `category_id`, `destination_account_id`, `description`, `tag_ids`, `split_settings`, …). The backend treats it as opaque (`datatypes.JSON` / `json.RawMessage`) — it does **not** parse, type, or validate individual fields. This keeps the model dynamic: the form can evolve without migrations. (User decision, 2026-06-13.)
- **D-02:** **`payload` excludes `amount` and `date`** by frontend contract — the "save as template" serializer strips them. Backend is opaque so cannot enforce; the contract lives in the frontend. (Amount always blank on apply; date = today at apply.)
- **D-03:** **Validation is deferred to apply time (frontend, Phase 29).** On apply, the stored payload is validated against the form's expected shape (Zod); **fields that don't match are silently ignored** (e.g. a `category_id` whose category was deleted is dropped, the rest applies). No error, no crash. This replaces DB referential integrity. (User decision.)

### Operational columns (relational, not in payload)
- **D-04:** **`user_id` `NOT NULL`** — owner; the IDOR scope (Phase 27) and the cap/uniqueness scope.
- **D-05:** **`name` `NOT NULL` with `UNIQUE(user_id, name)`** — the chip label, kept as a real column so uniqueness is a DB constraint. (Per-user uniqueness; trivial under the 3-cap.) *Open to flip into `payload` with service-level uniqueness if preferred.*
- **D-06:** **Hard delete — no `deleted_at` column.** Templates are disposable; real `DELETE` keeps the 3-template cap (Phase 27) counting trivially.

### Consequences of the opaque model (vs the earlier typed-column plan)
- **D-07:** **No FK columns, no `ON DELETE SET NULL`.** Account/category/tag ids live inside `payload`; a deleted entity leaves a stale id in the blob, filtered at apply (D-03).
- **D-08:** **`CategoryService.Delete` is NOT extended** (the earlier CP-8 nullify hook is dropped). With no `category_id` column there is nothing to cascade — apply-time silent-drop handles it. **This removes the only existing-code touch from Phase 26.**
- **D-09:** **No `TagService.Delete` hook** — same reasoning; stale tag ids filtered at apply.
- **D-10:** **Type scope = all three (`expense`/`income`/`transfer`) for free** — the opaque payload carries whatever the form produces, including `destination_account_id` for transfer. No schema branching. Per-type field correctness is the frontend form's job.
- **D-11:** **Split (both modes) and tags ride inside `payload`** — `split_settings` (percentage `Percentage *int` OR fixed-amount `Amount *int64` per row) and `tag_ids` array. Stored verbatim; **TMPL-05 satisfied** by opaque passthrough (no Go serialization logic to round-trip).

### Claude's Discretion
- Exact opaque-JSONB Go technique (`datatypes.JSON` vs custom `json.RawMessage` Scan/Value) — follow the existing pattern in `backend/internal/entity/user_settings.go` / `account.go`. No new dependency (STACK research: zero new deps).
- Whether the backend does *minimal* create-time sanity (valid JSON object, non-empty) vs fully opaque — planner's call; default to minimal/none, since the real contract is enforced on apply.
- Column ordering, `created_at`/`updated_at` conventions, indexes beyond `UNIQUE(user_id, name)` — match existing migrations.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 26: Backend Foundation" — goal + success criteria (revised for the opaque-payload model)
- `.planning/REQUIREMENTS.md` — TMPL-01, TMPL-05 (+ traceability)
- `.planning/PROJECT.md` §"Key Decisions" — locked v1.7 modeling decisions (dedicated table, opaque JSONB payload, apply-time validation)

### Research (this milestone)
- `.planning/research/ARCHITECTURE.md` — domain/entity/migration pattern + build order (NOTE: predates the opaque-payload pivot; its typed-column + `template_tags` + `CategoryService.Delete` advice is SUPERSEDED by the decisions above — use it for the layer pattern, not the schema shape)
- `.planning/research/PITFALLS.md` — isolation verification still applies; CP-1 (split round-trip) and CP-8 (CategoryService.Delete) are MOOT under the opaque model
- `.planning/research/SUMMARY.md` — consolidated guidance; `user_settings.go` JSONB precedent
- `.planning/research/STACK.md` — confirms zero new dependencies; idiomatic GORM JSONB technique

### Code (backend)
- `backend/CLAUDE.md` — layered architecture, domain/entity split, migrations, mocks, testing conventions
- `backend/internal/domain/transaction.go` §`SplitSettings` (≈L170), §`TransactionType` (L13–18) — the shapes the frontend payload mirrors (backend stays opaque)
- `backend/internal/entity/user_settings.go`, `backend/internal/entity/account.go` — existing opaque-JSONB Scan/Value pattern to follow for `payload`
- `backend/migrations/` — goose-style timestamped SQL (latest: `20260607000000_add_linked_transaction_day_of_month_to_user_connections.sql`); pattern for the new `create_transaction_templates_table` migration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- JSONB entity pattern in `entity/user_settings.go` + `entity/account.go` — copy for the opaque `payload` column.
- Existing migration files in `backend/migrations/` — template for the new CREATE TABLE migration.

### Established Patterns
- domain ↔ entity split with round-trip conversion (charges, notifications, push subscriptions all follow it). For templates the payload is opaque, so conversion is trivial (carry the raw JSON through).
- mocks via `just generate-mocks` (mockery); swagger via `just generate-docs` (N/A this phase — no handlers).

### Integration Points
- New `entity.TransactionTemplate` registered for migration; **must NOT** be joined into any existing transaction/balance query (isolation guarantee).
- **No** writes into existing services this phase (CategoryService.Delete extension dropped — D-08).

</code_context>

<specifics>
## Specific Ideas

- Final column set (from discussion): `id`, `user_id` (NOT NULL), `name` (NOT NULL, UNIQUE per user), `payload` (JSONB NOT NULL), `created_at`, `updated_at`. **No** `amount`, `date`, `deleted_at`, and **no** per-field FK columns.
- Apply contract (Phase 29): validate `payload` against the form's Zod shape; **silently drop** invalid/stale fields (deleted account/category/tag, unknown keys); apply the rest; amount blank + focused, date = today.
- Isolation acceptance: existing `Search`, `GetBalance`, `FindOrphanedSettlementTransactions` return identical results with templates present.

</specifics>

<deferred>
## Deferred Ideas

- Per-field backend validation of the payload — intentionally NOT done; the contract is enforced on the frontend at apply. If a future milestone wants server-side guarantees, revisit.
- Recurrence on templates — out of scope for v1.7 (PROJECT.md Out of Scope).

None of the discussion introduced new capabilities — stayed within Phase 26's data-foundation scope.

</deferred>

---

*Phase: 26-backend-foundation*
*Context gathered: 2026-06-13*
