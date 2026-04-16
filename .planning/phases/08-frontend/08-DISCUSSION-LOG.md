# Phase 8: Frontend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 08-frontend
**Areas discussed:** Page layout, Create charge flow

---

## Page Layout

### Sent vs received organization

| Option | Description | Selected |
|--------|-------------|----------|
| Tabs (Recommended) | Two tabs: "Enviadas" and "Recebidas". Clean separation, one list visible at a time | ✓ |
| Stacked sections | Both lists visible: "Recebidas" section on top, "Enviadas" below | |
| You decide | Claude picks best approach | |

**User's choice:** Tabs
**Notes:** None

### Period navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — same pattern (Recommended) | Reuse PeriodNavigator component, filter by period_month/period_year | ✓ |
| No — flat list | Show all charges regardless of period | |
| You decide | Claude picks | |

**User's choice:** Yes — same pattern
**Notes:** None

### Charge card display

| Option | Description | Selected |
|--------|-------------|----------|
| Compact rows | One-line per charge, tap to expand | |
| Rich cards | Card per charge with partner name, period, description, status badge, action buttons | ✓ |
| You decide | Claude picks | |

**User's choice:** Rich cards
**Notes:** None

### Status filtering

| Option | Description | Selected |
|--------|-------------|----------|
| Status chip filter (Recommended) | Horizontal chip row for status filtering | |
| No filter — all mixed | Show all statuses together, pending first | ✓ |
| You decide | Claude decides | |

**User's choice:** No filter — all mixed
**Notes:** None

---

## Create Charge Flow

### Form presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Drawer (Recommended) | Right-side drawer via renderDrawer pattern | ✓ |
| Inline on page | Expand form section at top of page | |
| You decide | Claude picks | |

**User's choice:** Drawer
**Notes:** None

### Period default

| Option | Description | Selected |
|--------|-------------|----------|
| Match page period (Recommended) | Pre-fill with whatever month/year user is viewing | ✓ |
| Always current month | Always default to today's month/year | |
| You decide | Claude picks | |

**User's choice:** Match page period
**Notes:** None

### Connection selection

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-select single (Recommended) | Pre-fill if only one accepted connection | ✓ |
| Always show picker | Always show dropdown | |
| You decide | Claude picks | |

**User's choice:** Auto-select single
**Notes:** None

### Balance preview

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — show balance (Recommended) | Fetch and display current balance after selecting connection + period | ✓ |
| No — just submit | Don't show balance preview | |
| You decide | Claude picks | |

**User's choice:** Yes — show balance
**Notes:** None

### Mutation UX (user-initiated addition)

**User's input:** "We should translate error tags from the backend, also block the submit button when submitting and show some feedback that the charge was successfully created"

| Option | Description | Selected |
|--------|-------------|----------|
| All actions (Recommended) | Apply error translation + loading button + success toast to all charge actions | ✓ |
| Create only | Only create gets the polish | |

**User's choice:** All actions
**Notes:** User proactively requested these UX patterns. Error tag translation extends existing `apiErrors.ts` utility.

---

## Claude's Discretion

- Accept drawer/modal layout and field presentation
- Reject/cancel confirmation approach
- Sidebar nav item design, icon choice, badge styling
- Empty states per tab
- Card spacing and visual hierarchy
- Loading skeletons

## Deferred Ideas

None
