---
phase: 24
slug: frontend-permission-subscribe-service-worker
created: 2026-05-30
source: user decisions during /gsd:ui-phase → research handoff
---

# Phase 24 — Locked Decisions (for the planner)

These resolve the open questions surfaced by `24-RESEARCH.md`. They are binding for planning and execution.

## D-24-1 — VAPID public key delivery (resolves RESEARCH BLOCKER)

Add a backend endpoint `GET /api/push-subscriptions/vapid-public-key` returning
`{ "key": "<base64url>" }` from `cfg.VAPID.PublicKey`.

- One source of truth (the Cloud Run-managed env the backend already reads); survives key rotation without a frontend rebuild. `VITE_VAPID_PUBLIC_KEY` build-time env was rejected.
- Cross-layer task: new handler method + struct (`VapidPublicKeyResponse`) in `internal/domain/push_subscription.go` + 1 route in `cmd/server/main.go` + `just generate-docs`. No service/migration changes.
- **Plan this FIRST** — every frontend subscribe task depends on it. Authed scope is acceptable (the user is logged in before they can toggle notifications).

## D-24-2 — OS push notification copy (resolves RESEARCH OQ-1)

**Per-type title + server-provided body. The title is added to the BACKEND push payload (single source of truth) — NOT derived in the service worker.**

Concretely, amend the **Phase 23** `buildPayload` in `backend/internal/service/notification_service.go`:

- Replace the static `Title: "Finance App"` with a per-type title:
  | `data.type` | title |
  |-------------|-------|
  | `charge_received` | `"Nova cobrança"` |
  | `charge_accepted` | `"Cobrança aceita"` |
  | `split_created` | `"Nova transação dividida"` |
  | `split_updated` | `"Transação dividida atualizada"` |
  | (default/unknown) | `"Finance App"` |
- Keep the existing **rich body verbatim** — it already includes the actor name + amount (e.g. `"Vic te cobrou R$ 50,00: Aluguel"`, `"Vic adicionou uma transação dividida de R$ 84,90"`). This is consistent with the Phase 25 inbox decision to show amounts.
- The split-created **coalesced** multi-event body (`"%s adicionou %d transações divididas"`) keeps title `"Nova transação dividida"`.
- The service worker therefore renders `payload.title` / `payload.body` **as-is** — no per-type copy logic in `sw.ts`. This is a small, well-scoped edit to already-shipped Phase 23 code; cover it with a unit-test update to `buildPayload`'s expectations.

**Consequence for the UI-SPEC:** the §Surface 4 "Title + Body Copy Contract" table (which specified simpler bodies like `"{partner_name} criou uma cobrança para você."` and SW-side `{partner_name}` substitution) is **superseded** — the body comes from the server with the amount included, and `{partner_name}` resolution happens server-side, not in the SW. The 24-UI-SPEC has been annotated accordingly.

## Carried-forward research decisions (no user input needed; for planner convenience)

- **SW strategy:** switch `vite-plugin-pwa` from `generateSW` → `injectManifest` with `src/sw.ts`; reimplement the existing auth-boot `NetworkFirst` cache + `navigateFallback` in `sw.ts` via `registerRoute`/`NavigationRoute`. Registration unchanged (`PWAUpdateNotifier` / `useRegisterSW`, `injectRegister:false`).
- **Status truth:** the backend `GET /api/push-subscriptions` returns `{ subscribed: boolean }` — use `subscribed` (UI-SPEC prose that said `active` is wrong).
- **CTRL-03 routing:** payload has **no `url`**; derive `/charges` vs `/transactions` from `data.type` / `data.entity_type` in `sw.ts`; `clients.matchAll`→focus+`postMessage({url})` else `openWindow`; app navigates via a `useServiceWorkerNavigation` hook + global router.
- **Deps:** zero new runtime deps; add `workbox-*` as pinned devDeps only if types don't resolve transitively after the strategy switch.
- **Testing limits:** unit (vitest) for pure helpers + state machine + api client; Playwright with stubbed `PushManager`/SW + `grantPermissions(['notifications'])` for toggle states + the permission gate; real OS render/tap deferred to manual device UAT.
