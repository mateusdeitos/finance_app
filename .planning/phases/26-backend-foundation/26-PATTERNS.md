# Phase 26: Backend Foundation - Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 3 (1 migration, 1 domain, 1 entity)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/migrations/<ts>_create_transaction_templates_table.sql` | migration | DDL / batch | `backend/migrations/20260530125310_create_notifications_table.sql` (structure) + `00001_initial_schema.up.sql` L141-146 (JSONB column) | exact (composite) |
| `backend/internal/domain/transaction_template.go` | model (domain) | transform / write-boundary | `backend/internal/domain/charge.go` (struct + enum) + `transaction.go` L13-30, L170-179 (Type, SplitSettings shapes to mirror) | role-match (no JSONB-payload domain exists) |
| `backend/internal/entity/transaction_template.go` | model (entity) | CRUD / JSONB persistence | `backend/internal/entity/user_settings.go` (JSONB Scan/Value + converters + hooks) + `entity/charge.go` (gorm tags + ToDomain/FromDomain) | exact (JSONB pattern) |

Notes:
- There is **no existing domain type** that wraps a typed-but-JSONB-persisted payload. `domain.UserSettings.Settings` is `map[string]interface{}` (untyped). So `domain.TransactionTemplatePayload` is a **new shape** — the planner mirrors field shapes from `domain.Transaction` / `SplitSettings`, not a 1:1 copy. The entity-level JSONB plumbing, however, has a direct exact analog (`user_settings.go`).

## Pattern Assignments

### `backend/migrations/<ts>_create_transaction_templates_table.sql` (migration, DDL)

**Create via `just migrate-create create_transaction_templates_table`** — never hand-write the filename/timestamp (CLAUDE.md migrations rule). Latest existing migration: `20260607000000_...` — the recipe generates a newer timestamp automatically.

**Analog (table + index + symmetric Down):** `backend/migrations/20260530125310_create_notifications_table.sql`
```sql
-- +goose Up
CREATE TABLE notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(50) NOT NULL,
    ...
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_id    ON notifications(user_id);

-- +goose Down
DROP TABLE IF EXISTS notifications;
```

**Analog (JSONB NOT NULL column syntax):** `backend/migrations/00001_initial_schema.up.sql` L141-146
```sql
CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Composite for the new table** (apply CONTEXT.md D-04/D-05/D-06/D-07 — `user_id NOT NULL`, `UNIQUE(user_id, name)`, hard delete so **no `deleted_at`**, **no FK columns** for account/category/tag). Recommended shape mirroring both analogs:
```sql
-- +goose Up
CREATE TABLE transaction_templates (
    id         SERIAL PRIMARY KEY,
    user_id    INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(...) NOT NULL,            -- chip label (D-05)
    payload    JSONB       NOT NULL,             -- typed write-boundary, opaque storage (D-01)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)                       -- D-05 per-user uniqueness as DB constraint
);
CREATE INDEX idx_transaction_templates_user_id ON transaction_templates(user_id);

-- +goose Down
DROP TABLE IF EXISTS transaction_templates;
```
Decisions to honor: `payload JSONB NOT NULL` (D-01), no `amount`/`date`/`deleted_at`/FK columns (D-02/D-06/D-07). `ON DELETE CASCADE` on `user_id` matches the recent `notifications`/`user_settings` convention (newer than charges' bare `REFERENCES users(id)`). Whether the `REFERENCES users(id)` FK is included is the planner's call; charges/notifications include it. `TIMESTAMPTZ ... DEFAULT NOW()` (notifications) vs `TIMESTAMP ... DEFAULT CURRENT_TIMESTAMP` (user_settings) — prefer **`TIMESTAMPTZ DEFAULT NOW()`** (most recent convention; repo is UTC-everywhere). Note the entity `BeforeCreate`/`BeforeUpdate` hooks also set these (see entity below), so the DB default is a safety net.

---

### `backend/internal/domain/transaction_template.go` (model, write-boundary)

**Analog (file/struct layout, enum pattern):** `backend/internal/domain/charge.go` L1-50 — package decl, `type Foo string` enum with `IsValid()`, then the main struct with `json:` tags.

**Shapes to mirror (do NOT import/reuse — re-declare the template payload struct):**
- `TransactionType` enum — `backend/internal/domain/transaction.go` L13-34 (`expense`/`income`/`transfer`, `IsValid()`, `IsTransfer()`). D-10: all three types ride in the opaque payload for free; reuse `domain.TransactionType` directly for the `Type` field.
- `SplitSettings` — `backend/internal/domain/transaction.go` L170-179. **This is the key shape for TMPL-05** (both split modes must round-trip):
```go
type SplitSettings struct {
	ConnectionID   int `json:"connection_id"`
	UserConnection *UserConnection
	Percentage     *int   `json:"percentage,omitempty"`   // percentage mode
	Amount         *int64 `json:"amount,omitempty"`       // fixed-amount mode (cents)
	Date           *Date  `json:"date,omitempty"`
}
```
  Both `Percentage *int` and `Amount *int64` are nilable — exactly one is set per row depending on mode. The template payload must preserve both nilable fields so unmarshal→marshal keeps the chosen mode (CONTEXT.md D-11 / TMPL-05). Planner decides whether to reuse `domain.SplitSettings` verbatim or define a leaner template-local variant (the live one carries `UserConnection *UserConnection` and `Date` which the template likely does not need; reuse keeps round-trip trivial).

**New types to define** (per CONTEXT.md D-01b):
```go
type TransactionTemplate struct {
	ID      int                        `json:"id"`
	UserID  int                        `json:"user_id"`
	Name    string                     `json:"name"`
	Payload TransactionTemplatePayload `json:"payload"`
	// timestamps optional; match charge.go which carries CreatedAt/UpdatedAt *time.Time
}

