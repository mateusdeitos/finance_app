# Stack Research

**Domain:** Per-category monthly budgets module with configurable alerts (v1.7 addition to an existing couples' finance app)
**Researched:** 2026-06-06
**Confidence:** HIGH

---

## Verdict: No new dependencies required

Every capability needed for v1.7 Budgets is already present in the existing stack. The analysis below documents the exact reuse points, explains the two key design questions (period computation and alert triggering), and explicitly lists what must NOT be added.

---

## Existing Stack — Full Reuse Inventory

### Backend (Go 1.24)

| Technology | Version (go.mod) | v1.7 Role |
|------------|-----------------|-----------|
| Echo v4 | v4.13.4 | CRUD handlers for Budget and CategoryMapping endpoints |
| GORM | v1.31.1 | ORM for budget, category_mapping, budget_alert entities |
| PostgreSQL (pgx/v5) | v5.7.6 | Storage for budgets, mappings, alert sentinel state |
| Goose v3 | v3.26.0 | SQL migrations for new tables (`just migrate-create`) |
| webpush-go (SherClockHolmes) | v1.4.0 (indirect, already in go.sum) | Budget threshold alert push delivery via existing `NotificationService.Dispatch` |
| zerolog | v1.35.0 | Structured logging in new BudgetService |
| samber/lo | v1.52.0 | Slice utilities in budget service layer |
| testcontainers-go/postgres | v0.40.0 | Integration tests for BudgetService with real DB |
| testify | v1.11.1 | Unit and integration test assertions |
| swag | v1.16.2 | Swagger annotations on Budget/CategoryMapping handlers |

### Frontend (React 19 + TypeScript)

| Technology | Version (package.json) | v1.7 Role |
|------------|----------------------|-----------|
| @mantine/core | ^9.2.1 | `Progress` bar for spend-vs-cap visualization; all standard form inputs for budget forms |
| @mantine/dates | ^9.2.1 | Month display for current-period context |
| TanStack Query | ^5.71.10 | `useBudgets`, `useBudget`, `useCategoryMappings` query hooks |
| TanStack Router | ^1.166.8 | New `/budgets` file-based route under `/_authenticated` |
| React Hook Form | ^7.55.0 | Budget create/edit form, alert threshold configuration |
| Zod | ^4.3.6 | Schema for budget form (cap in cents int64, scope enum, threshold percentages) |
| dayjs | ^1.11.20 | Current-month period derivation for "realizado" queries |
| @tabler/icons-react | ^3.40.0 | Budget list and card icons |

---

## Key Design Questions — Stack Implications

### 1. How are monthly budget periods evaluated?

**Decision: on-read SQL aggregation, not stored snapshots.**

"Realizado" (actual spend) is computed at query time by reusing the existing `GetBalance` logic — there are no per-period snapshot rows to maintain.

The design session confirmed: "realizado is just a sum within the current month — no need to persist per-period history for v1." The existing `BalanceFilter` struct in `internal/domain/balance.go` already carries `CategoryIDs []int`, `AccountIDs []int`, `HideSettlements bool`, and a `Period`. A `BudgetService.GetRealized` method calls `transactionRepo.GetBalance` with the budget's category (and the partner's mapped category if shared), scoped to the current calendar month.

For a **private budget**, the filter uses the owner's category ID and sets `HideSettlements: false` so the net-of-settlement amount (the "author's net portion" from the design doc) flows naturally — this is exactly what `GetBalance` already computes for a private account.

For a **shared budget**, both users' mapped category IDs are passed and both users' relevant account IDs are included, producing the combined connection-wide spend — mirroring the "full amount paid by connection members" rule from the design doc.

**Stack implication:** Zero new Go dependencies. No materialized views, no caching layer, no snapshot table. The query executes on every budget card render request; at the scale of a couples app (2 users, tens of transactions per month per category) this is negligible.

### 2. How are alert thresholds checked?

**Decision: synchronous on-write check inside `TransactionService.Create/Update`, dispatched via the existing `NotificationService.Dispatch` goroutine — identical to v1.6 split notifications.**

Cloud Run is stateless. There is no Cloud Scheduler, Cloud Tasks, or Pub/Sub in `infra/main.tf`. Introducing any of those just for threshold alerts would be a significant infrastructure addition for a two-user app. The v1.6 precedent is explicit in `PROJECT.md`: "Synchronous best-effort push dispatch (goroutine after commit) — No async/job infra exists; Cloud Run is stateless; avoids Cloud Tasks IAM setup."

Concrete flow:
```
TransactionService.Create(...)
  → repository writes transaction + settlements (DB transaction commits)
  → go s.services.Notification.Dispatch(context.Background(),
        s.services.Budget.EvaluateAlerts(ctx, transaction))
```

`BudgetService.EvaluateAlerts` finds budgets whose category matches the written transaction, computes realized vs cap for the current month, and returns a `[]domain.NotificationEvent` for any threshold newly crossed. The goroutine runs best-effort; failure is logged, not propagated to the HTTP response.

