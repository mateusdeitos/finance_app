# Phase 24: Frontend Permission, Subscribe & Service Worker - Research

**Researched:** 2026-05-30
**Domain:** Browser Web Push API + Service Worker plumbing in a React 19 / Vite 6 / Mantine 9 / vite-plugin-pwa 1.x SPA, wiring to an already-built Go backend.
**Confidence:** HIGH (codebase + backend contract verified by direct read; library API verified against vite-plugin-pwa 1.3.0 + official docs/WebSearch). One BLOCKER (VAPID public-key delivery) requires a cross-layer task.

> Note: no `24-CONTEXT.md` exists for this phase (only Phase 23 has one). There are therefore no locked user decisions to honor beyond the APPROVED `24-UI-SPEC.md`, which acts as the design contract. The UI-SPEC's "Design Reference (LOCKED)" section and Interaction Behavior / Initial state resolution blocks are treated with the same authority as locked decisions.

## Summary

Phase 24 is browser-plumbing work: register a custom service worker that can receive `push` events and handle `notificationclick`, ask for Notification permission **only** on an explicit toggle tap, subscribe the current device via `PushManager.subscribe()`, and sync that subscription with the three backend endpoints already shipped in Phase 22 (`POST`/`DELETE`/`GET /api/push-subscriptions`). The visible surface (a 5-state `Switch` row in the mobile "Mais" drawer and the desktop user menu) is fully specified by the APPROVED `24-UI-SPEC.md`; this research covers the HOW of the plumbing, not the UI design.

The single hard blocker is **VAPID public-key delivery**: `pushManager.subscribe()` requires the VAPID *public* key as `applicationServerKey` (a `Uint8Array`), but today no frontend env var or backend endpoint exposes it — the backend only holds it server-side in `cfg.VAPID.PublicKey` (`VAPID_PUBLIC_KEY`, base64url-encoded uncompressed EC P-256 point, verified in `backend/internal/config/config.go:71`). The recommendation is a tiny cross-layer addition: a backend `GET /api/push-subscriptions/vapid-public-key` handler returning `{ "key": "<base64url>" }`. This keeps the key co-located with the backend env that already manages it (Cloud Run secret), avoids a second source of truth, and survives key rotation without a frontend rebuild.

The second decision is the **service-worker strategy**. The current `vite.config.ts` uses `generateSW` (Workbox auto-generates the SW), which does **not** let you author custom `push`/`notificationclick` handlers. Phase 24 must switch to **`injectManifest`**: a hand-written `src/sw.ts` that calls `precacheAndRoute(self.__WB_MANIFEST)`, reimplements the existing `auth-boot` NetworkFirst runtime cache via `workbox-routing`/`workbox-strategies`, and adds the push handlers. Registration already flows through `PWAUpdateNotifier.tsx`'s `useRegisterSW` (`virtual:pwa-register/react`) with `injectRegister: false` — that component is unchanged; only the build strategy and the SW source change.

**Primary recommendation:** Switch vite-plugin-pwa to `injectManifest` with `src/sw.ts`; add a backend `GET /api/push-subscriptions/vapid-public-key` endpoint (cross-layer task, BLOCKER); build a `usePushSubscription` hook as the 5-state machine the UI-SPEC describes; derive deep-link URLs inside the SW from the Phase-23 payload's `data.type` (the payload has NO `url` field — verified). Zero new runtime dependencies; add `@types/...` only via the workbox types already pulled in by vite-plugin-pwa.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Permission prompt (CTRL-01) | Browser / Client | — | `Notification.requestPermission()` is a browser API; must fire only on user gesture |
| Push subscription create/remove (SUB-01/02) | Browser / Client | API / Backend | `PushManager.subscribe()` runs in the page; the resulting endpoint/keys are POST/DELETE'd to the backend |
| Subscription persistence (upsert per user+device) | API / Backend | Database | Already shipped Phase 22 — `POST/DELETE/GET /api/push-subscriptions` |
| VAPID public key supply | API / Backend | Browser / Client | Key lives in backend env (Cloud Run secret); frontend consumes it as `applicationServerKey` — **needs new endpoint** |
| Push receipt + OS notification render (SC4) | Browser / Client (Service Worker) | — | `push` event fires in the SW; `self.registration.showNotification()` renders OS UI |
| Push delivery (server → push service) | API / Backend | — | Already shipped Phase 23 (`notification_service.go` `s.sender.Send(...)`) — out of scope |
| Deep-link navigation on click (CTRL-03) | Browser / Client (SW + page) | — | SW `notificationclick` focuses/opens a client; page navigates via TanStack Router on `postMessage` |
| Toggle UI + 5-state machine (CTRL-02) | Browser / Client | — | Mantine `Switch` row + `usePushSubscription` hook; pure client state derived from permission + backend GET |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-01 | Grant permission + register Web Push subscription for current device | `usePushSubscription` subscribe path: `requestPermission()` → `pushManager.subscribe({ userVisibleOnly:true, applicationServerKey })` → `POST /api/push-subscriptions` with `{ endpoint, keys:{p256dh,auth} }` (matches `domain.SubscribePushRequest`). VAPID key from new GET endpoint (BLOCKER). |
| SUB-02 | Turn off → remove device subscription on server | unsubscribe path: `subscription.unsubscribe()` (browser) + `DELETE /api/push-subscriptions?endpoint=<url-encoded>`. UI-SPEC: stay `enabled` on API error. |
| CTRL-01 | Permission asked only via explicit in-app action, never on load | `requestPermission()` is called **only** inside the Switch `onChange` handler when transitioning from `default`. No `useEffect`-on-mount permission call. Initial state derives from `Notification.permission` + backend GET, no prompt. |
| CTRL-02 | See + toggle on/off state for current device | 5-state machine (`default`/`requesting`/`enabled`/`denied`/`unsupported`) rendered as a Mantine `Switch` row in `MobileMoreDrawer` + `DesktopSidebar`. State derived in `usePushSubscription`. |
| CTRL-03 | Clicking a delivered push opens app focused on the related entity | SW `notificationclick` → `clients.matchAll` → focus + `postMessage({url})` OR `clients.openWindow(url)`. URL derived from payload `data.type` → `/charges` or `/transactions` (Phase 24 lands on list page, not entity drawer — UI-SPEC §Surface 4). |

Backend SUB-03 (persist) / SUB-04 (delivery) shipped in Phases 22/23 — out of scope.
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Root + `frontend/CLAUDE.md` directives the planner MUST enforce:

