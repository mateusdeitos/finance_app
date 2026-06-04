---
phase: 24-frontend-permission-subscribe-service-worker
plan: "02"
subsystem: frontend
tags: [vitest, pure-utils, push-notifications, test-infra]
dependency_graph:
  requires: []
  provides:
    - urlBase64ToUint8Array (VAPID key decoder for SUB-01 subscribe)
    - deriveDeepLink (CTRL-03 deep-link derivation for sw.ts)
    - QueryKeys.PushSubscription (query key for Plan 04 hook)
    - NotificationsTestIds (test-id catalogue for Wave 2/3 e2e)
    - Browser-push jsdom stubs (Notification, serviceWorker, PushManager — for Wave 2 hook tests)
  affects:
    - frontend/vitest.config.ts (already widened before this plan landed)
    - frontend/vitest.setup.ts (already stubbed before this plan landed)
    - frontend/src/utils/queryKeys.ts (PushSubscription already added)
    - frontend/src/testIds/ (notifications.ts + index.ts already added)
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN cycle for pure helper functions
    - Guarded jsdom stubs via `if (!('X' in globalThis))` pattern
    - `as const` testIds catalogue per domain
key_files:
  created:
    - frontend/src/utils/urlBase64ToUint8Array.ts
    - frontend/src/utils/urlBase64ToUint8Array.test.ts
    - frontend/src/utils/pushDeepLink.ts
    - frontend/src/utils/pushDeepLink.test.ts
    - frontend/src/testIds/notifications.ts
  modified:
    - frontend/vitest.config.ts (include widened to .{ts,tsx})
    - frontend/vitest.setup.ts (browser-push stubs appended)
    - frontend/src/utils/queryKeys.ts (PushSubscription added)
    - frontend/src/testIds/index.ts (NotificationsTestIds re-export added)
decisions:
  - "urlBase64ToUint8Array: canonical 6-line helper (web.dev / MDN pattern); no library needed"
  - "deriveDeepLink: prefix-match on type string (startsWith), entity_type fallback, '/' safe default — matches CTRL-03 allow-list requirement from threat model T-24-03"
  - "Test vector fix: original VAPID key in test was 86 chars (decodes to 64 bytes, not 65); replaced with deterministic 87-char test vector (0x04 + bytes 1..64)"
metrics:
  duration: ~15 minutes
  completed: 2026-05-30
  tasks_completed: 2
  files_created: 4
  files_modified: 4
---

# Phase 24 Plan 02: Test-Infra + Pure Helpers Summary

One-liner: Widened vitest to discover `.ts` tests, stubbed browser-push jsdom globals, and shipped two pure dependency-free helpers (`urlBase64ToUint8Array`, `deriveDeepLink`) with full unit coverage — the leaf contracts that Wave 2 (sw.ts, hooks) imports.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Widen vitest config + browser-push jsdom stubs + catalogue entries | `14fb993` | Done (pre-landed) |
| 2 (RED) | Failing tests for urlBase64ToUint8Array + deriveDeepLink | `6e6a964` | Done |
| 2 (GREEN) | Implement urlBase64ToUint8Array + deriveDeepLink | `40d66a1` | Done |

## Exported Signatures (Wave 2/3 Handoff)

### `frontend/src/utils/urlBase64ToUint8Array.ts`

```ts
export function urlBase64ToUint8Array(base64String: string): Uint8Array
```

Canonical base64url → Uint8Array decoder. Adds missing `=` padding, translates `-`→`+` and `_`→`/`, then uses `atob`. Used by `usePushSubscription` subscribe path as `applicationServerKey`.

### `frontend/src/utils/pushDeepLink.ts`

```ts
export function deriveDeepLink(data: { type: string; entity_type?: string }): string
```

Maps push payload `data.type`/`data.entity_type` to an internal app route. Returns only from a fixed allow-list (`/charges`, `/transactions`, `/`) — never echoes attacker-controlled strings (T-24-03 mitigated). Import this in `src/sw.ts` (Plan 03) without any extra dependencies; the file is pure JS, no DOM beyond `atob`.