type TransactionTemplatePayload struct {
	Type                 TransactionType  `json:"type"`
	AccountID            *int             `json:"account_id,omitempty"`
	CategoryID           *int             `json:"category_id,omitempty"`
	DestinationAccountID *int             `json:"destination_account_id,omitempty"`
	Description          string           `json:"description"`
	TagIDs               []int            `json:"tag_ids,omitempty"`
	SplitSettings        []SplitSettings  `json:"split_settings,omitempty"`
	// NO Amount, NO Date (D-02) — strict unmarshal naturally drops them
}
```
Field naming/nullability is planner's discretion; mirror `domain.Transaction` json tags (L74-104) for consistency. `TagIDs []int` mirrors `BulkUpdateTransaction.TagIDs` (transaction.go L368) since the template stores ids, not full `Tag` objects. The strict unmarshal/marshal wiring (`DisallowUnknownFields`) is **Phase 27** (D-01b) — Phase 26 only defines the types.

**Convention reminders from `backend/CLAUDE.md` Code conventions:** enums as `type Foo string` + `IsValid()`; money as `int64` cents; UTC times; `snake_case.go` filenames; never leak GORM past the repository.

---

### `backend/internal/entity/transaction_template.go` (model, JSONB persistence)

**Primary analog (JSONB Scan/Value + converters + GORM hooks):** `backend/internal/entity/user_settings.go` (full file). This is the canonical opaque-JSONB precedent named in CONTEXT.md (D-01 discretion note + canonical_refs).

JSONB driver implementation to copy (user_settings.go L1-37) — note this file already declares the shared `type JSONB map[string]interface{}` with `Value()`, `GormDataType()`, `Scan()`. For the template `payload`, the planner should **NOT** reuse `JSONB` (untyped map); instead implement Scan/Value on a typed payload field. Two viable techniques (CONTEXT.md "Claude's Discretion" — `datatypes.JSON` vs `json.RawMessage`/struct Scan/Value):

Technique A — struct-typed column with Scan/Value (closest to `AccountUserConnection` in `entity/account.go` L84-98):
```go
// entity/account.go L84-98 — the struct-with-Scan/Value JSONB analog
type AccountUserConnection struct {
	UserConnection
}
func (a *AccountUserConnection) Value() (driver.Value, error) {
	return json.Marshal(a)
}
func (a *AccountUserConnection) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, &a.UserConnection)
}
```
Apply the same `Value()`/`Scan()` (plus `GormDataType() string { return "jsonb" }` from user_settings.go L21-23) to a `Payload` type wrapping `domain.TransactionTemplatePayload`. Imports block to copy: `"database/sql/driver"`, `"encoding/json"` (user_settings.go L3-10).

**Entity struct + GORM tags analog:** `backend/internal/entity/charge.go` L10-25 and `notification.go` L9-18 — `gorm:"primaryKey;autoIncrement"`, `gorm:"not null"`, `*time.Time` timestamps:
```go
type Notification struct {
	ID     int    `gorm:"primaryKey;autoIncrement"`
	UserID int    `gorm:"not null;index"`
	...
	CreatedAt *time.Time
}
```
Recommended entity shape:
```go
type TransactionTemplate struct {
	ID        int    `gorm:"primaryKey;autoIncrement"`
	UserID    int    `gorm:"not null;index"`
	Name      string `gorm:"not null"`
	Payload   <PayloadJSONBType> `gorm:"type:jsonb;not null"`
	CreatedAt *time.Time
	UpdatedAt *time.Time
}
```

**Domain↔entity converters analog:** `entity/charge.go` L39-75 (`(c *Charge) ToDomain()` / `ChargeFromDomain(d *domain.Charge)`) and `user_settings.go` L47-77 (shows the JSONB marshal/unmarshal happening inside the converter). Follow the `entity.XxxFromDomain(d)` + `(e *Xxx) ToDomain()` naming (CLAUDE.md convention). The converter is where the typed payload ↔ JSONB-column translation lives.

**Timestamp hooks analog:** `user_settings.go` L79-89 / `charge.go` L27-37 — `BeforeCreate`/`BeforeUpdate` setting `created_at`/`updated_at`:
```go
func (TransactionTemplate) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}
func (e *TransactionTemplate) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}
```

## Shared Patterns

### JSONB column persistence
**Source:** `backend/internal/entity/user_settings.go` L12-37 (driver: `Value`/`GormDataType`/`Scan`); `entity/account.go` L84-98 (struct-typed variant)
**Apply to:** the `payload` field of `entity.TransactionTemplate`
**Key point:** `GormDataType() string { return "jsonb" }` tells GORM the column type; `Value()` marshals to JSON bytes, `Scan()` unmarshals from `[]byte`. The repo has **no `datatypes.JSON` usage and no JSONB migration columns except `user_settings.settings`** — so the in-Go Scan/Value approach is the established (and only) precedent. STACK research confirms zero new deps.

### Domain ↔ Entity conversion
**Source:** `backend/internal/entity/charge.go` L39-75; `user_settings.go` L47-77
**Apply to:** `entity.TransactionTemplate`
**Convention (CLAUDE.md):** `entity.XxxFromDomain(d)` constructor + `(e *Xxx) ToDomain()` method; never leak GORM types past the repository.

### GORM timestamp hooks
**Source:** `user_settings.go` L79-89; `charge.go` L27-37; `account.go` L68-82
**Apply to:** `entity.TransactionTemplate` — every entity in this codebase manages `created_at`/`updated_at` via `BeforeCreate`/`BeforeUpdate` (in addition to any DB default).

### Migrations
**Source:** `backend/CLAUDE.md` §Migrations + `migrations/20260530125310_create_notifications_table.sql`
**Apply to:** the new table migration
**Key point:** goose `-- +goose Up` / `-- +goose Down` with a symmetric `DROP TABLE IF EXISTS`; **create with `just migrate-create <name>`**, never hand-write the timestamp.

### Enum convention
**Source:** `backend/internal/domain/transaction.go` L13-34; `charge.go` L8-33
**Apply to:** reuse `domain.TransactionType` (don't redefine) for `TransactionTemplatePayload.Type`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All three files have strong analogs. The only partial gap: no existing **domain** type pairs a *typed* struct with JSONB persistence (`user_settings` uses an untyped map), so `domain.TransactionTemplatePayload` is a new shape assembled from `domain.Transaction`/`SplitSettings` field shapes — but the entity-level JSONB plumbing it depends on is an exact copy of `user_settings.go`/`account.go`. |

## Isolation Guarantee (CONTEXT.md acceptance)

No analog needed, but flagged for the planner: `entity.TransactionTemplate` must **not** be joined into any existing query. There is **no `AutoMigrate`** in this codebase (migrations are pure goose SQL), so the new entity is not auto-registered anywhere — it only becomes reachable through its own future repository (Phase 27). Existing `Search`, `GetBalance`, `FindOrphanedSettlementTransactions` reference `entity.Transaction`/`entity.Settlement` only and are untouched. D-08/D-09: **do not** modify `CategoryService.Delete` or `TagService.Delete` — Phase 26 has zero existing-code touches.

## Metadata

**Analog search scope:** `backend/migrations/`, `backend/internal/domain/`, `backend/internal/entity/`, `backend/internal/repository/` (registration check)
**Files scanned:** migrations (20 listed + initial schema JSONB section), `domain/{transaction,charge,user_settings,tag}.go`, `entity/{user_settings,account,charge,notification}.go`
**Pattern extraction date:** 2026-06-14
