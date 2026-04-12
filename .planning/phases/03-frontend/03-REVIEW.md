---
phase: 03-frontend
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - frontend/src/types/transactions.ts
  - frontend/src/components/transactions/form/transactionFormSchema.ts
  - frontend/src/utils/buildTransactionPayload.ts
  - frontend/src/components/transactions/form/RecurrenceFields.tsx
  - frontend/src/components/transactions/CreateTransactionDrawer.tsx
  - frontend/src/components/transactions/UpdateTransactionDrawer.tsx
  - frontend/src/routes/_authenticated.transactions_.import.tsx
  - frontend/src/components/transactions/import/ImportReviewRow.tsx
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Eight files covering the transaction form refactor (recurrence settings, import flow) were reviewed. There are no critical security or data-loss bugs. The recurrence validation logic in `transactionFormSchema.ts` is sound for the standard create/update flow: the `superRefine` guards run before the `!` non-null assertions in `buildTransactionPayload.ts`, making those safe in the happy path.

Four warnings were found, all of which can cause silent incorrect behaviour or runtime errors under plausible user interactions:

1. The `RecurrencePopover` in the import flow does not sync `recurrenceEnabled` back to the parent form when the popover closes, breaking the validation path that `applySharedRefinements` relies on.
2. `parsedRowToFormValues` always initialises `recurrenceCurrentInstallment` to `null`, losing data the backend may have provided.
3. `buildTransactionPayload` falls back to `"monthly"` for `recurrenceType` when the value is `null`, silently masking a validation gap.
4. `UpdateTransactionDrawer` uses `transaction_recurrence_id` (numeric) to gate propagation display, but seeds `recurrenceEnabled` from `transaction_recurrence?.id` — a mismatch that can show or hide the propagation selector incorrectly when the two fields diverge.

---

## Warnings

### WR-01: `RecurrencePopover.handleClose` does not update `recurrenceEnabled` in the parent form

**File:** `frontend/src/components/transactions/import/ImportReviewRow.tsx:416-421`

**Issue:** `handleClose` writes `recurrenceType`, `recurrenceCurrentInstallment`, and `recurrenceTotalInstallments` back to the parent row, but never updates `recurrenceEnabled`. The import schema's `superRefine` delegates to `applySharedRefinements`, which gates all recurrence field validation on `data.recurrenceEnabled`. If a user opens the popover, sets a recurrence type, then closes it, `recurrenceEnabled` remains whatever value was set at parse time (`!!r.recurrence_type`). More importantly, if a row was parsed without a recurrence type (`recurrenceEnabled: false`) and the user then configures one via the popover, `recurrenceEnabled` stays `false`. Validation will never check the recurrence fields, so `buildPayload` (line 91) will skip the recurrence block entirely — the user's input is silently dropped.

**Fix:**
```ts
function handleClose() {
  const values = localForm.getValues();
  const rowPath = namePrefix.slice(0, -1);
  parentForm.setValue(`${rowPath}.recurrenceEnabled`, values.recurrenceType != null);
  parentForm.setValue(`${rowPath}.recurrenceType`, values.recurrenceType);
  parentForm.setValue(`${rowPath}.recurrenceCurrentInstallment`, values.recurrenceCurrentInstallment);
  parentForm.setValue(`${rowPath}.recurrenceTotalInstallments`, values.recurrenceTotalInstallments);
}
```

---

### WR-02: `parsedRowToFormValues` drops `recurrenceCurrentInstallment` supplied by the backend

**File:** `frontend/src/routes/_authenticated.transactions_.import.tsx:122`

**Issue:** `ParsedImportRow` has `recurrence_count` mapped to `recurrenceTotalInstallments`, but there is no backend field for current installment in the parsed row — the mapping unconditionally sets `recurrenceCurrentInstallment: null`. This is intentional given the current API shape, but the downstream consequence is that every imported recurring row requires the user to manually open the popover and fill in the current installment before the form is valid. If the user does not notice this, clicking "Confirm" will either fail validation (good) or, if validation is bypassed, send `current_installment: 0` to the API. The real risk is that `buildPayload` (line 91) wraps recurrence only when `recurrenceCurrentInstallment != null`, so a row with `recurrenceEnabled: true` and `recurrenceCurrentInstallment: null` will silently skip sending recurrence settings even though the total installments was parsed. This creates an inconsistency between what the CSV declared and what gets created.

**Fix:** Either pre-populate `recurrenceCurrentInstallment` with `1` as a sensible default when `recurrence_type` is present, or add a dedicated validation error in `applySharedRefinements` (which already does check for this) that surfaces clearly in the import UI. Pre-populating `1` is the lower-friction choice:

