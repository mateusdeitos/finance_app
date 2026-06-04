---
status: partial
phase: 23-backend-notification-events-inbox-api
source: [23-VERIFICATION.md]
started: 2026-05-30T00:00:00Z
updated: 2026-05-30T00:00:00Z
---

## Current Test

[awaiting human testing — requires a deployed server + real VAPID keys + a browser push subscription]

## Tests

### 1. charge_received push delivery
expected: Creating a charge delivers a pt-BR Web Push to the recipient's browser reading "{partner} te cobrou R$ X,XX: {description}", and a notifications row of type charge_received is persisted referencing the charge id.
result: [pending]

### 2. charge_accepted push delivery
expected: Accepting a charge delivers a pt-BR Web Push to the charge initiator reading "{partner} aceitou sua cobrança de R$ X,XX", and a notifications row of type charge_accepted is persisted referencing the charge id.
result: [pending]

### 3. percentage-split push shows the partner's split-share amount (CR-02 end-to-end)
expected: Creating a 50% split of an R$ 100,00 expense delivers a push to the partner showing their share (R$ 50,00), NOT the full R$ 100,00; a split_created row referencing the linked transaction id is persisted.
result: [pending]

### 4. cursor pagination stability + unread badge
expected: GET /api/notifications lists newest-first; paging with the cursor yields no duplicates or gaps under concurrent inserts; GET /api/notifications/unread-count matches the actual unread total; marking read (single + all) updates the count.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
