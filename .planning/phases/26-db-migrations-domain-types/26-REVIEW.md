---
phase: 26-db-migrations-domain-types
reviewed: 2026-06-14T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - backend/internal/domain/budget.go
  - backend/internal/domain/budget_period_boundary_test.go
  - backend/internal/entity/budget.go
  - backend/migrations/20260614113028_create_budgets_table.sql
  - backend/migrations/20260614113109_create_budget_alert_thresholds_table.sql
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-06-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This phase delivers DB schema (two Goose migrations) and domain/entity types for the Budgets feature. The domain model is clean and consistent with project conventions — `int64` cents, `*string` for nullable `LastFiredPeriod`, pointer-receiver `BeforeUpdate`, value-receiver `BeforeCreate` (matching the established `Charge`/`Settlement` pattern), and correct GORM snake_case column mapping without needing explicit tags. The `ToDomain`/`BudgetFromDomain` round-trips are structurally complete with no lossy conversions.

Two material defects were found: the period-boundary test provides zero coverage of `EndDate()` correctness (both assertions are trivially true by `time.Time` arithmetic), and the `budgets` Down migration will fail under partial rollback due to a live FK reference from `budget_alert_thresholds`. Three additional warnings concern missing DB-level data-integrity guards (`amount_cents` positivity, `last_fired_period` format) and the absence of entity round-trip tests.

## Critical Issues

### CR-01: Period-boundary test assertions are vacuously true — EndDate() correctness is never checked

**File:** `backend/internal/domain/budget_period_boundary_test.go:14-24`

**Issue:** Both sub-tests assert pure `time.Time` arithmetic identities that hold for _any_ time value returned by `EndDate()`:

- Sub-test 1: `txDate := endDate; assert.False(t, txDate.After(endDate))` — `x.After(x)` is always `false` by definition; passes even if `EndDate()` returns `time.Time{}` (zero value).
- Sub-test 2: `txDate := endDate.Add(time.Nanosecond); assert.True(t, txDate.After(endDate))` — `(x + 1ns).After(x)` is always `true` by definition; passes no matter what `EndDate()` returns.

The actual contract being documented in the comments — that `EndDate()` for `Period{Month:6, Year:2026}` returns `2026-06-30 23:59:59.999999999 UTC` — is never asserted. If `EndDate()` returned `2026-01-01 00:00:00 UTC`, both tests would still pass. The test provides zero coverage of the implementation's correctness.

**Fix:** Assert the exact expected time, and additionally assert the StartDate so the inclusive lower bound is also pinned:

```go
func TestPeriodBoundaryInclusion(t *testing.T) {
    period := Period{Month: 6, Year: 2026}

    wantStart := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
    wantEnd   := time.Date(2026, 6, 30, 23, 59, 59, 999999999, time.UTC)

    t.Run("StartDate returns first instant of month", func(t *testing.T) {
        assert.Equal(t, wantStart, period.StartDate(),
            "StartDate must be 2026-06-01 00:00:00.000000000 UTC")
    })

    t.Run("EndDate returns last nanosecond of month", func(t *testing.T) {
        assert.Equal(t, wantEnd, period.EndDate(),
            "EndDate must be 2026-06-30 23:59:59.999999999 UTC")
    })

    t.Run("transaction at exactly EndDate() is included", func(t *testing.T) {
        txDate := period.EndDate()
        assert.False(t, txDate.After(period.EndDate()),
            "transaction at EndDate() must not be After endDate")
    })

    t.Run("transaction at EndDate()+1ns is excluded", func(t *testing.T) {
        txDate := period.EndDate().Add(time.Nanosecond)
        assert.True(t, txDate.After(period.EndDate()),
            "transaction 1ns past EndDate() must be After endDate")
    })
}
```

## Warnings

### WR-01: Down migration for budgets table will fail under partial rollback

**File:** `backend/migrations/20260614113028_create_budgets_table.sql:16`

**Issue:** `DROP TABLE IF EXISTS budgets` will raise a FK constraint violation if `budget_alert_thresholds` is still present (i.e., if someone rolls back only migration `20260614113028` without first rolling back `20260614113109`). The `IF EXISTS` clause suppresses "table does not exist" but does NOT suppress FK dependency errors. Goose's normal reverse-chronological rollback applies migrations in the correct order, but manual `goose down-to` targeting this specific version, or a future migration reordering, will cause a silent operational failure.

**Fix:** Add `CASCADE` to the drop:

```sql
-- +goose Down
DROP TABLE IF EXISTS budgets CASCADE;
```

This ensures child-table rows and the FK constraint are dropped atomically even if `budget_alert_thresholds` still exists.

---

### WR-02: `amount_cents` has no positivity constraint — zero and negative budgets silently accepted

**File:** `backend/migrations/20260614113028_create_budgets_table.sql:6`

**Issue:** `amount_cents BIGINT NOT NULL` accepts `0` and negative values. A budget cap of zero cents (infinite block) or a negative cap is semantically invalid; the `transactions` table enforces `CHECK (amount != 0)` for the same reason. Without a DB-level constraint, a repository bug or bad API payload could insert a zero-amount budget that would make spending calculations nonsensical (`RemainingCents` would be negative from the first cent spent).

**Fix:**

```sql
amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
```

---

### WR-03: `last_fired_period` TEXT accepts any string — no format enforcement

**File:** `backend/migrations/20260614113109_create_budget_alert_thresholds_table.sql:7`

**Issue:** The column is documented to hold `'YYYY-MM'` strings (spec D-26-7). The database accepts any text value (e.g., `'foo'`, `'2026-13'`, `''`) without error. A future bug that writes a malformed period string will pass DB insertion silently, then fail only when the application tries to parse the string back — producing a runtime error at an unexpected call site rather than at write time.

**Fix:** Add a regex CHECK constraint:

```sql
last_fired_period TEXT CHECK (last_fired_period IS NULL OR last_fired_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
```

This allows `NULL` (no alert yet fired), enforces the `YYYY-MM` shape, and rejects months outside `01–12`.

## Info

### IN-01: No round-trip test for entity.Budget / entity.BudgetAlertThreshold

**File:** `backend/internal/entity/budget.go`

**Issue:** The project has established the pattern of unit-testing entity round-trips (`backend/internal/entity/push_subscription_test.go`). `entity.Budget` and `entity.BudgetAlertThreshold` have no corresponding `_test.go` file. While all field mappings in `ToDomain`/`BudgetFromDomain`/`BudgetAlertThresholdFromDomain` are structurally correct, a test would catch future regressions (e.g., a new field added to `domain.Budget` but not reflected in the entity conversion).

**Fix:** Add `backend/internal/entity/budget_test.go` following the `push_subscription_test.go` pattern. Exercise at minimum: all non-zero fields survive a `FromDomain → ToDomain` round-trip, and `*string LastFiredPeriod` is correctly preserved as both non-nil and nil.

---

### IN-02: `BudgetSpentResult` embeds `Budget` by value

**File:** `backend/internal/domain/budget.go:47`

**Issue:** `BudgetSpentResult.Budget` is a value field, not a pointer. This is a minor design note — it means the struct is always returned by copy. While `Budget` is small today, it is inconsistent with the rest of the domain where parent structs typically embed children as pointers (e.g., `Transaction` embeds `*Category`). If `Budget` gains fields (e.g., for shared budgets in a future phase), all callers returning `[]BudgetSpentResult` will copy a larger struct without any compiler warning.

**Fix:** Consider `Budget *Budget` (pointer). Not urgent while `Budget` is small, but worth flagging before Phase 27 service layer is built on top of this type.

---

_Reviewed: 2026-06-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
