# Phase 26: DB Migrations + Domain Types - Pattern Map

**Mapped:** 2026-06-08
**Files analyzed:** 5 new files
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/migrations/YYYYMMDDHHMMSS_create_budgets_table.sql` | migration | batch | `backend/migrations/20260530125301_create_push_subscriptions_table.sql` + `backend/migrations/20260309000000_create_settlements_table.sql` | exact |
| `backend/migrations/YYYYMMDDHHMMSS_create_budget_alert_thresholds_table.sql` | migration | batch | `backend/migrations/20260414000000_create_charges_table.sql` (FK + index + Up/Down) | exact |
| `backend/internal/domain/budget.go` | model | CRUD | `backend/internal/domain/balance.go` + `backend/internal/domain/transaction.go` | role-match (exact for enum pattern, filter struct, Period usage) |
| `backend/internal/entity/budget.go` | model | CRUD | `backend/internal/entity/category.go` + `backend/internal/entity/transaction.go` | exact |
| `backend/internal/domain/budget_period_boundary_test.go` | test | request-response | `backend/internal/domain/transaction_test.go` (TestPeriodUnmarshalJSON / StartDate+EndDate table test) | exact |

---

## Pattern Assignments

### `backend/migrations/YYYYMMDDHHMMSS_create_budgets_table.sql` (migration, batch)

**Primary analog:** `backend/migrations/20260530125301_create_push_subscriptions_table.sql`
**Secondary analog:** `backend/migrations/20260309000000_create_settlements_table.sql`

**File scaffold pattern — push_subscriptions (lines 1–12):**
```sql
-- +goose Up
CREATE TABLE push_subscriptions (
    id         SERIAL PRIMARY KEY,
    user_id    INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT        NOT NULL,
    ...
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_push_subscriptions_endpoint UNIQUE (endpoint)
);
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- +goose Down
DROP TABLE IF EXISTS push_subscriptions;
```

**FK + CASCADE pattern from settlements (lines 4–13):**
```sql
CREATE TABLE settlements (
    id                     SERIAL PRIMARY KEY,
    user_id                INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    amount                 BIGINT NOT NULL,
    account_id             INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
    source_transaction_id  INT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at             TIMESTAMP,
    updated_at             TIMESTAMP
);
CREATE INDEX idx_settlements_user_id ON settlements(user_id);
CREATE INDEX idx_settlements_source_transaction_id ON settlements(source_transaction_id);
```

**CHECK constraint style from initial schema (line 56):**
```sql
from_default_split_percentage SMALLINT CHECK (from_default_split_percentage >= 0 AND from_default_split_percentage <= 100),
```
(Apply the same `CHECK (threshold_pct BETWEEN 1 AND 200)` for `budget_alert_thresholds.threshold_pct`.)

**BIGINT for cents from initial schema (line 117):**
```sql
amount BIGINT NOT NULL CHECK (amount != 0),
```

**Instructions for `budgets` migration:**
- `owner_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE`
- `amount_cents BIGINT NOT NULL` — cents, no zero-check required (zero budget cap is valid)
- `active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- `CONSTRAINT uq_budgets_owner_category UNIQUE (owner_user_id, category_id)` — enforces D-26-3
- Indexes on `owner_user_id` and `category_id`
- Down block: `DROP TABLE IF EXISTS budgets;`
- **No** `scope`, `connection_id`, `category_mapping_id`, or CHECK constraint on those — per D-26-1

---

### `backend/migrations/YYYYMMDDHHMMSS_create_budget_alert_thresholds_table.sql` (migration, batch)

**Primary analog:** `backend/migrations/20260414000000_create_charges_table.sql`

**Complete analog (lines 1–24):**
```sql
-- +goose Up
CREATE TABLE charges (
    id                  SERIAL PRIMARY KEY,
    charger_user_id     INT NOT NULL REFERENCES users(id),
    payer_user_id       INT NOT NULL REFERENCES users(id),
    connection_id       INT NOT NULL REFERENCES user_connections(id) ON DELETE RESTRICT,
    period_month        INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year         INT NOT NULL,
    description         TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ
);

CREATE INDEX idx_charges_charger_user_id ON charges(charger_user_id);
CREATE INDEX idx_charges_payer_user_id ON charges(payer_user_id);
CREATE INDEX idx_charges_connection_id ON charges(connection_id);
CREATE INDEX idx_charges_status ON charges(status);

-- +goose Down
DROP TABLE IF EXISTS charges;
```

