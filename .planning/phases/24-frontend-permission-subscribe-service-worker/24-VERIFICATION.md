---
phase: 24-frontend-permission-subscribe-service-worker
verified: 2026-05-30T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
human_verification: # Legitimately deferred to device UAT (24-HUMAN-UAT.md) — NOT gaps
  - test: "SC4 live OS render — trigger a backend push; confirm OS notification shows per-type title + rich pt-BR body + icon + tag"
    expected: "OS notification with title 'Nova cobrança'/'Cobrança aceita'/etc and body 'Vic te cobrou R$ 50,00: Aluguel'"
    why_human: "No real push service in Docker/CI; code path verified, live render requires a real device/browser + push credentials"
  - test: "SC5 live tap navigation — tap a delivered notification (app open and app closed paths)"
    expected: "App focuses (or new tab opens) and navigates to /charges or /transactions per data.type"
    why_human: "Requires real OS notification + browser; code path verified, live tap deferred to device UAT"
  - test: "SC10 full Playwright e2e suite (notifications.spec.ts)"
    expected: "All notification toggle-state + permission-gate tests pass against the Docker e2e stack"
    why_human: "Docker stack unavailable in this environment; suite is authored and well-formed, run deferred to UAT"
---

# Phase 24: Frontend Permission, Subscribe & Service Worker — Verification Report

**Phase Goal:** Users can grant/revoke browser notification permission from within the app; the frontend registers/removes Web Push subscriptions with the backend; the service worker handles incoming pushes and routes a tap to the correct entity screen.
**Verified:** 2026-05-30
**Status:** passed (code-complete; live OS render/tap + full Playwright run device-UAT-pending)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| SC1 | No permission prompt on load; only on explicit in-app action (CTRL-01) | ✓ VERIFIED | `usePushSubscription.ts`: env checks derived during render (L64-67), status via TanStack Query gated `enabled` (L76-78, `usePushSubscriptionStatus.ts:24-30`), NO mount effect. `requestPermission` fires ONLY inside `onToggle` when `state==='default'` (L101-103). Unit tests `usePushSubscription.test.tsx:59-62` ("does not call requestPermission on mount") + L64-68 ("prompts exactly once after toggle from default"). |
| SC2 | Grant + subscribe → POST to backend; toggle 'on' (SUB-01, CTRL-02) | ✓ VERIFIED | Subscribe path `usePushSubscription.ts:111-128`: `requestPermission`→`fetchVapidPublicKey()`→`pushManager.subscribe({userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(key)})`→`postSubscription(sub.toJSON())`→`setLocalEnabled(true)`→teal toast. VAPID from `GET /api/push-subscriptions/vapid-public-key` (`pushSubscriptions.ts:19-25`). State→'enabled' when subscribed (L90-91). Unit test L70-73. |
| SC3 | Disable → remove on backend; toggle 'off'; error reverts (SUB-02) | ✓ VERIFIED | Unsubscribe path `usePushSubscription.ts:143-149`: `getSubscription()`→`deleteSubscription(sub.endpoint)`→`sub.unsubscribe()`→`setLocalEnabled(false)`→teal toast. `deleteSubscription` issues `DELETE /api/push-subscriptions?endpoint=...` (`pushSubscriptions.ts:55-62`). Error path reverts to enabled (L159-160). Unit test L75-77. |
| SC4 | Backend push → OS notification with title+body (SC4) | ✓ VERIFIED (code; live render device-UAT-pending) | `sw.ts:62-98` push handler renders `payload.title`/`payload.body` as-is (D-24-2, no SW-side copy), with icon/badge/tag and malformed-payload fallback. Backend per-type titles in `notification_service.go:65-78` (`pushTitleForType`: charge_received "Nova cobrança", charge_accepted "Cobrança aceita", split_created "Nova transação dividida", split_updated "Transação dividida atualizada"); body verbatim (L19). Backend test `notification_service_test.go:33-39` asserts all four titles + verbatim body. |
| SC5 | Tap → focus/open app, land on correct list (CTRL-03) | ✓ VERIFIED (code; live tap device-UAT-pending) | `sw.ts:107-123` notificationclick → `clients.matchAll`→focus + `postMessage({type:"NAVIGATE",url})` else `openWindow(url)`; url from `deriveDeepLink(payload.data)` (L86, `pushDeepLink.ts:16-37`). `useServiceWorkerNavigation.ts:23-32` validates `type==="NAVIGATE"` + `url.startsWith("/")` → `router.navigate`; mounted in `AppLayout.tsx:18`. |