```ts
recurrenceCurrentInstallment: r.recurrence_type ? 1 : null,
```

---

### WR-03: `buildTransactionPayload` silently falls back to `"monthly"` when `recurrenceType` is `null`

**File:** `frontend/src/utils/buildTransactionPayload.ts:29`

**Issue:** Inside the `recurrence_settings` branch (reached only when `values.recurrenceEnabled` is `true`), the type is written as `values.recurrenceType ?? "monthly"`. At this point validation has already confirmed `recurrenceType` is non-null (via `applySharedRefinements`), so the fallback is effectively dead in the create/update flow. However, `buildTransactionPayload` is a shared utility. If it is ever called from a context that bypasses Zod validation (e.g. a test harness, a future refactor), a null recurrence type will be silently converted to `"monthly"` rather than surfacing as an error. The `!` assertions on lines 30-31 would also fire in that same scenario, causing a runtime crash, while the type field would not.

**Fix:** Assert the type instead of coalescing, consistent with the surrounding `!` assertions:

```ts
type: values.recurrenceType!,
current_installment: values.recurrenceCurrentInstallment!,
total_installments: values.recurrenceTotalInstallments!,
```

This makes all three fields fail the same way if the utility is misused, rather than masking one of them.

---

### WR-04: `isRecurring` and `recurrenceEnabled` use different source fields in `UpdateTransactionDrawer`

**File:** `frontend/src/components/transactions/UpdateTransactionDrawer.tsx:60,70`

**Issue:** The form's `recurrenceEnabled` default is derived from `!!transaction.transaction_recurrence?.id` (line 60), while the `isRecurring` flag that controls rendering the `UpdatePropagationSelector` is derived from `transaction.transaction_recurrence_id != null` (line 70). These can disagree when `transaction_recurrence_id` is set but `transaction_recurrence` was not embedded in the response (a lazy-loaded relationship). In that case `isRecurring` would be `true` (propagation selector shown), but `recurrenceEnabled` would be `false` (form initialised as non-recurring), and the submitted payload would include `propagation_settings` but no `recurrence_settings` — an inconsistent update request.

**Fix:** Use the same source field for both. The safer choice is `transaction_recurrence_id` since it is always present even without the embedded relation:

```ts
recurrenceEnabled: transaction.transaction_recurrence_id != null,
```

---

## Info

### IN-01: `importRowFormSchema` does not validate `date` non-emptiness for `action === "import"`

**File:** `frontend/src/components/transactions/form/importFormSchema.ts:8,18-23`

**Issue:** `date` is `z.string()` with no `.min(1)`. `applySharedRefinements` does not check `date`. An import row marked "import" with a blank date (e.g. the backend failed to parse it) will pass schema validation and reach `createTransaction` with an empty string date. The server will reject it, but the client-side UX gives no pre-submit hint to the user.

**Fix:** Add a date non-empty check inside the `superRefine`:
```ts
if (data.action === "import" && !data.date) {
  ctx.addIssue({ code: "custom", message: "Data é obrigatória", path: ["date"] });
}
```

---

### IN-02: `TransactionRecurrence` type in `transactions.ts` is not aligned with `RecurrenceSettings`

**File:** `frontend/src/types/transactions.ts:52-59`

**Issue:** The `TransactionRecurrence` interface (lines 52-59) models the embedded relation returned by the list API. It has `installments` but no `current_installment`. `RecurrenceSettings` (lines 140-144) models the create/update payload with both `current_installment` and `total_installments`. `UpdateTransactionDrawer` correctly reads `installment_number` from the top-level `Transaction` for the current installment (line 62), but if a future consumer reads `transaction_recurrence.current_installment` it will get a type error and have to reach for a different field. The asymmetry between `installments` (singular concept on the relation) and `total_installments` (payload concept) makes this easy to confuse.

**Fix:** No immediate code change required, but consider renaming `TransactionRecurrence.installments` to `total_installments` to match the payload vocabulary, or adding a JSDoc comment explaining that `current_installment` comes from `Transaction.installment_number`.

---

### IN-03: `useWatch` on `rows` in `ImportReviewPage` re-runs on every keystroke

**File:** `frontend/src/routes/_authenticated.transactions_.import.tsx:146-153`

**Issue:** The `useWatch` with `compute` on line 146 subscribes to the entire `rows` array. With many import rows, every keystroke in any text field re-runs the compute function across all rows. This is a code smell that could degrade perceived performance on large imports (the stated limit is 100 rows). This is noted as info rather than warning because it is a performance concern, which is out of v1 scope — but it is worth flagging because the `compute` callback only needs `action` and `import_status`, not the full row objects.

**Fix:** Watch only the fields actually needed, or use a selector-based approach that avoids subscribing to all row data.

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
