# Phase 11: Backend Validation & Propagation - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The backend correctly enforces that only date, description, category, and tags are editable on linked transactions, and propagates those changes using existing diff-based logic. Changes only affect the editing user's own transactions — never the partner's side.

</domain>

<decisions>
## Implementation Decisions

### Validation strategy
- **D-01:** Relax the blanket `ErrChildTransactionCannotBeUpdated` block in `validateUpdateTransactionRequest`. Instead of rejecting all edits when `GetSourceTransactionIDs` returns IDs, check which fields the request is changing.
- **D-02:** Allowed fields for linked transactions: `date`, `description`, `category_id`, `tags`, `propagation_settings`. All other fields (`amount`, `account_id`, `transaction_type`, `recurrence_settings`, `split_settings`, `destination_account_id`) must be nil/empty or return an error.
- **D-03:** Single error message when disallowed fields are present: "linked transactions can only edit date, description, category, and tags". One error, not per-field.

### Category propagation
- **D-04:** Category propagates only to the editing user's own installments in the recurrence series. It does NOT propagate to partner's linked transactions — users have different categories.
- **D-05:** This is different from description propagation (which currently copies to all linked transactions). Category is user-specific like tags.

### Tags behavior
- **D-06:** Tags are allowed when editing linked transactions. Tags are personal metadata, consistent with category being allowed.
- **D-07:** Tags already propagate to same-user linked transactions in the existing code (lines 114-118 of transaction_update.go). No change needed for tag propagation logic.

### Propagation scope for linked transactions
- **D-08:** Propagation settings (all/current/current_and_future) work the same way as regular transactions, BUT only affect the editing user's own installments. Partner's transactions/installments are never modified.
- **D-09:** Date changes on linked transactions only shift the editing user's installment dates. Partner's linked transaction dates are NOT shifted. This differs from the current behavior where `own.LinkedTransactions[i].Date` is also shifted (lines 101-103).
- **D-10:** Description changes on linked transactions only update the editing user's installments. Same principle — "edit my side only".

### Claude's Discretion
- Implementation approach for detecting "is this a linked transaction edit" vs "is this a regular edit"
- Whether to refactor the validation check inline or extract a helper function
- Error tag naming for the new validation error

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Transaction update logic
- `backend/internal/service/transaction_update.go` — Core update logic, validation, propagation, linked transaction handling
- `backend/internal/service/transaction_update.go:934` — `validateUpdateTransactionRequest` — the validation function to modify
- `backend/internal/service/transaction_update.go:76-118` — Propagation loop where date/description/category/tags are applied

### Domain model
- `backend/internal/domain/transaction.go:120-132` — `TransactionUpdateRequest` struct — defines all updateable fields
- `backend/internal/domain/transaction.go` — `TransactionPropagationSettings` type and constants

### Error system
- `backend/pkg/errors/errors.go:124` — `ErrChildTransactionCannotBeUpdated` — current blanket error to be replaced/modified

### Linked transactions
- `backend/internal/repository/transaction_repository.go:319` — `GetSourceTransactionIDs` — determines if a transaction is a linked child
- `backend/migrations/20260203120000_linked_transactions_and_drop_parent_id.up.sql` — Linked transactions table schema

### Requirements
- `.planning/REQUIREMENTS.md` — VAL-01, VAL-02, PROP-01 requirements for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shouldUpdateTransactionBasedOnPropagationSettings` (line 699): Already handles all/current/current_and_future filtering — reuse directly
- `fetchRelatedTransactions` (line 885): Fetches installments based on propagation — reuse directly
- Date diff logic (line 31-32): `dateDiffDays` calculation already exists
- Description propagation (lines 106-111): Pattern to follow for category (but user-only)

### Established Patterns
- Pointer fields in `TransactionUpdateRequest`: nil means "don't change", non-nil means "set to this value"
- `ErrorTag` system for fine-grained error categorization
- `pkgErrors.NewWithTag` for creating domain-specific errors

### Integration Points
- `validateUpdateTransactionRequest` is the single entry point for update validation
- The propagation loop (lines 76-150) is where field changes are applied to each transaction
- `GetSourceTransactionIDs` is the mechanism to detect linked transactions

</code_context>

<specifics>
## Specific Ideas

- "Edit my side only" principle: linked transaction edits never affect the partner's data. Consistent with v1.2 silent skip approach for bulk actions.
- Users have different categories, so category cannot propagate cross-user.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-backend-validation-propagation*
*Context gathered: 2026-04-18*
