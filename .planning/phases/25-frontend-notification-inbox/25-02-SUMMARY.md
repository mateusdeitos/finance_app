---
phase: 25-frontend-notification-inbox
plan: "02"
subsystem: frontend
tags: [notifications, query-hooks, api-client, types, pure-function, tdd, pt-BR]
dependency_graph:
  requires: [Phase 23 inbox endpoints (GET /api/notifications, GET /api/notifications/unread-count, POST /:id/read, POST /read-all)]
  provides: [Notifications namespace, QueryKeys notification entries, api/notifications.ts, useNotificationInbox, useNotificationUnreadCount, describeNotification, NotificationsTestIds inbox ids]
  affects: [Phase 25 plans 03/04/05 — consume these exports directly]
tech_stack:
  added: []
  patterns: [useInfiniteQuery cursor pagination, refetchInterval polling without useEffect, pure copy builder with amountState pattern, TDD red/green]
key_files:
  created:
    - frontend/src/types/notifications.ts
    - frontend/src/api/notifications.ts
    - frontend/src/hooks/useNotificationInbox.ts
    - frontend/src/hooks/useNotificationUnreadCount.ts
    - frontend/src/components/notifications/describeNotification.ts
    - frontend/src/components/notifications/describeNotification.test.ts
  modified:
    - frontend/src/utils/queryKeys.ts (4 new entries added)
    - frontend/src/testIds/notifications.ts (12 inbox keys added to 3 Phase-24 keys)
decisions:
  - "amountState 'missing' for charge_received uses no-amount template fallback + dash substitution (matching reference impl in notif-inbox-components.jsx line 21 and UI-SPEC dash rule)"
  - "QueryKeys intentionally omits TransactionById/ChargeById per CONTEXT.md D-25-1 superseded-design avoidance"
  - "useNotificationInbox returns { query, invalidate } without select generic — infinite query pages have no standard single-type select shape; consumers flatten via query.data.pages.flatMap"
metrics:
  duration: ~30 minutes
  completed: 2026-05-30
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 2
---

# Phase 25 Plan 02: Frontend Notification Inbox Data Foundation Summary

Delivered the complete Phase 25 Wave-1 frontend data foundation: Notifications namespace, 4 QueryKeys entries, the inbox API client, inbox testIds, infinite-list and unread-count query hooks, and the pure `describeNotification` copy builder with 15-case vitest suite.

## What Was Built

### Task 1 — Types, QueryKeys, API client, testIds (pre-committed)

Already committed as `5c336b6 feat(25-02/task-1)`. Confirmed complete:
- `frontend/src/types/notifications.ts` — `Notifications` namespace with 5 types
- `frontend/src/utils/queryKeys.ts` — 4 new entries added; NO `TransactionById`/`ChargeById`
- `frontend/src/api/notifications.ts` — 4 export functions matching Phase 23 contract
- `frontend/src/testIds/notifications.ts` — 3 Phase-24 keys + 12 inbox keys (including parametric factories)

### Task 2 — useNotificationInbox + useNotificationUnreadCount hooks

- `useNotificationInbox`: `useInfiniteQuery` with `initialPageParam: ''` and `getNextPageParam: (last) => last.has_more ? last.next_cursor : undefined`. Returns `{ query, invalidate }`. Consumers flatten via `query.data.pages.flatMap(p => p.notifications)`.
- `useNotificationUnreadCount`: `useQuery` with `refetchInterval: 60_000`, `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`, typed `select` generic. Returns `{ query, invalidate }`. The 60s poll is a query option, NOT a useEffect.

### Task 3 — describeNotification pure function + tests (TDD)

- `describeNotification(n, ctx)` — pure TypeScript, no React/hooks/fetch. Builds pt-BR description strings per type × amountState. Uses `formatBalance` for BRL formatting.
- 15 vitest cases covering every type (charge_received, charge_accepted, split_created, split_updated) × amountState (known/loading/missing) + fallbacks (null partnerName, unknown type).
- Full test suite: 79/79 pass (was 64 baseline + 15 new).

## Gate Results

| Gate | Result |
|------|--------|
| `npm run build` (tsc -b && vite build) | PASS |
| `npm run test:component` | PASS — 79/79 (8 files) |
| `npm run lint` | PASS — 0 errors (2 pre-existing warnings in unrelated files) |
| QueryKeys has no TransactionById/ChargeById | CONFIRMED |

## Deviations from Plan

None — plan executed exactly as written.