**Instructions for `budget_alert_thresholds` migration:**
- `budget_id INT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE` — D-26-4 cascade
- `threshold_pct INT NOT NULL CHECK (threshold_pct BETWEEN 1 AND 200)` — mirrors period_month CHECK style
- `enabled BOOLEAN NOT NULL DEFAULT TRUE` — D-26-6
- `last_fired_period TEXT` (nullable, no DEFAULT, no NOT NULL) — D-26-7
- `CONSTRAINT uq_budget_alert_thresholds_budget_pct UNIQUE (budget_id, threshold_pct)`
- Index on `budget_id`
- Down block: `DROP TABLE IF EXISTS budget_alert_thresholds;`

---

### `backend/internal/domain/budget.go` (model, CRUD)

**Analog A — typed enum pattern:** `backend/internal/domain/transaction.go` lines 13–30
```go
type TransactionType string

const (
    TransactionTypeExpense  TransactionType = "expense"
    TransactionTypeIncome   TransactionType = "income"
    TransactionTypeTransfer TransactionType = "transfer"
)

func (t TransactionType) IsValid() bool {
    return t == TransactionTypeExpense || t == TransactionTypeIncome || t == TransactionTypeTransfer
}
```
Apply directly for `BudgetScope`:
```go
type BudgetScope string

const (
    BudgetScopePrivate BudgetScope = "private"
)

func (s BudgetScope) IsValid() bool {
    return s == BudgetScopePrivate
}
```

**Analog B — domain struct with int64 cents + *time.Time timestamps:** `backend/internal/domain/transaction.go` lines 73–104
```go
type Transaction struct {
    ID             int            `json:"id"`
    UserID         int            `json:"user_id"`
    CategoryID     *int           `json:"category_id,omitempty"`
    Amount         int64          `json:"amount"` // Amount in cents
    ...
    CreatedAt      *time.Time     `json:"created_at"`
    UpdatedAt      *time.Time     `json:"updated_at"`
}
```

**Analog C — Filter struct with slice-of-IDs + bool flag:** `backend/internal/domain/transaction.go` lines 181–198
```go
type TransactionFilter struct {
    IDs        []int  `query:"id[]"`
    AccountIDs []int  `query:"account_id[]"`
    CategoryIDs []int `query:"category_id[]"`
    UserID     *int   `query:"user_id,omitempty"`
    ...
    WithSettlements bool `query:"with_settlements"`
}
```

**Analog D — BalanceFilter with Period + result struct:** `backend/internal/domain/balance.go` lines 3–15
```go
type BalanceFilter struct {
    UserID          int
    Period          Period
    AccountIDs      []int `query:"account_id[]"`
    CategoryIDs     []int `query:"category_id[]"`
    TagIDs          []int `query:"tag_id[]"`
    Accumulated     bool  `query:"accumulated"`
    HideSettlements bool  `query:"hide_settlements"`
}

type BalanceResult struct {
    Balance int64 `json:"balance"`
}
```

**Analog E — Period.String() for YYYY-MM format (existing):** `backend/internal/domain/transaction.go` lines 347–349
```go
func (p *Period) String() string {
    return fmt.Sprintf("%d-%d", p.Year, p.Month)
}
```
Note: `last_fired_period` (D-26-7) uses `fmt.Sprintf("%04d-%02d", p.Year, p.Month)` — zero-padded for consistent `YYYY-MM` string equality comparisons. This is a **deliberate departure** from `Period.String()` which is not zero-padded.

**Instructions for `domain/budget.go`:**

