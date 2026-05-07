# Phase 14: Bulk Action Wiring & Cent-Exact Conversion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-20
**Phase:** 14-bulk-action-wiring-cent-exact-conversion
**Areas discussed:** Propagation handling, Cent conversion locus, Transfer handling, Existing-splits semantics, Last-split definition, Icon/test IDs, Dismiss behavior

---

## Propagation Drawer for Recurring Txs

| Option | Description | Selected |
|--------|-------------|----------|
| Skip propagation drawer | Splits are per-tx; propagation is awkward here. Simpler UX. | |
| Show propagation drawer when hasRecurring | Mirror category/date consistency. | ✓ |
| Show only for installment-based recurrences | Conditional logic. | |

**User's choice:** Show propagation drawer when hasRecurring
**Notes:** Consistency with category/date flows wins over the semantic argument that "splits don't propagate".

---

## Cent Conversion Locus (PAY-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Extract to a pure helper (splitMath.ts) | Easy to unit-test in Phase 15, reusable. | ✓ |
| Inline in the route handler | Closer to existing patterns, harder to test. | |
| Inline in BulkDivisionDrawer | Violates Phase 13 D-10; drawer doesn't know selected txs. | |

**User's choice:** Extract to a pure helper
**Notes:** New file `frontend/src/utils/splitMath.ts` with `splitPercentagesToCents(amount, splits)` as a pure function.

---

## Transfer Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Silent skip | Filter out `tx.type === 'transfer'` before building items. Matches BULK-02 spirit. | ✓ |
| Send splits, let backend reject | Noisy; surfaces backend-only failure. | |
| Convert transfer to expense | Out of scope. | |

**User's choice:** Silent skip

---

## Existing Splits Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Override | New splits replace old. Matches "aplicar" in issue #86. | ✓ |
| Merge (append) | Produces invalid state. | |
| Skip if already has splits | Surprising UX. | |

**User's choice:** Override

---

## Last-Split Definition (PAY-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Last row in form order | Literal issue text; deterministic. | ✓ |
| Largest-percentage row | Minimizes relative error; requires sort. | |

**User's choice:** Last row in form order

---

## Menu Icon + Test IDs

| Option | Description | Selected |
|--------|-------------|----------|
| IconArrowsSplit2 + bulk_division conventions | Per issue #86 suggestion. | |
| Same icon as import transactions bulk toolbar | User specified — checked codebase: `IconShare` used in `ImportCSVBulkToolbar.tsx:63` for split column. | ✓ |

**User's choice:** Same icon as import toolbar → resolved to `IconShare`
**Notes:** Chosen after resolving the user's pointer into the codebase. Visual consistency with existing split/"Divisão" surfaces wins over the issue's literal icon suggestion.

---

## Dismiss Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Silent exit | Mirror handleCategoryChange try/catch pattern. | ✓ |
| Show toast "Ação cancelada" | Noisy, inconsistent. | |

**User's choice:** Silent exit

---

## Claude's Discretion

- Exact Portuguese copy for progress-drawer titles (will mirror category/date conventions).
- Tooltip copy for the disabled "Divisão" menu item.
- Internal organization of `getEligibleIds()` vs a dedicated division-eligibility helper.
- Where `splitMath.test.ts` lives (planner or Phase 15 decides).

## Deferred Ideas

- Merge existing splits into bulk splits
- Skip txs that already have splits
- Convert transfers to expenses inline
- Split-specific propagation drawer variant
- Retry-failed-items button in BulkProgressDrawer
- Representative-tx preview in BulkDivisionDrawer
