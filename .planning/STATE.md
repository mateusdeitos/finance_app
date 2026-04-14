---
version: v1.1
status: active
last_activity: 2026-04-14
---

## Current Position

Phase: 5 — Charge Domain & DB
Plan: —
Status: Roadmap defined — ready to plan Phase 5
Last activity: 2026-04-14 — v1.1 roadmap created (Phases 5–8)

Progress: ░░░░░░░░░░ 0% (0/4 phases complete)

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-14)

**Core value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.
**Current focus:** v1.1 Charges — allow connected users to settle debts via charges and auto-transfers

## Performance Metrics

- v1.0: 4 phases, 8 plans, 1 day (2026-04-09 → 2026-04-10)
- v1.1: 4 phases planned, 0 complete

## Accumulated Context

### Decisions
- v1.0 Recurrence Redesign shipped 2026-04-10. 4 phases, 8 plans completed. Archived: `.planning/milestones/v1.0-ROADMAP.md`
- Charge entity uses `payer_user_id` / `charger_user_id` (explicit directional fields, not connection orientation) — no SwapIfNeeded needed for ownership checks
- Accept flow reuses `TransactionService.Create` with type=transfer + DestinationAccountID — avoids duplicating linked-transaction logic
- Race condition guard: conditional UPDATE `WHERE status='pending'` + affected-rows check (not SELECT FOR UPDATE) — cleaner, no read-check-write window
- `charges` table uses ON DELETE RESTRICT on connection_id — connection cannot be deleted while pending charges exist
- `transactions.charge_id` is nullable FK — set on auto-created transfers, null on all manually created transactions
- Phase 8 (Frontend) uses non-optimistic mutation pattern — no optimistic updates for financial state transitions

### Critical pitfalls noted (see .planning/research/PITFALLS.md)
- CP-1: Double-accept race condition — use conditional UPDATE with affected-rows check
- CP-2: Non-atomic accept — single DB transaction for status update + both transfers
- DI-2: Transfer pair symmetry — use existing linked-transaction mechanism (single cross-user transfer, not two separate creates)
- FE-1: Badge staleness — invalidate QueryKeys.Charges in all charge mutation hooks

### Todos
- Wire `ChargeService` last in main.go (depends on Services — same circular-dep pattern as TransactionService)
- Run `just generate-mocks` after adding ChargeRepository and ChargeService interfaces
- Run `just generate-docs` after adding charge handlers

### Blockers
None

## Session Continuity

Next: `/gsd-plan-phase 5`