**Threshold-crossing guard (no scheduler needed):** A `last_notified_threshold` and `last_notified_month` column on the budget alert record tracks what was last fired. The check fires a push only if the new computed percentage crosses a threshold that has not already been notified in the current calendar month. Month rollover is detected lazily: when `last_notified_month` differs from the current month, the sentinel is treated as reset. No job, no cron, no scheduled reset.

**Stack implication:** No scheduler. No Cloud Tasks. No cron library. No in-process ticker goroutine. `TransactionService` gets a dependency on `BudgetService` (the existing cross-service pattern already used by `ChargeService`). `NotificationService.Dispatch` is called with a new `NotificationTypeBudgetAlert` constant added to `internal/domain/push_subscription.go`.

### 3. How is spend-vs-cap visualized on the frontend?

**Decision: `<Progress>` from `@mantine/core` — no chart library.**

`@mantine/core` v9.2.1 ships both `Progress` (segmented horizontal bar with multiple colored sections) and `RingProgress` (circular SVG ring). Both are confirmed present in the installed package version. A budget card showing one category's spend vs cap is a progress indicator, not a chart. `Progress` with color logic (`blue` → `orange` → `red` as spend crosses thresholds) is idiomatic Mantine and requires nothing new.

### 4. How is category equivalence modeled?

A new `category_mappings` table with `(connection_id, user_a_category_id, user_b_category_id)`. User-defined lookup, joined at query time in `BudgetService.GetRealized`. No graph library, no fuzzy-matching algorithm. The design session explicitly rejected name-based matching as fragile.

---

## New Domain Concepts — Backend Layer Map

No new external packages. New files only, all following established patterns:

| Artifact | Package | Notes |
|---------|---------|-------|
| `domain.Budget` | `internal/domain/budget.go` | Cap (int64 cents), scope enum (`shared`/`private`), nullable connection_id, category_id, active bool |
| `domain.CategoryMapping` | `internal/domain/category_mapping.go` | connection_id, user_a_category_id, user_b_category_id |
| `domain.BudgetAlertConfig` | `internal/domain/budget.go` | threshold_percentage int, enabled bool, last_notified_threshold int, last_notified_month string |
| `entity.Budget` | `internal/entity/budget.go` | GORM struct with `ToDomain()`/`FromDomain()` |
| `entity.CategoryMapping` | `internal/entity/category_mapping.go` | GORM struct |
| `BudgetRepository` interface | `internal/repository/interfaces.go` | CRUD + `ListByUserID` + `ListByCategory` |
| `CategoryMappingRepository` interface | `internal/repository/interfaces.go` | CRUD + `GetByConnectionAndCategory` |
| `BudgetService` interface | `internal/service/interfaces.go` | CRUD, `GetRealized`, `EvaluateAlerts` |
| SQL migrations | `migrations/` | `just migrate-create add_budgets` and `just migrate-create add_category_mappings` |
| `/api/budgets` handler | `internal/handler/budget_handler.go` | Standard CRUD following existing handler conventions |
| `/api/category-mappings` handler | `internal/handler/category_mapping_handler.go` | Connection-scoped CRUD |
| `NotificationTypeBudgetAlert` constant | `internal/domain/push_subscription.go` | Added alongside existing type constants |

---

## New Frontend Artifacts — No New Packages

| Artifact | Convention | Notes |
|---------|------------|-------|
| `src/api/budgets.ts` | Raw fetch functions | CRUD + per-budget realized endpoint |
| `src/api/categoryMappings.ts` | Raw fetch functions | Connection-scoped mapping CRUD |
| `src/hooks/useBudgets.ts` | `{ query, invalidate }` pattern | Follows existing hook convention exactly |
| `src/hooks/useCategoryMappings.ts` | `{ query, invalidate }` pattern | |
| `src/pages/BudgetsPage.tsx` | Page component | Budget list + spend progress cards |
| `src/components/budgets/BudgetCard.tsx` | Domain component | `<Progress>` from `@mantine/core`; color shifts at threshold boundaries |
| `src/components/budgets/BudgetFormDrawer.tsx` | `renderDrawer` pattern | Budget create/edit form via React Hook Form + Zod |
| `src/components/budgets/AlertConfigForm.tsx` | Sub-component | Threshold percentage inputs within budget form |
| `src/components/categoryMappings/CategoryMappingDrawer.tsx` | `renderDrawer` pattern | Per-connection mapping management |
| `src/routes/_authenticated.budgets.tsx` | Thin route entry | Points to `BudgetsPage`; no logic in route file |
| `QueryKeys.Budgets`, `QueryKeys.CategoryMappings` | `src/utils/queryKeys.ts` | New entries in existing file |
| `BudgetsTestIds`, `CategoryMappingsTestIds` | `src/testIds/` | New domain files, existing `as const` pattern |

---

## What NOT to Add

