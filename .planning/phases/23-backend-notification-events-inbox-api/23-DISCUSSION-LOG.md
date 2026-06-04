# Phase 23: Backend Notification Events & Inbox API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 23-backend-notification-events-inbox-api
**Areas discussed:** NOTIF-04 trigger scope, Notification content & privacy, Bulk-operation volume, Inbox read & query semantics

---

## NOTIF-04 trigger scope

| Option | Description | Selected |
|--------|-------------|----------|
| Amount or existence | Notify only when the linked side's amount changes or the split is added/removed; date/category/description silent. | ✓ |
| Amount, existence, or date | The above plus due-date changes. | |
| Any field change | Any edit to a transaction with a linked side notifies the partner. | |

**User's choice:** Amount or existence
**Notes:** Reuse existing `updateChanges.AddedSplit()/RemovedSplit()` in transaction_update.go; add amount-change detection on the linked side. Self-edits never notify; only partner-initiated changes.

---

## Notification content & privacy

| Option | Description | Selected |
|--------|-------------|----------|
| Name + amount + context | Full detail incl. formatted amount; lock-screen exposure accepted for shared finances. | ✓ |
| Name + event only | Partner name + event, no amounts on lock screen. | |
| Generic | No names or amounts. | |

**User's choice:** Name + amount + context
**Notes:** Codebase scout confirmed the app UI is pt-BR (e.g. "Criar conexão", "Adicionar pessoa") while backend error strings are English (developer-facing). → Push copy is pt-BR with BRL formatting. Four message templates proposed in CONTEXT.md D-07 as Claude discretion.

---

## Bulk-operation volume

| Option | Description | Selected |
|--------|-------------|----------|
| One summary push, per-tx rows | One aggregated push per batch, but one inbox row per linked transaction (each deep-linking to its own tx). | ✓ |
| Per transaction | One push + one row per transaction; simplest but spammy on large batches. | |
| One aggregate notification | Single push AND single row deep-linking to a filtered list. | |

**User's choice:** One summary push, per-tx rows
**Notes:** Generalized into a coalescing rule — group notifications by (recipient, type) per originating request; persist all rows, send one summary push when >1. Covers single + bulk (bulk split v1.4, CSV import, bulk update) without special-casing.

---

## Inbox read & query semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Offset/limit pagination | limit+offset, newest-first, matches existing list endpoints. | |
| Simple cap (latest N) | Return latest ~50, no paging. | |
| Return all | No limit. | |
| **Other (free text)** | "Cursor based pagination most recent first" | ✓ |

**User's choice:** Cursor-based pagination, most-recent-first (free-text)
**Notes:** Preferred cursor over offset for stability under inserts. unread-count returns exact int (frontend caps display). Marking-read stays explicit via POST; GET never mutates. Researcher to confirm cursor shape (likely created_at, id).

---

## Claude's Discretion

- Always persist the notification row even when the recipient has no active subscription (inbox ≠ delivery).
- Dispatcher abstraction, goroutine lifecycle/logging, currency-formatting helper location.
- Push payload JSON shape (coordinate with Phase 24/25 service-worker contract).
- Failure observability: log push failures at an appropriate level (no metrics infra for v1.6).
- Exact rendering of a removed-split notification's deep-link (Phase 25).

## Deferred Ideas

- Notification retention / cleanup job (table grows unbounded in v1.6).
- Per-notification-type preference toggles (out of v1.6 scope).
- "99+" unread-count capping and auto-mark-read on navigate (Phase 25 frontend).
- Aggregate/list deep-link entity type (not needed given per-tx rows).
