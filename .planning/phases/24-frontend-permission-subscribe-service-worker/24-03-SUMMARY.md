---
phase: 24-frontend-permission-subscribe-service-worker
plan: "03"
subsystem: frontend
tags: [vite-plugin-pwa, injectManifest, service-worker, push-notifications, workbox]
dependency_graph:
  requires:
    - deriveDeepLink (from Plan 02, src/utils/pushDeepLink.ts)
  provides:
    - src/sw.ts (custom SW: precache + auth-boot cache + push + notificationclick)
    - vite.config.ts (injectManifest strategy, src/sw.ts target)
    - postMessage contract: { type: "NAVIGATE", url: string } (consumed by Plan 05)
key_files:
  created:
    - frontend/src/sw.ts
  modified:
    - frontend/vite.config.ts
decisions:
  - "injectManifest strategy: strategies:'injectManifest', srcDir:'src', filename:'sw.ts'"
  - "workbox devDeps: NOT needed — workbox-* types resolve transitively via vite-plugin-pwa"
  - "push handler: renders payload.title/body as-is (D-24-2); tag = entity_type-entity_id for deduplication"
  - "notificationclick: focus+postMessage({type:'NAVIGATE', url}) else openWindow(url)"
  - "postMessage shape: { type: 'NAVIGATE', url: string } — url from deriveDeepLink (fixed allow-list)"
metrics:
  duration: ~15 minutes
  completed: 2026-05-30
  tasks_completed: 2
  files_created: 1
  files_modified: 1
commits:
  - d102220  feat(24-03): switch vite-plugin-pwa to injectManifest strategy pointing at src/sw.ts
---

# Phase 24 Plan 03: injectManifest + custom sw.ts Summary

One-liner: Converted vite-plugin-pwa from generateSW to injectManifest, authored `src/sw.ts` with precache, the preserved auth-boot NetworkFirst cache, navigateFallback, push handler (SC4), notificationclick handler (CTRL-03), and SKIP_WAITING support.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | vite.config.ts — generateSW → injectManifest | `d102220` | Done |
| 2 | src/sw.ts — precache + auth-boot cache + push + click | `d102220` | Done |

## postMessage Contract (Wave 2/3 Handoff — PINNED)

Plan 05 (`useServiceWorkerNavigation` hook) MUST listen for:

```ts
// SW → page (in notificationclick handler)
client.postMessage({ type: "NAVIGATE", url: string })
```

- `type`: always the string literal `"NAVIGATE"` (case-sensitive).
- `url`: a fixed allow-list internal path from `deriveDeepLink` — one of `/charges`, `/transactions`, `/`. Never an attacker-controlled string (T-24-06 mitigated).

Page-side validation pattern (for Plan 05):
```ts
navigator.serviceWorker.addEventListener("message", (event) => {
  const msg = event.data as { type?: string; url?: string }
  if (msg?.type === "NAVIGATE" && typeof msg.url === "string" && msg.url.startsWith("/")) {
    router.navigate({ to: msg.url })
  }
})
```

## Auth-Boot Cache — Verbatim Preservation

The `workbox.runtimeCaching` block removed from `vite.config.ts` is exactly reproduced in `src/sw.ts`:

| Parameter | Value |
|-----------|-------|
| `urlPattern` | `url.pathname === "/api/auth/me" \|\| url.pathname === "/api/onboarding/status"` |
| handler | `NetworkFirst` |
| `cacheName` | `"auth-boot"` |
| `networkTimeoutSeconds` | `2` |
| `maxEntries` | `8` |
| `maxAgeSeconds` | `60 * 60 * 24` (86400) |
| cacheable statuses | `[0, 200]` |

## navigateFallback Preservation

Old generateSW config: `navigateFallback: "/index.html"`

Reimplemented in `src/sw.ts` as:
```ts
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));
```

This ensures deep-route hard refreshes still resolve the app shell (Pitfall 5 from research).

## workbox devDeps

**No new devDeps were added.** All `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-cacheable-response`, and `workbox-expiration` types resolve transitively via `vite-plugin-pwa` — no manual pinning required.

## Push Handler (SC4)

```ts
self.addEventListener("push", (event) => {
  if (!event.data) return;
  // Parses payload.title/body as-is (D-24-2)
  // tag = `${entity_type}-${entity_id}` for per-entity deduplication
  // Fallback notification on parse failure (T-24-05)
  event.waitUntil(handlePush());
});
```

Push payload shape (from Phase 23 buildPayload):
```json
{
  "title": "Nova cobrança",
  "body": "Vic te cobrou R$ 50,00: Aluguel",
  "data": { "type": "charge_received", "entity_type": "charge", "entity_id": 42 }
}
```

## Gate Results

| Gate | Result | Notes |
|------|--------|-------|
| `npm run build` | PASS | tsc + vite build clean; emits `dist/sw.js` (27 kB) |
| `npm run test:component` | PASS | 35/35 tests |
| `npm run lint` | PASS (0 errors) | 2 pre-existing warnings in TransactionsPage.tsx (unrelated) |
| `grep runtimeCaching vite.config.ts` | EMPTY | Block fully moved to sw.ts |
| `dist/sw.js` exists | YES | 27023 bytes, injectManifest output |

## Deferred UAT Checks

The following CANNOT be verified in CI and are deferred to manual device UAT (`24-HUMAN-UAT.md`):

1. **Deep-route hard refresh** — load `npm run preview`, navigate to `/charges`, hard-refresh → should resolve (navigateFallback intact, not white screen).
2. **Auth-boot cache** — DevTools → Application → Cache Storage should show `auth-boot` after visiting `/api/auth/me` or `/api/onboarding/status`.
3. **Real push render** (SC4) — real push event from backend → OS notification shows correct Portuguese title + body (no generic copy).
4. **Real tap** (SC5/CTRL-03) — tapping the notification → app opens/focuses and navigates to `/charges` or `/transactions`.

## Known Stubs

None. All handlers are fully implemented with real logic.

## Self-Check: PASSED

- `frontend/src/sw.ts` — FOUND (136 lines, > 50 min)
- `frontend/vite.config.ts` — strategies:injectManifest, filename:sw.ts, runtimeCaching:REMOVED
- `d102220` feat(24-03) — FOUND
- All verify conditions from plan tasks — PASSING
