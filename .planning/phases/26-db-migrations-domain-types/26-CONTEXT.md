# Phase 26: DB Migrations + Domain Types - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Lay the **database schema + Go type foundation** for **private per-category monthly budgets** (v1.7). Deliverables:

- Two Goose migrations: `budgets` and `budget_alert_thresholds` (Up + Down blocks; `just migrate-down` runs clean on a local DB).
- `internal/domain/budget.go` — `Budget`, `BudgetAlertThreshold`, `BudgetFilter`, `BudgetSpentResult`, `BudgetScope`.
- `internal/entity/budget.go` — GORM structs with `ToDomain` / `FromDomain`.
- A Period-boundary unit test proving realizado queries use `domain.Period.StartDate()`/`EndDate()` exclusively (transaction at exactly `EndDate()` included; `EndDate()+1ns` excluded).

**No service, repository, or handler code** in this phase. `go build ./...` must pass.

**Scope is private-only.** Shared/connection budgets, category-equivalence mapping, multiple budgets per user, and per-period history are all deferred to a future milestone (see REQUIREMENTS.md "Out of scope").
</domain>

<decisions>
## Implementation Decisions

### Schema scope shape
- **D-26-1: Private-only schema — no shared scaffolding in the DB.** The `budgets` table carries exactly: `owner_user_id`, `category_id`, `amount_cents` (int64 cents), `active`, and timestamps. Do **NOT** add `scope` / `connection_id` / `category_mapping_id` columns or the `chk_scope_fks` CHECK constraint that the v1.7 research `ARCHITECTURE.md` describes — that design predates the shared-budget scope cut. Those columns are added by a future migration when the shared milestone starts.
- **D-26-2: Ship the `BudgetScope` Go type anyway, with `Private` as the only constant.** ROADMAP explicitly lists `BudgetScope` as a phase-26 deliverable. Define it as a typed enum (`type BudgetScope string`) with `BudgetScopePrivate` only (no `BudgetScopeShared` yet) and an `IsValid()` method. It is a lightweight forward marker with zero DB cost — there is no `scope` column for it to map to in v1.7.
- **D-26-3: One cap per category enforced at the DB.** `UNIQUE(owner_user_id, category_id)` on `budgets` (the flat model: each row IS one category cap; "a user's budget" = their set of rows). Matches BUD-03 / ROADMAP SC3.

