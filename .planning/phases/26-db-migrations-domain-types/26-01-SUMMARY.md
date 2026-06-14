---
phase: 26-db-migrations-domain-types
plan: "01"
subsystem: backend/migrations
tags: [database, migrations, budgets, goose, sql]
dependency_graph:
  requires: []
  provides:
    - budgets table DDL (Up + Down blocks)
    - budget_alert_thresholds table DDL (Up + Down blocks)
  affects:
    - backend/migrations/ (two new timestamped .sql files)
tech_stack:
  added: []
  patterns:
    - Goose SQL migrations (-- +goose Up / -- +goose Down annotations)
    - SERIAL PRIMARY KEY + BIGINT cents + TIMESTAMPTZ timestamps
    - ON DELETE CASCADE for FK child tables
    - CHECK constraint (threshold_pct BETWEEN 1 AND 200)
    - UNIQUE constraint (owner_user_id, category_id) and (budget_id, threshold_pct)
    - CREATE INDEX on FK columns
key_files:
  created:
    - backend/migrations/20260614113028_create_budgets_table.sql
    - backend/migrations/20260614113109_create_budget_alert_thresholds_table.sql
  modified: []
decisions:
  - "D-26-1 honored: budgets table has NO scope/connection_id/category_mapping_id/deleted_at columns"
  - "D-26-4 honored: hard DELETE via ON DELETE CASCADE, no deleted_at on budgets"
  - "D-26-5: active BOOLEAN NOT NULL DEFAULT TRUE as pause toggle"
  - "D-26-6: enabled BOOLEAN NOT NULL DEFAULT TRUE per-threshold toggle on budget_alert_thresholds"
  - "D-26-7: last_fired_period TEXT nullable (no NOT NULL, no DEFAULT) for YYYY-MM latch"
  - "Docker-deferred: migrate-down round-trip deferred; static Down-symmetry proof performed instead"
metrics:
  duration: "<5 minutes (files already committed when execution started)"
  completed: "2026-06-14"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 0
---

# Phase 26 Plan 01: Goose Migrations — budgets + budget_alert_thresholds Summary

Two Goose SQL migrations establishing the private-budget schema: `budgets` table (per-category monthly cap) and `budget_alert_thresholds` child table (alert threshold configuration), with correct FK CASCADE, CHECK, UNIQUE constraints, indexes, and symmetric Down blocks.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create budgets table migration | 99e3406 | backend/migrations/20260614113028_create_budgets_table.sql |
| 2 | Create budget_alert_thresholds table migration | a844831 | backend/migrations/20260614113109_create_budget_alert_thresholds_table.sql |
| 3 | Verify migrations (Docker-deferred static proof) | — (no files) | static proof only |

## Acceptance Criteria Verification

### Task 1: budgets migration

- File `20260614113028_create_budgets_table.sql` exists with 14-digit timestamp prefix: PASS
- Contains `CREATE TABLE budgets`: PASS
- `owner_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE`: PASS
- `category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE`: PASS
- `amount_cents BIGINT NOT NULL`: PASS
- `active BOOLEAN NOT NULL DEFAULT TRUE`: PASS
- `UNIQUE (owner_user_id, category_id)`: PASS
- `-- +goose Down` followed by `DROP TABLE IF EXISTS budgets;`: PASS
- Negative check — no `scope`, `connection_id`, `category_mapping_id`, `chk_scope_fks`, `deleted_at`: PASS

### Task 2: budget_alert_thresholds migration

- File `20260614113109_create_budget_alert_thresholds_table.sql` exists with 14-digit timestamp prefix: PASS
- Timestamp (20260614113109) > budgets timestamp (20260614113028) — child after parent: PASS
- Contains `CREATE TABLE budget_alert_thresholds`: PASS
- `budget_id INT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE`: PASS
- `CHECK (threshold_pct BETWEEN 1 AND 200)`: PASS
- `enabled BOOLEAN NOT NULL DEFAULT TRUE`: PASS
- `last_fired_period TEXT` — nullable (no NOT NULL, no DEFAULT): PASS
- `UNIQUE (budget_id, threshold_pct)`: PASS
- `-- +goose Down` followed by `DROP TABLE IF EXISTS budget_alert_thresholds;`: PASS

### Task 3: Static Down-Symmetry Proof (Docker-deferred)

Docker/PostgreSQL unavailable in this execution environment (ephemeral remote container). Per the plan's explicitly-sanctioned fallback and v1.6 precedent documented in STATE.md, the round-trip is **Docker-deferred**.

**Static proof performed:**

| Migration | Up block creates | Down block drops | Symmetric? |
|-----------|-----------------|-----------------|------------|
| 20260614113028_create_budgets_table.sql | `CREATE TABLE budgets` | `DROP TABLE IF EXISTS budgets` | PASS |
| 20260614113109_create_budget_alert_thresholds_table.sql | `CREATE TABLE budget_alert_thresholds` | `DROP TABLE IF EXISTS budget_alert_thresholds` | PASS |

**Child-before-parent drop ordering:** Under goose rollback (reverse timestamp order):
1. First rollback: 20260614113109 drops `budget_alert_thresholds` (child)
2. Second rollback: 20260614113028 drops `budgets` (parent)
No FK constraint violation can occur because the child table is always dropped before the parent.

**Follow-up required:** Run `just migrate-up && just migrate-down && just migrate-down` locally against PostgreSQL before Phase 26 is considered fully verified. This is already tracked in STATE.md todos.

## Deviations from Plan

### Environment deviation (expected, not a bug)

The plan instructs `just migrate-create <name>` to scaffold migration files (Task 1 and 2 actions). As documented in the `<environment_constraints>` block, `just` and `goose` are not installed in this ephemeral container. Migration files were hand-authored with timestamps generated via `date -u +%Y%m%d%H%M%S`, satisfying the plan's acceptance criteria (which only require a valid 14-digit timestamp prefix and correct goose annotations). The budgets timestamp (20260614113028) is strictly less than the thresholds timestamp (20260614113109), preserving child-after-parent ordering.

The plan's Task 3 "run `just migrate-up`/`just migrate-down`" was handled via the Docker-deferred fallback path explicitly documented in the plan itself.

None of these are deviations from intent — both are the sanctioned execution paths for this environment.

## Known Stubs

None. The migration files contain complete, production-ready DDL with no placeholder values or TODO comments.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| No new threat surface | — | Both files are static DDL executed only by the Goose migration runner at deploy time; no runtime user input crosses this boundary. All threats from the plan's STRIDE register (T-26-01..05) are mitigated by the schema as written: UNIQUE constraints, NOT NULL guards, CHECK bound, FK CASCADE, IF EXISTS safety. |

## Self-Check: PASSED

- backend/migrations/20260614113028_create_budgets_table.sql: FOUND
- backend/migrations/20260614113109_create_budget_alert_thresholds_table.sql: FOUND
- 26-01-SUMMARY.md: FOUND
- Commit 99e3406 (budgets migration): FOUND
- Commit a844831 (budget_alert_thresholds migration): FOUND