- **No `fetch`/`axios` inside components/pages/effects.** API calls live in `src/api/`, consumed by hooks in `src/hooks/`. The push API client goes in `src/api/pushSubscriptions.ts`. [VERIFIED: frontend/CLAUDE.md §3]
- **Every query is a hook returning `{ query, invalidate }`; every mutation a hook returning `{ mutation }`** — invalidation is the caller's responsibility (no hard-coded `onSuccess` invalidations in the mutation hook). [VERIFIED: frontend/CLAUDE.md §3]
- **Query keys come from `QueryKeys` in `src/utils/queryKeys.ts`** — no magic strings. Add a `PushSubscription` key. [VERIFIED: src/utils/queryKeys.ts]
- **Derived state from queries goes through a `select` callback**, not `useMemo`/filter in the component. Query hooks expose `select?: (data) => T`. [VERIFIED: frontend/CLAUDE.md §3]
- **`useEffect` is a last resort; ZERO `useEffect` in components.** When genuinely needed (e.g. SW `message` listener for deep-link nav), encapsulate in a named hook under `src/hooks/`. The UI-SPEC explicitly says "No `useEffect` in the component — the state derivation lives in `usePushSubscription`." [VERIFIED: frontend/CLAUDE.md §4 + UI-SPEC §Initial state resolution]
- **TypeScript: `any` banned.** Use `unknown` + narrowing. Service-worker globals need typed `self` (`ServiceWorkerGlobalScope`). [VERIFIED: frontend/CLAUDE.md §7]
- **Components small + folder-by-domain.** New `NotificationToggleRow` → `src/components/notifications/`. CSS Modules colocated. Never declare helper components inside a page body. [VERIFIED: frontend/CLAUDE.md §6]
- **`data-testid` only for e2e; centralized in `src/testIds/`, re-exported from `index.ts`.** Add `src/testIds/notifications.ts`. Switch interactions in e2e MUST use `SwitchField` from `e2e/helpers/formFields.ts`. [VERIFIED: frontend/CLAUDE.md §E2E]
- **Mantine `Switch` aria-labels per UI-SPEC; 44px touch target; validate at 375px first.** [VERIFIED: UI-SPEC §Accessibility/Mobile-first]
- **Backend additions (the VAPID endpoint):** handler thin, business logic in service, godoc annotations + `just generate-docs`, route in `cmd/server/main.go`. Money/time conventions N/A here. [VERIFIED: backend/CLAUDE.md]

## Backend Contract (VERIFIED by direct read)

Auth'd under `/api` (cookie or bearer), routes in `backend/cmd/server/main.go:207-211`:

| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | `/api/push-subscriptions` | `domain.SubscribePushRequest`: `{ endpoint: string, keys: { p256dh: string, auth: string } }` | `204` (upsert per user+device) |
| DELETE | `/api/push-subscriptions?endpoint=<url-encoded>` | — | `204` |
| GET | `/api/push-subscriptions?endpoint=<url-encoded>` | — | `200` `domain.PushSubscriptionStatusResponse`: `{ "subscribed": boolean }` |

[VERIFIED: backend/internal/handler/push_subscription_handler.go, backend/internal/domain/push_subscription.go:14-26]

> ⚠️ UI-SPEC §Initial state resolution says the GET "returns active: true". The actual JSON field is **`subscribed`**, not `active`. The api client + hook must read `subscribed`. Flag for the planner — UI-SPEC prose is slightly off here; the backend domain struct is the source of truth.

**Push payload shape (Phase 23, VERIFIED in `backend/internal/service/notification_service.go:129-168`):**

```json
{ "title": "Finance App", "body": "<formatted pt-BR string>", "data": { "type": "charge_received", "entity_type": "charge", "entity_id": 123 } }
```

Critical implications for the SW:
- **The payload has NO `url` field.** The SW must DERIVE the deep-link URL from `data.type` (or `data.entity_type`). Do not expect `data.url`. [VERIFIED]
- **The backend already sets `title` and `body`** (title is literally `"Finance App"`; body is a fully-formatted pt-BR string like `"{actor} te cobrou R$ 50,00: {desc}"`). The SW should render `payload.title` / `payload.body` directly. **This diverges from UI-SPEC §Surface 4's per-type title/body table** — that table describes copy the backend does NOT send. Recommendation: SW uses the server-provided `title`/`body`; treat the UI-SPEC copy table as aspirational/superseded by the shipped Phase-23 strings. Flag as Open Question OQ-1.
- `entity_type` is `"charge"` or `"transaction"`; `entity_id` is the int. Use these to build the `tag` (`"charge-{id}"` / `"transaction-{id}"`) and the deep-link.

## Standard Stack

### Core (all already installed — VERIFIED in frontend/package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite-plugin-pwa | ^1.2.0 (latest 1.3.0) | SW build via `injectManifest`, manifest injection, `virtual:pwa-register/react` | Already the project's PWA plumbing; supports custom SW |
| workbox-precaching | (transitive via vite-plugin-pwa) | `precacheAndRoute(self.__WB_MANIFEST)`, `cleanupOutdatedCaches()` | Required by injectManifest to precache the app shell |
| workbox-routing | (transitive) | `registerRoute()` to reimplement auth-boot runtime cache | Replaces generateSW's declarative `runtimeCaching` |
| workbox-strategies | (transitive) | `NetworkFirst` for the auth-boot routes | Same strategy the current config uses |
| @tanstack/react-query | ^5.71.10 | GET subscription-status query + subscribe/unsubscribe mutations | Project convention (no raw fetch in components) |
| @mantine/core | ^9.2.1 | `Switch`, `Group`, `Text`, `Loader` for the toggle row | Project component library |
| @mantine/notifications | ^9.2.1 | `notifications.show()` toasts | Established pattern (`main.tsx` mounts `<Notifications position="top-right" autoClose={3000} />`) |
| @tabler/icons-react | ^3.40.0 | `IconBell` / `IconBellOff` | Project icon set |

> Note: the UI-SPEC header says "Mantine v7 / React 19 / Vite" but the installed versions are **Mantine ^9.2.1, Vite ^6.2.5** (VERIFIED in package.json). Use the installed versions. The Switch/Group/Text/Loader APIs referenced are stable across v7→v9; no API risk.

