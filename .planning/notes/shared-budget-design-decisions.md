---
title: Shared Budget Design Decisions
date: 2026-06-05
context: Explore session — sistema de budget compartilhado entre usuários
---

## Concept: Budget = per-category monthly spending cap

A budget is a **spending limit per category per month**, with tracking of
actual spend ("realizado") vs. the limit. Classic monthly-envelope-cap style,
NOT zero-based allocation, savings goals, or cashflow forecasting (those were
considered and set aside).

## Period behavior: monthly, no rollover

- The limit is **monthly and resets each month**.
- Leftover or overspend does **not** carry to the next month.
- Same limit applies to every month until changed.
- Implication: "realizado" is just a sum within the current month — no need to
  persist per-period history for v1.

## Scope: configurable per budget (shared vs. private)

Each budget declares its scope at creation:

- **Shared** — tied to a `UserConnection`. Tracks spend across the connection's
  members.
- **Private** — belongs to a single user. Tracks only that user's own spend.

## Split semantics (the subtle part)

How a split/shared transaction counts against a budget depends on the budget's
scope. This mirrors the existing `GetBalance` settlement logic:

- **Shared budget** → counts the **full amount** paid by the members of that
  connection. A transaction may be split among **N people** (see future note —
  the connection model is pairwise today).
- **Private budget** → counts only the **author's net portion**:
  `transaction amount − settlements`. This is exactly the "settlements don't
  leak into the private account" rule already enforced by `GetBalance`.

**Reuse opportunity:** the "realizado" calculation likely reuses the existing
balance/transaction query building blocks rather than inventing new aggregation.

## Critical dependency: category mapping between users

Categories are **per-user** (`domain.Category.UserID`, `backend/internal/domain/category.go:7`).
There is no global/shared category. User A's "Mercado" and User B's "Mercado"
are distinct rows.

A shared budget "by category" therefore needs a **user-defined equivalence map**:
"category X of A ≡ category Y of B". This is a reusable building block (useful
for shared reports/views too), most likely living at the **connection** level,
and is a **prerequisite** for the shared budget feature.

Rejected alternatives for the mapping:
- **Match by name** — fragile (different names, duplicates).
- **Introduce shared categories** — cleaner long-term but a large structural
  change to the per-user category model; out of scope for now.

## Future considerations (not v1)

- **N-way splits** — a transaction split among more than 2 people; needs the
  connection model to support N members.
- **Rollover / envelope style** — leftover or overspend carrying into the next
  month; requires persisting per-period history.
