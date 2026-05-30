---
phase: 24-frontend-permission-subscribe-service-worker
plan: "04"
subsystem: frontend
tags: [push-notifications, state-machine, tanstack-query, tdd, hooks]
dependency_graph:
  requires: [24-01 (VAPID endpoint), 24-02 (urlBase64ToUint8Array, QueryKeys.PushSubscription, jsdom stubs)]
  provides:
    - fetchVapidPublicKey / fetchSubscriptionStatus / postSubscription / deleteSubscription (src/api/pushSubscriptions.ts)
    - usePushSubscriptionStatus (TanStack Query wrapper for GET /api/push-subscriptions?endpoint=)
    - usePushSubscription (5-state machine: default|requesting|enabled|denied|unsupported)
    - NotificationState type
    - notificationHelperText(state, surface) standalone helper
  affects:
    - Plan 05: NotificationToggleRow component consumes usePushSubscription + notificationHelperText
tech_stack:
  added: []
  patterns:
    - 5-state machine derived synchronously during render (no useEffect for state)
    - TanStack Query enabled-gate pattern for permission-aware queries
    - CTRL-01: requestPermission only inside onToggle on user gesture
    - notificationHelperText OD-3 short/full surface variant
key_files:
  created:
    - frontend/src/api/pushSubscriptions.ts
    - frontend/src/api/pushSubscriptions.test.ts
    - frontend/src/hooks/usePushSubscriptionStatus.ts
    - frontend/src/hooks/usePushSubscription.ts
    - frontend/src/hooks/usePushSubscription.test.tsx
decisions:
  - "State derived synchronously during render — no useEffect for unsupported/denied detection"
  - "localEnabled: boolean|null bridges optimistic-free subscribe/unsubscribe without query flip"
  - "urlBase64ToUint8Array(key) as unknown as BufferSource — TS 5.9 ArrayBufferLike variance workaround"
  - "notificationHelperText exported as standalone function for Plan 05 to call with surface variant"
metrics:
  completed_date: "2026-05-30"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 24 Plan 04: Push API Client + usePushSubscription State Machine Summary

Push notifications non-visual logic: raw fetch API client (4 functions, 11 tests) + `usePushSubscriptionStatus` TanStack query + `usePushSubscription` 5-state machine (29 tests, CTRL-01 enforced).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Push API client (src/api/pushSubscriptions.ts) + tests | 98e729c | src/api/pushSubscriptions.ts, src/api/pushSubscriptions.test.ts |
| 2 | usePushSubscription state machine + status query (with tests) | 49f84d2 | src/hooks/usePushSubscriptionStatus.ts, src/hooks/usePushSubscription.ts, src/hooks/usePushSubscription.test.tsx |

## Hook Public API (Handoff for Plan 05)

### `usePushSubscription()` return value

```ts
type NotificationState = 'default' | 'requesting' | 'enabled' | 'denied' | 'unsupported'

interface UsePushSubscriptionResult {
  /** Current 5-state machine state */
  state: NotificationState
  /** Trigger subscribe (from default) or unsubscribe (from enabled). Noop in all other states. */
  onToggle: () => void
  /** Returns the helper copy string for the current state and surface. */
  helperText: (surface: 'mobile' | 'desktop') => string
}
```

### `NotificationState` type

```ts
export type NotificationState = 'default' | 'requesting' | 'enabled' | 'denied' | 'unsupported'
```

Exported from `frontend/src/hooks/usePushSubscription.ts`.

### `notificationHelperText(state, surface)`

```ts
export function notificationHelperText(
  state: NotificationState,
  surface: 'mobile' | 'desktop',
): string
```

Exported from `frontend/src/hooks/usePushSubscription.ts`.

OD-3 copy table (verbatim):

| State | `mobile` (short) | `desktop` (full) |
|-------|-----------------|------------------|
| `default` | "Toque para ativar" | "Toque para ativar" |
| `requesting` | "Aguardando..." | "Aguardando permissão..." |
| `enabled` | "Ativadas" | "Ativadas neste dispositivo" |
| `denied` | "Bloqueadas pelo navegador" | "Bloqueadas — ative nas configurações do navegador" |
| `unsupported` | "Não suportado" | "Não suportado neste navegador" |