### Supporting (browser APIs — no install)
| API | Purpose | When to Use |
|-----|---------|-------------|
| `navigator.serviceWorker` | feature-detect + `.ready`/`.getRegistration()` to reach `pushManager` | Initial state, subscribe, status |
| `window.PushManager` | feature-detect | `unsupported` state gate |
| `Notification.permission` / `Notification.requestPermission()` | permission state + explicit request | `denied` gate (CTRL-01), subscribe trigger |
| `registration.pushManager.getSubscription()` | current endpoint for GET-status + DELETE | initial-state resolution + unsubscribe |
| `registration.pushManager.subscribe({ userVisibleOnly, applicationServerKey })` | create subscription | SUB-01 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `injectManifest` custom SW | `generateSW` + `importScripts('/push-handlers.js')` | Lets you keep declarative `runtimeCaching`, but the push script must be a separate hand-maintained file in `public/`, no TS, no bundling, no `self.__WB_MANIFEST` access, and you import an un-versioned script. injectManifest is cleaner and the official recommendation for custom event handlers. **Reject importScripts.** |
| Backend `GET vapid-public-key` endpoint | `VITE_VAPID_PUBLIC_KEY` build-time env | Build-time env requires the key baked into the bundle at build and a rebuild on rotation; it also duplicates the source of truth (backend env vs. frontend env). The key is non-secret, so either is *safe*, but the endpoint keeps one source of truth (the Cloud Run secret the backend already reads) and survives rotation. **Prefer the endpoint.** (See Decision 1.) |
| New runtime dep (e.g. `web-push` helpers) | none | All needed primitives are native browser APIs + workbox (already transitive). **Zero new runtime deps.** |

**Installation:** No new packages. Confirm workbox sub-packages resolve once `npm install` runs (they ship as transitive deps of vite-plugin-pwa 1.x). If TS can't find `workbox-*` types after switching to injectManifest, add as devDeps: `npm i -D workbox-precaching workbox-routing workbox-strategies` (pin to the version vite-plugin-pwa 1.3.0 bundles). [VERIFIED: vite-plugin-pwa 1.3.0 is latest per `npm view`]

## Architecture Patterns

### System Architecture Diagram

```
┌─ ENABLE FLOW (SUB-01, CTRL-01) ──────────────────────────────────────────┐
│ User taps Switch (default state)                                          │
│   → usePushSubscription.subscribe()                                       │
│     → Notification.requestPermission()  ── denied ──> state=denied (no    │
│            │ granted                                    toast)            │
│            ▼                                                              │
│     → GET /api/push-subscriptions/vapid-public-key  (NEW endpoint)        │
│     → urlBase64ToUint8Array(key)                                          │
│     → registration.pushManager.subscribe({userVisibleOnly,appServerKey})  │
│     → subscription.toJSON() → { endpoint, keys:{p256dh,auth} }            │
│     → POST /api/push-subscriptions  ── 204 ──> state=enabled + teal toast │
│            └── error ──> state=default + red toast                        │
└──────────────────────────────────────────────────────────────────────────┘

┌─ DISABLE FLOW (SUB-02) ───────────────────────────────────────────────────┐
│ User taps Switch (enabled state)                                           │
│   → getSubscription() → endpoint                                           │
│   → DELETE /api/push-subscriptions?endpoint=<enc>  ── 204 ──┐              │
│   → subscription.unsubscribe()                              ▼              │
│            success ──> state=default + teal toast    error ──> stay        │
│                                                       enabled + red toast  │
└────────────────────────────────────────────────────────────────────────────┘

┌─ INITIAL STATE (CTRL-02, on mount, no prompt) ────────────────────────────┐
│ !('serviceWorker' in navigator) || !('PushManager' in window) → unsupported│
│ else Notification.permission === 'denied'                     → denied      │
│ else getSubscription() endpoint → GET status (TanStack useQuery)           │
│        subscribed:true → enabled ; subscribed:false/no sub/err → default   │
└────────────────────────────────────────────────────────────────────────────┘

┌─ PUSH RECEIPT + CLICK (SC4, CTRL-03) ─ service worker (src/sw.ts) ─────────┐
│ self 'push' event → event.data.json() → {title, body, data:{type,          │
│      entity_type, entity_id}}                                              │
│   → url = deriveUrl(data)   // charge_*→/charges ; split_*→/transactions   │
│   → showNotification(title, {body, icon, badge, tag, data:{url}})          │
│                                                                            │
│ self 'notificationclick' → close() → clients.matchAll({type:'window'})     │
│   → existing client? client.focus() + client.postMessage({type:'NAV',url}) │
│   → else clients.openWindow(url)                                           │
│ page: useServiceWorkerNavigation hook listens for 'message' → router.nav   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (new + modified)

```
frontend/
├── vite.config.ts                          # MODIFY: generateSW → injectManifest
├── src/
│   ├── sw.ts                               # NEW: custom service worker (precache + auth-boot cache + push handlers)
│   ├── api/
│   │   └── pushSubscriptions.ts            # NEW: fetch wrappers (status GET, subscribe POST, unsubscribe DELETE, vapidPublicKey GET)
│   ├── hooks/
│   │   ├── usePushSubscription.ts          # NEW: 5-state machine + subscribe/unsubscribe
│   │   ├── usePushSubscriptionStatus.ts    # NEW (or inlined): TanStack useQuery for GET status
│   │   └── useServiceWorkerNavigation.ts   # NEW: 'message' listener → router.navigate (CTRL-03 page side)
│   ├── components/
│   │   └── notifications/
│   │       ├── NotificationToggleRow.tsx   # NEW
│   │       └── NotificationToggleRow.module.css   # NEW (if needed)
│   ├── components/MobileMoreDrawer.tsx     # MODIFY: add toggle row above "Sair"
│   ├── components/DesktopSidebar.tsx       # MODIFY: add toggle row in user menu above divider
│   ├── utils/
│   │   ├── urlBase64ToUint8Array.ts        # NEW: VAPID key decoder (pure → unit-testable)
│   │   ├── pushDeepLink.ts                 # NEW: deriveUrl(type) — shared by SW; pure → unit-testable
│   │   └── queryKeys.ts                    # MODIFY: add PushSubscription key
│   └── testIds/
│       ├── notifications.ts                # NEW: NotificationsTestIds
│       └── index.ts                        # MODIFY: re-export
└── e2e/
    └── tests/notifications.spec.ts         # NEW: toggle-state e2e with mocked Notification/PushManager
