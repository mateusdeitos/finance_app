# Phase 11: Backend Validation & Propagation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 11-backend-validation-propagation
**Areas discussed:** Validation strategy, Category propagation, Tags behavior, Edge cases

---

## Validation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Single error (Recommended) | One error like "linked transactions can only edit date, description, and category" | ✓ |
| Per-field errors | Return separate error for each disallowed field | |
| You decide | Claude picks approach fitting existing patterns | |

**User's choice:** Single error
**Notes:** Simple, clear, consistent with current error patterns.

---

## Category propagation

| Option | Description | Selected |
|--------|-------------|----------|
| Same as description (Recommended) | Copy category to all linked transactions | |
| Only own side | Category only changes on user's transaction, not partner's | ✓ |
| You decide | Claude picks based on existing code | |

**User's choice:** Only own side — "it should propagate only for the user, because users have different categories"
**Notes:** Users have different category sets, so cross-user category propagation doesn't make sense.

---

## Tags behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Allow tags (Recommended) | Tags are personal metadata, let users edit on linked transactions | ✓ |
| Restrict tags | Stick strictly to requirements (date, description, category only) | |

**User's choice:** Allow tags
**Notes:** Consistent with category being allowed — both are personal metadata.

---

## Edge cases — Propagation settings

| Option | Description | Selected |
|--------|-------------|----------|
| Same behavior (Recommended) | Propagation settings apply identically for linked transactions | |
| Current only | Force propagation=current for linked transactions | |

**User's choice:** Same behavior, but only for transactions the user owns — should not affect partner transactions
**Notes:** "Edit my side only" principle established.

## Edge cases — Partner date shifting

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, shift partner dates (Recommended) | Keep existing behavior | |
| Only own dates | Only shift editing user's installment dates | ✓ |

**User's choice:** Only own dates
**Notes:** Consistent with "edit my side only" principle.

---

## Claude's Discretion

- Implementation approach for linked transaction detection
- Refactoring strategy for validation check
- Error tag naming

## Deferred Ideas

None