```go
package domain

import "time"

// BudgetScope is a typed forward marker; only Private exists in v1.7.
type BudgetScope string

const (
    BudgetScopePrivate BudgetScope = "private"
)

func (s BudgetScope) IsValid() bool {
    return s == BudgetScopePrivate
}

type Budget struct {
    ID           int        `json:"id"`
    OwnerUserID  int        `json:"owner_user_id"`
    CategoryID   int        `json:"category_id"`
    AmountCents  int64      `json:"amount_cents"` // cents, matches int64 convention
    Active       bool       `json:"active"`
    CreatedAt    *time.Time `json:"created_at"`
    UpdatedAt    *time.Time `json:"updated_at"`
}

type BudgetAlertThreshold struct {
    ID              int        `json:"id"`
    BudgetID        int        `json:"budget_id"`
    ThresholdPct    int        `json:"threshold_pct"`
    Enabled         bool       `json:"enabled"`
    LastFiredPeriod *string    `json:"last_fired_period"` // "YYYY-MM" or nil; D-26-7
    // No CreatedAt/UpdatedAt — threshold table has no timestamps in schema
}

type BudgetFilter struct {
    IDs          []int `json:"ids"`
    OwnerUserIDs []int `json:"owner_user_ids"`
    CategoryIDs  []int `json:"category_ids"`
    ActiveOnly   bool  `json:"active_only"` // D-26-5
}

// BudgetSpentResult carries per-category realizado data for SPEND-03.
type BudgetSpentResult struct {
    Budget    Budget `json:"budget"`
    SpentCents     int64  `json:"spent_cents"`     // realizado, from GetBalance
    RemainingCents int64  `json:"remaining_cents"` // AmountCents - SpentCents
}
```

---

### `backend/internal/entity/budget.go` (model, CRUD)

**Primary analog:** `backend/internal/entity/category.go` (lines 1–62 — complete file)
```go
package entity

import (
    "time"

    "github.com/finance_app/backend/internal/domain"
    "gorm.io/gorm"
)

type Category struct {
    ID        int
    UserID    int
    Name      string
    Emoji     *string
    ParentID  *int
    CreatedAt *time.Time
    UpdatedAt *time.Time
    User      User
    Parent    *Category
}

func (c *Category) ToDomain() *domain.Category {
    cat := &domain.Category{
        ID:        c.ID,
        UserID:    c.UserID,
        Name:      c.Name,
        Emoji:     c.Emoji,
        ParentID:  c.ParentID,
        CreatedAt: c.CreatedAt,
        UpdatedAt: c.UpdatedAt,
    }
    if c.Parent != nil {
        cat.Parent = c.Parent.ToDomain()
    }
    return cat
}

func CategoryFromDomain(d *domain.Category) *Category {
    return &Category{
        ID:        d.ID,
        UserID:    d.UserID,
        Name:      d.Name,
        Emoji:     d.Emoji,
        ParentID:  d.ParentID,
        CreatedAt: d.CreatedAt,
        UpdatedAt: d.UpdatedAt,
    }
}

func (Category) BeforeCreate(tx *gorm.DB) error {
    now := time.Now()
    tx.Statement.SetColumn("created_at", now)
    tx.Statement.SetColumn("updated_at", now)
    return nil
}

func (c *Category) BeforeUpdate(tx *gorm.DB) error {
    tx.Statement.SetColumn("updated_at", time.Now())
    return nil
}
```

**Secondary analog — BeforeCreate/BeforeUpdate on value vs pointer receiver:**
`backend/internal/entity/transaction.go` lines 38–48 shows `BeforeCreate` on a value receiver (`Transaction`) and `BeforeUpdate` on a pointer receiver (`*Transaction`). `entity/category.go` uses the same split. Copy this split exactly.

