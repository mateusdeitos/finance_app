---
phase: 24-frontend-permission-subscribe-service-worker
plan: "05"
subsystem: frontend
tags: [push-notifications, ui-component, service-worker, e2e, mantine-switch, playwright]
dependency_graph:
  requires:
    - 24-04 (usePushSubscription 5-state machine, notificationHelperText)
    - 24-03 (SW postMessage { type: "NAVIGATE", url } contract)
    - 24-02 (NotificationsTestIds, MobileNavTestIds, CommonTestIds)
  provides:
    - NotificationToggleRow (5-state Switch row, both surfaces)
    - useServiceWorkerNavigation (SW NAVIGATE → router.navigate)
    - MobileMoreDrawer wired: toggle above Sair
    - DesktopSidebar wired: toggle after Tema, above divider
    - e2e spec + page object (notifications.spec.ts, NotificationsPage.ts)
    - 24-HUMAN-UAT.md (device/real-push verification checklist)
  affects:
    - frontend/src/components/AppLayout.tsx (hook mount)
    - frontend/src/components/MobileMoreDrawer.tsx (wired)
    - frontend/src/components/DesktopSidebar.tsx (wired)
tech_stack:
  added: []
  patterns:
    - useEffect in named hook (useServiceWorkerNavigation) — never in component (CLAUDE.md §4)
    - Mantine Switch with checked/disabled per 5-state machine
    - OD-1 LOCKED: Loader replaces bell icon during requesting state
    - OD-2 LOCKED: desktop toggle in user Menu.Dropdown after Tema, above divider
    - OD-3 LOCKED: mobile short copy, desktop full copy via variant prop
    - e2e addInitScript stubs for unsupported/denied/default states
    - SwitchField from formFields.ts for all Switch interactions (CLAUDE.md mandatory)
    - testid-only selectors, scoped to surface container (strict-mode safe)
key_files:
  created:
    - frontend/src/components/notifications/NotificationToggleRow.tsx
    - frontend/src/components/notifications/NotificationToggleRow.module.css
    - frontend/src/hooks/useServiceWorkerNavigation.ts
    - frontend/e2e/tests/notifications.spec.ts
    - frontend/e2e/pages/NotificationsPage.ts
    - .planning/phases/24-frontend-permission-subscribe-service-worker/24-HUMAN-UAT.md
  modified:
    - frontend/src/components/AppLayout.tsx (useServiceWorkerNavigation mount)
    - frontend/src/components/MobileMoreDrawer.tsx (NotificationToggleRow above Sair)
    - frontend/src/components/DesktopSidebar.tsx (NotificationToggleRow after Tema)
decisions:
  - "useEffect lives in useServiceWorkerNavigation hook — CLAUDE.md §4 strictly enforced; zero useEffect in component files"
  - "MobileMoreDrawer restructured: filter items into non-danger (invite/import) + NotificationToggleRow + danger (logout) to ensure visual order"
  - "DesktopSidebar: themeMenuItem-style div wraps NotificationToggleRow for consistent padding with Tema row"
  - "T-24-09 mitigated in useServiceWorkerNavigation: type==='NAVIGATE' AND typeof url==='string' AND url.startsWith('/') guard"
  - "e2e spec authored but execution deferred to Docker e2e stack (no push service locally)"
  - "variant prop on NotificationToggleRow controls mobile (short) vs desktop (full) helper copy (OD-3)"
metrics:
  completed_date: "2026-05-30"
  tasks_completed: 2
  tasks_total: 2
  checkpoint_status: "PENDING USER VERIFICATION (checkpoint:human-verify)"
---

# Phase 24 Plan 05: NotificationToggleRow + SW Navigation + Surface Wiring Summary

One-liner: Built the 5-state NotificationToggleRow Mantine Switch row, wired it into both MobileMoreDrawer (above Sair) and DesktopSidebar (after Tema, above divider), mounted useServiceWorkerNavigation once in AppLayout for SW tap→route, and authored the Playwright e2e spec covering unsupported/denied/default-gate states.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | NotificationToggleRow + useServiceWorkerNavigation + AppLayout mount | f2d2a1c | src/components/notifications/NotificationToggleRow.tsx, src/components/notifications/NotificationToggleRow.module.css, src/hooks/useServiceWorkerNavigation.ts, src/components/AppLayout.tsx |
| 2 | Wire MobileMoreDrawer + DesktopSidebar; author e2e spec + page object | 9e97926 | src/components/MobileMoreDrawer.tsx, src/components/DesktopSidebar.tsx, e2e/tests/notifications.spec.ts, e2e/pages/NotificationsPage.ts |

