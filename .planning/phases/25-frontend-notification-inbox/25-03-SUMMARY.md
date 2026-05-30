---
phase: 25-frontend-notification-inbox
plan: "03"
subsystem: frontend
tags: [notifications, batch-resolver, optimistic-mutations, tdd, tanstack-query]
dependency_graph:
  requires: [Phase 25 plan 01 (backend by-ids endpoints), Phase 25 plan 02 (types, QueryKeys, api/notifications.ts)]
  provides: [useResolveNotificationAmounts, useMarkNotificationRead, useMarkAllNotificationsRead, fetchChargesByIds, fetchTransactionsByIds]
  affects: [Phase 25 plans 04/05 — consume these hooks in NotificationRow and inbox UI]
tech_stack:
  added: []
  patterns: [batched useQuery (≤2 requests/page), optimistic useMutation with onMutate/onError/onSettled, InfiniteData typed cache writes]
key_files:
  modified:
    - frontend/src/api/charges.ts (fetchChargesByIds added)
    - frontend/src/api/transactions.ts (fetchTransactionsByIds added)
  created:
    - frontend/src/hooks/useResolveNotificationAmounts.ts
    - frontend/src/hooks/useResolveNotificationAmounts.test.ts
    - frontend/src/hooks/useMarkNotificationRead.ts
    - frontend/src/hooks/useMarkNotificationRead.test.tsx
    - frontend/src/hooks/useMarkAllNotificationsRead.ts
commits:
  - "71424c3 feat(25-03/task-1): batched entity-amount resolver + by-IDs api fns"
  - "14b32e7 feat(25-03/task-2): useMarkNotificationRead optimistic mutation + tests"
  - "1decbcf feat(25-03/task-3): useMarkAllNotificationsRead optimistic mutation"
decisions:
  - "InfiniteData<NotificationListResponse, unknown> typed explicitly — no `any`"
  - "onSettled invalidates only NotificationUnreadCount (cross-cutting badge); inbox-list invalidation is caller's job via onSuccess?"
  - "chargeIds/transactionIds sorted before use in queryKey so TanStack dedupes correctly across re-renders"
  - "wasUnread computed from snapshot BEFORE setQueryData so decrement logic is correct"
metrics:
  duration: ~25 minutes
  completed: 2026-05-30
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 2
---

# Phase 25 Plan 03: Wave 2 — Batch Resolver + Optimistic Mutations

Delivered the D-25-1 batched amount resolver and D-25-2 optimistic mark-read / mark-all-read mutations with full test coverage.

## What Was Built

### Task 1 — fetchChargesByIds / fetchTransactionsByIds + useResolveNotificationAmounts + tests

- `src/api/charges.ts` — `fetchChargesByIds(ids: number[]): Promise<Charges.ListResponse>`: builds `GET /api/charges?id[]=…`; returns `{ charges: [] }` early for empty input.
- `src/api/transactions.ts` — `fetchTransactionsByIds(ids: number[]): Promise<Transactions.Transaction[]>`: builds `GET /api/transactions/by-ids?id[]=…`; returns `[]` early for empty input.
- `src/hooks/useResolveNotificationAmounts.ts` — page-level resolver:
  - Collects distinct sorted id sets per entity_type from the notifications array.
  - Fires ONE `useQuery` keyed `[QueryKeys.NotificationChargesById, chargeIds]` (enabled only when `chargeIds.length > 0`).
  - Fires ONE `useQuery` keyed `[QueryKeys.NotificationTransactionsById, transactionIds]` (enabled only when `transactionIds.length > 0`).
  - Returns `Map<"entity_type:entity_id", { amount, amountState }>` — pure derivation, no useEffect.
- 11 vitest cases: ≤1 charges + ≤1 transactions per page (call-count assertions), deduplication, known/loading/missing state transitions, empty page, map key format.

### Task 2 — useMarkNotificationRead (optimistic) + tests

- `src/hooks/useMarkNotificationRead.ts`:
  - `onMutate(id)`: cancels both queries; snapshots both caches; computes `wasUnread` from snapshot; flips row in inbox InfiniteData; decrements count with `Math.max(0, count-1)` only if `wasUnread`; returns snapshot for rollback.
  - `onError`: restores both caches from ctx snapshot.
  - `onSettled`: invalidates `[QueryKeys.NotificationUnreadCount]`.
  - `onSuccess`: calls `options?.onSuccess?.()` for caller inbox-list invalidation.
  - Returns `{ mutation }` — no toast, no hardcoded inbox invalidation.
