# Phase 13: BulkDivisionDrawer Form - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 13-bulkdivisiondrawer-form
**Areas discussed:** Component strategy, Validation approach, UX feedback, Pre-selection default, Drawer defaults

---

## Component Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh standalone component | Clean RHF form inside BulkDivisionDrawer. SplitSettingsFields assumes a known tx.amount and lives inside a parent form; bulk has N txs with varying amounts and no preview context. Fork-then-prune keeps this simpler and more testable. | |
| Refactor SplitSettingsFields to support bulk | Add a "bulk mode" to the existing component (no amount preview, no mode toggle). Higher churn, touches existing flows, risks regressions in the single-tx edit form. | |
| Reuse SplitSettingsFields as-is | Use it inside the drawer's FormProvider with onlyPercentage and totalAmount=0. Confirmed that the `totalAmount > 0` guard hides the preview cleanly when no `amount` field is in the form. | ✓ |

**User's choice:** Reuse SplitSettingsFields as-is
**Notes:** Follow-up clarified that when the drawer's form has no `amount` field, `useWatch({ name: "amount" })` returns 0 and the cent-preview text is suppressed by the existing guard — no broken preview, no fork needed.

---

## Validation Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Zod resolver with refine() | Project convention already uses Zod (recurrence form). `refine(sum === 100)` on the splits array. Declarative, testable, consistent with the rest of the codebase. | ✓ |
| Manual watch + button disabled | useWatch the splits, compute sum, disable submit when sum !== 100. Simpler but ad-hoc — diverges from the Zod pattern. | |
| Submit-time check only | Let user click submit; show an alert if sum !== 100. Worst UX — doesn't guide user in real-time. | |

**User's choice:** Zod resolver with refine()
**Notes:** Matches the recurrence form precedent introduced in v1.0.

---

## UX Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Live sum badge in drawer + disabled submit | Show `Total: X% / 100%` with color state (red when !=100, green when =100). Submit stays disabled until 100. Clear, immediate, mobile-friendly. | ✓ |
| Inline error under the last row only when submit attempted | No live feedback; error appears after click. Less guidance, more clicks to figure out the problem. | |
| Auto-rebalance on row removal/add | When user adds/removes rows, redistribute percentages to total 100. Clever but opinionated — can silently override user input. | |

**User's choice:** Live sum badge + disabled submit
**Notes:** Auto-rebalance captured as a deferred idea.

---

## Pre-selection Default (UI-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-select account, use connection's default_split_percentage | Mirrors the single-tx split behavior in SplitSettingsFields (line 64). Consistent UX and honors the relationship setting the users already configured. | ✓ |
| Pre-select account, default to 50% | Fixed 50/50. Ignores user preferences stored in user_connection. | |
| Pre-select account, default to 100% | Full allocation to the connected partner. Semantically odd for a "split" action. | |

**User's choice:** Pre-select account, use connection's default_split_percentage

---

## Drawer Defaults (position + return shape)

| Option | Description | Selected |
|--------|-------------|----------|
| OK with both (bottom + raw form values) | Bottom drawer + returns `[{ connection_id, percentage }]`. Phase 14 will handle cent conversion. | ✓ |
| Right-side drawer | Use Mantine Drawer position='right' (larger form area) instead of bottom. | |
| Return pre-normalized shape | Drawer returns `{ splits: [...] }` wrapped in an object — easier to extend later. | |

**User's choice:** OK with both

---

## Claude's Discretion

- Exact Portuguese copy for the sum badge ("Soma: X%/100%" vs "Total: X%/100%" etc.)
- Exact layout and spacing inside the drawer
- `data-testid` values (follow existing `drawer_*`, `btn_apply_*`, `input_bulk_*` conventions)
- Whether to include a first-time hint/tooltip explaining per-tx application

## Deferred Ideas

- Auto-rebalance percentages on row add/remove
- Preview of a "representative transaction" showing how the splits would apply
