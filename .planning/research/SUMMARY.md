# Project Research Summary

**Project:** v1.7 Budgets — per-category monthly spending caps for a couples' finance app
**Domain:** Personal finance — shared and private budget tracking with push alert delivery
**Researched:** 2026-06-06
**Confidence:** HIGH

---

## Executive Summary

v1.7 Budgets adds per-category monthly spending limits ("realizado" vs. cap) to an existing Go/Echo/GORM/PostgreSQL + React/Mantine/TanStack couples' finance app. The milestone is an extension, not a greenfield build: every capability required — REST routing, ORM persistence, balance aggregation, push delivery, form inputs, progress visualization — is already present in the stack. Zero new dependencies are introduced on either the backend or the frontend. The implementation adds new domain types, new repository and service implementations, and new route files, all following patterns established in v1.4–v1.6.

The single most important correctness decision is that "realizado" reuses `TransactionRepository.GetBalance` without modification. For a private budget, `GetBalance` is called with `HideSettlements: false` so the author receives their net-of-settlement cost. For a shared budget, `GetBalance` is called once per connection member with `HideSettlements: true` and the two gross-outflow figures are summed. This two-call design is the explicit defence against the primary correctness risk: double-counting spend in the settlement/linked-transaction model. Writing any new aggregation SQL that duplicates this logic is categorically rejected — divergence from `GetBalance` would cause the budget realizado to disagree with the balance view, with no automatic test catching the drift.

The build has a hard dependency order: category equivalence mapping must be fully complete (including the category-delete guard in `CategoryService.Delete`) before any shared budget "realizado" or alert logic is built. Alerts reuse the v1.6 post-commit goroutine dispatch through `NotificationService.Dispatch` and are gated by a `last_fired_period` idempotency column on each `budget_alert_thresholds` row — a "YYYY-MM" string that acts as a once-per-threshold-per-month latch with zero scheduler infrastructure. The ordered sequence is: DB migrations + domain types → category mapping CRUD + category-delete guard → budget CRUD + realizado → alerts → frontend.

---

## Key Findings

### Recommended Stack

No new packages are added to `go.mod` or `package-lock.json`. The backend uses Go 1.24 / Echo v4 / GORM v1.31.1 / PostgreSQL with pgx/v5 and Goose for migrations. The alert push path reuses `github.com/SherClockHolmes/webpush-go` v1.4.0, which is already an indirect dependency. The frontend uses the exact set in `package.json`: `@mantine/core ^9.2.1` for the `<Progress>` bar (no chart library), TanStack Query/Router for data fetching and routing, React Hook Form + Zod for budget forms, and dayjs for the current-month period.

**Core technologies (reuse only):**
- **Echo v4 + GORM v1.31.1:** New `BudgetHandler`, `CategoryMappingHandler`, and supporting repository/service files following existing layered conventions.
- **PostgreSQL via GORM + Goose:** Three new tables (`category_equivalence_mappings`, `budgets`, `budget_alert_thresholds`) with FK constraints and `just migrate-create` scaffolding.
- **`NotificationService.Dispatch` (existing goroutine):** Reused as-is for budget threshold alerts; a new `NotificationTypeBudgetAlert` constant is the only change to the existing notification domain.
- **`TransactionRepository.GetBalance` (existing):** The sole aggregation path for "realizado"; called via `BudgetService.GetSpent`; no new SQL.
- **`@mantine/core Progress`:** Spend-vs-cap visualization; present in installed v9.2.1; `@mantine/charts` is explicitly not added.
- **TanStack Query + React Hook Form + Zod:** `useBudgets`, `useBudgetSpent`, `useCategoryMappings` hooks; `BudgetFormDrawer` with Zod validation for cap (int64 cents) and threshold percentages.

### Expected Features

