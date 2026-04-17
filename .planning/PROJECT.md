# Couples Finance App — Backend

## What This Is

A Go REST API backend for a couples' finance management app. It lets two users (partners) track shared and individual transactions, split expenses, transfer funds between accounts, and manage recurring installment purchases. Deployed on Google Cloud Run with PostgreSQL.

## Core Value

Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.

## Requirements

### Validated

- ✓ Transaction management (create, update, delete) with type support: `expense`, `income`, `transfer` — existing
- ✓ Recurring transactions: generate installment series from total count or end date — existing
- ✓ Propagation settings for recurring edits/deletes: `all`, `current`, `current_and_future` — existing
- ✓ Split expenses between partners by percentage or fixed amount — existing
- ✓ Transfers between accounts (same user or cross-user via connections) — existing
- ✓ Settlement tracking (credit/debit) for shared split expenses — existing
- ✓ Account management — existing
- ✓ Category and tag management — existing
- ✓ User authentication via JWT + OAuth (Google, Microsoft) — existing
- ✓ User connections (partner relationships with default split percentages) — existing
- ✓ Transaction filtering and search with pagination — existing
- ✓ Balance calculation per account/period — existing
- ✓ CSV transaction import — existing
- ✓ Hide settlements filter in advanced search — existing
- ✓ Recurrence input model: `current_installment + total_installments` replaces `repetitions | end_date` — v1.0
- ✓ Create loop produces correct installment series from `current_installment` (e.g. 3–10 for `current=3, total=10`) — v1.0
- ✓ `TransactionRecurrence.Installments` stores `total_installments` (total series size, not count created) — v1.0
- ✓ Frontend form: "Parcela atual" + "Total de parcelas" inputs with cross-field Zod validation — v1.0
- ✓ TypeScript types and payload builder updated for new recurrence fields — v1.0

### Active

(None — v1.1 complete, next milestone not yet defined)

### v1.1 Validated

- ✓ Charge entity with status machine (pending → paid/rejected/cancelled) and DB schema — Phase 5
- ✓ Charge CRUD API: create, reject, cancel, list with IDOR protection — Phase 6
- ✓ Pending charge badge count endpoint — Phase 6
- ✓ Atomic charge acceptance: dual-transfer creation in single DB transaction — Phase 7
- ✓ Race-condition guard: conditional UPDATE prevents double-accept — Phase 7
- ✓ ChargeID propagation to all transfer transactions — Phase 7
- ✓ Role re-inference from live balance during accept — Phase 7
- ✓ Charges frontend: listing page with tabs, create/accept/reject/cancel forms, sidebar badge — Phase 8
- ✓ E2E Playwright tests for charges feature (multi-user setup) — Phase 8

### Out of Scope

- Backdating or creating past installments (1–2 in a 3-of-10 scenario) — user only needs future tracking
- Migrating existing transaction data to the new format — old records stay as-is
- Open-ended recurrences (subscriptions with no end) — not part of this change
- Backwards compatibility shim — breaking API change accepted
- `end_date` as recurrence input — removed; fixed-count only going forward

## Context

**Current state (v1.1 complete):** Charges feature fully shipped — backend and frontend. Charge entity with status machine, CRUD API with IDOR protection, atomic accept flow with race guard, and full web UI (listing, create/accept/reject/cancel, sidebar badge). E2E Playwright tests cover the complete flow with multi-user setup.

**Tech stack:** Go 1.24, Echo v4, GORM, PostgreSQL (backend) · React, TypeScript, Mantine, Zod, React Hook Form (frontend) · Playwright (e2e)

**Known open items:**

- Integration tests for accept flow require Docker (testcontainers) — pass locally, blocked in CI without Docker
- E2E tests (recurrence.spec.ts) require a live app to confirm — not runnable in CI without Docker/server

## Key Decisions

| Decision                                                          | Rationale                                                                              | Outcome |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------- |
| `current_installment` lives inside `RecurrenceSettings`           | Keeps recurrence concerns together; consistent with existing pattern                   | ✓ Good  |
| `total_installments` replaces `repetitions` (rename for clarity)  | More expressive; removes ambiguity about what the count means                          | ✓ Good  |
| Remove `end_date` from RecurrenceSettings                         | User chose fixed-count only; breaking change accepted; simplifies validation           | ✓ Good  |
| Only create installments from current to total                    | Past installments are irrelevant to users at registration time                         | ✓ Good  |
| `TransactionRecurrence.Installments` stores total (not remaining) | Preserves existing semantics; recurrence record describes the full series              | ✓ Good  |
| E2E tests seed via API (not UI) for recurrence assertions         | Shared test DB makes row-count assertions unreliable; badge assertions prove numbering | ✓ Good  |
| Direct transactionRepo.Create in accept (bypass service)          | Avoids nested DB transactions; PostgreSQL doesn't support them natively     | ✓ Good  |
| Conditional UPDATE WHERE status='pending' for race guard          | Single atomic fence; no SELECT FOR UPDATE needed; cleaner than read-check-write | ✓ Good  |
| Role re-inference from live balance during accept                 | Balance may flip between charge creation and acceptance; swap in same tx    | ✓ Good  |
| charges.date as TIMESTAMPTZ (initiator + acceptor each provide)   | Both parties need their own transaction date for their respective transfers  | ✓ Good  |
| Mock-based handler tests (not integration) for charge handler     | No existing handler test patterns; mock approach avoids Docker dependency    | ✓ Good  |
| Removed createAuthenticatedRoute wrapper, use createFileRoute directly | Template literal loses TanStack Router type inference; `_authenticated` prefix handles auth | ✓ Good |
| Shared PeriodNavigator with onPeriodChange callback               | Reuse over copy; both transactions and charges pages use same component      | ✓ Good  |
| Charge mutations invalidate Transactions + Balance queries         | Accept creates transfers; stale transaction list without cross-invalidation  | ✓ Good  |

## Constraints

- **Tech stack**: Go 1.24, Echo v4, GORM, PostgreSQL — no new dependencies for this change
- **Breaking change**: API clients must update their request format; no transition period
- **DB migration**: `transaction_recurrence.installments` column stores total installments — semantics unchanged, no schema migration needed
- **No end_date**: Removed from RecurrenceSettings; only fixed-count recurrences supported going forward

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-16 after v1.1 Charges milestone complete_