### Cap removal & the `active` column
- **D-26-4: "Remove a category cap" (BUD-05) = hard `DELETE` of the `budgets` row.** No soft-delete, no `deleted_at` on budgets. Budgets need no audit trail — realizado is computed on-read with no history table — and deleting a cap must not touch transactions (it doesn't; transactions are a separate table). The row's `budget_alert_thresholds` children are removed via `ON DELETE CASCADE`.
- **D-26-5: `active BOOLEAN NOT NULL DEFAULT true` is a user-facing PAUSE toggle, distinct from deletion.** A paused cap (`active=false`) keeps its config and thresholds but stops counting realizado / firing alerts. `BudgetFilter` should expose an `ActiveOnly` option for queries that want only live caps.

### Alert enable/disable representation
- **D-26-6: Per-threshold `enabled BOOLEAN NOT NULL DEFAULT true` on `budget_alert_thresholds`.** Each threshold (e.g. 80%, 100%) toggles independently without being deleted. This is **finer than ALERT-01 strictly requires** (ALERT-01 says "enable/disable alerts for that cap") and is an **intentional addition beyond ROADMAP's literal three-column list** for the threshold table. Disabling every threshold on a cap = silencing that cap's alerts; the cap-level `active` pause covers whole-cap stop. No separate `alerts_enabled` column on `budgets`.

### `last_fired_period` latch
- **D-26-7: `last_fired_period` is nullable `TEXT` storing `'YYYY-MM'`** (e.g. `'2026-06'`); `NULL` = never fired. Derive from `domain.Period` via `fmt.Sprintf("%04d-%02d", year, month)`. This is the once-per-month idempotency latch that Phase 28's conditional `UPDATE ... WHERE last_fired_period IS NULL OR last_fired_period <> $period` compares by string equality. Chosen deliberately to match the `YYYY-MM` `month` parameter format used by SPEND-03's API — one period format end-to-end. Domain field type: `*string`.

### Period-boundary contract (locked by ROADMAP SC4)
- **D-26-8: All realizado/balance queries use `domain.Period.StartDate()` / `EndDate()` exclusively** — never ad-hoc date math. This phase establishes the contract with a unit test asserting a transaction at exactly `EndDate()` is included and one at `EndDate()+1ns` is excluded. Note the existing `GetBalance` filters with `date >= StartDate` AND `date <= EndDate` (inclusive of `EndDate`'s last nanosecond `23:59:59.999999999`).

### Migration conventions (carry forward, not re-decided)
- Use `just migrate-create <name>` to scaffold (auto-timestamps `YYYYMMDDHHMMSS_*.sql`); never hand-name migration files.
- SQL style per existing migrations: explicit `REFERENCES`, `ON DELETE` clauses, `CREATE INDEX` for FK columns, `TIMESTAMPTZ` timestamps.
- `budget_alert_thresholds.budget_id` → `budgets(id) ON DELETE CASCADE`; `UNIQUE(budget_id, threshold_pct)`.
- FK `ON DELETE` for `budgets.category_id` → `categories(id)` and `budgets.owner_user_id` → `users(id)`: follow the existing category/user cascade pattern (categories use `ON DELETE CASCADE` from users). **Claude's discretion** during planning, guided by existing migrations — default to `ON DELETE CASCADE` so deleting a category/user cleans up its budget rows.

### Claude's Discretion
- Exact field set of `BudgetFilter` (beyond `OwnerUserIDs`, `CategoryIDs`, `ActiveOnly`), `BudgetSpentResult` (must surface per-category `cap`, `spent`, `remaining` for SPEND-03), and `BudgetAlertThreshold` Go fields — derive from the locked schema + downstream phase needs.
- Index choices beyond FK indexes.
- `threshold_pct` column type (int percent, e.g. CHECK 1–200) — follow research recommendation / existing CHECK-constraint style.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 26: DB Migrations + Domain Types" — the FIXED phase boundary, schema column list, and 4 success criteria. **This is the authority where it conflicts with research.**
- `.planning/REQUIREMENTS.md` — v1.7 requirements (BUD-01..05, SPEND-01..03, ALERT-01..04, UI-01..04) and the explicit "Out of scope" table that cut shared budgets. Phase 26 maps to none directly (foundation) but every later v1.7 requirement builds on this schema.

### Design intent
- `.planning/notes/shared-budget-design-decisions.md` — the explore-session origin of the budget concept (per-category monthly cap, no rollover, private = owner net portion via `GetBalance`). Note: this doc still discusses shared budgets, which v1.7 defers.
- `.planning/research/ARCHITECTURE.md` — detailed proposed schema/types. **READ WITH CARE: it predates the scope cut and describes the full shared+private 3-table design (scope column, connection_id, category_mapping_id, chk_scope_fks, category_equivalence_mappings table). Phase 26 deliberately does NOT implement that — see D-26-1/D-26-2.** Still useful for: domain type field shapes, `last_fired_period` rationale, `Period`→`BalanceFilter` mapping.
- `.planning/research/SUMMARY.md` — milestone overview, dependency order, `last_fired_period` "YYYY-MM" latch rationale, zero-new-dependencies note.
- `.planning/research/PITFALLS.md` — migration rollback safety, alert idempotency fence, best-effort-push sequencing (relevant to Phase 28, not 26).

### Backend patterns to mirror (Go)
- `backend/migrations/` — Goose migration conventions; e.g. `20260414000000_create_charges_table.sql` (FK + index + Up/Down style), `00001_initial_schema.up.sql` (categories table at §lines 75–87).
- `backend/internal/domain/transaction.go` — domain struct + Filter pattern (`Transaction` ~L73, `TransactionFilter` ~L181), and **`Period` type with `StartDate()`/`EndDate()` at ~L326–361** (the boundary contract).
- `backend/internal/domain/category.go` — `Category` (owner = `UserID int`); budgets reference `category_id` + `owner_user_id`.
- `backend/internal/entity/transaction.go` — GORM entity + `ToDomain`/`FromDomain` + `BeforeCreate` timestamp hook pattern.
- `backend/internal/entity/category.go` — entity conversion pattern to mirror for `entity/budget.go`.
- `backend/internal/repository/transaction_repository.go` — `GetBalance` (~L334) + `BalanceFilter`; the realizado calculation reused in Phase 27 (do not build new aggregation SQL).
- `backend/internal/domain/transaction_test.go` (~L48–159) & `backend/internal/service/transaction_balance_test.go` — precedent for Period-boundary and date-inclusion/exclusion assertions; model the new boundary unit test on these.
- `backend/CLAUDE.md` — Go architecture, layered design, testcontainers testing, mocks.
- `backend/justfile` — `migrate-create` / `migrate-up` / `migrate-down` targets; `just generate-docs` (only relevant once handlers exist, not this phase).

### Cross-cutting conventions
- `CLAUDE.md` (root) — cents (int64) end-to-end; `time.Local = UTC`; UTC across the wire.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`domain.Period` + `StartDate()`/`EndDate()`** (`internal/domain/transaction.go:326`): the boundary primitive every realizado query must use. Phase 26 only writes a contract test against it; Phase 27 consumes it.
- **`GetBalance` / `BalanceFilter`** (`internal/repository/transaction_repository.go:334`): the realizado engine. Private budget spend = owner net portion (amount − settlements), which `GetBalance` with `HideSettlements=false` already computes. No new aggregation SQL.
- **Entity `ToDomain`/`FromDomain` + `BeforeCreate` hook** pattern (`entity/transaction.go`, `entity/category.go`): copy directly for `entity/budget.go` and `entity/budget_alert_threshold.go`.

### Established Patterns
- **Money = `int64` cents**, IDs = `int`/SERIAL, timestamps = `*time.Time` (UTC) / `TIMESTAMPTZ`.
- **Filter structs** (`TransactionFilter`, `ChargeFilter`): model `BudgetFilter` on these (slice-of-IDs fields + bool flags like `ActiveOnly`).
- **Goose migrations** are timestamp-named via `just migrate-create`; symmetric Up/Down; FK columns get a `CREATE INDEX`.

### Integration Points
- `budgets.category_id` → `categories(id)`, `budgets.owner_user_id` → `users(id)` — existing tables.
- `budget_alert_thresholds.budget_id` → `budgets(id)` (new), `ON DELETE CASCADE`.
- Phase 27 wires `BudgetRepository`/`Service`/`Handler` on top of these types; Phase 28 wires alert dispatch using `last_fired_period`. Keep the domain types shaped for those consumers.
</code_context>

<specifics>
## Specific Ideas

- `last_fired_period` deliberately uses the **same `'YYYY-MM'` string format** as the SPEND-03 API `month` parameter — the user wants one period representation flowing end-to-end, no second format to keep in sync.
- The `BudgetScope` type is kept as a deliverable purely as a **forward marker** (Private only) so the future shared milestone has a typed seam, without paying any schema cost now.
</specifics>

<deferred>
## Deferred Ideas

These surfaced from research/requirements but are explicitly NOT in v1.7 (and not in phase 26). Do not implement:

- **Shared / connection-level budgets** — `scope`, `connection_id`, `category_mapping_id`, `chk_scope_fks` CHECK constraint, and the whole `category_equivalence_mappings` table (research SHARED-F1..F5). Added by a future migration + the `BudgetScopeShared` constant when that milestone starts.
- **Category equivalence mapping** (`my category X ≡ partner's Y`) + the `CategoryService.Delete` guard it needs — only required for shared budgets.
- **Multiple budgets per user** (BUD-F1), **per-period historical snapshots** (BUD-F2), **rollover/envelope carry-forward** (BUD-F3), **N-way splits** (BUD-F4), **alert-on-cap-edit** (ALERT-F1).

</deferred>

---

*Phase: 26-DB Migrations + Domain Types*
*Context gathered: 2026-06-07*