**Score:** 5/5 truths verified (SC4/SC5 code-complete, live behavior legitimately deferred to device UAT)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `backend/internal/domain/push_subscription.go` | VapidPublicKeyResponse struct | ✓ VERIFIED | L8-10 struct with `key` json tag (D-24-1) |
| `backend/internal/handler/push_subscription_handler.go` | VapidPublicKey method + field | ✓ VERIFIED | `vapidPublicKey` field (L12), constructor injection (L16-22), handler L31-35 |
| `backend/cmd/server/main.go` | vapid-public-key route | ✓ VERIFIED | L52-53 `GET /api/push-subscriptions/vapid-public-key` before bare status route |
| `backend/internal/service/notification_service.go` | per-type title in buildPayload | ✓ VERIFIED | `buildPayload` L17-61, `pushTitleForType` L65-78 |
| `backend/internal/service/notification_service_test.go` | per-type title assertions | ✓ VERIFIED | L33-39 subtests for all four titles + verbatim body + data |
| `frontend/src/utils/urlBase64ToUint8Array.ts` | base64url→Uint8Array decoder | ✓ VERIFIED | Pure decoder L9-18 |
| `frontend/src/utils/pushDeepLink.ts` | deriveDeepLink type→route | ✓ VERIFIED | L16-37 maps charge*→/charges, split*→/transactions, fallback / |
| `frontend/src/testIds/notifications.ts` | NotificationsTestIds | ✓ VERIFIED | Switch:'switch_notifications', ToggleRow, RequestingLoader, HelperText |
| `frontend/src/api/pushSubscriptions.ts` | 4 fetch wrappers | ✓ VERIFIED | fetchVapidPublicKey, fetchSubscriptionStatus, postSubscription, deleteSubscription (credentials:'include') |
| `frontend/src/hooks/usePushSubscription.ts` | 5-state machine + onToggle | ✓ VERIFIED | NotificationState union L9; states derived L83-92; onToggle sole permission/subscribe site |
| `frontend/src/hooks/usePushSubscriptionStatus.ts` | TanStack query for status | ✓ VERIFIED | useQuery gated by enabled, staleTime 60s |
| `frontend/src/sw.ts` | custom SW: precache+auth-boot+push+click | ✓ VERIFIED | 135 lines; precache L16, navigateFallback L23, auth-boot NetworkFirst L31-42, push L62, notificationclick L107 |
| `frontend/vite.config.ts` | injectManifest → src/sw.ts | ✓ VERIFIED | strategies:'injectManifest', srcDir:'src', filename:'sw.ts', injectRegister:false |
| `frontend/src/components/notifications/NotificationToggleRow.tsx` | 5-state Switch row | ✓ VERIFIED | Consumes usePushSubscription; icon/helper/disabled/loader per state |
| `frontend/src/hooks/useServiceWorkerNavigation.ts` | SW message→router.navigate | ✓ VERIFIED | message listener + NAVIGATE/url guard |
| `frontend/e2e/tests/notifications.spec.ts` | toggle-state + permission-gate e2e | ✓ VERIFIED | no-prompt-on-load, subscribe, denied tests; uses NotificationsPage page object (deferred run) |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| main.go | PushSubscriptionHandler.VapidPublicKey | route registration | ✓ WIRED (main.go:53) |
| handler | cfg.VAPID.PublicKey | constructor injection | ✓ WIRED (vapidPublicKey field) |
| usePushSubscription | Notification.requestPermission | only in onToggle when default | ✓ WIRED (L101-103) |
| usePushSubscription | pushSubscriptions api | fetchVapidPublicKey/postSubscription/deleteSubscription | ✓ WIRED (L3, L114/120/147) |
| pushSubscriptions.ts | /api/push-subscriptions | fetch credentials:'include' | ✓ WIRED |
| vite.config.ts | src/sw.ts | injectManifest | ✓ WIRED |
| sw.ts | deriveDeepLink | import @/utils/pushDeepLink | ✓ WIRED (L8, L86) |
| sw.ts notificationclick | open client | postMessage({type:'NAVIGATE',url}) | ✓ WIRED (L117) |
| MobileMoreDrawer | NotificationToggleRow | above Sair | ✓ WIRED (surface="mobile") |
| DesktopSidebar | NotificationToggleRow | after Tema, above Divider | ✓ WIRED (surface="desktop") |
| AppLayout | useServiceWorkerNavigation | mounted once | ✓ WIRED (L18) |
| useServiceWorkerNavigation | router.navigate | SW 'message' listener | ✓ WIRED (L30) |

