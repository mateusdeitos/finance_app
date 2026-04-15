# Phase 5 Context: Charge Domain & DB

**Phase:** 5 — Charge Domain & DB
**Goal:** The system has a complete, validated Charge data model and DB schema that other phases can build on.
**Requirements:** CHG-01, CHG-02, CHG-07, TXN-01, TXN-02
**Date:** 2026-04-14

---

## Decisions

### 1. Charge Entity Fields

The `Charge` domain struct and GORM entity use **explicit directional fields** for ownership (not just `author_user_id`):

```go
type Charge struct {
    ID               int
    ChargerUserID    int        // creditor — who is owed money
    PayerUserID      int        // debtor — who owes money
    ChargerAccountID *int       // nullable — where charger wants to RECEIVE (set upfront if charger initiates, or set at accept if payer initiates)
    PayerAccountID   *int       // nullable — where payer pays FROM (set upfront if payer initiates, or set at accept if charger initiates)
    ConnectionID     int        // FK to user_connections
    PeriodMonth      int        // 1–12
    PeriodYear       int
    Description      *string    // optional free-text note
    Status           ChargeStatus
    CreatedAt        *time.Time
    UpdatedAt        *time.Time
}
```

**Rationale:** Explicit charger/payer avoids runtime derivation from connection orientation at every service call. Both account fields are nullable because whichever party initiates provides their account upfront; the other fills theirs in at accept time.

### 2. No Amount Field — Derive from Connection Balance at Accept Time

There is **no `Amount` field** on the Charge entity. The accept flow (Phase 7) will:
1. Query the connection balance for `period_month` / `period_year`
2. Use that computed balance as the transfer amount for both auto-created transfers

**Rationale:** A charge represents a request to settle the period's actual balance — not a fixed pre-agreed amount. The balance is the canonical source of truth.

### 3. ChargeStatus Enum

```go
type ChargeStatus string

const (
    ChargeStatusPending   ChargeStatus = "pending"
    ChargeStatusPaid      ChargeStatus = "paid"
    ChargeStatusRejected  ChargeStatus = "rejected"
    ChargeStatusCancelled ChargeStatus = "cancelled"
)
```

Valid transitions (enforce in domain `ValidateTransition`):
- `pending` → `paid` (accept)
- `pending` → `rejected` (reject)
- `pending` → `cancelled` (cancel by author)
- All terminal states (`paid`, `rejected`, `cancelled`) → no valid exits

### 4. DB Schema

**`charges` table:**
```sql
CREATE TABLE charges (
    id                  SERIAL PRIMARY KEY,
    charger_user_id     INT NOT NULL REFERENCES users(id),
    payer_user_id       INT NOT NULL REFERENCES users(id),
    charger_account_id  INT REFERENCES accounts(id),
    payer_account_id    INT REFERENCES accounts(id),
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
```

**`transactions` table — add `charge_id`:**
```sql
ALTER TABLE transactions ADD COLUMN charge_id INT REFERENCES charges(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_charge_id ON transactions(charge_id) WHERE charge_id IS NOT NULL;
```

**Notes:**
- `connection_id` FK uses `ON DELETE RESTRICT` — cannot delete a connection with pending charges
- `charge_id` on transactions uses `ON DELETE SET NULL` — if charge is deleted, transactions keep their data but lose the link
- Migration filenames follow existing timestamp pattern: `20260414000000_create_charges_table.sql` and `20260414000001_add_charge_id_to_transactions.sql`

### 5. Transaction Domain/Entity Enhancement

Add `ChargeID *int` to:
- `domain.Transaction` struct
- `entity.Transaction` struct (GORM field with `charge_id` column)
- `ToDomain()` / `FromDomain()` conversion methods

---

## Patterns to Follow

- `ChargeStatus` enum: follow `UserConnectionStatusEnum` pattern in `internal/domain/user_connection.go` — typed string with `IsValid()` method
- GORM entity: follow `entity.Settlement` pattern — `BeforeCreate`, `BeforeUpdate`, `ToDomain()`, `FromDomain()`
- Migration: use Goose SQL format with `-- +goose Up` / `-- +goose Down` annotations (check existing migrations)
- Migration timestamp: `20260414HHMMSS_description.sql` format

---

## Canonical Refs

- `backend/internal/domain/user_connection.go` — StatusEnum pattern to follow for ChargeStatus
- `backend/internal/domain/transaction.go` — Transaction struct to extend with ChargeID
- `backend/internal/entity/settlement.go` — Entity pattern (BeforeCreate, ToDomain/FromDomain)
- `backend/internal/entity/transaction.go` — Transaction entity to extend with ChargeID
- `backend/migrations/20260309000000_create_settlements_table.sql` — Migration pattern to follow
- `.planning/REQUIREMENTS.md` — CHG-01, CHG-02, CHG-07, TXN-01, TXN-02

---

## Out of Scope for This Phase

- ChargeRepository / ChargeService interfaces (Phase 6)
- HTTP handlers (Phase 6)
- Accept atomicity / transfer creation (Phase 7)
- Frontend (Phase 8)
- Balance query logic (Phase 7 — accept flow)
