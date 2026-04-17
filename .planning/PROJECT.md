# Couples Finance App — Backend

## What This Is

A Go REST API backend for a couples' finance management app. It lets two users (partners) track shared and individual transactions, split expenses, transfer funds between accounts, and manage recurring installment purchases. Includes a charges system for requesting payments between partners, and a user avatar system with OAuth photo support and customizable account colors. Deployed on Google Cloud Run with PostgreSQL.

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
- ✓ Frontend form: "Parcela atual" + "Total de parcelas" inputs with Zod validation — v1.0
- ✓ TypeScript types and payload builder updated for new recurrence fields — v1.0
- ✓ Charge entity with status machine (pending → paid/rejected/cancelled) and DB schema — v1.1
- ✓ Charge CRUD API: create, reject, cancel, list with IDOR protection — v1.1
- ✓ Pending charge badge count endpoint — v1.1
- ✓ Atomic charge acceptance: dual-transfer creation in single DB transaction — v1.1
- ✓ Race-condition guard: conditional UPDATE prevents double-accept — v1.1
- ✓ Charges frontend: listing, create/accept/reject/cancel, sidebar badge — v1.1
- ✓ Bulk selection mode on transactions list — v1.2
- ✓ Bulk category change for selected transactions — v1.2
- ✓ Bulk date change for selected transactions — v1.2
- ✓ Progress drawer showing update progress per transaction — v1.2
- ✓ Propagation settings drawer when selected transactions have installments — v1.2
- ✓ Silent skip of linked transactions (user is not original_user_id) — v1.2
- ✓ Query invalidation on completion — v1.2
- ✓ Save avatar URL from OAuth provider on login — v1.2
- ✓ Display user avatar in header, split settings, transaction rows, account cards — v1.2
- ✓ Customizable background color for private account avatars — v1.2

### Active

(None — planning next milestone)

### Out of Scope

- Backdating or creating past installments — user only needs future tracking
- Migrating existing transaction data to the new format — old records stay as-is
- Open-ended recurrences (subscriptions with no end) — not part of current scope
- `end_date` as recurrence input — removed; fixed-count only
- Mobile app — web-first approach
- Offline mode — real-time sync not core to finance tracking

## Context

**Current state (v1.2 complete):** Three milestones shipped. Recurrence redesign (v1.0), charges system (v1.1), and bulk actions + avatar system (v1.2). Backend: Go 1.24 with Echo v4, GORM, PostgreSQL. Frontend: React, TypeScript, Mantine, Zod, React Hook Form. E2E: Playwright.

**Known open items:**
- Integration tests for accept flow require Docker (testcontainers) — blocked in CI without Docker
- UAT gaps in phases 7, 9; verification gaps in phases 8, 9, 10 (human_needed)

## Key Decisions

| Decision                                                               | Rationale                                                                                   | Outcome |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------- |
| `current_installment` lives inside `RecurrenceSettings`                | Keeps recurrence concerns together; consistent with existing pattern                        | ✓ Good  |
| `total_installments` replaces `repetitions` (rename for clarity)       | More expressive; removes ambiguity about what the count means                               | ✓ Good  |
| Remove `end_date` from RecurrenceSettings                              | Fixed-count only; breaking change accepted; simplifies validation                           | ✓ Good  |
| Only create installments from current to total                         | Past installments irrelevant at registration time                                           | ✓ Good  |
| Direct transactionRepo.Create in accept (bypass service)               | Avoids nested DB transactions; PostgreSQL doesn't support them natively                     | ✓ Good  |
| Conditional UPDATE WHERE status='pending' for race guard               | Single atomic fence; cleaner than read-check-write                                          | ✓ Good  |
| Role re-inference from live balance during accept                      | Balance may flip between charge creation and acceptance                                     | ✓ Good  |
| *string for AvatarURL (NULL not empty string)                          | OAuth providers may return empty; NULL distinguishes "no avatar" from "empty"               | ✓ Good  |
| Correlated subqueries for partner avatar/name in account search        | Avoids additional JOINs; partner data resolved in single query                              | ✓ Good  |
| SEL-02 silent skip for linked transactions                             | User shouldn't see errors for transactions they can't modify; cleaner UX                    | ✓ Good  |
| Single propagation choice for entire batch                             | Per-transaction propagation would be confusing UX; one choice covers all                    | ✓ Good  |

## Constraints

- **Tech stack**: Go 1.24, Echo v4, GORM, PostgreSQL (backend) · React, TypeScript, Mantine (frontend)
- **Breaking change**: API clients must update request format for recurrence; no transition period
- **DB**: `transaction_recurrence.installments` stores total installments

## Evolution

This document evolves at phase transitions and milestone boundaries.

---

_Last updated: 2026-04-17 after v1.2 Transactions Bulk Actions milestone complete_