backend/
├── internal/handler/push_subscription_handler.go   # MODIFY: add VapidPublicKey handler (godoc)
└── cmd/server/main.go                               # MODIFY: add route GET /api/push-subscriptions/vapid-public-key
```

### Pattern 1: vite.config.ts — generateSW → injectManifest

**What:** Switch the VitePWA plugin to `strategies: 'injectManifest'` pointing at `src/sw.ts`. `registerType` and `injectRegister: false` are PRESERVED (registration still flows through `PWAUpdateNotifier`'s `useRegisterSW`). The declarative `workbox.runtimeCaching` block moves INTO `src/sw.ts` (workbox can't auto-generate runtime caching in injectManifest mode). The `manifest` block is unchanged.

```ts
// vite.config.ts — diff shape (Source: vite-pwa-org.netlify.app/guide/inject-manifest [CITED])
VitePWA({
  strategies: "injectManifest",        // NEW
  srcDir: "src",                        // NEW — where sw.ts lives
  filename: "sw.ts",                    // NEW — built to /sw.js
  registerType: "prompt",              // UNCHANGED
  injectRegister: false,               // UNCHANGED — PWAUpdateNotifier registers
  devOptions: { enabled: false },       // UNCHANGED (consider enabling for SW dev — see Pitfall 4)
  injectManifest: {                     // REPLACES the `workbox:` block's globPatterns
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
  },
  manifest: { /* UNCHANGED — name, icons, display:standalone, etc. */ },
})
```

- `workbox.cleanupOutdatedCaches` → call `cleanupOutdatedCaches()` in sw.ts.
- `workbox.navigateFallback: "/index.html"` → register a navigation route in sw.ts (or use `createHandlerBoundToURL` + `NavigationRoute`).
- `workbox.runtimeCaching` (auth-boot) → reimplement in sw.ts with `registerRoute` + `NetworkFirst` (see Pattern 2).

### Pattern 2: src/sw.ts — precache + PRESERVED auth-boot cache + push handlers

**What:** The custom SW. Reimplements every behavior the current generateSW config provides, then adds push.

```ts
// src/sw.ts  — Source pattern: vite-pwa-org.netlify.app injectManifest guide + Workbox docs [CITED]
/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

// ── 1. Precache the app shell (injected manifest) ──────────────────────────
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ── 2. navigateFallback → /index.html (was workbox.navigateFallback) ───────
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

// ── 3. PRESERVED auth-boot NetworkFirst cache (verbatim behavior of the old
//      workbox.runtimeCaching block: serve last response if Cloud Run cold-
//      start exceeds 2s, avoiding a white screen). ──────────────────────────
registerRoute(
  ({ url }) => url.pathname === "/api/auth/me" || url.pathname === "/api/onboarding/status",
  new NetworkFirst({
    cacheName: "auth-boot",
    networkTimeoutSeconds: 2,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
);

// ── 4. Web Push receipt (SC4) ──────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  // Backend payload (Phase 23 VERIFIED): { title, body, data:{type,entity_type,entity_id} }
  const payload = event.data.json() as {
    title: string; body: string;
    data: { type: string; entity_type: string; entity_id: number };
  };
  const url = deriveDeepLink(payload.data);            // pure helper, shared w/ src/utils/pushDeepLink.ts
  const tag = `${payload.data.entity_type}-${payload.data.entity_id}`; // dedupe per entity
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      data: { url },
    }),
  );
});

// ── 5. Click → focus existing client or open (CTRL-03) ─────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          void client.focus();
          client.postMessage({ type: "NAVIGATE", url });   // page navigates via TanStack Router
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// keep PWAUpdateNotifier's prompt flow working (registerType:"prompt")
self.addEventListener("message", (e) => { if (e.data?.type === "SKIP_WAITING") self.skipWaiting(); });
```

> If `workbox-cacheable-response` / `workbox-expiration` aren't resolvable, the equivalent inline plugin objects also work; but they ship with vite-plugin-pwa 1.x. Confirm at install. The `NavigationRoute`/`createHandlerBoundToURL` precache-fallback is the canonical injectManifest replacement for `navigateFallback`.

### Pattern 3: usePushSubscription — the 5-state machine

**What:** A single hook encapsulating all SW/permission/subscription logic. The component is dumb: it reads `state`, `helperText`, and calls `onToggle()`. Matches UI-SPEC §Interaction Behavior + §Initial state resolution exactly. No `useEffect` in the component; the query lives here.

```ts
// src/hooks/usePushSubscription.ts — design skeleton (Source: UI-SPEC §Interaction Behavior [CITED])
export type NotificationState = "default" | "requesting" | "enabled" | "denied" | "unsupported";

