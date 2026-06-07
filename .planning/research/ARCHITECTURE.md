# Architecture Research

**Domain:** Budgets module integration into existing layered Go + React couples' finance app
**Researched:** 2026-06-06
**Confidence:** HIGH — based on direct codebase inspection, not inference

---

## Standard Architecture

### System Overview (Existing + Budgets Extension)

```
HTTP (Echo)
  ├── /api/connections/:id/category-mappings  (NEW) → CategoryMappingHandler
  ├── /api/budgets                            (NEW) → BudgetHandler (CRUD)
  └── /api/budgets/:id/spent                  (NEW) → BudgetHandler.GetSpent

Service Layer
  ├── CategoryMappingService  (NEW)  — CRUD + ownership guard
  ├── BudgetService           (NEW)  — CRUD + GetSpent orchestration + CheckAndFireAlerts
  │     └── calls TransactionService.GetBalance (EXISTING) for realizado
  └── NotificationService     (EXISTING, extended with budget_alert type)

Repository Layer
  ├── CategoryMappingRepository   (NEW)
  ├── BudgetRepository            (NEW)
  └── TransactionRepository       (EXISTING, GetBalance reused as-is)

PostgreSQL
  ├── category_equivalence_mappings  (NEW table)
  ├── budgets                        (NEW table)
  └── budget_alert_thresholds        (NEW table, child of budgets)
```

### Component Responsibilities

| Component | Responsibility | Layer |
|-----------|----------------|-------|
| `CategoryMappingHandler` | CRUD for connection-level equivalence maps | Handler |
| `BudgetHandler` | CRUD for budgets + `GET /budgets/:id/spent` | Handler |
| `CategoryMappingService` | Validate connection membership + category ownership | Service |
| `BudgetService` | Budget CRUD, orchestrate GetSpent, trigger alert check post-commit | Service |
| `CategoryMappingRepository` | Read/write `category_equivalence_mappings` | Repository |
| `BudgetRepository` | Read/write `budgets` + `budget_alert_thresholds`; lookup by category | Repository |
| `TransactionRepository.GetBalance` | REUSED AS-IS for realizado computation | Repository |

---

## (a) Data Model

### Table: `category_equivalence_mappings`

```sql
-- +goose Up
CREATE TABLE category_equivalence_mappings (
    id                  SERIAL PRIMARY KEY,
    connection_id       INT    NOT NULL REFERENCES user_connections(id) ON DELETE CASCADE,
    -- from_category_id always belongs to connection.from_user_id (normalized on write)
    from_category_id    INT    NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    -- to_category_id always belongs to connection.to_user_id
    to_category_id      INT    NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_mapping_connection_from UNIQUE (connection_id, from_category_id),
    CONSTRAINT uq_mapping_connection_to   UNIQUE (connection_id, to_category_id)
);
CREATE INDEX idx_mapping_connection ON category_equivalence_mappings(connection_id);

-- +goose Down
DROP TABLE IF EXISTS category_equivalence_mappings;
```

**Design rationale:**
- Scoped to `connection_id` (bilateral agreement); one row covers both users' directions.
- `from_category_id` is always the `connection.FromUserID`'s category; `to_category_id` is `connection.ToUserID`'s. The service normalizes directionality at write time using the same `SwapIfNeeded` pattern as `UserConnection`.
- The two unique constraints enforce one equivalence partner per category: a category cannot appear in two mappings for the same connection.
- `ON DELETE CASCADE` from `user_connections` — deleting a connection automatically removes its mappings.
- `ON DELETE CASCADE` from `categories` — deleting a category removes the mapping row. The BudgetService must handle `category_mapping_id` becoming orphaned (or budget being deactivated) when the referenced mapping disappears.

**Domain type (in `internal/domain/budget.go` — new file):**

```go
type CategoryEquivalenceMapping struct {
    ID             int        `json:"id"`
    ConnectionID   int        `json:"connection_id"`
    FromCategoryID int        `json:"from_category_id"`
    ToCategoryID   int        `json:"to_category_id"`
    CreatedAt      *time.Time `json:"created_at"`
    UpdatedAt      *time.Time `json:"updated_at"`
}

type CategoryMappingSearchOptions struct {
    ConnectionIDs    []int `json:"connection_ids"`
    FromCategoryIDs  []int `json:"from_category_ids"`
    ToCategoryIDs    []int `json:"to_category_ids"`
}
```

---

### Table: `budgets`

