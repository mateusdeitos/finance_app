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
- ✓ Backend validation restricts linked transaction edits to date, description, category, tags only — v1.3
- ✓ Date/description propagation for linked transactions is user-scoped (edit my side only) — v1.3
- ✓ "Divisão" bulk action appears in transactions SelectionActionBar before Excluir — v1.4
- ✓ BulkDivisionDrawer form is percentage-only (no fixed-amount mode) — v1.4
- ✓ Single connected account auto-selected when opening drawer — v1.4
- ✓ Form validates Σ percentage = 100% before submit — v1.4
- ✓ Frontend converts percentage → cents per-transaction with "last split absorbs rest" — v1.4
- ✓ Payload contains only `connection_id` + `amount` (never `percentage`) — v1.4
- ✓ Linked/unsplittable transactions silently skipped in bulk batch — v1.4
- ✓ BulkProgressDrawer reused for sequential per-transaction updates — v1.4
- ✓ Reproducible CSV fixtures (50/200/500 rows) + React DevTools Profiler baseline — v1.5
- ✓ Page-level `useWatch({ name: 'rows' })` replaced by `compute`-scoped subscriptions — v1.5
- ✓ `categoryOptions`/`accountOptions` derived inside TanStack Query `select` callbacks — v1.5
- ✓ `useDuplicateTransactionCheck` debounced and gated by `enabled` per row — v1.5
- ✓ Import e2e suite green after perf rework (keystroke 761ms→3.5ms / 929ms→5.6ms) — v1.5
- ✓ Web Push subscription lifecycle: register, store, remove, and report status of a per-device push subscription — v1.6
- ✓ Notify the charge recipient when the partner creates a new charge — v1.6
- ✓ Notify the charge creator when the partner accepts their charge — v1.6
- ✓ Notify the partner when a new split transaction is created on their side — v1.6
- ✓ Notify the partner when a split transaction is updated in a way that affects their side — v1.6
- ✓ Persist each notification with a deep-link to its related entity (charge/transaction) — v1.6
- ✓ In-app notification inbox with read/unread state and open-entity navigation — v1.6
- ✓ Minimal user control: browser permission prompt + enable/disable on the current device — v1.6

### Active

_v1.7 requirements being defined — see `.planning/REQUIREMENTS.md`._

### Deferred (from v1.3)

- [ ] Frontend edit form: disabled non-editable fields, hidden type/recurrence/split sections — v1.3 backlog
- [ ] Propagation drawer when editing recurring linked transactions — v1.3 backlog

## Current Milestone: v1.7 Budgets (Orçamentos)

**Goal:** A user can maintain a single monthly budget made up of per-category spending caps, track actual spend ("realizado") per category against each cap, and receive configurable alerts as a category nears or exceeds its cap.

**Scope:** Private budgets only — a single budget per user, composed of per-category caps. Shared (connection-level) budgets, the category equivalence mapping they require, and multiple budgets per user are deferred to a future milestone.

