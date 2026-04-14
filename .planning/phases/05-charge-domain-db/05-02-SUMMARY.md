---
phase: 05-charge-domain-db
plan: 02
subsystem: database-migrations
tags: [migration, charges, schema, postgresql]
dependency_graph:
  requires: []
  provides: [charges-table-ddl, transactions-charge-id-fk]
  affects: [phase-06-repository, phase-07-accept-flow]
tech_stack:
  added: []
  patterns: [goose-sql-migrations, timestamptz, partial-index, on-delete-restrict, on-delete-set-null]
key_files:
  created:
    - backend/migrations/20260414000000_create_charges_table.sql
    - backend/migrations/20260414000001_add_charge_id_to_transactions.sql
  modified: []
decisions:
  - "VARCHAR(20) for status instead of DB ENUM — avoids DROP TYPE complexity in rollback"
  - "ON DELETE RESTRICT on connection_id FK — cannot delete connection with pending charges"
  - "ON DELETE SET NULL on charge_id FK — transactions preserve data if charge deleted"
  - "TIMESTAMPTZ (not TIMESTAMP) for created_at/updated_at — all new tables use TIMESTAMPTZ"
  - "Partial index WHERE charge_id IS NOT NULL — only indexes rows with a charge link"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-14"
  tasks_completed: 1
  files_created: 2
  files_modified: 0
---

# Phase 5 Plan 2: DB Migrations (charges table + charge_id FK) Summary

Two Goose SQL migration files creating the `charges` table schema and adding `charge_id` FK to `transactions`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create charges table migration and transactions charge_id migration | 1e67c5b | backend/migrations/20260414000000_create_charges_table.sql, backend/migrations/20260414000001_add_charge_id_to_transactions.sql |

## What Was Built

### Migration 1: `20260414000000_create_charges_table.sql`

Creates the `charges` table with:
- `SERIAL PRIMARY KEY` id
- `charger_user_id`, `payer_user_id` — INT FKs to `users(id)`
- `charger_account_id`, `payer_account_id` — nullable INT FKs to `accounts(id)`
- `connection_id` — INT NOT NULL FK to `user_connections(id)` **ON DELETE RESTRICT**
- `period_month` INT NOT NULL with **CHECK (period_month BETWEEN 1 AND 12)**
- `period_year` INT NOT NULL
- `description` TEXT (nullable)
- `status` **VARCHAR(20)** NOT NULL DEFAULT 'pending' (not a DB ENUM)
- `created_at`, `updated_at` **TIMESTAMPTZ**
- 4 indexes: charger_user_id, payer_user_id, connection_id, status
- Down: `DROP TABLE IF EXISTS charges` (no DROP TYPE needed — no ENUM used)

### Migration 2: `20260414000001_add_charge_id_to_transactions.sql`

Adds to `transactions`:
- `charge_id INT REFERENCES charges(id) ON DELETE SET NULL` — nullable FK
- `CREATE INDEX idx_transactions_charge_id ON transactions(charge_id) WHERE charge_id IS NOT NULL` — partial index
- Uses StatementBegin/StatementEnd wrappers for ALTER TABLE (required pattern)
- Down: drops index then drops column

## Deviations from Plan

None - plan executed exactly as written.

## Threat Coverage

All mitigations from threat register applied:
- T-05-04: `CHECK (period_month BETWEEN 1 AND 12)` enforces valid month range
- T-05-05: `ON DELETE RESTRICT` on connection_id prevents orphaned charges
- T-05-06: `ON DELETE SET NULL` on charge_id preserves transaction data (accepted tradeoff)
- T-05-07: 4 indexes on charges table + partial index on transactions.charge_id

## Self-Check: PASSED

- backend/migrations/20260414000000_create_charges_table.sql: FOUND
- backend/migrations/20260414000001_add_charge_id_to_transactions.sql: FOUND
- Commit 1e67c5b: FOUND
