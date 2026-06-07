# Phase 26: DB Migrations + Domain Types - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-07
**Phase:** 26-DB Migrations + Domain Types
**Areas discussed:** Forward-compat scope, Cap removal & 'active', Threshold enable/disable, last_fired_period type

---

## Forward-compat scope

Context flagged: research `ARCHITECTURE.md` describes the full shared+private design (scope column, connection_id, category_mapping_id, chk_scope_fks, category_equivalence_mappings table), but REQUIREMENTS.md + ROADMAP cut shared budgets to a future milestone. ROADMAP still lists `BudgetScope` as a phase-26 type.

| Option | Description | Selected |
|--------|-------------|----------|
| Private-only schema | budgets = (owner_user_id, category_id, amount_cents, active, timestamps). No scope/connection_id/category_mapping_id/CHECK. Ship BudgetScope Go type (Private only). Shared columns added later via migration. | ✓ |
| Scope discriminator only | Add `scope TEXT NOT NULL DEFAULT 'private'` (CHECK private-only), no shared FKs. Cheap forward hook. | |
| Full forward-compat | Pre-wire scope + nullable connection_id + category_mapping_id + chk_scope_fks per research. | |

**User's choice:** Private-only schema
**Notes:** Clean YAGNI. Adding columns later is cheap in this codebase (goose + `just migrate-create`). `BudgetScope` type still ships (Private constant only) to satisfy ROADMAP's deliverable list with zero DB cost.

---

## Cap removal & 'active'

| Option | Description | Selected |
|--------|-------------|----------|
| Hard delete; active = pause | 'Remove a cap' = hard DELETE (thresholds cascade). `active` = separate user pause toggle (keep config + thresholds, stop counting/alerting). | ✓ |
| Soft-delete via active=false | Removal = set active=false; rows stay, filtered by ActiveOnly. One concept but rows accumulate + reactivation logic on re-add. | |
| deleted_at + active | Follow transaction soft-delete convention literally: deleted_at for removal + active as pause. Two soft-state columns for a table needing no history. | |

**User's choice:** Hard delete; active = pause
**Notes:** Budgets need no audit trail — realizado is computed on-read with no history table. Deleting a cap doesn't touch transactions (separate table). `BudgetFilter.ActiveOnly` exposes the pause filter.

---

## Threshold enable/disable

ALERT-01 wording is cap-level ("enable/disable alerts for that cap"); `active` already pauses a whole cap, so this is the finer "silence push but keep tracking realizado" control.

| Option | Description | Selected |
|--------|-------------|----------|
| Per-cap alerts_enabled | `alerts_enabled BOOLEAN` on budgets. Matches ALERT-01 wording; distinct from `active`. | |
| Per-threshold enabled | `enabled BOOLEAN` on each budget_alert_thresholds row; 80%/100% toggle independently. Finer than ALERT-01 requires. | ✓ |
| Row-presence = enabled | No enabled column; disable = delete row, re-enable = recreate. Simplest but loses remembered config + resets last_fired_period latch. | |

**User's choice:** Per-threshold enabled
**Notes:** Intentional addition beyond ROADMAP's literal three-column threshold list. Disabling all thresholds on a cap = silencing it; no separate cap-level `alerts_enabled` column needed.

---

## last_fired_period type

| Option | Description | Selected |
|--------|-------------|----------|
| TEXT 'YYYY-MM' | Nullable TEXT (e.g. '2026-06'); NULL = never fired. Matches research, trivial from Period via Sprintf, identical to SPEND-03 API month format. String-equality fence. | ✓ |
| INT YYYYMM | Nullable INT (202606). Compact/integer-comparable but a second period format to sync; less readable. | |
| DATE (month-start) | Nullable DATE pinned to 2026-06-01. Native date semantics but adds date/tz surface for a month label. | |

**User's choice:** TEXT 'YYYY-MM'
**Notes:** One period format end-to-end with the SPEND-03 `month=YYYY-MM` API parameter. Domain field `*string`.

---

## Claude's Discretion

- FK `ON DELETE` behavior for `budgets.category_id` / `budgets.owner_user_id` (default to CASCADE per existing category/user pattern).
- Exact field sets of `BudgetFilter`, `BudgetSpentResult`, `BudgetAlertThreshold`.
- `threshold_pct` column type/CHECK and non-FK index choices.

## Deferred Ideas

- Shared/connection budgets + scope/connection_id/category_mapping_id/chk_scope_fks + `category_equivalence_mappings` table + the `CategoryService.Delete` guard.
- Category equivalence mapping (cross-user category bridge).
- Multiple budgets per user, per-period historical snapshots, rollover/envelope carry-forward, N-way splits, alert-on-cap-edit.
