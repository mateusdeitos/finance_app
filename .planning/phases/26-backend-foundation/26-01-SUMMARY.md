---
phase: 26-backend-foundation
plan: "01"
subsystem: backend
tags: [migration, domain, templates, jsonb, tdd]
dependency_graph:
  requires: []
  provides:
    - backend/migrations/20260614113105_create_transaction_templates_table.sql
    - backend/internal/domain/transaction_template.go
    - backend/internal/domain/transaction_template_test.go
  affects: []
tech_stack:
  added: []
  patterns:
    - goose SQL migration (Up/Down symmetric)
    - domain.TransactionTemplatePayload as typed JSONB write-boundary
    - SplitSettings reuse for percentage *int / fixed-amount *int64 round-trip
key_files:
  created:
    - backend/migrations/20260614113105_create_transaction_templates_table.sql
    - backend/internal/domain/transaction_template.go
    - backend/internal/domain/transaction_template_test.go
  modified: []
decisions:
  - "Reuse domain.SplitSettings verbatim (keeps both Percentage *int and Amount *int64 nilable fields) — round-trip trivial per CONTEXT.md D-11"
  - "No DisallowUnknownFields wiring in Phase 26 — strict unmarshal deferred to Phase 27 (D-01b)"
  - "Hard delete / no deleted_at column per D-06"
  - "payload JSONB NOT NULL, no FK columns for account/category/tag (D-07)"
metrics:
  duration: ~10m
  completed_date: "2026-06-14"
  tasks_completed: 2
  files_changed: 3
---

# Phase 26 Plan 01: Schema Migration and Domain Types Summary

One-liner: transaction_templates goose migration (JSONB payload, UNIQUE(user_id,name), no amount/date/deleted_at) plus strict domain types with TDD round-trip proof for both split modes.

## What Was Built

### Task 1: Migration (chore)
Created `backend/migrations/20260614113105_create_transaction_templates_table.sql` via `just migrate-create`. The Up block creates the `transaction_templates` table with:
- `id SERIAL PRIMARY KEY`
- `user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `name VARCHAR(255) NOT NULL`
- `payload JSONB NOT NULL`
- `created_at` / `updated_at` `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `UNIQUE (user_id, name)` constraint
- `idx_transaction_templates_user_id` index

The Down block is `DROP TABLE IF EXISTS transaction_templates` (symmetric).

No forbidden columns: no `amount`, `date`, `deleted_at`, no FK columns for account/category/tag.

### Task 2: Domain Types + Round-Trip Tests (TDD)

**RED** — wrote `transaction_template_test.go` with 3 failing tests before any implementation:
- `TestTransactionTemplatePayload_SplitModesRoundTrip` (Test A): both split modes survive unmarshal→marshal (TMPL-05)
- `TestTransactionTemplatePayload_AllFieldsPreserved` (Test B): all payload fields present after unmarshal
- `TestTransactionTemplatePayload_AmountAndDateDropped` (Test C): `amount`/`date` keys absent from re-marshaled JSON

**GREEN** — created `transaction_template.go` defining:
- `TransactionTemplate` struct (ID, UserID, Name, Payload, CreatedAt, UpdatedAt)
- `TransactionTemplatePayload` struct (Type TransactionType, AccountID *int, CategoryID *int, DestinationAccountID *int, Description string, TagIDs []int, SplitSettings []SplitSettings)

Types reuse `domain.TransactionType` and `domain.SplitSettings` directly — no redeclarations. All 3 tests pass.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| e530f6b | chore(26-01) | create transaction_templates migration |
| fc43d91 | test(26-01) | add failing tests for TransactionTemplatePayload round-trip (RED) |
| 891ca7d | feat(26-01) | define TransactionTemplate and TransactionTemplatePayload domain types (GREEN) |

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test commit) | fc43d91 | PASS |
| GREEN (feat commit) | 891ca7d | PASS |

## Known Stubs

None — this plan creates a migration and pure domain types. No UI rendering paths, no data sources to wire.

## Threat Flags

None — no new HTTP surface, no auth paths, no untrusted input processed at runtime. Threat model T-26-01 (IDOR foundation via user_id NOT NULL + UNIQUE(user_id,name)) is satisfied by the migration schema as designed.

## Self-Check: PASSED

- `backend/migrations/20260614113105_create_transaction_templates_table.sql` exists: FOUND
- `backend/internal/domain/transaction_template.go` exists: FOUND
- `backend/internal/domain/transaction_template_test.go` exists: FOUND
- Commit e530f6b: FOUND
- Commit fc43d91: FOUND
- Commit 891ca7d: FOUND
- `go build ./...`: PASS
- `go test ./internal/domain/ -run TestTransactionTemplate -count=1`: PASS (3 tests)
- `git diff --name-only HEAD~3 HEAD` shows ONLY the 3 expected files: CONFIRMED