### Behavioral Spot-Checks (Runnable Gates — verification evidence)

| Gate | Command | Result | Status |
| ---- | ------- | ------ | ------ |
| Frontend build emits dist/sw.js | `npm run build` | exit 0; PWA injectManifest; dist/sw.js generated | ✓ PASS |
| Unit tests | `npx vitest run` | 7 files / 64 tests passed | ✓ PASS |
| Frontend lint | `npm run lint` | exit 0; 0 errors, 2 pre-existing TransactionsPage warnings (not this phase) | ✓ PASS |
| Backend build | `go build ./...` | exit 0 | ✓ PASS |
| Backend vet | `go vet -tags=integration ./internal/...` | exit 0 | ✓ PASS |
| Backend short tests | `go test -short ./...` | exit 0 (service ok) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SUB-01 | 01, 04, 05 | Subscribe device (browser registers Web Push sub with backend) | ✓ SATISFIED | subscribe→postSubscription (usePushSubscription.ts:111-128); POST /api/push-subscriptions |
| SUB-02 | 04, 05 | Unsubscribe device (sub removed from backend) | ✓ SATISFIED | deleteSubscription + sub.unsubscribe (L143-149); DELETE /api/push-subscriptions |
| CTRL-01 | 04, 05 | No prompt on load; only explicit action | ✓ SATISFIED | TanStack-Query status (no mount prompt); requestPermission only in onToggle; unit tests L59-68 |
| CTRL-02 | 04, 05 | Toggle reflects enabled state after grant+subscribe | ✓ SATISFIED | state derivation L83-92; localEnabled/subscribed→'enabled' |
| CTRL-03 | 02, 03, 05 | Tap notification opens/focuses related screen | ✓ SATISFIED (code; live tap device-UAT) | sw.ts notificationclick + deriveDeepLink + useServiceWorkerNavigation |

No orphaned requirements: REQUIREMENTS.md lines 52-56 map exactly SUB-01/02 + CTRL-01/02/03; all claimed across plans. SUB-03/04 delivered Phase 22 (out of scope, correctly excluded).

### Locked Decisions Honored

| Decision | Status | Evidence |
| -------- | ------ | -------- |
| D-24-1 (VAPID via authed GET endpoint, runtime fetch) | ✓ HONORED | domain.VapidPublicKeyResponse + handler + main.go route; frontend fetchVapidPublicKey at subscribe time (no build-time env) |
| D-24-2 (per-type title in BACKEND payload; SW renders as-is) | ✓ HONORED | pushTitleForType in notification_service.go (4 titles + default); sw.ts renders payload.title/body with no per-type copy logic |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| usePushSubscription.ts:118 | `as unknown as BufferSource` cast | ℹ️ Info | Documented TS 5.9 Uint8Array/BufferSource interop workaround; not a stub |
| sw.ts:65-70 | showFallback "Você tem uma nova notificação" | ℹ️ Info | Legitimate malformed/empty-payload fallback honoring userVisibleOnly (T-24-05), not a placeholder |

No blockers. No stubs (all empty-state values are overwritten by query/subscribe flows). No TODO/FIXME in phase files.

### Deferred to Device UAT (NOT gaps — see 24-HUMAN-UAT.md)

- **SC4 live OS render** — code path verified (sw.ts push handler + backend titles); real OS notification render requires a device + push credentials.
- **SC5 live tap navigation** — code path verified (notificationclick → postMessage/openWindow → useServiceWorkerNavigation → router.navigate); real tap requires a device.
- **Full Playwright e2e suite** — notifications.spec.ts authored and well-formed (no-prompt gate, subscribe, denied); run requires Docker e2e stack (unavailable here).

### Gaps Summary

None. Every requirement (SUB-01/02, CTRL-01/02/03) maps to substantive, wired implementation across backend and frontend. All six runnable gates pass (frontend build emits dist/sw.js; 64 vitest tests green; lint 0 errors; backend build/vet/test green). Both locked decisions (D-24-1, D-24-2) are honored. The only unverified items are real-device OS render/tap and the Dockerized Playwright run — all legitimately deferred to 24-HUMAN-UAT.md, with their code paths present and verified. Verdict: PASS (code-complete, device-UAT-pending).

---

_Verified: 2026-05-30_
_Verifier: Claude (gsd-verifier)_