**Instructions for `entity/budget.go`:**
- Define two entity structs: `Budget` and `BudgetAlertThreshold`
- `Budget` has `BeforeCreate` (value receiver) + `BeforeUpdate` (pointer receiver) for timestamps
- `BudgetAlertThreshold` has **no** `BeforeCreate`/`BeforeUpdate` — the threshold table has no timestamps columns
- `Budget.ToDomain()` pointer receiver, `BudgetFromDomain(d *domain.Budget) *Budget` free function — exact naming convention from `CategoryFromDomain`
- Same for `BudgetAlertThreshold.ToDomain()` + `BudgetAlertThresholdFromDomain()`
- GORM table name is auto-derived (`budgets`, `budget_alert_thresholds`) — no `TableName()` override needed unless GORM would guess wrong (it won't for these names)
- No GORM associations on `Budget` entity for Phase 26 (repository wires those in Phase 27); keep the struct flat matching the schema columns

```go
package entity

import (
    "time"

    "github.com/finance_app/backend/internal/domain"
    "gorm.io/gorm"
)

type Budget struct {
    ID          int
    OwnerUserID int
    CategoryID  int
    AmountCents int64
    Active      bool
    CreatedAt   *time.Time
    UpdatedAt   *time.Time
}

func (Budget) BeforeCreate(tx *gorm.DB) error {
    now := time.Now()
    tx.Statement.SetColumn("created_at", now)
    tx.Statement.SetColumn("updated_at", now)
    return nil
}

func (b *Budget) BeforeUpdate(tx *gorm.DB) error {
    tx.Statement.SetColumn("updated_at", time.Now())
    return nil
}

func (b *Budget) ToDomain() *domain.Budget {
    return &domain.Budget{
        ID:          b.ID,
        OwnerUserID: b.OwnerUserID,
        CategoryID:  b.CategoryID,
        AmountCents: b.AmountCents,
        Active:      b.Active,
        CreatedAt:   b.CreatedAt,
        UpdatedAt:   b.UpdatedAt,
    }
}

func BudgetFromDomain(d *domain.Budget) *Budget {
    return &Budget{
        ID:          d.ID,
        OwnerUserID: d.OwnerUserID,
        CategoryID:  d.CategoryID,
        AmountCents: d.AmountCents,
        Active:      d.Active,
        CreatedAt:   d.CreatedAt,
        UpdatedAt:   d.UpdatedAt,
    }
}

type BudgetAlertThreshold struct {
    ID              int
    BudgetID        int
    ThresholdPct    int
    Enabled         bool
    LastFiredPeriod *string
}

func (t *BudgetAlertThreshold) ToDomain() *domain.BudgetAlertThreshold {
    return &domain.BudgetAlertThreshold{
        ID:              t.ID,
        BudgetID:        t.BudgetID,
        ThresholdPct:    t.ThresholdPct,
        Enabled:         t.Enabled,
        LastFiredPeriod: t.LastFiredPeriod,
    }
}

func BudgetAlertThresholdFromDomain(d *domain.BudgetAlertThreshold) *BudgetAlertThreshold {
    return &BudgetAlertThreshold{
        ID:              d.ID,
        BudgetID:        d.BudgetID,
        ThresholdPct:    d.ThresholdPct,
        Enabled:         d.Enabled,
        LastFiredPeriod: d.LastFiredPeriod,
    }
}
```

---

### `backend/internal/domain/budget_period_boundary_test.go` (test, request-response)

**Primary analog:** `backend/internal/domain/transaction_test.go` lines 48–159
```go
func TestPeriodUnmarshalJSON(t *testing.T) {
    // ...
    t.Run("should return the correct start and end date", func(t *testing.T) {
        testCases := []struct {
            Period    Period
            StartDate time.Time
            EndDate   time.Time
        }{
            {
                Period:    Period{Month: 1, Year: 2026},
                StartDate: time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC),
                EndDate:   time.Date(2026, time.January, 31, 23, 59, 59, 999999999, time.UTC),
            },
            // ... all 12 months
        }
        for _, testCase := range testCases {
            assert.Equal(t, startDate, period.StartDate())
            assert.Equal(t, endDate, period.EndDate())
        }
    })
}
```

**Instructions for boundary test file:**
- Package: `package domain` (same package as `transaction_test.go` — white-box unit test, no build tags)
- Import: `"testing"`, `"time"`, `"github.com/stretchr/testify/assert"`
- Function name: `TestPeriodBoundaryInclusion`
- Two sub-tests:
  1. `"transaction at EndDate() is included"` — construct a `time.Time` equal to `period.EndDate()` and assert it satisfies `!t.After(endDate)` (i.e. `t.Equal(endDate) || t.Before(endDate)`)
  2. `"transaction at EndDate()+1ns is excluded"` — construct `period.EndDate().Add(time.Nanosecond)` and assert `t.After(endDate)`
- Use a fixed period (e.g. `Period{Month: 6, Year: 2026}`) — not `time.Now()`, to avoid flaky output
- No DB, no `testing.Short()` guard — this is a pure unit test
- The test documents the contract for `GetBalance`'s `date <= endDate` filter (inclusive nanosecond boundary at `23:59:59.999999999`)

```go
package domain

import (
    "testing"
    "time"

    "github.com/stretchr/testify/assert"
)

func TestPeriodBoundaryInclusion(t *testing.T) {
    period := Period{Month: 6, Year: 2026}
    endDate := period.EndDate() // 2026-06-30 23:59:59.999999999 UTC

    t.Run("transaction at exactly EndDate() is included", func(t *testing.T) {
        txDate := endDate
        assert.False(t, txDate.After(endDate), "transaction at EndDate() must not be After endDate")
    })

    t.Run("transaction at EndDate()+1ns is excluded", func(t *testing.T) {
        txDate := endDate.Add(time.Nanosecond)
        assert.True(t, txDate.After(endDate), "transaction 1ns past EndDate() must be After endDate")
    })
}
```

---

## Shared Patterns

### Money representation
**Source:** `backend/internal/domain/transaction.go` line 82, `backend/migrations/00001_initial_schema.up.sql` line 117
**Apply to:** `domain/budget.go` (`AmountCents int64`), migration `budgets.amount_cents BIGINT NOT NULL`
```go
Amount int64 `json:"amount"` // Amount in cents
```
```sql
amount BIGINT NOT NULL CHECK (amount != 0),
```
Budget amounts use `AmountCents` (not `Amount`) to be self-documenting; the `int64` type and `BIGINT` column type are mandatory.

### Timestamps in entities
**Source:** `backend/internal/entity/category.go` lines 52–62
**Apply to:** `entity/budget.go` (Budget struct only — `BudgetAlertThreshold` has no timestamp columns)
```go
func (Category) BeforeCreate(tx *gorm.DB) error {
    now := time.Now()
    tx.Statement.SetColumn("created_at", now)
    tx.Statement.SetColumn("updated_at", now)
    return nil
}

func (c *Category) BeforeUpdate(tx *gorm.DB) error {
    tx.Statement.SetColumn("updated_at", time.Now())
    return nil
}
```

### Enum type pattern
**Source:** `backend/internal/domain/transaction.go` lines 13–30
**Apply to:** `domain/budget.go` (`BudgetScope` type)
Convention: `type Foo string` + `const FooBar Foo = "bar"` + `(f Foo) IsValid() bool`. Never use `iota` or integers for domain enums.

### Nullable TEXT field for period latch
**Source:** D-26-7 decision, `last_fired_period *string` in domain
**Apply to:** both `domain/budget.go` (`BudgetAlertThreshold.LastFiredPeriod *string`) and `entity/budget.go` (`BudgetAlertThreshold.LastFiredPeriod *string`)
Format produced by: `fmt.Sprintf("%04d-%02d", p.Year, p.Month)` — zero-padded, distinct from `Period.String()` which is not zero-padded.

### Migration symmetric Down block
**Source:** Every migration in `backend/migrations/`
**Apply to:** Both new migration files
```sql
-- +goose Down
DROP TABLE IF EXISTS budget_alert_thresholds;
DROP TABLE IF EXISTS budgets;
```
Order matters for FK: drop child table (`budget_alert_thresholds`) before parent (`budgets`). Each migration file handles only its own table in the Down block.

### Import path alias
**Source:** `backend/internal/entity/category.go` line 6, `backend/internal/entity/transaction.go` line 6
**Apply to:** All new Go files in `internal/domain/` and `internal/entity/`
```go
import (
    "github.com/finance_app/backend/internal/domain"
    "gorm.io/gorm"
)
```

---

## No Analog Found

All files for this phase have close analogs. No entries.

---

## Metadata

**Analog search scope:** `backend/migrations/`, `backend/internal/domain/`, `backend/internal/entity/`, `backend/internal/repository/`, `backend/internal/service/`
**Files scanned:** 8 source files + 5 migration files
**Pattern extraction date:** 2026-06-08