**Must have (table stakes — all targeted for v1.7):**
- Budget CRUD: create with category, cap in cents, scope (shared/private), and threshold percentages; edit applies immediately; delete preserves underlying transactions.
- Spend-vs-cap "realizado" display: amount + percentage + Mantine `Progress` bar; over-budget shown distinctly in red with numerical overage.
- Month-reset with no rollover: realizado is a current-calendar-month SQL aggregation; no persisted period history.
- Shared budget visibility for both partners.
- Category equivalence mapping: user-defined "my category X ≡ partner's category Y" at connection scope; prerequisite for shared budgets.
- Configurable per-budget threshold alerts: push notification fires once when realizado first crosses each configured threshold (e.g. 80%, 100%) within the month.
- Alert fires once per threshold per month: `last_fired_period` idempotency fence.

**Should have (differentiators):**
- Configurable per-budget thresholds (not a fixed system default).
- Shared budget "realizado" reflects full household gross spend using settlement-aware `GetBalance` semantics.
- Partner sees incomplete-mapping warning when one side of the equivalence is missing.
- Both connection members notified on shared budget threshold crossing; private alerts go to the owner only.

**Defer to v1.x / v2+:**
- Historical view of past months (requires per-period stored snapshots).
- Rollover / envelope carry-forward (explicitly out of scope per design decisions).
- N-way budgets (requires non-pairwise connection model).

### Architecture Approach

The new budget subsystem fits entirely within the existing four-layer monolith (Handler → Service → Repository → PostgreSQL). `BudgetService` is wired last in `main.go` because it depends on `TransactionService` (for `GetBalance`) and `UserConnectionService` (for IDOR checks on shared budgets) — the same cross-service dependency pattern used by `ChargeService`. `CheckAndFireAlerts` is called post-commit from `TransactionService.{Create,Update,Delete}` via a detached goroutine, identical to the v1.6 `Notification.Dispatch` call.

**Major components:**
1. **`category_equivalence_mappings` table + `CategoryMappingRepository/Service/Handler`** — prerequisite; normalizes mapping directionality on write; blocks category deletion when a mapping references that category.
2. **`budgets` + `budget_alert_thresholds` tables + `BudgetRepository/Service/Handler`** — core CRUD; `budgets` carries a DB CHECK constraint enforcing scope-FK invariant; `budget_alert_thresholds` stores `last_fired_period TEXT` as the idempotency sentinel.
3. **`BudgetService.GetSpent`** — assembles `domain.BalanceFilter` and delegates to `TransactionService.GetBalance`; private: one call with `HideSettlements: false`; shared: two calls with `HideSettlements: true`, summed absolute values; zero new aggregation SQL.
4. **`BudgetService.CheckAndFireAlerts`** — post-commit goroutine; conditional UPDATE on `last_fired_period` is the write fence; dispatches one `NotificationEvent` per recipient per threshold crossing.
5. **Frontend: `BudgetsPage` + `BudgetCard` + `BudgetFormDrawer` + `CategoryMappingDrawer`** — Mantine `Progress` for visualization; RHF+Zod for form validation; `useBudgetSpent` cache invalidated by any transaction mutation.

### Critical Pitfalls

1. **Double-counting spend for shared budgets** — never query `SUM(amount) WHERE category_id = X AND user_id IN (A, B)` across the raw transactions table. Use two `GetBalance(HideSettlements: true)` calls, one per member, and sum. Prove correct with an integration test covering the full 3-row split scenario.
2. **"Realizado" computed by new SQL that diverges from `GetBalance`** — any hand-written aggregation re-implementing the transactions+settlements UNION will silently miss the soft-delete guard, settlement account-scoping, and period boundaries. Reuse `GetBalance` exclusively.
3. **Alert spam without the `last_fired_period` fence** — implement the conditional UPDATE (`WHERE last_fired_period IS NULL OR last_fired_period != $period`) before wiring `CheckAndFireAlerts` to `TransactionService`. If `rowsAffected == 0`, skip dispatch.
4. **Category mapping drift — mapped categories deleted without guarding `CategoryService.Delete`** — the guard must ship in the same phase as the mapping table; it cannot be deferred because the delete path is live today.
5. **Period boundary inconsistency** — always derive period from `domain.Period.StartDate()` / `Period.EndDate()` on the backend; frontend sends explicit `YYYY-MM` query parameter; never use `time.Now()` ad-hoc or `new Date().getMonth()` in the browser.

---

## Implications for Roadmap