export function usePushSubscription() {
  // 1. Static feature/permission gates (sync, derived during render — no effect):
  const supported = "serviceWorker" in navigator && "PushManager" in window;
  const permissionDenied = supported && Notification.permission === "denied";

  // 2. Local override for in-flight + post-action state (NOT optimistic flip):
  const [pending, setPending] = useState(false);     // 'requesting'
  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null); // post-mutation truth

  // 3. Backend status via TanStack useQuery (only when supported && not denied):
  //    queryFn resolves the current endpoint first (getSubscription) then GETs status.
  const { query } = usePushSubscriptionStatus({ enabled: supported && !permissionDenied });

  // 4. Derive state (pure):
  const state: NotificationState =
    !supported ? "unsupported"
    : permissionDenied ? "denied"
    : pending ? "requesting"
    : (localEnabled ?? query.data?.subscribed) ? "enabled"
    : "default";

  // 5. onToggle — the ONLY place requestPermission()/subscribe() fire (CTRL-01):
  async function onToggle() {
    if (state === "default") {
      const perm = await Notification.requestPermission();   // user gesture only
      if (perm !== "granted") return;                        // → denied via re-render; no toast
      setPending(true);
      try {
        const reg = await navigator.serviceWorker.ready;
        const { key } = await fetchVapidPublicKey();          // NEW backend endpoint
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        await postSubscription(sub.toJSON());                 // POST { endpoint, keys }
        setLocalEnabled(true); notifications.show(/* teal */);
      } catch { notifications.show(/* red 'Erro ao ativar' */); }  // → default
      finally { setPending(false); }
    } else if (state === "enabled") {
      setPending(true);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await deleteSubscription(sub.endpoint); await sub.unsubscribe(); }
        setLocalEnabled(false); notifications.show(/* teal */);
      } catch { setLocalEnabled(true); notifications.show(/* red 'Erro ao desativar' */); } // stay enabled
      finally { setPending(false); }
    }
    // requesting/denied/unsupported → noop (Switch is disabled)
  }

  return { state, onToggle, helperText: HELPER[state] /* short on mobile, full on desktop */ };
}
```

Reconciliation notes the planner must honor:
- **Read `subscribed`, not `active`** from the GET response (backend field is `subscribed`).
- **Reconcile local-vs-backend drift**: if `getSubscription()` returns a local subscription but backend `subscribed:false`, the UI shows `default` (backend is truth for the toggle). Re-subscribing from `default` will POST the existing/refreshed subscription, re-upserting — safe (backend upserts per user+device). If backend says `subscribed:true` but `getSubscription()` is null (browser dropped it), unsubscribe would no-op the DELETE (no endpoint) — recommendation: still allow toggling off to clear backend state by passing the last-known endpoint from the query, or simply DELETE-by-endpoint when available and let backend prune stale on next send (the backend already prunes 404/410 endpoints — VERIFIED `notification_service.go:119-123`).
- **No optimistic flip** (UI-SPEC explicit): show `requesting`, then transition on result.

### Pattern 4: useServiceWorkerNavigation (CTRL-03 page side)

**What:** A named hook (per the no-inline-`useEffect` rule) mounted once high in the tree (e.g. in `AppLayout`) that listens for the SW's `postMessage({type:'NAVIGATE', url})` and navigates via the global `router` instance (same approach `MobileMoreDrawer` uses: `router.navigate({to})` because `useNavigate()` is unavailable outside RouterProvider in some roots).

```ts
// src/hooks/useServiceWorkerNavigation.ts
export function useServiceWorkerNavigation() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "NAVIGATE" && typeof e.data.url === "string") {
        void router.navigate({ to: e.data.url });
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);
}
```

### Anti-Patterns to Avoid
- **Calling `requestPermission()` on mount / in a `useEffect`.** Violates CTRL-01. It must be inside the toggle's `onChange`.
- **Optimistically flipping the Switch before the API confirms.** UI-SPEC forbids it; causes desync on network error.
- **Expecting `data.url` in the push payload.** It isn't there (VERIFIED). Derive it.
- **Hard-coding the VAPID key in the bundle** without a rotation story. Use the endpoint.
- **Authoring push handlers in `generateSW` mode.** Not possible; you'd be forced into `importScripts` of an un-bundled file.
- **Using Mantine/`getByRole`/`getByText` selectors in e2e.** Use `data-testid` + `SwitchField`.
- **A raw `fetch` inside the component.** All HTTP goes through `src/api/pushSubscriptions.ts` + hooks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Precaching the app shell + cache versioning | Manual `caches.open()` + addAll lists | `precacheAndRoute(self.__WB_MANIFEST)` + `cleanupOutdatedCaches()` | Workbox handles revision hashing, cleanup, integrity |
| Runtime API caching (auth-boot) | Hand-written fetch-event cache logic | `registerRoute` + `NetworkFirst` (workbox-strategies) | Preserves the exact 2s-timeout fallback behavior already proven in prod |
| SW registration + update lifecycle | `navigator.serviceWorker.register` + update polling | Existing `PWAUpdateNotifier` (`useRegisterSW`) | Already built; handles update prompts, interval checks, visibility re-check |
| VAPID key base64url→Uint8Array | (this you DO write — tiny + pure) | `urlBase64ToUint8Array` helper (below) | It's ~6 lines; no library needed, but isolate + unit-test it |
| Deriving deep-link from event type | Inline string switch in the SW only | Shared pure `deriveDeepLink(type)` in `src/utils/pushDeepLink.ts` | Unit-testable + reused by SW and any future inbox |

**urlBase64ToUint8Array helper (canonical — Source: web.dev / MDN push examples [CITED]):**

```ts
// src/utils/urlBase64ToUint8Array.ts
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}
```

**Key insight:** Everything except the two tiny pure helpers (urlBase64 decode, deep-link derivation) is provided by Workbox/vite-plugin-pwa/native APIs. Hand-rolling the SW caching layer would silently break the proven auth-boot cold-start mitigation.

## Decision Resolutions (the 6 key questions)

### Decision 1 (BLOCKER) — VAPID public-key delivery: backend endpoint
**Recommendation:** Add `GET /api/push-subscriptions/vapid-public-key` → `200 { "key": "<base64url>" }`, returning `cfg.VAPID.PublicKey`. Cross-layer task in an otherwise-frontend phase.

Rationale: (a) the key already lives server-side as a Cloud Run-managed env (`VAPID_PUBLIC_KEY`, VERIFIED `config.go:118`) — one source of truth; (b) it's non-secret, so serving it is safe (can even be unauthenticated, but slotting it under the existing authed `/api/push-subscriptions` group is simplest and consistent — no public-route wiring needed); (c) survives key rotation without a frontend rebuild, unlike `VITE_VAPID_PUBLIC_KEY`. The backend change is small: add a `VapidPublicKey` handler method (godoc-annotated), wire one route in `main.go` next to the existing three (`main.go:207-211`), run `just generate-docs`. No service/repository/migration changes. Frontend caches the key via TanStack Query (`staleTime: Infinity`).

> Reject `VITE_VAPID_PUBLIC_KEY` build-time env: duplicates the source of truth and forces a rebuild on rotation.

### Decision 2 — Service-worker strategy: `injectManifest` with `src/sw.ts`
**Recommendation:** Switch to `injectManifest` (Pattern 1 + 2). PRESERVE auth-boot NetworkFirst by reimplementing it with `registerRoute` + `NetworkFirst` in sw.ts (exact same `cacheName`, `networkTimeoutSeconds:2`, expiration). Registration is UNCHANGED — `PWAUpdateNotifier`'s `useRegisterSW(virtual:pwa-register/react)` continues to register `/sw.js` with `injectRegister:false`. Reject `importScripts` (un-bundled, un-typed, no manifest access).

### Decision 3 — Subscription lifecycle + endpoint identity
**Recommendation:** Initial state per UI-SPEC §Initial state resolution (unsupported → denied → GET status → enabled/default), implemented in `usePushSubscription` (Pattern 3). Resolve the endpoint for the status GET and DELETE via `(await navigator.serviceWorker.ready).pushManager.getSubscription()`. Subscribe with `{ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }`. Backend upserts per user+device, so re-subscribing is idempotent; handle local-vs-backend drift by treating backend `subscribed` as the toggle's truth (see Pattern 3 reconciliation notes). Read field **`subscribed`** (not `active`).

### Decision 4 — notificationclick deep-link routing (CTRL-03)
**Recommendation:** SW handler (Pattern 2 §5): `clients.matchAll({type:'window', includeUncontrolled:true})` → focus first client + `postMessage({type:'NAVIGATE', url})`; else `clients.openWindow(url)`. Page listens via `useServiceWorkerNavigation` (Pattern 4) and calls `router.navigate({to:url})`. The URL is DERIVED from the payload's `data.type`/`data.entity_type` (payload has NO `url` field — VERIFIED): `charge_received`/`charge_accepted` → `/charges`; `split_created`/`split_updated` → `/transactions`. Phase 24 lands on the LIST page, not an entity drawer (UI-SPEC §Surface 4 explicit).

### Decision 5 — Testing approach (honest about limits)
**Recommendation:** Three tiers (detail in Validation Architecture below):
- **Unit (vitest, jsdom):** `urlBase64ToUint8Array` (pure), `deriveDeepLink` (pure), the state-derivation logic of `usePushSubscription` (with `Notification`/`navigator.serviceWorker`/`PushManager` mocked), and `src/api/pushSubscriptions.ts` functions with `fetch` mocked. These give real coverage of the risky logic.
- **Playwright e2e:** toggle-state rendering and the `onChange → requestPermission` gate, using `context.grantPermissions(['notifications'])` for the granted path and stubbing `window.PushManager`/`navigator.serviceWorker.ready.pushManager.subscribe` via `page.addInitScript` so no real push service is needed. Assert state transitions via the `data-testid`s and helper-text testid. Match `theme-toggle.spec.ts` (scope to the dropdown to avoid duplicate-testid strict-mode violations on desktop+mobile). Use `SwitchField` from `e2e/helpers/formFields.ts`.
- **Manual / device UAT (deferred):** actual OS notification render + tap on a real device, and iOS (which requires the PWA be installed to Home Screen — see Pitfall 1). No real push delivery is automatable here (no push service in the Docker-less/CI env, and Phase 23 delivery is server-side). Add to a `24-HUMAN-UAT.md`-style checklist.

### Decision 6 — Library choices: zero new runtime deps
**Recommendation:** No new runtime dependency. Use native browser APIs + the already-installed vite-plugin-pwa (`virtual:pwa-register/react` for registration) + transitive `workbox-precaching`/`-routing`/`-strategies`. TS: the SW file needs `/// <reference lib="webworker" />` + `declare const self: ServiceWorkerGlobalScope` (DOM lib already includes ServiceWorker types; `vite-plugin-pwa/client` is already referenced in `src/vite-env.d.ts`). If `workbox-*` types don't resolve after the strategy switch, add them as **devDependencies** pinned to vite-plugin-pwa 1.3.0's bundled versions.