- 10 vitest cases: optimistic flip, decrement-only-if-unread, no-decrement-if-already-read, floor-at-0, full rollback on error, onSettled invalidates on both success and error, onSuccess delegation, return shape.

### Task 3 — useMarkAllNotificationsRead (optimistic)

- `src/hooks/useMarkAllNotificationsRead.ts`: mirrors Task 2's pattern.
  - `onMutate()`: cancels both, snapshots, maps ALL pages/notifications to `read: true`, zeroes count.
  - `onError`: rolls back both caches.
  - `onSettled`: invalidates `NotificationUnreadCount`.
  - `onSuccess?`: caller callback.
  - Returns `{ mutation }`.

## Gate Results

| Gate | Result |
|------|--------|
| `npm run build` (tsc -b && vite build) | PASS |
| `npm run test:component` (vitest run) | PASS — 100/100 (10 files; was 79 baseline + 21 new tests) |
| `npm run lint` | PASS — 0 errors (2 pre-existing warnings in unrelated TransactionsPage.tsx) |
| No `fetchChargeById` / `useChargeById` / singular `useResolveNotificationAmount` | CONFIRMED (grep clean) |
| Resolver makes ≤2 entity requests/page | CONFIRMED (asserted by call-count tests) |

## Deviations from Plan

None — plan executed exactly as written. `queryKeys.ts` required no changes (all 4 keys already added in Plan 02).

---

## Exported API Handoff (for Plans 25-04/05)

### `useResolveNotificationAmounts` — `frontend/src/hooks/useResolveNotificationAmounts.ts`

```ts
export type AmountState = 'known' | 'loading' | 'missing'

export type ResolvedAmount = {
  amount: number | null   // cents; only meaningful when amountState === 'known'
  amountState: AmountState
}

export function useResolveNotificationAmounts(
  notifications: Notifications.Notification[],
): Map<string, ResolvedAmount>
```

**Usage pattern (in a NotificationRow or inbox component):**

```ts
// At the page level — pass the current page's flattened notifications
const notifications = inboxQuery.data?.pages.flatMap(p => p.notifications) ?? []
const amountMap = useResolveNotificationAmounts(notifications)

// In each row — look up by "entity_type:entity_id"
const resolved = amountMap.get(`${notification.entity_type}:${notification.entity_id}`)
// resolved is { amount, amountState } or undefined (treat undefined as 'loading')

// Feed into describeNotification:
describeNotification(notification, {
  amount: resolved?.amount ?? null,
  amountState: resolved?.amountState ?? 'loading',
  partnerName,
  description,
})
```

**Key behaviours:**
- Map key format: `"charge:42"`, `"transaction:7"` — `${entity_type}:${entity_id}`.
- `amountState: 'known'` — id found in response with non-null amount.
- `amountState: 'loading'` — batch query is in-flight for this entity type.
- `amountState: 'missing'` — id was requested but absent (IDOR / soft-deleted / null amount) → `describeNotification` renders `—`.
- Fires at most 1 charges query + 1 transactions query per render cycle (TanStack dedupes; cache-first).
- Both queries disabled when the respective id-set is empty (no call made).

---

### `useMarkNotificationRead` — `frontend/src/hooks/useMarkNotificationRead.ts`

```ts
export function useMarkNotificationRead(
  options?: { onSuccess?: () => void }
): { mutation: UseMutationResult<void, Error, number> }
```

**Usage:**

```ts
const { mutation } = useMarkNotificationRead({
  onSuccess: inboxInvalidate, // from useNotificationInbox().invalidate
})

// Fire:
mutation.mutate(notificationId)
// or:
await mutation.mutateAsync(notificationId)
```

**Caller's responsibility:** provide `onSuccess` to invalidate the inbox list. The hook handles the unread-count badge reconciliation automatically in `onSettled`.

---

### `useMarkAllNotificationsRead` — `frontend/src/hooks/useMarkAllNotificationsRead.ts`

```ts
export function useMarkAllNotificationsRead(
  options?: { onSuccess?: () => void }
): { mutation: UseMutationResult<void, Error, void> }
```

**Usage:**

```ts
const { mutation } = useMarkAllNotificationsRead({
  onSuccess: inboxInvalidate,
})

// Fire (no argument):
mutation.mutate()
```

Same onSuccess pattern as `useMarkNotificationRead`. Optimistically sets every loaded page row to `read: true` and zeroes the count; rolls back on error; invalidates count on settled.