Five phases, in hard dependency order.

### Phase 1: DB Migrations + Domain Types
Three Goose migrations (`category_equivalence_mappings`, `budgets`, `budget_alert_thresholds`) with FK constraints, CHECK constraint (scope invariant), and indexes. All domain types and GORM entity structs. `go build ./...` passes. Addresses migration rollback safety.

### Phase 2: Category Equivalence Mapping CRUD + Category-Delete Guard
`CategoryMappingRepository/Service/Handler` under `/api/connections/:id/category-mappings` with directionality normalization. Updated `CategoryService.Delete` that blocks deletion of any category referenced by an active mapping (`BUDGET.CATEGORY_IN_ACTIVE_MAPPING`). Hard prerequisite for shared realizado; delete guard ships here, not later.

### Phase 3: Budget CRUD + Realizado (`GetSpent`)
`BudgetRepository`, `BudgetService` (CRUD + real `GetSpent`; `CheckAndFireAlerts` stub), `BudgetHandler` (CRUD + `GET /api/budgets/:id/spent?month=YYYY-MM`). Integration tests: private realizado = net-of-settlement; shared realizado = gross sum from both members; 3-row split scenario. `GetSpent` calls `GetBalance` exclusively.

### Phase 4: Budget Threshold Alerts
`NotificationTypeBudgetAlert` constant, full `CheckAndFireAlerts` (conditional UPDATE fence first; one `NotificationEvent` per recipient), instrumentation of `TransactionService.{Create,Update,Delete,BulkUpdate}`, cross-user check for shared budgets. Integration tests: exactly one alert per threshold per month under concurrent writes. No scheduler infrastructure; `last_fired_period` lazy-reset.

### Phase 5: Frontend
TS types, API fns, query/mutation hooks, `QueryKeys` entries, `BudgetsPage`, `BudgetCard` (Mantine `Progress`, threshold color bands, over-budget label), `BudgetFormDrawer` (RHF+Zod; scope `SegmentedControl`; conditional mapping vs. category picker), `CategoryMappingDrawer`, route, nav entry, `budget_alert` inbox handling. Playwright e2e. Explicit `QueryKeys.BudgetSpent` invalidation on transaction mutations; `budgetProgressPercent` cents utility.

### Phase Ordering Rationale
- Schema first: every subsequent phase compiles against the GORM entities.
- Mapping before budget realizado: shared `GetSpent` resolves both category IDs from the mapping repo.
- Mapping-delete guard in Phase 2, not later: `CategoryService.Delete` is a live production path.
- Realizado before alerts: `CheckAndFireAlerts` calls `GetSpent` internally.
- All backend phases before frontend: eliminates API contract churn.

### Research Flags
Needs research: none — all five phases follow standard codebase patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified against live `go.mod` and `package-lock.json`; `infra/main.tf` confirms no scheduler |
| Features | HIGH | Design-decisions session + competitor analysis + codebase domain model |
| Architecture | HIGH | Direct inspection of `GetBalance`, `TransactionService` post-commit pattern, `Services` aggregate DI |
| Pitfalls | HIGH | Each pitfall traced to specific codebase files |

**Overall confidence:** HIGH

### Gaps to Address (explicit decisions for requirements)

- **Best-effort push losing an alert permanently (Pitfall 9):** Decide the sequencing of the `last_fired_period` write relative to push dispatch. Recommendation: write the sentinel only after at least one successful push delivery, so a failed push leaves the latch unset and the next transaction write retries (tradeoff: possible duplicate push on retry vs. guaranteed no missed alert).
- **`CheckAndFireAlerts` triggered by cap edits (EC-6):** If a user lowers a cap mid-month and the new cap immediately crosses a threshold, no alert fires under the transaction-write-triggered design. Decide: also call `CheckAndFireAlerts` from `BudgetService.Update`, or accept that cap-lowering does not trigger an immediate alert (recommended: trigger it).
- **Two-call vs. single-call shared realizado:** Affirm the two `GetBalance` calls (one per member, summed) and flag for integration-test verification.

---
*Research completed: 2026-06-06*
*Ready for roadmap: yes*
