---
phase: 30-frontend-management-ui
plan: 01
subsystem: ui
tags: [react, typescript, tanstack-query, vitest, react-hook-form]

# Dependency graph
requires:
  - phase: 29-frontend-chip-apply-flow
    provides: Transactions.Template/TemplatePayload types, fetchTransactionTemplates + useTransactionTemplates query hook, buildTemplateFormPatch (the inverse builder)
provides:
  - createTransactionTemplate / updateTransactionTemplate / deleteTransactionTemplate API client functions
  - useCreateTransactionTemplate / useUpdateTransactionTemplate / useDeleteTransactionTemplate mutation hooks (`{ mutation }`, caller-owned onSuccess/invalidation)
  - buildTemplatePayloadFromForm(values, tags) — pure TransactionFormValues -> Transactions.TemplatePayload builder
affects: [30-02-frontend-management-ui, 30-03-frontend-management-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mutation hooks return { mutation } only; invalidation stays the caller's job (mirrors useCategories.ts)"
    - "Pure form->payload builders live beside their inverse in components/transactions/form/ (buildTemplatePayload.ts next to applyTemplate.ts)"

key-files:
  created:
    - frontend/src/components/transactions/form/buildTemplatePayload.ts
    - frontend/src/components/transactions/form/buildTemplatePayload.test.tsx
  modified:
    - frontend/src/api/transactionTemplates.ts
    - frontend/src/hooks/useTransactionTemplates.ts

key-decisions:
  - "split_settings rows are mapped explicitly (connection_id/percentage/amount/date) with date: s.date ?? undefined rather than assigning values.split_settings directly, because TransactionFormValues' split date is string | null | undefined (zod .nullable().optional()) while Transactions.SplitSetting.date is string | undefined — a direct assignment fails tsc"
  - "DELETE error handling parses the JSON error body (data.message ?? fallback) like POST/PUT, diverging from the plan's illustrative snippet which used a flat 'Failed to delete template' string with no body parsing — matches categories.ts's actual DELETE behavior"

patterns-established:
  - "Write-side data layer plans (API + hooks + pure builder) can land fully independent of any UI, ready for two downstream consumer plans"

requirements-completed: []  # MNG-01/MNG-02 need 30-02/30-03 (the actual UI) before they are truly satisfied; this plan only unblocks them

# Metrics
duration: ~15min
completed: 2026-07-10
---

# Phase 30 Plan 01: Template Mutation Data Layer Summary

**Create/update/delete API client functions, three `{ mutation }` hooks, and a pure `buildTemplatePayloadFromForm` builder that mirrors `buildTransactionPayload`'s transfer handling and drops tag names with no matching tag — 5 vitest cases including a round-trip check against `buildTemplateFormPatch`.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-10T19:05:00Z (approx)
- **Completed:** 2026-07-10T19:19:54Z
- **Tasks:** 3
- **Files modified:** 4 (2 modified, 2 created)

## Accomplishments
- `src/api/transactionTemplates.ts` gained `createTransactionTemplate` (POST, 201), `updateTransactionTemplate` (PUT /:id, 204), `deleteTransactionTemplate` (DELETE /:id, 204) — all mirroring `categories.ts`'s fetch options and `data.message ?? fallback` error parsing.
- `src/hooks/useTransactionTemplates.ts` gained three mutation hooks (`useCreateTransactionTemplate`, `useUpdateTransactionTemplate`, `useDeleteTransactionTemplate`), each returning `{ mutation }` with a caller-supplied `onSuccess` — the existing query hook + `invalidate` are untouched.
- New pure `buildTemplatePayloadFromForm(values, tags)` in `src/components/transactions/form/buildTemplatePayload.ts` — the inverse of Phase 29's `buildTemplateFormPatch` — converts `TransactionFormValues` into `Transactions.TemplatePayload`, resolving tag names to ids (dropping unmatched names), never emitting `amount`/`date`, and handling transfers (no `category_id`/`split_settings`, `destination_account_id` set).
- 5 vitest cases in `buildTemplatePayload.test.tsx` cover: full expense payload with tags+split, dropped unmatched tag, transfer branch, empty tags/split producing `undefined` (not `[]`), and a round-trip sanity check through `buildTemplateFormPatch`.

## Task Commits

Each task was committed atomically:

1. **Task 1: API client create/update/delete** - `a031ace` (feat)
2. **Task 2: Mutation hooks** - `239deef` (feat)
3. **Task 3: buildTemplatePayloadFromForm + unit tests** - `76ae12e` (feat)

**Plan metadata:** _pending_ (docs: complete plan)

## Files Created/Modified
- `frontend/src/api/transactionTemplates.ts` - added create/update/delete API client fns
- `frontend/src/hooks/useTransactionTemplates.ts` - added three mutation hooks alongside the existing query hook
- `frontend/src/components/transactions/form/buildTemplatePayload.ts` - pure form-values -> TemplatePayload builder (new file)
- `frontend/src/components/transactions/form/buildTemplatePayload.test.tsx` - 5 vitest cases (new file)

## Decisions Made
- `split_settings` rows are mapped field-by-field (`connection_id`, `percentage`, `amount`, `date: s.date ?? undefined`) instead of assigning `values.split_settings` verbatim, to normalize the form schema's `date: string | null | undefined` down to `TemplatePayload`'s `string | undefined` — otherwise `tsc` rejects the assignment. Mirrors the existing per-row date normalization already present in `buildTransactionPayload.ts` (minus the `values.date` fallback, since templates carry no date).
- `deleteTransactionTemplate` parses the JSON error body (`data.message ?? 'Failed to delete template'`) rather than the plan's illustrative flat-string variant, to stay byte-for-byte consistent with `categories.ts`'s actual `deleteCategory` implementation (which does the same body-parse on its DELETE).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Explicit split_settings mapping instead of direct assignment**
- **Found during:** Task 3 (buildTemplatePayloadFromForm)
- **Issue:** The plan's illustrative code assigned `values.split_settings` directly to `TemplatePayload.split_settings`. `TransactionFormValues.split_settings[].date` is typed `string | null | undefined` (zod `.nullable().optional()`), while `Transactions.SplitSetting.date` is `string | undefined` — a direct assignment fails `tsc` (`null` not assignable).
- **Fix:** Mapped each split row explicitly, converting `date: s.date ?? undefined`, matching the existing pattern in `buildTransactionPayload.ts`.
- **Files modified:** `frontend/src/components/transactions/form/buildTemplatePayload.ts`
- **Verification:** `npx tsc --noEmit` exits 0; vitest case "builds a payload for an expense with tags + split" passes.
- **Committed in:** `76ae12e` (Task 3 commit)

**2. [Rule 1 - Bug] DELETE error body parsing to match categories.ts exactly**
- **Found during:** Task 1 (API client)
- **Issue:** The plan's illustrative `deleteTransactionTemplate` snippet threw a flat `new Error("Failed to delete template")` with no body parsing, diverging from `categories.ts`'s `deleteCategory`, which parses `data.message ?? fallback` on all three verbs including DELETE.
- **Fix:** Added the same `res.json().catch(() => ({}))` + `data.message ?? 'Failed to delete template'` parsing to `deleteTransactionTemplate`, per the plan's own instruction to "match categories.ts's exact error-body parsing... if it reads differently, follow that."
- **Files modified:** `frontend/src/api/transactionTemplates.ts`
- **Verification:** `npx tsc --noEmit` exits 0.
- **Committed in:** `a031ace` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bug/consistency fixes, no scope creep)
**Impact on plan:** Both auto-fixes keep the implementation type-safe and byte-consistent with the categories.ts mirror the plan explicitly called for. No architectural changes.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 30-02 (TemplateForm + TemplatesManagementDrawer + toolbar entry point) can now consume `useCreateTransactionTemplate`/`useUpdateTransactionTemplate`/`useDeleteTransactionTemplate` and `buildTemplatePayloadFromForm` directly.
- 30-03 (Save-as-template action) has the same data layer available; no additional data-layer work needed before either plan starts.
- MNG-01/MNG-02 remain "Pending" in REQUIREMENTS.md — they are only satisfied once the UI (30-02/30-03) lands; this plan is purely the data-layer foundation.

---
*Phase: 30-frontend-management-ui*
*Completed: 2026-07-10*
