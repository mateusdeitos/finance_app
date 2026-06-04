---
phase: 24-frontend-permission-subscribe-service-worker
plan: "05"
created: 2026-05-30
status: PENDING USER VERIFICATION
---

# Phase 24 — Human UAT Checklist

> **Purpose:** This document aggregates all verification steps that CANNOT be performed in the automated CI/CD environment because they require:
> - A real OS push notification delivery (no push service available in Docker)
> - A real mobile device or PWA-installed browser session
> - Browser permission dialogs (non-automatable beyond basic grants)
> - Full Playwright e2e suite on the Docker stack
>
> Complete this checklist on a real device/browser after deploying the Phase 24 build.

---

## Prerequisites

```bash
# 1. Build and serve the production bundle (SW only activates in production build)
cd frontend
npm run build
npm run preview
# → Open the preview URL in a real browser (e.g. http://localhost:4173)

# 2. For real push delivery: backend must be running and connected to the push service
cd ..
docker-compose up -d  # or deploy to staging/Cloud Run
```

---

## Checklist

### SC1 — Toggle visible on both surfaces

- [ ] **Desktop** (viewport ≥ sm breakpoint): open the user menu (click the avatar pill bottom-left).
  - [ ] A "Notificações" row appears **after** "Tema" and **before** the divider above "Sair".
  - [ ] Row shows `IconBellOff` icon + "Notificações" label + "Toque para ativar" helper + unchecked Switch.
  - [ ] Visually matches `design/notif-desktop.png`.

- [ ] **Mobile (375px viewport or device)**: open the "Mais" bottom drawer (bottom tab bar → "Mais").
  - [ ] A "Notificações" row appears **above** "Sair".
  - [ ] Helper text is the short variant: "Toque para ativar" (not truncated at 375px).
  - [ ] Visually matches `design/notif-mobile2.png`.

---

### SC2 — Permission gate (CTRL-01) — no prompt on load

- [ ] With a **fresh browser profile** (notifications permission never requested for this origin):
  - [ ] Load the app — **confirm no browser permission prompt appears on page load**.
  - [ ] Navigate between pages (Transações, Contas, Cobranças) — **still no prompt**.
  - [ ] Open the "Notificações" toggle row in either surface — **still no prompt**.

---

### SC3 — Subscribe flow (SUB-01)

> Continue from SC2 (fresh profile, no permission granted yet).

- [ ] **Tap the Switch** from `default` state.
  - [ ] The browser permission prompt appears **at this point only** (not before).
  - [ ] While the prompt is open, the Switch shows the `requesting` state:
    - [ ] `Loader size="xs"` (spinner) replaces the bell icon (OD-1 LOCKED).
    - [ ] Helper shows "Aguardando..." (mobile) / "Aguardando permissão..." (desktop).
    - [ ] Switch is disabled (cannot be re-tapped).
  
- [ ] **Grant permission** in the browser prompt.
  - [ ] Row transitions to `enabled` state:
    - [ ] `IconBell` icon visible.
    - [ ] Switch is checked (blue track).
    - [ ] Helper shows "Ativadas" (mobile) / "Ativadas neste dispositivo" (desktop).
  - [ ] A **teal success toast** appears top-right:
    - [ ] Title: "Notificações ativadas"
    - [ ] Body: "Você receberá notificações neste dispositivo."
    - [ ] Auto-closes after ~3 seconds.
  - [ ] In browser DevTools → Application → Push Subscriptions: an active subscription entry appears for this origin.

---

### SC4 — Unsubscribe (SUB-02)

> Continue from SC3 (subscription active, state = `enabled`).

- [ ] **Tap the Switch** again (currently checked/enabled).
  - [ ] Switch transitions through a brief `requesting` state (spinner).
  - [ ] Row returns to `default` state:
    - [ ] `IconBellOff` icon.
    - [ ] Switch unchecked.
    - [ ] Helper: "Toque para ativar" (mobile) / "Toque para ativar" (desktop).
  - [ ] A **teal toast** appears top-right:
    - [ ] Title: "Notificações desativadas"
    - [ ] Body: "Notificações desativadas neste dispositivo."
  - [ ] DevTools → Application → Push Subscriptions: subscription entry removed.

---

### SC5 — Denied state