## Common Pitfalls

### Pitfall 1: iOS Web Push requires the PWA installed to Home Screen
**What goes wrong:** On iOS Safari, `Notification`/`PushManager` are unavailable in the browser tab; push only works when the app is added to the Home Screen (installed PWA), since iOS 16.4. A user testing in mobile Safari will hit the `unsupported` state and assume it's broken.
**Why it happens:** Apple gates Web Push to standalone Home Screen web apps. [VERIFIED: WebSearch — magicbell.com, webpush-ios-example, multiple sources agree]
**How to avoid:** The manifest already has `display: standalone` + 192/512 icons (VERIFIED `vite.config.ts`), which satisfies the prerequisite. Document in UAT that iOS testing must use the installed PWA. The `unsupported` state copy ("Não suportado neste navegador") correctly covers iOS-in-browser.
**Warning signs:** Toggle shows `unsupported` on iPhone Safari but works on Android Chrome.

### Pitfall 2: `event.data.json()` throws / payload mismatch
**What goes wrong:** SW `push` handler assumes a shape; if `event.data` is null (some push services send empty pushes) or the backend body changes, `.json()` throws and the push is silently dropped.
**Why it happens:** `userVisibleOnly:true` requires a visible notification per push; a thrown handler shows nothing → Chrome may show a generic "site updated in background" notification and penalize the origin.
**How to avoid:** Guard `if (!event.data) return;` and wrap `.json()` in try/catch with a generic fallback notification. Use the VERIFIED Phase-23 shape `{title, body, data:{type,entity_type,entity_id}}` and render `payload.title`/`payload.body` directly.
**Warning signs:** Generic "background update" OS notifications; pushes that never render.

### Pitfall 3: Stale/orphaned subscriptions and local-vs-backend drift
**What goes wrong:** Browser silently invalidates a `PushSubscription` (key rotation, clearing data); local `getSubscription()` and backend `subscribed` disagree; toggle shows the wrong state or DELETE has no endpoint.
**Why it happens:** Push subscriptions can expire/change independent of your app.
**How to avoid:** Treat backend `subscribed` as the toggle truth; on subscribe always re-POST `subscription.toJSON()` (backend upserts, idempotent). The backend already prunes 404/410 endpoints on send (VERIFIED `notification_service.go:119-123`), so stale server rows self-heal. See Pattern 3 reconciliation notes.
**Warning signs:** Toggle on but no notifications; DELETE 400 ("endpoint is required").

### Pitfall 4: devOptions.enabled:false hides SW bugs until prod build
**What goes wrong:** With `devOptions.enabled:false` (current), the SW isn't active under `npm run dev`, so push/click handlers can't be exercised locally without a production build (`npm run build && npm run preview`).
**Why it happens:** vite-plugin-pwa disables the SW in dev by default.
**How to avoid:** For SW development, either temporarily set `devOptions.enabled:true` (note: injectManifest dev needs `devOptions.type:'module'`) or test against `npm run preview`. Don't commit `devOptions.enabled:true` if it conflicts with the existing dev experience — verify with the team. e2e runs against the built app (port 3100), so the SW IS active there.
**Warning signs:** Handlers work in preview but "don't exist" in `npm run dev`.

### Pitfall 5: navigateFallback / runtimeCaching silently lost on strategy switch
**What goes wrong:** Moving from generateSW to injectManifest drops the declarative `navigateFallback` and `runtimeCaching` unless reimplemented; the app loses SPA deep-link fallback and the auth-boot cold-start cache → white screens return.
**Why it happens:** injectManifest gives you full control = full responsibility; nothing is auto-generated except the precache manifest injection.
**How to avoid:** Reimplement BOTH in sw.ts (Pattern 2 §2 + §3) with identical parameters. Add a verification step: load a deep route (e.g. `/charges`) offline and confirm it still resolves; confirm `auth-boot` cache appears in DevTools → Application → Cache Storage.
**Warning signs:** 404 on hard-refresh of a non-root route; white screen on slow `/api/auth/me`.

## Code Examples