One minor note on `describeNotification.test.ts`: the `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment was added for the unknown-type test case cast — this is intentional (testing the fallback for an invalid type value).

## Known Stubs

None. All functions are wired to real endpoints and real data.

## Threat Surface Scan

No new server surface introduced. T-25-06 (XSS via notification copy): `describeNotification` output is plain text; no HTML string returned. T-25-07 (poll storm): `refetchIntervalInBackground: false` implemented as required.

---

## Exported API Handoff (for Plans 25-03/04/05)

### `Notifications` namespace — `frontend/src/types/notifications.ts`

```ts
export namespace Notifications {
  export type NotificationType = 'charge_received' | 'charge_accepted' | 'split_created' | 'split_updated'
  export type EntityType = 'charge' | 'transaction'
  export type Notification = {
    id: number
    type: NotificationType
    entity_type: EntityType
    entity_id: number
    read: boolean
    created_at: string // ISO 8601
  }
  export type NotificationListResponse = {
    notifications: Notification[]
    next_cursor: string
    has_more: boolean
  }
  export type UnreadCountResponse = { count: number }
}
```

### `QueryKeys` new entries — `frontend/src/utils/queryKeys.ts`

| Key | String value |
|-----|-------------|
| `QueryKeys.Notifications` | `'notifications'` |
| `QueryKeys.NotificationUnreadCount` | `'notification-unread-count'` |
| `QueryKeys.NotificationChargesById` | `'notification-charges-by-id'` |
| `QueryKeys.NotificationTransactionsById` | `'notification-transactions-by-id'` |

### `api/notifications.ts` function signatures

```ts
fetchNotifications({ cursor, limit }: { cursor: string; limit: number }): Promise<Notifications.NotificationListResponse>
// GET /api/notifications?cursor=<cursor>&limit=<limit> (cursor param omitted when empty string)

fetchNotificationUnreadCount(): Promise<Notifications.UnreadCountResponse>
// GET /api/notifications/unread-count

markNotificationRead(id: number): Promise<void>
// POST /api/notifications/:id/read → 204

markAllNotificationsRead(): Promise<void>
// POST /api/notifications/read-all → 204
```

### `useNotificationInbox` — `frontend/src/hooks/useNotificationInbox.ts`

```ts
function useNotificationInbox(): {
  query: UseInfiniteQueryResult<InfiniteData<Notifications.NotificationListResponse>>
  invalidate: () => Promise<void>
}
// Cursor list, newest-first. Flatten pages: query.data?.pages.flatMap(p => p.notifications)
// Pagination: query.hasNextPage, query.fetchNextPage, query.isFetchingNextPage
// queryKey: [QueryKeys.Notifications]
// initialPageParam: '' (empty string)
// getNextPageParam: (last) => last.has_more ? last.next_cursor : undefined
```

### `useNotificationUnreadCount` — `frontend/src/hooks/useNotificationUnreadCount.ts`

```ts
function useNotificationUnreadCount<T = Notifications.UnreadCountResponse>(
  select?: (data: Notifications.UnreadCountResponse) => T
): {
  query: UseQueryResult<T>
  invalidate: () => Promise<void>
}
// queryKey: [QueryKeys.NotificationUnreadCount]
// refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true
// Raw count: query.data?.count (number)
// Capped for badge: (query.data?.count ?? 0) > 9 ? '9+' : query.data?.count
```

### `describeNotification` — `frontend/src/components/notifications/describeNotification.ts`

```ts
export type AmountState = 'known' | 'loading' | 'missing'

export interface NotificationContext {
  amount: number | null    // cents (int64); only used when amountState === 'known'
  amountState: AmountState
  partnerName: string | null  // null → falls back to 'Seu parceiro(a)'
  description?: string | null // charge_received only; null → omits ': {description}'
}

export function describeNotification(
  n: Notifications.Notification,
  ctx: NotificationContext,
): string
```

**Per-type behaviour summary:**

| type | known | loading | missing |
|------|-------|---------|---------|
| charge_received | `"{who} te cobrou {amt}: {desc}"` (desc omitted if null) | `"{who} criou uma cobrança para você"` | `"{who} te cobrou —"` |
| charge_accepted | `"{who} aceitou sua cobrança de {amt}"` | `"{who} aceitou sua cobrança"` | `"{who} aceitou sua cobrança de —"` |
| split_created | `"{who} adicionou uma transação dividida de {amt}"` | `"{who} adicionou uma transação dividida"` | `"{who} adicionou uma transação dividida de —"` |
| split_updated | `"{who} atualizou uma transação dividida ({amt})"` | `"{who} atualizou uma transação dividida"` | `"{who} atualizou uma transação dividida (—)"` |
| fallback | `"Nova notificação"` | `"Nova notificação"` | `"Nova notificação"` |

`{amt}` = `formatBalance(ctx.amount)` from `src/utils/formatCents.ts` (e.g. `R$ 50,00` for 5000 cents).

Plans 25-03/04 pass `{ amount, amountState }` from the batch resolver output directly into this context — the shape is intentionally stable.

## Self-Check: PASSED

All 3 tasks committed, all files exist, all gates green.