**Target features:**
- **Budget with per-category caps** — one budget per user; the user adds their own categories, each with a monthly cap (int64 cents); at most one cap per category
- **Per-category actual-spend tracking** — "realizado" vs. cap for the current month, reusing the existing `GetBalance` logic (owner's net portion: transaction − settlements); a split transaction counts only the part the owner paid
- **Configurable per-category alerts** — the user enables/configures threshold(s) (e.g. 80%, 100%) per category cap that fire a push notification to the owner, reusing the v1.6 Web Push infrastructure; each threshold fires once per month and the latch is set only after a successful delivery
- **Frontend** — manage category caps, visualize spend-vs-cap progress per category, and open the budget from an alert notification

**Key decisions (from explore session 2026-06-05, see `.planning/notes/shared-budget-design-decisions.md`; refined during v1.7 requirements):** monthly with no rollover; realizado reuses `GetBalance` (never new aggregation SQL); alerts fire on transaction writes (not cap edits); shared budgets and category mapping deferred.

### Out of Scope

- Backdating or creating past installments — user only needs future tracking
- Migrating existing transaction data to the new format — old records stay as-is
- Open-ended recurrences (subscriptions with no end) — not part of current scope
- `end_date` as recurrence input — removed; fixed-count only
- Mobile app — web-first approach
- Offline mode — real-time sync not core to finance tracking
- Backend changes to the import payload or duplicate-detection API — v1.5 is frontend-only
- Switching off `<table>` semantics globally — only the import review screen migrates to a CSS-grid virtualized layout
- Replacing React Hook Form or Mantine — performance fixes work within the existing stack
- Speculative micro-optimizations (manual `useMemo`/`useCallback` everywhere) — `babel-plugin-react-compiler` is already active; we only intervene where the compiler cannot help (subscriptions, query derivations, scaling)
- Import review table virtualization (`@tanstack/react-virtual`) — Phase 20 skipped post-gate; perf goals were met without it (v1.5)
- Queued / retried push delivery (e.g. Cloud Tasks) — v1.6 dispatches synchronously best-effort; durability deferred
- Per-notification-type preference toggles — v1.6 ships minimal device-level enable/disable only
- Charge reject / cancel notifications — only "received" and "accepted" are in scope per issue #174
- Email / SMS / native FCM / APN delivery channels — v1.6 is Web Push (PWA) only
- Shared / connection-level budgets and the category equivalence mapping they require — deferred from v1.7; this milestone is private budgets only (SHARED-F1..F5)
- Multiple budgets per user — v1.7 ships a single budget per user composed of per-category caps (BUD-F1)
- N-way splits across more than 2 people in a budget — connection model is pairwise today; deferred
- Rollover / envelope-style budgets (leftover or overspend carrying to next month) — v1.7 is monthly with no rollover; requires per-period history

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
| Ship v1.3 with Phase 11 only; defer frontend form work                 | Bulk split (v1.4) takes priority; FE-01..FE-05 roll forward as backlog                      | Deferred |
| Bulk split drawer is percentage-only (no fixed-amount toggle)          | Avoids ambiguity across heterogeneous transaction amounts in a selection                    | ✓ Good  |
| Percentage → cents conversion per-transaction; last split absorbs rest | Guarantees Σ amount == tx.amount exactly; avoids 1-cent drift from rounding                 | ✓ Good  |
| Send only `connection_id` + `amount` in bulk split payload             | Mixing `percentage` and `amount` triggers backend 400; cents-only is the wire contract      | ✓ Good  |
| Silently skip unsplittable (linked) transactions in bulk batch         | Matches SEL-02 pattern from v1.2 — users shouldn't see errors for ops they can't perform    | ✓ Good  |
| Profile-then-fix order in v1.5 (baseline before code changes)          | Avoids speculative optimization; gives numeric proof per-phase                              | TBD |
| Two-phase performance approach (root cause first, then virtualization) | Virtualization without fixing re-render cascade still pays cost on visible rows             | TBD |
| CSS Grid layout for virtualized import table (not `<table>`)           | TanStack Virtual requires absolute-positioned rows; `<table>` semantics fight that          | TBD |
| Defer per-row manual memoization in v1.5                               | `babel-plugin-react-compiler` already auto-memoizes; manual useMemo/useCallback adds noise  | TBD |
| Web Push (VAPID) over native FCM/APN for v1.6                          | App is already a PWA (vite-plugin-pwa); web push reuses existing service worker, no native shells | TBD |
| Synchronous best-effort push dispatch (goroutine after commit)         | No async/job infra exists; Cloud Run is stateless; avoids Cloud Tasks IAM setup for v1.6        | TBD |
| Persist notifications with entity deep-link                            | User wants to navigate from a notification to the charge/transaction it refers to               | TBD |
| Fire push only after DB commit succeeds                                | Guarantees the referenced entity exists before notifying; avoids notifying on rolled-back txns  | TBD |

## Constraints

- **Tech stack**: Go 1.24, Echo v4, GORM, PostgreSQL (backend) · React, TypeScript, Mantine (frontend)
- **Breaking change**: API clients must update request format for recurrence; no transition period
- **DB**: `transaction_recurrence.installments` stores total installments

## Evolution

This document evolves at phase transitions and milestone boundaries.

---

_Last updated: 2026-06-06 — v1.7 Budgets started (v1.6 Push Notifications shipped, Phases 22–25)_
