---
phase: 29-frontend-chip-apply-flow
plan: 01
subsystem: api
tags: [react-query, typescript, transactions, templates]

# Dependency graph
requires:
  - phase: 27-backend-crud-api
    provides: "GET /api/transaction-templates endpoint returning { id, user_id, name, payload, created_at, updated_at }[]"
  - phase: 28-splitsettingsfields-template-mode
    provides: "SplitSettingsFields templateMode prop, ready to render TemplatePayload.split_settings"
provides:
  - "Transactions.Template / Transactions.TemplatePayload types"
  - "fetchTransactionTemplates API client (GET /api/transaction-templates)"
  - "useTransactionTemplates list query hook (select generic + invalidate)"
  - "QueryKeys.TransactionTemplates key"
affects: [29-frontend-chip-apply-flow (plan 02), 30-frontend-management-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-layer mirrors the accounts pattern exactly: raw fetch in src/api/, useQuery+useQueryClient hook in src/hooks/ returning { query, invalidate }, select generic on the hook"

key-files:
  created:
    - frontend/src/api/transactionTemplates.ts
    - frontend/src/hooks/useTransactionTemplates.ts
  modified:
    - frontend/src/types/transactions.ts
    - frontend/src/utils/queryKeys.ts

key-decisions:
  - "fetchTransactionTemplates omits the Content-Type header (GET only, matching fetchAccounts exactly, not the POST/PUT variants in accounts.ts)"

patterns-established:
  - "Template/TemplatePayload types reuse Transactions.SplitSetting and Transactions.TransactionType rather than redeclaring shapes"

requirements-completed: [APPLY-01, APPLY-02, APPLY-03, APPLY-04]

# Metrics
duration: 6min
completed: 2026-07-09
---

# Phase 29 Plan 01: Frontend Data Layer for Transaction Templates Summary

**Transactions.Template/TemplatePayload types, fetchTransactionTemplates client, and useTransactionTemplates list hook (select generic + invalidate) mirroring the accounts data-layer pattern.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-09T19:44:47Z (prior commit) / task work began ~19:45
- **Completed:** 2026-07-09T19:46:34Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Added `Transactions.TemplatePayload` and `Transactions.Template` to the `Transactions` namespace, reusing `SplitSetting`/`TransactionType` (no amount/date fields, `tag_ids: number[]`)
- Added `QueryKeys.TransactionTemplates` entry
- Created `fetchTransactionTemplates` API client mirroring `accounts.ts`'s GET wrapper exactly
- Created `useTransactionTemplates` list query hook mirroring `useAccounts` (select generic, `invalidate`, 5-min staleTime)

## Task Commits

Each task was committed atomically:

1. **Task 1: Types + QueryKeys** - `e782ade` (feat)
2. **Task 2: API client + list query hook** - `0f304dc` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `frontend/src/types/transactions.ts` - Added `TemplatePayload` and `Template` interfaces to the `Transactions` namespace
- `frontend/src/utils/queryKeys.ts` - Added `TransactionTemplates: 'transaction-templates'`
- `frontend/src/api/transactionTemplates.ts` - New: `fetchTransactionTemplates()` GET client
- `frontend/src/hooks/useTransactionTemplates.ts` - New: `useTransactionTemplates<T>(select?)` list query hook

## Decisions Made
- `fetchTransactionTemplates` mirrors `fetchAccounts` precisely (no `Content-Type` header on the GET, `credentials: 'include'` only) rather than the plan's inline sketch which included a `Content-Type` header — matching the environment note to mirror `accounts.ts` exactly took precedence over the plan's literal code block.

## Deviations from Plan

None (Rule 1 minor precision fix) - the plan's action block sketch of `fetchTransactionTemplates` included a `Content-Type: application/json` header, but `frontend/src/api/accounts.ts`'s `fetchAccounts` (the GET pattern this plan explicitly says to mirror "exactly") omits it for GET requests. Followed the environment note and the read `accounts.ts` file over the plan's illustrative snippet. No functional impact — the endpoint has no request body to type.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Read-only data layer (types, API client, query hook, query key) is complete and typechecks/lints clean.
- Plan 02 (TemplateQuickChips UI + apply logic) can consume `useTransactionTemplates` and `Transactions.Template`/`TemplatePayload` directly.
- No mutation hooks exist yet (out of scope per Phase 29 CONTEXT — deferred to Phase 30).

---
*Phase: 29-frontend-chip-apply-flow*
*Completed: 2026-07-09*