### Push API client (project convention — raw fetch in src/api only)
```ts
// src/api/pushSubscriptions.ts  (mirrors src/api/charges.ts conventions [VERIFIED])
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export async function fetchVapidPublicKey(): Promise<{ key: string }> {
  const res = await fetch(`${apiUrl}/api/push-subscriptions/vapid-public-key`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch VAPID key");
  return res.json();
}
export async function fetchSubscriptionStatus(endpoint: string): Promise<{ subscribed: boolean }> {
  const url = new URL(`${apiUrl}/api/push-subscriptions`, window.location.origin);
  url.searchParams.set("endpoint", endpoint);
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch subscription status");
  return res.json();
}
export async function postSubscription(sub: PushSubscriptionJSON): Promise<void> {
  const res = await fetch(`${apiUrl}/api/push-subscriptions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys?.p256dh, auth: sub.keys?.auth } }),
  });
  if (!res.ok) throw res;
}
export async function deleteSubscription(endpoint: string): Promise<void> {
  const url = new URL(`${apiUrl}/api/push-subscriptions`, window.location.origin);
  url.searchParams.set("endpoint", endpoint);
  const res = await fetch(url.toString(), { method: "DELETE", credentials: "include" });
  if (!res.ok) throw res;
}
```

### Backend VAPID endpoint (thin handler — matches backend/CLAUDE.md)
```go
// push_subscription_handler.go — add this method
// VapidPublicKey godoc
// @Summary      Get the VAPID public key
// @Description  Returns the server's VAPID public key for client-side push subscription
// @Tags         push-subscriptions
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200 {object} domain.VapidPublicKeyResponse
// @Router       /api/push-subscriptions/vapid-public-key [get]
func (h *PushSubscriptionHandler) VapidPublicKey(c echo.Context) error {
    return c.JSON(http.StatusOK, domain.VapidPublicKeyResponse{Key: h.vapidPublicKey})
}
// + add `vapidPublicKey string` to the handler struct, inject cfg.VAPID.PublicKey in NewPushSubscriptionHandler,
//   add `type VapidPublicKeyResponse struct { Key string `json:"key"` }` to domain,
//   register route: pushSubs.GET("/vapid-public-key", pushSubHandler.VapidPublicKey)  // BEFORE the bare GET handler
//   then run `just generate-docs`.
```

> Route ordering: register `/vapid-public-key` so it isn't shadowed by the existing `pushSubs.GET("", ...)` status route. Echo matches static segments fine, but place the sub-path route explicitly.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| generateSW (declarative runtimeCaching) | injectManifest (custom sw.ts) for any custom event handler | stable since vite-plugin-pwa 0.x | Required to author push/notificationclick |
| Web Push unsupported on iOS | Supported on installed Home Screen PWAs | iOS 16.4 (2023) | iOS works only as installed PWA, manifest already qualifies |
| FCM/GCM sender id required | VAPID-only Web Push | ~2018+ | Backend already VAPID-only (verified) |

**Deprecated/outdated:** Nothing in this stack is deprecated. vite-plugin-pwa 1.3.0 is current (VERIFIED `npm view`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The VAPID endpoint may be placed under the existing authed `/api/push-subscriptions` group (vs. a public route). | Decision 1 | Low — if it must be public (subscribe before login), move it to an unauthed group; trivial change. Key is non-secret either way. |
| A2 | `workbox-precaching/-routing/-strategies/-expiration/-cacheable-response` resolve as transitive deps of vite-plugin-pwa 1.x without explicit install. | Standard Stack | Medium — if not, add them as devDeps pinned to plugin's versions. Verify at `npm install`. |
| A3 | The push payload `data.entity_type` is `"charge"`/`"transaction"` and is sufficient to derive the list route. | Decision 4 | Low — VERIFIED in notification_service.go; `data.type` also works as fallback. |
| A4 | Reading `payload.title`/`payload.body` directly (server-formatted) is acceptable, overriding the UI-SPEC §Surface 4 per-type copy table. | Backend Contract / OQ-1 | Medium — needs product confirmation; backend already ships these exact strings, so re-deriving copy client-side would duplicate/conflict. |
| A5 | `context.grantPermissions(['notifications'])` + init-script stubs of PushManager/serviceWorker are sufficient to e2e the granted path without a real push service. | Validation | Medium — Playwright can grant notification permission, but subscribe()/SW push receipt may need stubbing; if too brittle, fall back to unit tests + manual UAT for the granted path. |

## Open Questions

1. **OQ-1: SW notification copy — server-provided vs. UI-SPEC table.**
   - What we know: backend (Phase 23) already sends `title:"Finance App"` + a fully-formatted pt-BR `body`. UI-SPEC §Surface 4 specifies a different per-type title/body table the backend does NOT send.
   - What's unclear: whether to render the server strings (simplest, single source) or have the SW re-derive UI-SPEC copy from `data.type` (requires `partner_name` which isn't in the payload).
   - Recommendation: render server-provided `title`/`body` (the payload lacks `partner_name`, so the UI-SPEC table can't even be fully reconstructed client-side). Surface to product for sign-off.

2. **OQ-2: GET status field name discrepancy.**
   - What we know: backend returns `{ "subscribed": boolean }`; UI-SPEC §Initial state resolution prose says "returns active: true".
   - What's unclear: nothing — backend is truth.
   - Recommendation: read `subscribed`. Note for planner; no UI-SPEC change needed (prose is informal).

3. **OQ-3: VAPID endpoint auth scope.**
   - What we know: key is non-secret; current toggle is only shown to authenticated users (inside user menu / Mais drawer).
   - Recommendation: authed `/api/push-subscriptions/vapid-public-key` is fine. Reconsider only if a pre-login subscribe flow is ever added.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| vite-plugin-pwa | SW build (injectManifest) | ✓ | ^1.2.0 (latest 1.3.0) | — |
| workbox-* (precaching/routing/strategies) | custom sw.ts | ✓ (transitive) | bundled w/ plugin | install as devDeps if types unresolved (A2) |
| vitest | unit tests | ✓ | ^4.1.6 | — |
| @playwright/test | e2e | ✓ | ^1.58.2 | — |
| @testing-library/react | hook/component unit tests | ✓ | ^16.3.2 | — |
| Backend VAPID_PUBLIC_KEY env | new GET endpoint | ✓ (server-side) | — | — (already required at startup, fail-fast) |
| Real push service / device | actual push delivery + OS render | ✗ | — | Manual/device UAT (deferred) — not automatable in CI |
| node_modules installed | building/testing locally | ✗ (sandbox) | — | `npm install` in frontend before any task runs |

**Missing dependencies with no fallback:** None blocking automated work. Real-push end-to-end render is inherently manual (no push service in env + Phase-23 delivery is server-side) — covered by UAT.

**Missing dependencies with fallback:** workbox sub-packages (A2 — install as devDeps if unresolved).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (unit) | vitest ^4.1.6 (jsdom) + @testing-library/react ^16.3.2 |
| Framework (e2e) | @playwright/test ^1.58.2 |
| Config file | `frontend/vitest.config.ts` (include `src/**/*.test.tsx`), `frontend/vitest.setup.ts`; Playwright in `frontend/e2e/` |
| Quick run command | `cd frontend && npm run test:component` (vitest run) and `npm run lint` |
| Full suite command | `cd frontend && npm run test:component && npm run e2e` |

> Note: `vitest.config.ts` `include` is `src/**/*.test.tsx` (tsx only). Pure helper tests written as `.test.ts` must either use `.test.tsx` extension OR be added to the `test:unit` node-runner list in package.json. Recommend `.test.tsx`/`.test.ts` added to vitest `include` (`src/**/*.test.{ts,tsx}`) — small Wave 0 config tweak.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| — | `urlBase64ToUint8Array` decodes correctly | unit | `npm run test:component -- urlBase64` | ❌ Wave 0 |
| CTRL-03 | `deriveDeepLink(type)` → correct route | unit | `npm run test:component -- pushDeepLink` | ❌ Wave 0 |
| CTRL-02 | state machine derives 5 states from mocked permission+query | unit | `npm run test:component -- usePushSubscription` | ❌ Wave 0 |
| SUB-01/02 | api client builds correct POST body / DELETE url (fetch mocked) | unit | `npm run test:component -- pushSubscriptions` | ❌ Wave 0 |
| CTRL-01 | tapping default Switch calls requestPermission; never on mount | e2e | `npm run e2e -- notifications` | ❌ Wave 0 |
| CTRL-02 | toggle renders enabled/denied/unsupported states | e2e (stubbed) | `npm run e2e -- notifications` | ❌ Wave 0 |
| CTRL-03 | notificationclick → navigation | manual/UAT | device UAT checklist | ❌ deferred |
| SC4 | OS notification renders on real push | manual/UAT | device UAT checklist | ❌ deferred |

### Sampling Rate
- **Per task commit:** `cd frontend && npm run lint && npm run test:component`
- **Per wave merge:** add `npm run e2e -- notifications`
- **Phase gate:** full `npm run test:component` + e2e green; backend `just test-unit` green (for the VAPID handler); manual UAT checklist completed before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/utils/urlBase64ToUint8Array.test.ts(x)` — pure decoder
- [ ] `src/utils/pushDeepLink.test.ts(x)` — covers CTRL-03 URL derivation
- [ ] `src/hooks/usePushSubscription.test.tsx` — state machine (mock `Notification`, `navigator.serviceWorker`, `PushManager`)
- [ ] `src/api/pushSubscriptions.test.ts(x)` — request shape with mocked `fetch`
- [ ] `e2e/tests/notifications.spec.ts` + page object — toggle states + permission gate (stub PushManager/SW via `addInitScript`)
- [ ] `vitest.config.ts` include widened to `src/**/*.test.{ts,tsx}` (or use `.tsx` for pure helpers)
- [ ] `vitest.setup.ts` — add `Notification`/`navigator.serviceWorker`/`PushManager` stubs (alongside existing matchMedia/ResizeObserver stubs)
- [ ] backend `push_subscription_handler_test.go` — VAPID endpoint returns key (handler test pattern)