Routing table:
- `type.startsWith("charge")` → `/charges`
- `type.startsWith("split")` → `/transactions`
- `entity_type === "charge"` → `/charges` (fallback)
- `entity_type === "transaction"` → `/transactions` (fallback)
- anything else → `/` (safe default)

### `frontend/src/utils/queryKeys.ts` — `QueryKeys.PushSubscription`

```ts
export const QueryKeys = {
  // ...existing keys...
  PushSubscription: 'push-subscription',
} as const
```

Use `[QueryKeys.PushSubscription]` as the `queryKey` for the subscription-status `useQuery` in Plan 04.

### `frontend/src/testIds/notifications.ts` — `NotificationsTestIds`

```ts
export const NotificationsTestIds = {
  SwitchNotifications: 'switch_notifications',       // the Mantine Switch element
  RowNotifications: 'row_notifications',             // the containing row/Group
  HelperNotifications: 'text_notifications_helper',  // helper text below the switch
} as const
```

Re-exported from `frontend/src/testIds/index.ts` as `export { NotificationsTestIds } from "./notifications"`.

### `frontend/vitest.setup.ts` — Browser-push jsdom stubs

Three guarded stubs (only defined when absent — per-test overrides always win):
- `globalThis.Notification` — `{ permission: 'default', requestPermission: vi.fn() }`
- `navigator.serviceWorker` — `{ ready: Promise.resolve({ pushManager: { subscribe: vi.fn(), getSubscription: vi.fn().mockResolvedValue(null) } }), addEventListener: vi.fn(), removeEventListener: vi.fn() }`
- `window.PushManager` — stub class `PushManagerStub {}`

Wave 2 hook tests reassign `(globalThis.Notification as { permission: NotificationPermission }).permission = 'granted'` etc. per test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect VAPID test vector byte count**
- **Found during:** Task 2 GREEN run
- **Issue:** The test's VAPID key string was 86 base64url chars (decodes to 64 bytes), but the assertion expected 65 bytes (the correct size of an uncompressed EC P-256 point: 0x04 prefix + 32-byte X + 32-byte Y = 65 bytes). The mismatch caused a test failure.
- **Fix:** Replaced the 86-char test string with a deterministic 87-char test vector (0x04 + sequential bytes 1..64) that correctly decodes to 65 bytes. The implementation is unchanged; only the test fixture was corrected.
- **Files modified:** `frontend/src/utils/urlBase64ToUint8Array.test.ts`
- **Commit:** included in `6e6a964`

**2. [Observation] Task 1 was pre-landed**
- The `14fb993` commit already covered: vitest include widening, browser-push jsdom stubs, `QueryKeys.PushSubscription`, `NotificationsTestIds` catalogue. This plan's Task 1 verification confirmed those changes are correct and passing.

## Gate Results

| Gate | Result | Notes |
|------|--------|-------|
| `npm run build` | PASS | tsc + vite build clean |
| `npx vitest run` (new test files) | PASS | 13/13 tests |
| `npm run test:component` (full suite) | 5 PASS / 3 pre-existing FAIL | 3 failing files use `node:test` (pre-existing, unrelated) |
| `npm run lint` | PASS (0 errors) | 2 pre-existing warnings in TransactionsPage.tsx (unrelated) |

## Known Stubs

None. All helpers are fully implemented with real logic.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| T-24-03 mitigated | `pushDeepLink.ts` | `deriveDeepLink` output is a fixed allow-list of internal paths — no open redirect possible |

## Self-Check: PASSED

- `frontend/src/utils/urlBase64ToUint8Array.ts` — FOUND
- `frontend/src/utils/urlBase64ToUint8Array.test.ts` — FOUND
- `frontend/src/utils/pushDeepLink.ts` — FOUND
- `frontend/src/utils/pushDeepLink.test.ts` — FOUND
- `14fb993` chore(24-02) — FOUND
- `6e6a964` test(24-02) RED — FOUND
- `40d66a1` feat(24-02) GREEN — FOUND