### Usage in Plan 05 component

```tsx
import { usePushSubscription } from '@/hooks/usePushSubscription'

function NotificationToggleRow({ surface }: { surface: 'mobile' | 'desktop' }) {
  const { state, onToggle, helperText } = usePushSubscription()
  return (
    <Group>
      <Switch
        checked={state === 'enabled'}
        disabled={state === 'requesting' || state === 'denied' || state === 'unsupported'}
        onChange={onToggle}
      />
      <Text>{helperText(surface)}</Text>
    </Group>
  )
}
```

## State Machine Behavior

| State | Switch checked | Switch disabled | Triggered by |
|-------|---------------|-----------------|-------------|
| `unsupported` | false | true | `!('serviceWorker' in navigator) \|\| !('PushManager' in window)` |
| `denied` | false | true | `Notification.permission === 'denied'` |
| `requesting` | false | true | `pending === true` (in-flight async) |
| `enabled` | true | false | `localEnabled === true \|\| statusQuery.data?.subscribed === true` |
| `default` | false | false | Everything else |

## CTRL-01 Compliance

`Notification.requestPermission()` is called **only** inside `onToggle()` when `state === 'default'`. It is **never** called:
- On mount
- In any `useEffect`
- In any other state transition

This is enforced by 2 dedicated tests in `usePushSubscription.test.tsx`.

## Verification Gates

| Gate | Result |
|------|--------|
| `npx vitest run src/api/pushSubscriptions.test.ts` | PASS (11 tests) |
| `npx vitest run src/hooks/usePushSubscription.test.tsx` | PASS (29 tests) |
| `npm run test:component` (full suite) | PASS (64 tests across 7 files) |
| `npm run build` (tsc + vite) | PASS |
| `npm run lint` | PASS (0 errors; 2 pre-existing warnings in TransactionsPage.tsx) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Uint8Array ArrayBufferLike vs ArrayBuffer TypeScript 5.9 variance**
- **Found during:** `npm run build` (tsc step)
- **Issue:** `urlBase64ToUint8Array(key)` returns `Uint8Array<ArrayBufferLike>`, but `PushSubscriptionOptionsInit.applicationServerKey` expects `BufferSource | null | undefined` which resolves to `ArrayBufferView<ArrayBuffer>`. TypeScript 5.9's stricter generic constraints reject the cast.
- **Fix:** Used `as unknown as BufferSource` double cast with an inline comment explaining the variance issue.
- **Files modified:** `frontend/src/hooks/usePushSubscription.ts`
- **Commit:** 49f84d2

**2. [Rule 1 - Bug] Test state bleed: setRequestPermissionResult set Notification.permission immediately**
- **Found during:** First test run of `usePushSubscription.test.tsx`
- **Issue:** Helper `setRequestPermissionResult('denied')` was immediately setting `Notification.permission = 'denied'`, causing the hook to synchronously derive `denied` state before the toggle fired. The test `waitFor(() => state === 'default')` then timed out.
- **Fix:** Rewrote the helper to keep `permission: 'default'` and instead use `mockImplementation` that calls `setNotificationPermission(result)` when the promise resolves — matching browser behavior.
- **Files modified:** `frontend/src/hooks/usePushSubscription.test.tsx`
- **Commit:** 49f84d2

## Known Stubs

None. All logic is fully implemented with real browser APIs and the fetch wrappers.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| T-24-08 mitigated | `usePushSubscription.ts` | `Notification.requestPermission()` only ever called inside `onToggle()` when `state === 'default'` — CTRL-01 fully satisfied, enforced by unit test |

## Self-Check: PASSED

- `frontend/src/api/pushSubscriptions.ts` — FOUND
- `frontend/src/api/pushSubscriptions.test.ts` — FOUND
- `frontend/src/hooks/usePushSubscriptionStatus.ts` — FOUND
- `frontend/src/hooks/usePushSubscription.ts` — FOUND
- `frontend/src/hooks/usePushSubscription.test.tsx` — FOUND
- Commits 98e729c (feat 24-04 api), 49f84d2 (feat 24-04 state machine) — FOUND in git log