## Checkpoint Status

**Task 3 (checkpoint:human-verify)** — PENDING USER VERIFICATION.

The human-verify checkpoint was NOT auto-skipped. `24-HUMAN-UAT.md` has been authored with the full device/real-push verification checklist (SC1–SC10). The user must verify on a real device/browser with a production build (`npm run preview`) and the backend running.

## NotificationToggleRow — State Machine

| State | Switch checked | Switch disabled | Icon | Helper (mobile / desktop) |
|-------|---------------|-----------------|------|--------------------------|
| `default` | false | false | IconBellOff dimmed | "Toque para ativar" / "Toque para ativar" |
| `requesting` | false | true | `<Loader size="xs" color="blue" />` | "Aguardando..." / "Aguardando permissão..." |
| `enabled` | true | false | IconBell (default color) | "Ativadas" / "Ativadas neste dispositivo" |
| `denied` | false | true | IconBellOff red | "Bloqueadas pelo navegador" / "Bloqueadas — ative nas configurações do navegador" |
| `unsupported` | false | true | IconBellOff dimmed | "Não suportado" / "Não suportado neste navegador" |

## useServiceWorkerNavigation — Security Contract

- Listens on `navigator.serviceWorker 'message'` events.
- Validates: `data.type === 'NAVIGATE'` AND `typeof data.url === 'string'` AND `data.url.startsWith('/')`.
- T-24-09 (spoofing): internal-path allow-list guard prevents off-origin redirect.
- Cleanup on unmount removes the listener.
- No state, no renders — pure effect hook.

## Verification Gates

| Gate | Result |
|------|--------|
| `npm run build` | PASS (tsc + vite, dist/sw.js emitted) |
| `npm run test:component` | PASS (64 tests, 7 files — no regressions) |
| `npm run lint` | PASS (0 errors; 2 pre-existing warnings in TransactionsPage.tsx) |
| `npx tsc -b --noEmit` | PASS (clean, including e2e spec) |
| `grep NotificationToggleRow MobileMoreDrawer.tsx` | FOUND |
| `grep NotificationToggleRow DesktopSidebar.tsx` | FOUND |
| `grep useServiceWorkerNavigation AppLayout.tsx` | FOUND |
| `grep switch_notifications e2e/tests/notifications.spec.ts` | FOUND |
| e2e spec execution | DEFERRED — requires Docker + push service (24-HUMAN-UAT.md SC10) |
| Real device push render | DEFERRED — 24-HUMAN-UAT.md SC6 |
| Real tap → navigation | DEFERRED — 24-HUMAN-UAT.md SC7 |

## Deviations from Plan

None — plan executed exactly as written. All LOCKED decisions (OD-1, OD-2, OD-3) honored. CLAUDE.md §4 (no useEffect in components) enforced — useEffect lives exclusively in useServiceWorkerNavigation hook.

## Known Stubs

None. All logic is fully implemented. E2e spec uses addInitScript stubs for browser API simulation during testing — not production stubs.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| T-24-09 mitigated | useServiceWorkerNavigation.ts | Message handler validates type+url before navigating; startsWith('/') prevents open redirect |
| T-24-10 mitigated | NotificationToggleRow.tsx | Switch disabled in requesting/denied/unsupported states — no repeated prompting possible |

## Self-Check: PASSED

- `frontend/src/components/notifications/NotificationToggleRow.tsx` — FOUND
- `frontend/src/components/notifications/NotificationToggleRow.module.css` — FOUND
- `frontend/src/hooks/useServiceWorkerNavigation.ts` — FOUND
- `frontend/e2e/tests/notifications.spec.ts` — FOUND
- `frontend/e2e/pages/NotificationsPage.ts` — FOUND
- `.planning/phases/24-frontend-permission-subscribe-service-worker/24-HUMAN-UAT.md` — FOUND
- Commits f2d2a1c (feat 24-05 task 1), 9e97926 (feat 24-05 task 2) — FOUND in git log
