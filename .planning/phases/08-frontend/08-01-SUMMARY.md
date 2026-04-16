---
phase: 08-frontend
plan: "01"
subsystem: frontend-data-layer
tags: [charges, api-client, hooks, typescript, react-query]
dependency_graph:
  requires: []
  provides:
    - charges-data-layer
    - charges-types
    - charges-api-client
    - charges-query-hooks
    - charges-mutation-hooks
  affects:
    - frontend/src/types/charges.ts
    - frontend/src/api/charges.ts
    - frontend/src/hooks/useCharges.ts
    - frontend/src/hooks/useChargesPendingCount.ts
    - frontend/src/hooks/useCreateCharge.ts
    - frontend/src/hooks/useAcceptCharge.ts
    - frontend/src/hooks/useRejectCharge.ts
    - frontend/src/hooks/useCancelCharge.ts
    - frontend/src/utils/queryKeys.ts
    - frontend/src/utils/apiErrors.ts
tech_stack:
  added: []
  patterns:
    - TanStack Query query/mutation hooks
    - TypeScript namespace for domain types
    - fetch with credentials: include for cookie auth
key_files:
  created:
    - frontend/src/types/charges.ts
    - frontend/src/api/charges.ts
    - frontend/src/hooks/useCharges.ts
    - frontend/src/hooks/useChargesPendingCount.ts
    - frontend/src/hooks/useCreateCharge.ts
    - frontend/src/hooks/useAcceptCharge.ts
    - frontend/src/hooks/useRejectCharge.ts
    - frontend/src/hooks/useCancelCharge.ts
  modified:
    - frontend/src/utils/queryKeys.ts
    - frontend/src/utils/apiErrors.ts
decisions:
  - Mutation hooks return { mutation } only with no invalidation logic — call sites own invalidation per CLAUDE.md rule
  - useChargesPendingCount has 60s staleTime to reduce badge poll frequency
  - Mutations throw raw Response (not new Error) for field-level error mapping via parseApiError
metrics:
  duration: ~8 minutes
  completed: "2026-04-16T12:56:30Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 8
  files_modified: 2
---

# Phase 8 Plan 01: Charges Data Layer Summary

**One-liner:** Charges data layer with TypeScript namespace, 6 API client functions, 6 React Query hooks, extended QueryKeys, and CHARGE.* error tag mappings.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create types, API client, and query keys | b09c950 | charges.ts, api/charges.ts, queryKeys.ts |
| 2 | Create all hooks and extend error mappings | c9f57b6 | 6 hook files, apiErrors.ts |

## What Was Built

**Types (`frontend/src/types/charges.ts`):**
- `Charges` namespace with `ChargeStatus`, `Direction`, `Charge`, `FetchParams`, `ListResponse`, `CreateChargePayload`, `AcceptChargePayload`
- All fields mirror `backend/internal/domain/charge.go` exactly

**API Client (`frontend/src/api/charges.ts`):**
- `fetchCharges(params)` — GET /api/charges with month/year/direction query params
- `fetchChargesPendingCount()` — GET /api/charges/pending-count
- `createCharge(payload)` — POST /api/charges, returns Response (throws raw Response on error)
- `acceptCharge(id, payload)` — POST /api/charges/:id/accept
- `rejectCharge(id)` — POST /api/charges/:id/reject
- `cancelCharge(id)` — POST /api/charges/:id/cancel
- All calls use `credentials: 'include'` for cookie auth

**Query Keys (`frontend/src/utils/queryKeys.ts`):**
- Added `Charges: 'charges'`
- Added `ChargesPendingCount: 'charges-pending-count'`

**Hooks:**
- `useCharges(params)` — parameterized query, returns `{ query, invalidate }`
- `useChargesPendingCount()` — parameterless query with 60s staleTime, returns `{ query, invalidate }`
- `useCreateCharge()` — returns `{ mutation }`
- `useAcceptCharge()` — accepts `{ id, payload }` variables, returns `{ mutation }`
- `useRejectCharge()` — id-only mutation, returns `{ mutation }`
- `useCancelCharge()` — id-only mutation, returns `{ mutation }`

**Error Mappings (`frontend/src/utils/apiErrors.ts`):**
- `CHARGE.INVALID_CONNECTION_ID` → `connection_id`
- `CHARGE.CONNECTION_NOT_ACCEPTED` → `connection_id`
- `CHARGE.INVALID_ACCOUNT_ID` → `my_account_id`
- `CHARGE.INVALID_PAYER` → `_general`
- `CHARGE.CHARGE_NOT_PENDING` → `_general`
- `CHARGE.AMOUNT_MUST_BE_POSITIVE` → `amount`

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

No new network endpoints or auth paths introduced. All API calls follow existing patterns (credentials: include, cookie auth enforced by backend JWT middleware). No new trust boundaries.

## Known Stubs

None. This plan creates a pure data layer with no UI rendering — no stub values flow to any component.

## Self-Check: PASSED

All 10 files present:
- FOUND: frontend/src/types/charges.ts
- FOUND: frontend/src/api/charges.ts
- FOUND: frontend/src/hooks/useCharges.ts
- FOUND: frontend/src/hooks/useChargesPendingCount.ts
- FOUND: frontend/src/hooks/useCreateCharge.ts
- FOUND: frontend/src/hooks/useAcceptCharge.ts
- FOUND: frontend/src/hooks/useRejectCharge.ts
- FOUND: frontend/src/hooks/useCancelCharge.ts
- FOUND: frontend/src/utils/queryKeys.ts
- FOUND: frontend/src/utils/apiErrors.ts

Commits verified:
- b09c950: feat(08-01): create charges types, API client, and query keys
- c9f57b6: feat(08-01): create charge hooks and extend apiErrors tag mappings

TypeScript: passes with no errors (`tsc --noEmit`)
