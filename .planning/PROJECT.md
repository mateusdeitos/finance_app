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

_(None — clean slate for next milestone)_

### Out of Scope

- Backdating or creating past installments (1–2 in a 3-of-10 scenario) — user only needs future tracking
- Migrating existing transaction data to the new format — old records stay as-is
- Open-ended recurrences (subscriptions with no end) — not part of this change
- Backwards compatibility shim — breaking API change accepted
- `end_date` as recurrence input — removed; fixed-count only going forward

## Context

**Current state (v1.0):** Recurrence redesign shipped. `RecurrenceSettings` now uses `CurrentInstallment + TotalInstallments`. The create loop starts from `current_installment`, date offsets are relative, and `TransactionRecurrence.Installments` stores the full series total. Frontend updated with new form inputs and Zod validation. All existing tests migrated; new integration + unit + e2e tests added.

**Tech stack:** Go 1.24, Echo v4, GORM, PostgreSQL (backend) · React, TypeScript, Mantine, Zod, React Hook Form (frontend) · Playwright (e2e)

**Known open items:**

- E2E tests (recurrence.spec.ts) require a live app to confirm — not runnable in CI without Docker/server
- WR-04: error message in form uses unaccented "nao" — should be confirmed matches rendered UI text

## Key Decisions

| Decision                                                          | Rationale                                                                              | Outcome |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------- |
| `current_installment` lives inside `RecurrenceSettings`           | Keeps recurrence concerns together; consistent with existing pattern                   | ✓ Good  |
| `total_installments` replaces `repetitions` (rename for clarity)  | More expressive; removes ambiguity about what the count means                          | ✓ Good  |
| Remove `end_date` from RecurrenceSettings                         | User chose fixed-count only; breaking change accepted; simplifies validation           | ✓ Good  |
| Only create installments from current to total                    | Past installments are irrelevant to users at registration time                         | ✓ Good  |
| `TransactionRecurrence.Installments` stores total (not remaining) | Preserves existing semantics; recurrence record describes the full series              | ✓ Good  |
| E2E tests seed via API (not UI) for recurrence assertions         | Shared test DB makes row-count assertions unreliable; badge assertions prove numbering | ✓ Good  |

## Constraints

- **Tech stack**: Go 1.24, Echo v4, GORM, PostgreSQL — no new dependencies for this change
- **Breaking change**: API clients must update their request format; no transition period
- **DB migration**: `transaction_recurrence.installments` column stores total installments — semantics unchanged, no schema migration needed
  <<<<<<< HEAD
- **No end_date**: Removed from RecurrenceSettings; only fixed-count recurrences supported going forward

## Key Decisions

| Decision                                                          | Rationale                                                                    | Outcome   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| `current_installment` lives inside `RecurrenceSettings`           | Keeps recurrence concerns together; consistent with existing pattern         | — Pending |
| `total_installments` replaces `repetitions` (rename for clarity)  | More expressive; removes ambiguity about what the count means                | — Pending |
| Remove `end_date` from RecurrenceSettings                         | User chose fixed-count only; breaking change accepted; simplifies validation | — Pending |
| Only create installments from current to total                    | Past installments are irrelevant to users at registration time               | — Pending |
| `TransactionRecurrence.Installments` stores total (not remaining) | Preserves existing semantics; recurrence record describes the full series    | — Pending |

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

# _Last updated: 2026-04-09 after initialization_

---

_Last updated: 2026-04-10 after v1.0 milestone_

> > > > > > > 837c2a8b4c46821fa710ca140091445d8383fbd4
