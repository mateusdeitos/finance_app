# Couples Finance App — Backend

## What This Is

A Go REST API backend for a couples' finance management app. It lets two users (partners) track shared and individual transactions, split expenses, transfer funds between accounts, and manage recurring installment purchases. Features structured request logging with zerolog for production observability. Deployed on Google Cloud Run with PostgreSQL.

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
- ✓ Create loop produces correct installment series from `current_installment` — v1.0
- ✓ `TransactionRecurrence.Installments` stores `total_installments` — v1.0
- ✓ Frontend form: "Parcela atual" + "Total de parcelas" inputs with cross-field Zod validation — v1.0
- ✓ TypeScript types and payload builder updated for new recurrence fields — v1.0
- ✓ Charge entity with status machine (pending → paid/rejected/cancelled) and DB schema — v1.1
- ✓ Charge CRUD API with IDOR protection — v1.1
- ✓ Atomic charge acceptance with race-condition guard — v1.1
- ✓ Charges frontend with full UI (listing, create/accept/reject/cancel, sidebar badge) — v1.1
- ✓ Bulk selection mode on transactions list — v1.2
- ✓ Bulk category change for selected transactions — v1.2
- ✓ Bulk date change for selected transactions — v1.2
- ✓ Progress drawer showing update progress per transaction — v1.2
- ✓ Propagation settings drawer when selected transactions have installments — v1.2
- ✓ Silent skip of linked transactions (user is not original_user_id) — v1.2
- ✓ Query invalidation on completion — v1.2
- ✓ Structured request logging with zerolog (single-log-per-request pattern) — v1.2
- ✓ Context-propagated logger accessible from all layers — v1.2
- ✓ Dynamic log leveling (2xx→info, 4xx→warn, 5xx→error) — v1.2
- ✓ Configurable minimum log level via LOG_LEVEL env var — v1.2
- ✓ Request ID generation + X-Request-ID response header — v1.2

### Active

(None — all current requirements shipped. Next milestone TBD.)

### Out of Scope

- Backdating or creating past installments — user only needs future tracking
- Migrating existing transaction data to the new format — old records stay as-is
- Open-ended recurrences (subscriptions with no end) — not part of this change
- Backwards compatibility shim — breaking API change accepted
- `end_date` as recurrence input — removed; fixed-count only going forward

## Context

**Current state (v1.2 complete):** Bulk actions feature shipped (frontend) — bulk category/date changes with propagation support and progress tracking. Request logging added (backend) — zerolog-based structured logging with Stripe's single-log-per-request pattern, context-propagated logger, dynamic log levels, and X-Request-ID headers for debugging.

**Tech stack:** Go 1.24, Echo v4, GORM, PostgreSQL, zerolog (backend) · React, TypeScript, Mantine, Zod, React Hook Form (frontend) · Playwright (e2e)

**Known open items:**

- Integration tests for accept flow require Docker (testcontainers) — pass locally, blocked in CI without Docker
- 5 pending human UAT scenarios for Phase 9 (bulk actions)
- Verification items for Phases 8 and 9 require manual testing

## Key Decisions

| Decision                                                               | Rationale                                                                                   | Outcome |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------- |
| `current_installment` lives inside `RecurrenceSettings`                | Keeps recurrence concerns together; consistent with existing pattern                        | ✓ Good  |
| `total_installments` replaces `repetitions` (rename for clarity)       | More expressive; removes ambiguity about what the count means                               | ✓ Good  |
| Remove `end_date` from RecurrenceSettings                              | User chose fixed-count only; breaking change accepted; simplifies validation                | ✓ Good  |
| Only create installments from current to total                         | Past installments are irrelevant to users at registration time                              | ✓ Good  |
| Direct transactionRepo.Create in accept (bypass service)               | Avoids nested DB transactions; PostgreSQL doesn't support them natively                     | ✓ Good  |
| Conditional UPDATE WHERE status='pending' for race guard               | Single atomic fence; no SELECT FOR UPDATE needed                                            | ✓ Good  |
| Role re-inference from live balance during accept                      | Balance may flip between charge creation and acceptance; swap in same tx                    | ✓ Good  |
| Shared PeriodNavigator with onPeriodChange callback                    | Reuse over copy; both transactions and charges pages use same component                     | ✓ Good  |
| Charge mutations invalidate Transactions + Balance queries             | Accept creates transfers; stale transaction list without cross-invalidation                 | ✓ Good  |
| zerolog over Echo's built-in logger                                    | Structured JSON output for Cloud Run; Stripe's single-log pattern for low noise             | ✓ Good  |
| `pkg/applog` with pointer mutation (not value copy)                    | Fields added in any layer accumulate on same logger; middleware emits once at end            | ✓ Good  |
| Custom middleware over hlog package                                    | hlog designed for net/http with alice chaining; custom fits Echo middleware pattern          | ✓ Good  |
| `severity` field name for Cloud Run                                    | Cloud Logging parses severity field natively; avoids DEFAULT level for all entries           | ✓ Good  |

## Constraints

- **Tech stack**: Go 1.24, Echo v4, GORM, PostgreSQL, zerolog — established stack
- **Breaking change**: API clients must update their request format; no transition period
- **DB migration**: `transaction_recurrence.installments` column stores total installments — semantics unchanged

## Evolution

This document evolves at phase transitions and milestone boundaries.

---

_Last updated: 2026-04-17 after v1.2 Bulk Actions & Observability milestone complete_