- [ ] In browser settings (or DevTools → Application → Notifications), **block notifications for this origin**.
- [ ] Reload the app.
  - [ ] Toggle row shows `denied` state:
    - [ ] `IconBellOff` icon in **red**.
    - [ ] Helper text in **red**: "Bloqueadas pelo navegador" (mobile) / "Bloqueadas — ative nas configurações do navegador" (desktop).
    - [ ] Switch is **disabled** (grey, non-interactive).
    - [ ] **No "Como ativar" link or button visible** (per spec — helper text is the sole guidance).
  - [ ] The disabled Switch cannot be tapped (verify by attempting to click it — nothing happens).

---

### SC6 — Real OS push delivery (SC4 from plan, CTRL-03)

> Requires: backend running with push credentials (VAPID keys configured); active subscription from SC3.

- [ ] Trigger a test push from the backend (e.g. via the admin panel or a test API call).
  - [ ] The **OS notification** appears with:
    - [ ] Title comes from the backend payload (e.g. "Nova cobrança", "Cobrança aceita", "Nova transação dividida", "Transação dividida atualizada") — **not** a generic string.
    - [ ] Body is the backend's rich pt-BR string with the amount (e.g. "Vic te cobrou R$ 50,00: Aluguel").
    - [ ] The FinanceApp icon (38px brand mark) appears.
    - [ ] `tag` field prevents duplicate stacking for the same entity.

---

### SC7 — Notification tap → in-app navigation (SC5/CTRL-03)

> Requires: app open in the browser AND an OS notification visible from SC6.

**Path A — App already open:**
- [ ] With the app tab **already open**, tap the OS notification.
  - [ ] The app **focuses** (tab/window comes to foreground).
  - [ ] App **navigates** to the correct list page:
    - [ ] `charge_received` / `charge_accepted` → `/charges`
    - [ ] `split_created` / `split_updated` → `/transactions`
  - [ ] No extra tap or search required to land on the list (SC5 satisfied).

**Path B — App not open:**
- [ ] **Close the app tab**. Tap the OS notification.
  - [ ] A new browser tab opens and navigates to the correct list page.

---

### SC8 — iOS installed-PWA path (if applicable)

> See Plan 03 Research Pitfall 1: iOS requires the PWA to be installed to Home Screen before push is available.

- [ ] On iOS Safari: "Add to Home Screen" → install the PWA.
- [ ] Open the installed app (from Home Screen — not Safari).
- [ ] Repeat SC2 (no prompt on load), SC3 (subscribe), SC6 (push delivery), SC7 (tap navigation).
  - [ ] Same behavior as desktop/Android Chrome.
  - [ ] Push service worker handles `push` event while app is backgrounded.

---

### SC9 — Auth-boot cache (from Plan 03)

- [ ] In DevTools → Application → Cache Storage: an `auth-boot` cache exists after first load.
- [ ] Hard-refresh on `/charges` → app resolves (no white screen); navigateFallback intact.

---

### SC10 — Full Playwright e2e suite

> Run after Docker stack (`docker-compose -f docker-compose.e2e.yml up`) is available.

```bash
cd frontend
npm run test:e2e
```

- [ ] All tests in `e2e/tests/notifications.spec.ts` pass.
- [ ] No regressions in other test files (all previously passing specs still pass).

---

## Notes

- **Toast position**: top-right globally configured in `main.tsx` — verify on both surfaces.
- **autoClose 3000ms**: toasts should auto-dismiss after 3 seconds.
- **No permission toast**: when the user denies the browser prompt, **no toast appears** — the `denied` state with red helper text is the sole feedback.
- **Monetary amounts**: backend push body includes formatted `R$ X,XX` amounts — verify the real pt-BR format (e.g. "Vic te cobrou R$ 50,00: Aluguel", not "Vic te cobrou 5000: Aluguel").

---

## Sign-Off

| Item | Verified by | Date | Notes |
|------|-------------|------|-------|
| SC1 Desktop placement | | | |
| SC1 Mobile placement | | | |
| SC2 No auto-prompt | | | |
| SC3 Subscribe flow | | | |
| SC4 Unsubscribe flow | | | |
| SC5 Denied state | | | |
| SC6 Real OS push | | | |
| SC7 Tap navigation (app open) | | | |
| SC7 Tap navigation (app closed) | | | |
| SC8 iOS PWA (optional) | | | |
| SC9 Auth-boot cache | | | |
| SC10 Full e2e suite | | | |
