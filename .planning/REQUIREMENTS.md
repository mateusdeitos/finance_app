# Requirements: Couples Finance App — v1.6 Push Notifications

**Defined:** 2026-05-30
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.
**Milestone goal:** Notify a partner about finance events relevant to them — new/accepted charges and new split transactions — via Web Push, with each notification persisted and deep-linked so they can open the underlying entity.
**Source:** GitHub issue #174 (Notificações)

## Milestone v1.6 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Push Subscription (SUB)

- [ ] **SUB-01**: User can grant browser notification permission and register a Web Push subscription for the current device
- [ ] **SUB-02**: User can turn notifications off, which removes the current device's push subscription on the server
- [ ] **SUB-03**: System persists push subscriptions per user + device (endpoint + keys) and prunes a subscription when the push service reports it expired/invalid (HTTP 404/410)
- [ ] **SUB-04**: System can report whether the current device already has an active push subscription, so the frontend can show the correct enabled/disabled state

### Notification Events (NOTIF)

- [ ] **NOTIF-01**: When the partner creates a new charge, the charge recipient receives a push notification
- [ ] **NOTIF-02**: When the partner accepts a charge, the charge creator receives a push notification
- [ ] **NOTIF-03**: When the partner creates a new split transaction, the user whose side receives the linked transaction gets a push notification
- [ ] **NOTIF-04**: When the partner updates a split transaction in a way that affects the user's linked side, the user receives a push notification
- [ ] **NOTIF-05**: Each notification is persisted server-side with its type and a deep-link reference to the related entity (charge or transaction)
- [ ] **NOTIF-06**: Notifications are dispatched after the originating DB transaction commits; a delivery failure neither rolls back nor blocks the originating operation (best-effort)

### Notification Inbox (INBOX)

- [ ] **INBOX-01**: User can open an in-app notification inbox listing their notifications, newest first
- [ ] **INBOX-02**: User can see an unread count indicator and distinguish unread notifications from read ones
- [ ] **INBOX-03**: User can select a notification to navigate to its related charge or transaction
- [ ] **INBOX-04**: User can mark notifications as read individually and all at once; opening a notification marks it read

### Permissions & Controls (CTRL)

- [ ] **CTRL-01**: User is asked for notification permission contextually via an explicit in-app action (not automatically on first load)
- [ ] **CTRL-02**: User can see and toggle the notification on/off state for the current device
- [ ] **CTRL-03**: Clicking a delivered OS/browser push notification opens the app focused on the related entity

## Future Requirements

Deferred to a later milestone. Tracked but not in the current roadmap.

### Notifications (future)

- **NOTIF-F1**: Charge reject / cancel notifications
- **CTRL-F1**: Per-notification-type preference toggles (charges vs split transactions)
- **DELIV-F1**: Queued / retried delivery for guaranteed push (e.g. Cloud Tasks)
- **DIGEST-F1**: Notification grouping / digest when many events fire in a short window

## Out of Scope

Explicitly excluded for v1.6. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Email / SMS / native FCM / APN delivery | v1.6 is Web Push (PWA) only — reuses the existing service worker, no native shells |
| Queued / retried push delivery | Synchronous best-effort chosen; durability deferred to a future milestone |
| Per-notification-type preference toggles | v1.6 ships minimal device-level enable/disable only |
| Charge reject / cancel notifications | Only "received" and "accepted" are in scope per issue #174 |
| Notification grouping / digest | One notification per event in v1.6 |
| Cross-device subscription sync / management UI | Each device manages its own subscription; no central device list |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SUB-01 | Phase 24 | Pending |
| SUB-02 | Phase 24 | Pending |
| SUB-03 | Phase 22 | Pending |
| SUB-04 | Phase 22 | Pending |
| NOTIF-01 | Phase 23 | Pending |
| NOTIF-02 | Phase 23 | Pending |
| NOTIF-03 | Phase 23 | Pending |
| NOTIF-04 | Phase 23 | Pending |
| NOTIF-05 | Phase 23 | Pending |
| NOTIF-06 | Phase 23 | Pending |
| INBOX-01 | Phase 25 | Pending |
| INBOX-02 | Phase 25 | Pending |
| INBOX-03 | Phase 25 | Pending |
| INBOX-04 | Phase 25 | Pending |
| CTRL-01 | Phase 24 | Pending |
| CTRL-02 | Phase 24 | Pending |
| CTRL-03 | Phase 24 | Pending |

**Coverage:**
- v1.6 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-30*
*Last updated: 2026-05-30 — traceability mapped (Phases 22–25)*
