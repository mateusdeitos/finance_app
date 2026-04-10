# Phase 3: Frontend — Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the recurrence UI and type system: remove `end_date` toggle + `repetitions` input, add two always-visible number inputs ("Parcela atual", "Total de parcelas"). Align TypeScript types, form schema, payload builder, and import form.

No new capabilities — this is a surgical replacement of five specific files/constructs.

</domain>

<decisions>
## Implementation Decisions

### D-01: Input Layout
Two `NumberInput` components rendered **side-by-side in a `Group`** (same pattern used elsewhere for related controls). `min={1}` for both. No toggle or conditional rendering — both inputs are always visible when recurrence type is selected.

### D-02: Field Names (Schema)
Replace in `transactionFormSchema.ts` (`baseTransactionFields`):
- `recurrenceEndDateMode: z.boolean()` → **remove**
- `recurrenceEndDate: z.string().nullable()` → **remove**
- `recurrenceRepetitions: z.number().int().nullable()` → **remove**

Add:
- `recurrenceCurrentInstallment: z.number().int().nullable()`
- `recurrenceTotalInstallments: z.number().int().nullable()`

### D-03: Validation Error Message
In `applySharedRefinements`, when `recurrenceCurrentInstallment > recurrenceTotalInstallments`:

Error message: **`"Parcela atual não pode ser maior que o total"`**
Path: `["recurrenceCurrentInstallment"]`

### D-04: TypeScript Type Update
In `src/types/transactions.ts`, `Transactions.RecurrenceSettings` interface:
- Remove: `repetitions?: number`
- Remove: `end_date?: string`
- Add: `current_installment: number`
- Add: `total_installments: number`

### D-05: Payload Builder
In `buildTransactionPayload.ts`, the recurrence object sent to the API:
- Remove: `repetitions` and `end_date` fields
- Add: `current_installment: values.recurrenceCurrentInstallment`
- Add: `total_installments: values.recurrenceTotalInstallments`

### D-06: Import Form — Full Update
Update both schema AND UI:
- `importFormSchema.ts` uses `baseTransactionFields` — gets new fields automatically once D-02 is done
- Remove any direct references to `recurrenceEndDate`, `recurrenceRepetitions`, `recurrenceEndDateMode` in import schema
- `RecurrenceFields.tsx` renders new inputs for import rows via `namePrefix` — no separate import UI needed

### D-07: RecurrenceFields.tsx Replacement
Remove:
- `Switch` for "Usar data de término" (`recurrenceEndDateMode`)
- Conditional `DatePickerInput` for `recurrenceEndDate`
- `NumberInput` for `recurrenceRepetitions`

Add (inside `<Stack gap="sm">`, after the type Select):
```tsx
<Group gap="sm">
  <Controller
    control={control}
    name={`${namePrefix}recurrenceCurrentInstallment`}
    render={({ field }) => (
      <NumberInput
        label="Parcela atual"
        min={1}
        value={(field.value as number | null) ?? ""}
        onChange={(val) => field.onChange(val === "" ? null : Number(val))}
        error={fieldError("recurrenceCurrentInstallment")}
        style={{ flex: 1 }}
      />
    )}
  />
  <Controller
    control={control}
    name={`${namePrefix}recurrenceTotalInstallments`}
    render={({ field }) => (
      <NumberInput
        label="Total de parcelas"
        min={1}
        value={(field.value as number | null) ?? ""}
        onChange={(val) => field.onChange(val === "" ? null : Number(val))}
        error={fieldError("recurrenceTotalInstallments")}
        style={{ flex: 1 }}
      />
    )}
  />
</Group>
```

### Claude's Discretion
- Default values for new fields in `CreateTransactionDrawer` and `UpdateTransactionDrawer` (null is safe default)
- Whether `UpdateTransactionDrawer` pre-fills from `transaction_recurrence.installments` — check existing pattern for `recurrenceRepetitions` and replicate

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Files Being Modified
- `frontend/src/types/transactions.ts` — `Transactions.RecurrenceSettings` interface
- `frontend/src/utils/buildTransactionPayload.ts` — payload construction
- `frontend/src/components/transactions/form/transactionFormSchema.ts` — `baseTransactionFields`, `applySharedRefinements`
- `frontend/src/components/transactions/form/RecurrenceFields.tsx` — UI component
- `frontend/src/components/transactions/form/importFormSchema.ts` — import schema

### Related Files (read for context, not modified)
- `frontend/src/components/transactions/CreateTransactionDrawer.tsx` — initializes form defaults; check how `recurrenceRepetitions` is defaulted
- `frontend/src/components/transactions/UpdateTransactionDrawer.tsx` — pre-fills from existing transaction; check how recurrence fields are mapped
- `frontend/CLAUDE.md` — frontend-specific project guidelines

### Requirements
- `FE-01` through `FE-06` in `.planning/REQUIREMENTS.md`

</canonical_refs>

<specifics>
## Specific Implementation Details

- Labels are in **Portuguese**: "Parcela atual" (current installment), "Total de parcelas" (total installments)
- Both inputs use `min={1}` — current_installment must be ≥ 1
- Layout: `<Group gap="sm">` with `style={{ flex: 1 }}` on each input for equal width
- Validation error path: `["recurrenceCurrentInstallment"]` (surface error on the first input)
- Error message: `"Parcela atual não pode ser maior que o total"`
- The `namePrefix` prop on `RecurrenceFields` handles import reuse — no separate import component needed

</specifics>

<deferred>
## Deferred Ideas

None — PRD covers phase scope.

</deferred>

---

*Phase: 03-frontend*
*Context gathered: 2026-04-10 via /gsd-discuss-phase*