## Security Domain

`security_enforcement` is not set to `false` in config (key absent) → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Endpoints reuse existing cookie/bearer auth middleware; no new auth logic |
| V3 Session Management | no | Unchanged |
| V4 Access Control | yes | Subscribe/unsubscribe/status are per-user (userID from context, VERIFIED handler). New VAPID endpoint exposes a non-secret public key only. |
| V5 Input Validation | yes | Frontend sends `endpoint`/`keys` from the browser-provided `PushSubscription` (trusted shape). Backend already binds `domain.SubscribePushRequest`. SW `event.data.json()` must be guarded (Pitfall 2). |
| V6 Cryptography | no (consumer) | VAPID signing is server-side (Phase 23). Frontend only decodes the public key (base64url→bytes); never handles private keys. |

### Known Threat Patterns for browser Web Push
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/empty push payload crashes SW handler → generic "background update" notification | Denial of Service / Tampering | Guard `if(!event.data)`; try/catch `.json()`; always `showNotification` (userVisibleOnly contract) |
| Leaking another user's subscription via shared endpoint | Information Disclosure | Backend scopes by userID from auth context (VERIFIED); endpoint string is device-specific |
| VAPID public key exposure | Information Disclosure | Non-issue — public key is designed to be public; serving it is safe |
| Cross-origin SW message spoofing on `postMessage` | Spoofing | `useServiceWorkerNavigation` only navigates to internal app routes derived from a fixed allow-list (`/charges`,`/transactions`); validate `e.data.type==='NAVIGATE'` and that url starts with `/` |

## Sources

### Primary (HIGH confidence)
- Codebase direct reads: `frontend/vite.config.ts`, `frontend/package.json`, `frontend/src/main.tsx`, `frontend/src/components/{MobileMoreDrawer,DesktopSidebar,ThemeToggle,PWAUpdateNotifier}.tsx`, `frontend/src/api/{charges,transactions}.ts`, `frontend/src/hooks/{usePWAInstall,useChargesPendingCount}.ts`, `frontend/src/utils/queryKeys.ts`, `frontend/src/vite-env.d.ts`, `frontend/vitest.config.ts`, `frontend/vitest.setup.ts`, `frontend/e2e/tests/theme-toggle.spec.ts`, `frontend/CLAUDE.md`, root `CLAUDE.md`, `backend/CLAUDE.md`
- Backend contract: `backend/internal/handler/push_subscription_handler.go`, `backend/internal/domain/push_subscription.go`, `backend/internal/service/notification_service.go` (payload shape), `backend/internal/config/config.go` (VAPID), `backend/cmd/server/main.go:40-51,195-218`
- UI contract: `.planning/phases/24-frontend-permission-subscribe-service-worker/24-UI-SPEC.md` (APPROVED)
- `npm view vite-plugin-pwa version` → 1.3.0 (latest), project pins ^1.2.0

### Secondary (MEDIUM confidence)
- vite-plugin-pwa injectManifest guide (vite-pwa-org.netlify.app/guide/inject-manifest) — confirmed via WebSearch summary (direct fetch 403'd); config keys `strategies/srcDir/filename/injectManifest.globPatterns`, `precacheAndRoute(self.__WB_MANIFEST)`, custom push handling [CITED]
- WebSearch (multiple agreeing sources: magicbell.com, webpush-ios-example, monogram.io) — iOS Web Push requires installed Home Screen PWA since iOS 16.4; `userVisibleOnly:true` + `applicationServerKey` subscribe pattern; `urlBase64ToUint8Array` helper [CITED]

### Tertiary (LOW confidence)
- None relied upon for decisions.

## Metadata

**Confidence breakdown:**
- Backend contract / payload shape: HIGH — direct source read of handlers, domain, notification_service.
- Standard stack / SW strategy: HIGH (codebase) / MEDIUM (exact injectManifest config keys — docs 403'd, confirmed via WebSearch + stable known API).
- Architecture / state machine: HIGH — derived directly from APPROVED UI-SPEC + verified conventions.
- Pitfalls (esp. iOS): MEDIUM-HIGH — multiple agreeing WebSearch sources.
- Testing limits: HIGH — honest about no-real-push-service constraint.

**Research date:** 2026-05-30
**Valid until:** 2026-06-29 (30 days — stable stack; re-verify vite-plugin-pwa config keys if upgrading past 1.3.x).