```sql
-- +goose Up
CREATE TABLE budgets (
    id                  SERIAL PRIMARY KEY,
    owner_user_id       INT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope               TEXT   NOT NULL CHECK (scope IN ('shared', 'private')),
    -- Shared budgets: connection_id NOT NULL, category_mapping_id NOT NULL
    -- Private budgets: connection_id NULL, category_mapping_id NULL
    connection_id       INT    REFERENCES user_connections(id) ON DELETE CASCADE,
    category_mapping_id INT    REFERENCES category_equivalence_mappings(id) ON DELETE SET NULL,
    -- category_id = owner's half of the mapping (or the single category for private).
    -- Denormalized for indexed queries: avoids joining to mappings on every budget list.
    category_id         INT    NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
    active              BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_scope_fks CHECK (
        (scope = 'shared'  AND connection_id IS NOT NULL AND category_mapping_id IS NOT NULL) OR
        (scope = 'private' AND connection_id IS NULL     AND category_mapping_id IS NULL)
    )
);
CREATE INDEX idx_budgets_owner    ON budgets(owner_user_id);
CREATE INDEX idx_budgets_category ON budgets(category_id);
CREATE INDEX idx_budgets_connection ON budgets(connection_id) WHERE connection_id IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS budgets;
```

**FK design for scope:**

- `scope = 'shared'`: `connection_id NOT NULL`, `category_mapping_id NOT NULL`. The mapping record identifies both the caller's category (`from_category_id`) and the partner's category (`to_category_id`). `category_id` is denormalized to the owner's half of the mapping for efficient indexed lookups on budget list.
- `scope = 'private'`: `connection_id NULL`, `category_mapping_id NULL`. Only `category_id` matters.
- The DB CHECK constraint enforces the invariant at the DB level, not only in the service.
- `category_mapping_id` uses `ON DELETE SET NULL` rather than `ON DELETE CASCADE` so the budget row survives category/mapping deletion — the service can detect a null `category_mapping_id` on a shared budget and mark it inactive or surface it as needing reconfiguration.

**Period representation:** No `period` column. The budget amount is a standing monthly cap with no rollover. "Realizado" is always computed on-demand for a caller-supplied period (defaulting to the current month). There is no per-period state to persist in v1.7.

**Domain types (continuing `internal/domain/budget.go`):**

```go
type BudgetScope string
const (
    BudgetScopeShared  BudgetScope = "shared"
    BudgetScopePrivate BudgetScope = "private"
)
func (s BudgetScope) IsValid() bool {
    return s == BudgetScopeShared || s == BudgetScopePrivate
}

type Budget struct {
    ID                int                    `json:"id"`
    OwnerUserID       int                    `json:"owner_user_id"`
    Scope             BudgetScope            `json:"scope"`
    ConnectionID      *int                   `json:"connection_id,omitempty"`
    CategoryMappingID *int                   `json:"category_mapping_id,omitempty"`
    CategoryID        int                    `json:"category_id"`
    AmountCents       int64                  `json:"amount_cents"`
    Active            bool                   `json:"active"`
    AlertThresholds   []BudgetAlertThreshold `json:"alert_thresholds,omitempty"`
    CreatedAt         *time.Time             `json:"created_at"`
    UpdatedAt         *time.Time             `json:"updated_at"`
}

type BudgetFilter struct {
    OwnerUserIDs  []int `json:"owner_user_ids"`
    CategoryIDs   []int `json:"category_ids"`
    ConnectionIDs []int `json:"connection_ids"`
    ActiveOnly    bool  `json:"active_only"`
}

type BudgetSpentResult struct {
    BudgetID    int   `json:"budget_id"`
    SpentCents  int64 `json:"spent_cents"`
    LimitCents  int64 `json:"limit_cents"`
    PeriodMonth int   `json:"period_month"`
    PeriodYear  int   `json:"period_year"`
}
```

---

### Table: `budget_alert_thresholds`

```sql
-- +goose Up
CREATE TABLE budget_alert_thresholds (
    id                  SERIAL PRIMARY KEY,
    budget_id           INT    NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    threshold_pct       INT    NOT NULL CHECK (threshold_pct > 0 AND threshold_pct <= 200),
    -- last_fired_period is "YYYY-MM" of the last month this threshold fired.
    -- NULL = never fired. Used as an idempotency guard in CheckAndFireAlerts.
    last_fired_period   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_alert_budget_pct UNIQUE (budget_id, threshold_pct)
);

-- +goose Down
DROP TABLE IF EXISTS budget_alert_thresholds;
```

**Design rationale:**
- Child of `budgets`; `ON DELETE CASCADE` cleans up automatically.
- `threshold_pct` is an integer (80 = 80%, 100 = 100%). Allows > 100 for "already over budget" second alert.
- `last_fired_period` stores "2026-06" — the month when the alert last fired. The post-commit goroutine compares this to the current period; if equal, the alert is skipped (idempotent). When the month rolls over, `last_fired_period` no longer matches and the threshold can fire again. No reset job is needed.

**Domain type (continuing `internal/domain/budget.go`):**

