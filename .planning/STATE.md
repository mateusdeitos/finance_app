---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Charges
status: executing
last_updated: "2026-04-15T18:17:36.328Z"
last_activity: 2026-04-15
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
  percent: 100
---

## Current Position

Phase: 07 (accept-atomic-transfer) — EXECUTING
Plan: 2 of 2
Status: Ready to execute
Last activity: 2026-04-15

Progress: █████░░░░░ 50% (2/4 phases complete, Phase 07 in discuss)

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-14)

**Core value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.
**Current focus:** Phase 07 — accept-atomic-transfer

## Performance Metrics

- v1.0: 4 phases, 8 plans, 1 day (2026-04-09 → 2026-04-10)
- v1.1: 4 phases planned, 2 complete

## Accumulated Context

### Decisions

- v1.0 Recurrence Redesign shipped 2026-04-10. 4 phases, 8 plans completed. Archived: `.planning/milestones/v1.0-ROADMAP.md`
- Charge entity uses `payer_user_id` / `charger_user_id` (explicit directional fields, not connection orientation) — no SwapIfNeeded needed for ownership checks
- Accept flow reuses `TransactionService.Create` with type=transfer + DestinationAccountID — avoids duplicating linked-transaction logic
- Race condition guard: conditional UPDATE `WHERE status='pending'` + affected-rows check (not SELECT FOR UPDATE) — cleaner, no read-check-write window
- `charges` table uses ON DELETE RESTRICT on connection_id — connection cannot be deleted while pending charges exist
- `transactions.charge_id` is nullable FK — set on auto-created transfers, null on all manually created transactions
- Phase 8 (Frontend) uses non-optimistic mutation pattern — no optimistic updates for financial state transitions
- Import cycle fix: moved `ImportDecimalSeparatorValue`/`ImportTypeDefinitionRule` to `domain/transaction_import.go` — mockery v2 generates mock_TransactionService with a service import, causing a cycle; domain is the correct home
- [Phase 07]: Mock-based handler tests (Path A) used for charge handler — no existing handler test files in repo
- [Phase 07]: HandleServiceError returns *echo.HTTPError for no-tag errors (Forbidden/AlreadyExists); *TaggedHTTPError for tag-bearing validation errors

### Critical pitfalls noted (see .planning/research/PITFALLS.md)

- CP-1: Double-accept race condition — use conditional UPDATE with affected-rows check
- CP-2: Non-atomic accept — single DB transaction for status update + both transfers
- DI-2: Transfer pair symmetry — use existing linked-transaction mechanism (single cross-user transfer, not two separate creates)
- FE-1: Badge staleness — invalidate QueryKeys.Charges in all charge mutation hooks

### Todos

- Run `just migrate-up` to apply charges table migration before integration tests
- Run `just generate-docs` to verify Swagger docs are up to date

### Blockers

None

## Session Continuity

Next: `/gsd-plan-phase 7`
