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

### Active

- [ ] Change recurrence input from `repetitions | end_date` to `current_installment + total_installments` — lets users register in-progress installment purchases (e.g., "I'm on installment 3 of 10")
- [ ] When `current_installment = 3, total_installments = 10`, create only installments 3–10, numbered accordingly
- [ ] Store `total_installments` in `TransactionRecurrence` (maps to existing `installments` column)
- [ ] Remove `end_date` from `RecurrenceSettings` (applies only to fixed-count recurrences going forward)

### Out of Scope

- Backdating or creating past installments (1–2 in the example above) — user only needs future tracking
- Migrating existing transaction data to the new format — old records stay as-is
- Open-ended recurrences (subscriptions with no end) — not part of this change; current behavior for nil repetitions is not being touched
- Backwards compatibility shim — breaking API change accepted

## Context

**Existing recurrence model:** `RecurrenceSettings` accepts `type` + either `repetitions` (int) or `end_date` (mutually exclusive). `RecurrenceFromSettings()` converts this to a `TransactionRecurrence` with an `installments` count. The create loop runs `for i := 1; i <= recurrence.Installments; i++`, so installment numbers always start from 1.

**The gap:** Users who already have installment purchases in progress have no way to register their current position. If they're on month 3 of a 10-month purchase, registering it today creates installments 1–10 — incorrect past dates and wrong installment numbering.

**The fix:** Replace `repetitions | end_date` with `current_installment + total_installments`. The create loop starts from `current_installment`, date offsets are calculated relative to that starting point, and `TransactionRecurrence.Installments` stores `total_installments` for series metadata.

**Affected layers:** `domain/transaction.go` (RecurrenceSettings struct + RecurrenceFromSettings), `service/transaction_create.go` (validation + loop), `service/transaction_update.go` (recurrence validation reuse), handler annotations, Swagger docs.

## Constraints

- **Tech stack**: Go 1.24, Echo v4, GORM, PostgreSQL — no new dependencies for this change
- **Breaking change**: API clients must update their request format; no transition period
- **DB migration**: `transaction_recurrence.installments` column stores total installments — semantics unchanged, no schema migration needed
- **No end_date**: Removed from RecurrenceSettings; only fixed-count recurrences supported going forward

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `current_installment` lives inside `RecurrenceSettings` | Keeps recurrence concerns together; consistent with existing pattern | — Pending |
| `total_installments` replaces `repetitions` (rename for clarity) | More expressive; removes ambiguity about what the count means | — Pending |
| Remove `end_date` from RecurrenceSettings | User chose fixed-count only; breaking change accepted; simplifies validation | — Pending |
| Only create installments from current to total | Past installments are irrelevant to users at registration time | — Pending |
| `TransactionRecurrence.Installments` stores total (not remaining) | Preserves existing semantics; recurrence record describes the full series | — Pending |

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
*Last updated: 2026-04-09 after initialization*