```go
type BudgetAlertThreshold struct {
    ID              int        `json:"id"`
    BudgetID        int        `json:"budget_id"`
    ThresholdPct    int        `json:"threshold_pct"`
    LastFiredPeriod *string    `json:"last_fired_period,omitempty"`
    CreatedAt       *time.Time `json:"created_at"`
    UpdatedAt       *time.Time `json:"updated_at"`
}
```

---

## (b) "Realizado" Computation — Reusing GetBalance

### What GetBalance already does

`TransactionRepository.GetBalance` (`transaction_repository.go:334`) builds a UNION of two SQL legs:

1. **Transactions leg** — sums `CASE WHEN operation_type='credit' THEN amount ELSE -amount END` for the given `user_id`, date range, and optional `account_id`/`category_id` filters.
2. **Settlements leg** — sums the same signed amounts from the `settlements` table, filtered by `s.account_id` (not the source transaction's account). This is the key settlement-doesn't-leak-into-private-account rule.

`HideSettlements=true` omits the settlements leg entirely.

### Mapping budget scope to BalanceFilter

**Private budget realizado** — the owner's net spend in their category after settlement credits offset the partner's portion:

```go
result, err := s.services.Transaction.GetBalance(ctx, budget.OwnerUserID, period, domain.BalanceFilter{
    CategoryIDs:     []int{budget.CategoryID},
    HideSettlements: false, // include settlements so private net = tx - settled portion
})
// spentCents = abs(result.Balance) if balance is negative (expense)
```

With `HideSettlements=false` and no `AccountIDs` constraint, the balance returns:
`SUM(debit transactions in category) - SUM(settlement credits on owner's connection accounts for those transactions)`

This is exactly the owner's net cost: the portion the partner owes is credited back via settlement, leaving only what the owner actually paid out of pocket. This mirrors the "private account reconciles with bank" rule enforced by `GetBalance`.

**Shared budget realizado** — the full gross outflow from both users' pockets in their respective categories:

```go
// Call 1: from_user gross spend in from_category
r1, err := s.services.Transaction.GetBalance(ctx, conn.FromUserID, period, domain.BalanceFilter{
    CategoryIDs:     []int{mapping.FromCategoryID},
    HideSettlements: true, // ignore settlement credits — want GROSS spend per user
})

// Call 2: to_user gross spend in to_category
r2, err := s.services.Transaction.GetBalance(ctx, conn.ToUserID, period, domain.BalanceFilter{
    CategoryIDs:     []int{mapping.ToCategoryID},
    HideSettlements: true,
})

spentCents := abs(r1.Balance) + abs(r2.Balance)
```

`HideSettlements=true` is intentional: a shared budget counts the total outflow before partners net against each other. If User A paid R$100 (R$50 of which B owes), the shared budget counts R$100 from A plus R$50 from B = R$150 gross connection spending. This is the correct "full amount paid by the connection's members" as defined in the design decisions.

### Where this lives

`BudgetService.GetSpent(ctx context.Context, callerUserID int, budgetID int, period domain.Period) (*domain.BudgetSpentResult, error)`:

1. Fetch budget (with alert thresholds preloaded) from `BudgetRepository`.
2. IDOR check: private — `budget.OwnerUserID == callerUserID`; shared — caller must be `conn.FromUserID` or `conn.ToUserID`.
3. For shared budgets, also fetch the mapping via `CategoryMappingRepository` to get both category IDs.
4. Call `s.services.Transaction.GetBalance` once (private) or twice (shared).
5. Return `BudgetSpentResult`.

`BudgetService` depends on `Services` (the aggregate struct) for `Transaction.GetBalance` and `UserConnection.SearchOne`. This is the same pattern used by `TransactionService`, `ChargeService`, and `UserConnectionService` — wired last in `main.go` after all other services are constructed.

**Zero new aggregation SQL.** `GetBalance` is the only raw-SQL aggregation path. This ensures budget realizado is calculated by the same logic as the balance the user sees in the transactions view, including all timezone, soft-delete, and settlement-leak protections.

---

## (c) Alert Threshold Evaluation

### Constraint

Cloud Run is stateless. No Cloud Scheduler, no Cloud Tasks, no cron infrastructure. The v1.6 decision explicitly chose synchronous best-effort goroutine dispatch (`go NotificationService.Dispatch(context.Background(), ...)`) over async job infra. Budget alerts follow the same decision.

### Recommended approach: Post-commit goroutine re-check on relevant writes

After every transaction write that could affect a budget, the transaction service fires a goroutine to `BudgetService.CheckAndFireAlerts`. This is structurally identical to how `NotificationService.Dispatch` is called post-commit today.

```go
// In TransactionService.Create, after s.tx.Commit(ctx):

// Existing v1.6:
go s.services.Notification.Dispatch(context.Background(), events)

// New v1.7 — fire budget alert check for affected categories:
if transaction.CategoryID > 0 {
    go s.services.Budget.CheckAndFireAlerts(
        context.Background(),
        userID,
        []int{transaction.CategoryID},
        currentPeriod,  // domain.Period{Month: now.Month(), Year: now.Year()}
    )
}
```

`BudgetService.CheckAndFireAlerts(ctx, userID, categoryIDs []int, period domain.Period)`:

1. `budgetRepo.Search(ctx, BudgetFilter{OwnerUserIDs: []int{userID}, CategoryIDs: categoryIDs, ActiveOnly: true})` — cheap indexed lookup.
2. For each budget: call `GetSpent(ctx, userID, budget.ID, period)`.
3. For each `BudgetAlertThreshold` on the budget:
   - Compute `pctUsed = spentCents * 100 / budget.AmountCents`.
   - If `pctUsed >= threshold.ThresholdPct` AND `threshold.LastFiredPeriod != currentPeriodStr`:
     - Update `threshold.LastFiredPeriod = currentPeriodStr` in DB.
     - `go s.services.Notification.Dispatch(context.Background(), []{Type: NotificationTypeBudgetAlert, ...})`.
4. Recover panics with a log. No retry.

**Why `last_fired_period` solves the "fire once per month" requirement without a scheduler:**
- First transaction that crosses 80% → `pctUsed >= 80`, `lastFired != "2026-06"` → fires, updates `lastFired = "2026-06"`.
- Second transaction same month → `pctUsed >= 80`, `lastFired == "2026-06"` → skip.
- Next month (July) → `lastFired == "2026-06" != "2026-07"` → can fire again.
- No reset migration, no scheduler job, no state to manage outside the threshold row.

**Triggers for CheckAndFireAlerts (all post-commit, all goroutines):**
- `TransactionService.Create` — if `transaction.CategoryID > 0`.
- `TransactionService.Update` — if category or amount changed; pass both old and new category IDs to cover the case where the category changed.
- `TransactionService.Delete` — rarely useful (spend decreases, not increases), but fire anyway for completeness to reset a threshold that may have fired due to a transaction that is now deleted. The check is cheap and idempotent.
- `TransactionService.BulkUpdate` (category change) — pass the new category IDs.

**For shared budgets:** The connection's other user's transactions also affect the shared budget. When User B creates a transaction in `to_category_id`, User A's shared budget should also be checked. Implementation: after the standard per-author check, also check whether any of the affected categories appear as `from_category_id` or `to_category_id` in a mapping, and re-run `CheckAndFireAlerts` for the other member of that connection. This secondary check can be done in the same goroutine: load mappings by category, find partner user IDs, call CheckAndFireAlerts for each. This is a targeted indexed query and stays well within best-effort acceptable latency.

**Scheduled sweep (rejected):** Would require Cloud Scheduler + Cloud Run invoker IAM, adds infra complexity, fires on a fixed cadence unrelated to when transactions happen, and provides no better correctness guarantee. The synchronous post-write check fires within milliseconds of the triggering write and is simpler to reason about.

---

## (d) New vs Modified Components

### Backend — New files

| File | Type | Purpose |
|------|------|---------|
| `internal/domain/budget.go` | Domain | All budget types: `Budget`, `BudgetScope`, `BudgetAlertThreshold`, `CategoryEquivalenceMapping`, `BudgetSpentResult`, `BudgetFilter`, `CategoryMappingSearchOptions` |
| `internal/entity/budget.go` | GORM entity | `Budget`, `BudgetAlertThreshold`, `CategoryEquivalenceMapping` with `ToDomain`/`FromDomain` |
| `internal/repository/category_mapping_repository.go` | Repository impl | CRUD for `category_equivalence_mappings` |
| `internal/repository/budget_repository.go` | Repository impl | CRUD for `budgets` + `budget_alert_thresholds`; `Search` by category/owner for alert check |
| `internal/service/category_mapping_service.go` | Service impl | CRUD + connection membership + category ownership validation |
| `internal/service/budget_service.go` | Service impl | CRUD + `GetSpent` + `CheckAndFireAlerts` |
| `internal/handler/category_mapping_handler.go` | Handler | CRUD routes under `/api/connections/:id/category-mappings` |
| `internal/handler/budget_handler.go` | Handler | CRUD routes + `GET /api/budgets/:id/spent?month=YYYY-MM` |
| `migrations/YYYYMMDDHHMMSS_create_category_mappings.sql` | Migration | `category_equivalence_mappings` table |
| `migrations/YYYYMMDDHHMMSS_create_budgets.sql` | Migration | `budgets` + `budget_alert_thresholds` tables |

### Backend — Modified files

| File | Change |
|------|--------|
| `internal/repository/interfaces.go` | Add `CategoryMappingRepository`, `BudgetRepository` interfaces; extend `Repositories` struct with both |
| `internal/service/interfaces.go` | Add `CategoryMappingService`, `BudgetService` interfaces; extend `Services` struct with both |
| `internal/service/transaction_create.go` | Post-commit: `go s.services.Budget.CheckAndFireAlerts(context.Background(), userID, categoryIDs, period)` |
| `internal/service/transaction_update.go` | Post-commit: same, passing both old and new category IDs |
| `internal/service/transaction_delete.go` | Post-commit: same, for the deleted transaction's category |
| `cmd/server/main.go` | Construct `CategoryMappingRepository`, `BudgetRepository`, `CategoryMappingService`, `BudgetService`; register new routes |
| `pkg/errors/errors.go` | Add `BUDGET.*` and `CATEGORY_MAPPING.*` error tags |
| `internal/domain/push_subscription.go` | Add `NotificationTypeBudgetAlert = "budget_alert"` constant |

### Frontend — New files

| File | Purpose |
|------|---------|
| `src/types/budgets.ts` | `Budgets` namespace: `Budget`, `BudgetScope`, `BudgetAlertThreshold`, `BudgetSpentResult`, `CategoryEquivalenceMapping` |
| `src/api/budgets.ts` | `fetchBudgets`, `createBudget`, `updateBudget`, `deleteBudget`, `fetchBudgetSpent` |
| `src/api/categoryMappings.ts` | `fetchCategoryMappings`, `createCategoryMapping`, `deleteCategoryMapping` |
| `src/hooks/useBudgets.ts` | `useBudgets(select?)`, `useCreateBudget`, `useUpdateBudget`, `useDeleteBudget` |
| `src/hooks/useBudgetSpent.ts` | `useBudgetSpent(budgetId, period)` — per-budget spent query |
| `src/hooks/useCategoryMappings.ts` | `useCategoryMappings(connectionId, select?)` + mutation hooks |
| `src/pages/BudgetsPage.tsx` | Budget list with per-budget progress cards |
| `src/components/budgets/BudgetCard.tsx` | Progress bar card: spent/limit, threshold color bands |
| `src/components/budgets/BudgetFormDrawer.tsx` | RHF+Zod drawer for create/edit: scope selector, category picker, amount, alert thresholds |
| `src/components/budgets/AlertThresholdFields.tsx` | Repeater field for `threshold_pct` entries |
| `src/components/category-mappings/CategoryMappingDrawer.tsx` | UI to pair caller's category with partner's category per connection |
| `src/routes/_authenticated.budgets.tsx` | Thin route file — delegates to `BudgetsPage` |
| `src/testIds/budgets.ts` | `BudgetsTestIds` const for e2e; `CategoryMappingTestIds` |

### Frontend — Modified files

| File | Change |
|------|--------|
| `src/utils/queryKeys.ts` | Add `QueryKeys.Budgets`, `QueryKeys.BudgetSpent`, `QueryKeys.CategoryMappings` |
| `src/components/AppLayout.tsx` (or nav component) | Add "Orçamentos" nav entry pointing to `/budgets` |
| Notification inbox render logic | Handle `budget_alert` notification type (link to `/budgets`) |

---

## (e) Build Order (Dependency-Ordered)

### Phase A — DB Foundation + Domain Types

Goal: tables exist and domain types compile; no service or handler code yet.

1. Write `internal/domain/budget.go` with all domain types (no external deps).
2. Write `internal/entity/budget.go` — GORM structs + `ToDomain`/`FromDomain`.
3. Create migration: `category_equivalence_mappings` table.
4. Create migration: `budgets` + `budget_alert_thresholds` tables.
5. `just migrate-up` — apply to local dev DB.

Gate: `go build ./...` passes. Tables verified via `psql \d`.

---

### Phase B — Category Mapping CRUD (hard prerequisite for shared budgets)

Goal: the equivalence-map API is complete and tested before any shared budget logic.

6. Add `CategoryMappingRepository` interface to `internal/repository/interfaces.go`; add field to `Repositories` struct.
7. Implement `internal/repository/category_mapping_repository.go`.
8. Add `CategoryMappingService` interface to `internal/service/interfaces.go`; add field to `Services` struct.
9. Implement `internal/service/category_mapping_service.go` — includes directionality normalization (caller's category → `from_category_id` when caller is `connection.from_user_id`; swap if caller is `to_user_id`).
10. Implement `internal/handler/category_mapping_handler.go` with Swagger annotations.
11. Wire all three in `cmd/server/main.go`; register routes under `/api/connections/:id/category-mappings`.
12. `just generate-mocks && just generate-docs`.
13. Unit tests: `category_mapping_service_test.go` (mock repos).
14. Integration tests: `category_mapping_service_with_db_test.go` (real DB — verify unique constraint, normalization, cascade delete).

Gate: `POST/GET/DELETE /api/connections/:id/category-mappings` returns correct payloads. Unique-constraint rejection verified. Frontend can consume.

---

### Phase C — Budget CRUD (without realizado computation)

Goal: budget management API works end-to-end; `GetSpent` is a stub returning 0.

15. Add `BudgetRepository` interface to `internal/repository/interfaces.go`; add field to `Repositories` struct.
16. Implement `internal/repository/budget_repository.go` — CRUD for `budgets` + `budget_alert_thresholds` (upsert threshold rows on budget update); `Search` method accepts `BudgetFilter`.
17. Add `BudgetService` interface to `internal/service/interfaces.go`; add field to `Services` struct.
18. Implement `internal/service/budget_service.go` — CRUD only; `GetSpent` returns `BudgetSpentResult{SpentCents: 0}`; `CheckAndFireAlerts` is a no-op stub.
19. Implement `internal/handler/budget_handler.go` — CRUD routes + `GET /api/budgets/:id/spent` (returns 0 for now).
20. Wire in `cmd/server/main.go`; register routes. Wire `BudgetService` after `TransactionService` and `UserConnectionService` (it will depend on `Services`).
21. `just generate-mocks && just generate-docs`.
22. Unit + integration tests for CRUD.

Gate: Budget CRUD endpoints work. DB constraints enforced. Frontend can start building the management UI against the real API.

---

### Phase D — Realizado Computation (GetBalance reuse)

Goal: `GetSpent` returns correct cents for both private and shared scopes.

23. Implement `BudgetService.GetSpent` — assemble `BalanceFilter` and call `s.services.Transaction.GetBalance`. Private: 1 call with `HideSettlements: false`. Shared: 2 calls with `HideSettlements: true`, fetch mapping to get both category IDs, sum absolute values.
24. Remove the stub; `GET /api/budgets/:id/spent?month=YYYY-MM` now returns real data.
25. Integration tests:
    - Private: create transactions in a category, call GetSpent, assert `spent_cents` matches sum.
    - Private with split: create a split expense (R$100, 50/50), verify private realizado = R$50 (net of settlement credit).
    - Shared: create transactions on both sides, verify shared realizado = gross sum from both users.

Gate: `GET /api/budgets/:id/spent` returns correct `spent_cents` verified against known transaction data. Split semantics confirmed.

---

### Phase E — Alert Thresholds + Push Dispatch

Goal: alerts fire exactly once per period per threshold crossing, via the existing push infrastructure.

26. Add `NotificationTypeBudgetAlert = "budget_alert"` to `internal/domain/push_subscription.go`.
27. Implement `BudgetService.CheckAndFireAlerts`:
    - Load active budgets by category.
    - Call `GetSpent` per budget.
    - Compare vs each threshold; check `LastFiredPeriod` idempotency guard.
    - Update `last_fired_period` in DB via `BudgetRepository.UpdateThresholdFiredPeriod(ctx, thresholdID, periodStr)`.
    - `go s.services.Notification.Dispatch(context.Background(), []{Type: NotificationTypeBudgetAlert, EntityType: "budget", EntityID: budget.ID, ...})`.
28. Instrument `TransactionService.Create`, `Update`, `Delete` — after existing commit+notify block, add `go s.services.Budget.CheckAndFireAlerts(context.Background(), ...)`.
29. For shared budget cross-user coverage: in the same goroutine, also check mappings for the affected categories and fire `CheckAndFireAlerts` for the partner user ID.
30. Unit tests: mock `BudgetService` to verify goroutine is fired from transaction writes. Integration test: create budget with 80% threshold, create transactions crossing 80%, assert `last_fired_period` updated and notification dispatched; create another transaction same month, assert no second dispatch.

Gate: Alert fires exactly once per period per threshold. Verified for both private and shared budget scopes. `last_fired_period` idempotency confirmed.

---

### Phase F — Frontend

Goal: users can manage budgets, see realizado progress, configure category mappings and alert thresholds.

31. Add `QueryKeys.Budgets`, `QueryKeys.BudgetSpent`, `QueryKeys.CategoryMappings` to `src/utils/queryKeys.ts`.
32. Implement `src/types/budgets.ts` — TypeScript types matching regenerated swagger spec.
33. Implement `src/api/budgets.ts`, `src/api/categoryMappings.ts` — raw fetch functions.
34. Implement query/mutation hooks: `useBudgets`, `useBudgetSpent`, `useCategoryMappings` + mutation variants.
35. `CategoryMappingDrawer` — two-column UI (caller's categories left, partner's categories right); pair via selection. The backend returns partner categories in the `GET /connections/:id/category-mappings` response to avoid an open `/categories?user_id=<other>` IDOR endpoint.
36. `BudgetFormDrawer` — RHF+Zod; scope `SegmentedControl` (shared/private); when shared: connection picker → category mapping picker; when private: category picker directly. Amount `CurrencyField` (cents). `AlertThresholdFields` repeater. Use `useWatch` for scope/connection to conditionally render mapping vs. category pickers.
37. `BudgetCard` — Mantine `Progress` with color threshold bands; `useBudgetSpent(budget.id, currentPeriod)`.
38. `BudgetsPage` — list budgets, open `BudgetFormDrawer` for create/edit.
39. Route `_authenticated.budgets.tsx` + nav entry.
40. `budget_alert` notification type handling in inbox (link to `/budgets`).
41. E2E: create private budget, create transactions, verify progress; create category mapping, create shared budget, verify cross-user spend.

Gate: E2E green. Budget management, realizado display, and alert configuration verified.

---

## Architectural Patterns

### Pattern 1: Post-Commit Goroutine Dispatch (Existing — Extended to Alerts)

**What:** After `s.tx.Commit(ctx)`, call `go service.DoSideEffect(context.Background(), ...)`. A recovered panic only loses the side effect, not the committed write.
**When to use:** Any effect that must not block the request and is acceptable to lose under failure (push notifications, alert checks).
**How extended in v1.7:** `CheckAndFireAlerts` uses the identical pattern established for `Notification.Dispatch` in v1.6. No new infrastructure is introduced.

```go
if err := s.tx.Commit(ctx); err != nil {
    return 0, pkgErrors.Internal("failed to commit", err)
}
go s.services.Notification.Dispatch(context.Background(), events) // existing v1.6
go s.services.Budget.CheckAndFireAlerts(                          // new v1.7
    context.Background(), userID, []int{transaction.CategoryID}, currentPeriod)
```

### Pattern 2: GetBalance Reuse via BalanceFilter

**What:** `BudgetService.GetSpent` assembles `domain.BalanceFilter` and delegates entirely to `TransactionService.GetBalance` → `TransactionRepository.GetBalance`. Zero new aggregation SQL.
**Key insight:** `HideSettlements=false` for private (gives net after partner credit-back); `HideSettlements=true` for shared (gives gross outflow per user). Two calls + sum for shared.

### Pattern 3: Mapping Directionality Normalization on Write

**What:** When creating a mapping, normalize `from_category_id` to always belong to `connection.FromUserID`, regardless of which user initiates the create. Implemented via the same `SwapIfNeeded` logic pattern.
**Why:** Ensures a single unique DB row regardless of which partner creates it first. The DB unique constraints on `(connection_id, from_category_id)` and `(connection_id, to_category_id)` reinforce this at the DB level.

### Pattern 4: `last_fired_period` Idempotency

**What:** Store `YYYY-MM` in `budget_alert_thresholds.last_fired_period` when a threshold fires. The alert check is a no-op if `last_fired_period == currentPeriod`. Resets naturally on month rollover.
**Why:** Allows `CheckAndFireAlerts` to be called on every relevant transaction write (no debouncing needed) while guaranteeing at-most-one-fire per month per threshold.

---

## Data Flow

### Create Transaction → Alert Check

```
TransactionHandler.Create (POST /api/transactions)
    → TransactionService.Create
        → Begin DB TX
        → transactionRepo.Create + settlement + linked tx writes
        → Commit DB TX
        → go Notification.Dispatch(splitCreatedEvents)          [existing v1.6]
        → go Budget.CheckAndFireAlerts(                         [new v1.7]
               userID, []int{categoryID}, currentPeriod)
              → budgetRepo.Search(BudgetFilter{CategoryIDs: [categoryID]})
              → for each budget:
                   → BudgetService.GetSpent → Transaction.GetBalance
              → for each threshold crossing not yet fired this period:
                   → budgetRepo.UpdateThresholdFiredPeriod(thresholdID, period)
                   → go Notification.Dispatch([{budget_alert, entityID: budget.ID}])
```

### Frontend: Budget Progress Display

```
BudgetsPage mounts
    → useBudgets() → GET /api/budgets
    → for each budget: useBudgetSpent(id, currentMonth) → GET /api/budgets/:id/spent?month=YYYY-MM
    → BudgetCard renders Mantine Progress: spent/limit, color at threshold%

User creates a transaction (existing flow)
    → existing transaction query invalidation
    → page explicitly invalidates QueryKeys.BudgetSpent on mutation success
    → BudgetCard re-fetches spent → reflects updated realizado
```

### Frontend: Category Mapping + Shared Budget Setup

```
BudgetFormDrawer (scope=shared selected)
    → connection picker → useCategoryMappings(connectionId)
         → GET /api/connections/:id/category-mappings
              (response includes partner's categories to avoid open IDOR endpoint)
    → user pairs categories → POST /api/connections/:id/category-mappings
    → user creates budget with category_mapping_id = mapping.ID
```

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `BudgetService` → `TransactionService.GetBalance` | Direct call via `Services` aggregate | Same cross-service dep as `ChargeService` → `TransactionService` |
| `BudgetService` → `UserConnectionService.SearchOne` | Direct call via `Services` | Resolve connection for shared budget IDOR check + GetSpent |
| `BudgetService` → `NotificationService.Dispatch` | Post-commit goroutine, `context.Background()` | Identical to existing pattern |
| `TransactionService.{Create,Update,Delete}` → `BudgetService.CheckAndFireAlerts` | Post-commit goroutine | New coupling; best-effort to avoid cascading failures into transaction path |
| `CategoryMappingHandler` internal partner-category fetch | `CategoryMappingService` → `CategoryRepository` | Service fetches partner's categories for the response; no open `?user_id=<other>` endpoint |

### IDOR Considerations

- `GET /api/budgets` — service filters by `owner_user_id = callerUserID`; also returns shared budgets where caller is a member of the connection.
- `GET /api/budgets/:id/spent` — service verifies caller is `owner_user_id` (private) or a member of `connection_id` (shared) before calling `GetBalance` with the other user's ID.
- `GET /api/connections/:id/category-mappings` — service verifies caller is a member of the connection before returning (and before fetching partner categories for the response).

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Duplicating GetBalance SQL for Budgets

**What people do:** Write a new `GetBudgetSpent` raw SQL query that re-implements the transactions+settlements UNION.
**Why it's wrong:** Diverges from `GetBalance`'s settlement semantics over time. Any future fix to `GetBalance` (timezone, soft-delete, settlement edge case) won't automatically apply to the budget query, causing the budget realizado to disagree with the balance UI.
**Do this instead:** Assemble `domain.BalanceFilter` and call `TransactionService.GetBalance`. It already handles the settlement-doesn't-leak rule, category filtering, and period boundaries.

### Anti-Pattern 2: Storing Period in Budget Table

**What people do:** Add `period_month`, `period_year` columns to `budgets` to scope the cap to one specific month.
**Why it's wrong:** v1.7 budgets are standing monthly caps — the same limit applies every month. Persisting the period implies per-period history or rollover, neither of which is in scope. It makes listing "active budgets for this month" require either a wildcard match or a per-period insert every month.
**Do this instead:** No period in the budget row. Period is a query parameter to `GetSpent`, defaulting to the current month at call time.

### Anti-Pattern 3: Exposing Partner's Categories via Open Endpoint

**What people do:** Allow `GET /api/categories?user_id=<any>` so the frontend can fetch the partner's categories for the mapping UI.
**Why it's wrong:** Authorization must live in the backend. Any authenticated user could enumerate any other user's categories.
**Do this instead:** Include partner categories in the `GET /api/connections/:id/category-mappings` response. The service verifies the caller is a member of the connection before fetching and returning the partner's category list.

### Anti-Pattern 4: Polling for Budget Alerts via Cloud Scheduler

**What people do:** Add a Cloud Scheduler job that sweeps all budgets periodically.
**Why it's wrong:** Requires IAM setup for Cloud Run invoker, adds infra complexity, fires on a fixed cadence unrelated to transaction writes, and provides no correctness advantage.
**Do this instead:** Post-commit goroutine check. Synchronous with the triggering write; idempotent via `last_fired_period`. Consistent with the established v1.6 pattern.

### Anti-Pattern 5: Mapping Directionality Ambiguity

**What people do:** Store mappings without normalizing `from`/`to` based on connection ownership, allowing duplicate rows from opposite perspectives.
**Why it's wrong:** Two partners could create the same mapping from opposite sides, producing two rows. Queries filtering by `from_category_id` would miss valid mappings stored with roles reversed.
**Do this instead:** Normalize on write: `from_category_id` always belongs to `connection.FromUserID`. The unique DB constraints enforce one row per category pair.

---

## Sources

- Direct inspection: `backend/internal/repository/transaction_repository.go:334` — `GetBalance` full implementation
- Direct inspection: `backend/internal/service/transaction_create.go:54-155` — post-commit goroutine pattern for `Notification.Dispatch`
- Direct inspection: `backend/internal/service/notification_service.go:50-80` — `Dispatch` implementation
- Direct inspection: `backend/internal/domain/balance.go` — `BalanceFilter` struct
- Direct inspection: `backend/internal/domain/push_subscription.go` — `NotificationEvent`, notification type constants
- Direct inspection: `backend/internal/domain/user_connection.go` — `UserConnection`, `SwapIfNeeded`
- Direct inspection: `backend/internal/service/interfaces.go` — `Services` struct, cross-service dep pattern
- Direct inspection: `backend/internal/repository/interfaces.go` — `Repositories` struct
- Direct inspection: `backend/CLAUDE.md` — business rules for shared expenses, settlement semantics, DI pattern, DBTransaction pattern
- Direct inspection: `.planning/notes/shared-budget-design-decisions.md` — scope decisions, split semantics, category mapping rationale
- Direct inspection: `.planning/PROJECT.md` — v1.7 requirements and out-of-scope list

---
*Architecture research for: v1.7 Budgets module integration*
*Researched: 2026-06-06*