| Do NOT Add | Why Not | Use Instead |
|------------|---------|-------------|
| `@mantine/charts` | Spend-vs-cap is a progress indicator, not a chart; `Progress` is already in `@mantine/core` | `<Progress>` from existing `@mantine/core` import |
| Recharts / Chart.js / D3 / Victory | Same reason; importing a chart library for a progress bar is disproportionate overhead | `<Progress>` or `<RingProgress>` from `@mantine/core` |
| Cloud Scheduler / Cloud Tasks / Pub/Sub | No existing infra; 2-user app; on-write goroutine is the v1.6 established precedent | `NotificationService.Dispatch` goroutine after DB commit |
| In-process cron (robfig/cron, go-co-op/gocron) | Cloud Run instances are stateless and ephemeral; goroutines do not survive across request/response cycles | On-write threshold check with lazy month sentinel in `BudgetService.EvaluateAlerts` |
| Redis / Memcached | Realized spend is a lightweight SQL aggregation per budget per month; no caching is warranted at this scale | Direct DB query via `transactionRepo.GetBalance` |
| Any Go job/queue library (asynq, machinery, river) | No async job infrastructure exists; introducing one for alerts alone is premature complexity | Goroutine + `NotificationService.Dispatch` (v1.6 pattern) |
| Separate budget microservice | Single Cloud Run service is the architectural contract | New `BudgetService` / `BudgetRepository` in the existing layered monolith |
| Per-period snapshot table | No rollover required in v1.7; snapshots solve a problem that does not yet exist | Real-time SQL aggregation via `GetBalance` |

---

## Alternatives Considered

| Recommended Approach | Alternative Considered | Why Rejected |
|---------------------|----------------------|--------------|
| On-write goroutine for threshold alerts | Cloud Scheduler polling a `/internal/check-budgets` endpoint | Requires new GCP resources (scheduler job, authenticated invoker IAM binding); overkill for 2 users; no existing infra to build on |
| On-read SQL aggregation for realized spend | Pre-aggregated monthly snapshots written on every transaction | Adds a write-side concern; no rollover means no history is needed; snapshot can drift if a transaction is deleted or edited |
| `<Progress>` from `@mantine/core` | `@mantine/charts` BarChart | `@mantine/charts` wraps Recharts; a linear progress bar does not need a charting library |
| Lazy month sentinel reset (`last_notified_month` column) | Scheduled job resetting alert state at month start | No scheduler exists; lazy check on next transaction write costs one extra column read and is zero-infra |
| `BudgetService.EvaluateAlerts` cross-calls `TransactionService.GetBalance` | Separate raw SQL aggregation in `BudgetRepository` | Reusing the service avoids duplicating the settlement-aware, soft-delete-aware aggregation logic that `GetBalance` already encapsulates correctly |

---

## Version Compatibility

All reused packages are already locked in `go.mod` / `package-lock.json`. No new version resolution needed.

| Package | Locked Version | Compatibility Note |
|---------|---------------|-------------------|
| `@mantine/core` | ^9.2.1 | `Progress` and `RingProgress` confirmed present in v9.2.1 (Mantine docs verified) |
| `github.com/SherClockHolmes/webpush-go` | v1.4.0 (indirect) | Already wired through `notificationService`; budget alerts reuse the same `Dispatch` path with no API changes |
| `gorm.io/gorm` | v1.31.1 | Soft-delete, context propagation, and `DBTransaction` pattern all apply to new entities unchanged |

---

## Sources

- `/home/user/finance_app/backend/go.mod` — confirmed all Go dependencies; webpush-go v1.4.0 already present as indirect dependency
- `/home/user/finance_app/frontend/package.json` — confirmed `@mantine/core ^9.2.1`, `@mantine/dates`, TanStack Query/Router, React Hook Form, Zod, dayjs all present
- `/home/user/finance_app/infra/main.tf` — confirmed no Cloud Scheduler, Cloud Tasks, or Pub/Sub resources; stateless Cloud Run only
- `/home/user/finance_app/backend/internal/service/notification_service.go` — `Dispatch` goroutine pattern, `pushPayload` structure, best-effort delivery model confirmed
- `/home/user/finance_app/backend/internal/service/interfaces.go` — `TransactionService.GetBalance` and `NotificationService.Dispatch` signatures confirmed
- `/home/user/finance_app/backend/internal/domain/balance.go` — `BalanceFilter.CategoryIDs []int` and `HideSettlements bool` confirmed available for reuse
- `/home/user/finance_app/backend/internal/domain/push_subscription.go` — `NotificationEvent` struct and existing type constants confirmed
- `/home/user/finance_app/.planning/notes/shared-budget-design-decisions.md` — on-read computation decision, split semantics mirroring GetBalance, no-rollover decision, category mapping at connection level
- `/home/user/finance_app/.planning/PROJECT.md` — v1.6 "synchronous best-effort dispatch" architectural decision confirmed as precedent
- Mantine docs (web search verified) — `Progress` and `RingProgress` both in `@mantine/core` v9.x; no separate `@mantine/charts` package required for progress bars

---
*Stack research for: v1.7 Budgets module (couples' finance app)*
*Researched: 2026-06-06*
