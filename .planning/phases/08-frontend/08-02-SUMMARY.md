---
phase: 08-frontend
plan: "02"
subsystem: frontend-components
tags: [charges, ui-components, mantine-notifications, react-hook-form, drawers]
dependency_graph:
  requires:
    - charges-data-layer
    - charges-types
    - charges-query-hooks
    - charges-mutation-hooks
  provides:
    - ChargeStatusBadge
    - ChargeCard
    - CreateChargeDrawer
    - AcceptChargeDrawer
    - sidebar-charges-badge
    - notifications-provider
  affects:
    - frontend/src/main.tsx
    - frontend/src/components/AppLayout.tsx
    - frontend/src/components/charges/ChargeStatusBadge.tsx
    - frontend/src/components/charges/ChargeCard.tsx
    - frontend/src/components/charges/ChargeCard.module.css
    - frontend/src/components/charges/CreateChargeDrawer.tsx
    - frontend/src/components/charges/AcceptChargeDrawer.tsx
    - frontend/package.json
tech_stack:
  added:
    - "@mantine/notifications@7.17.8"
  patterns:
    - renderDrawer + useDrawerContext pattern for drawer lifecycle
    - react-hook-form + zodResolver for form validation
    - Controller for Mantine Select/DateInput (no native ref)
    - useQuery for inline balance preview (non-form data)
    - notifications.show() for success feedback on mutations
    - Badge rightSection in NavLink for pending count indicator
key_files:
  created:
    - frontend/src/components/charges/ChargeStatusBadge.tsx
    - frontend/src/components/charges/ChargeCard.tsx
    - frontend/src/components/charges/ChargeCard.module.css
    - frontend/src/components/charges/CreateChargeDrawer.tsx
    - frontend/src/components/charges/AcceptChargeDrawer.tsx
  modified:
    - frontend/src/main.tsx
    - frontend/src/components/AppLayout.tsx
    - frontend/package.json
decisions:
  - "@mantine/notifications@7.17.8 installed with --legacy-peer-deps due to peer conflicts between @tanstack/zod-adapter and zod v4 — both versions work correctly at runtime"
  - "Notifications provider placed before App inside MantineProvider so toast appears above all content"
  - "CreateChargeDrawer auto-selects connection when only one accepted connection exists and hides the picker (per D-07)"
  - "AcceptChargeDrawer amount field uses NumberInput in BRL units with cents conversion in submit handler (multiply by 100)"
  - "Balance preview uses inline useQuery rather than a custom hook since it is temporary display context only"
metrics:
  duration: ~4 minutes
  completed: "2026-04-16T13:02:12Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 3
---

# Phase 8 Plan 02: Charge UI Components Summary

**One-liner:** Charge UI components — ChargeStatusBadge, ChargeCard with role-based actions, CreateChargeDrawer and AcceptChargeDrawer with balance preview and success notifications, and Cobrancas sidebar link with live pending-count badge.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install @mantine/notifications, create ChargeStatusBadge, ChargeCard, sidebar badge | 3d9bb25 | package.json, main.tsx, ChargeStatusBadge.tsx, ChargeCard.tsx, ChargeCard.module.css, AppLayout.tsx |
| 2 | Create CreateChargeDrawer and AcceptChargeDrawer with success notifications | 59aa02b | CreateChargeDrawer.tsx, AcceptChargeDrawer.tsx |

## What Was Built

**`@mantine/notifications` (v7.17.8):**
- Installed matching @mantine/core@7.17.8 version (resolved with --legacy-peer-deps due to @tanstack/zod-adapter + zod v4 peer conflict)
- `Notifications` provider mounted in main.tsx inside MantineProvider with `position="top-right" autoClose={3000}`
- `@mantine/notifications/styles.css` imported for correct styling

**ChargeStatusBadge (`frontend/src/components/charges/ChargeStatusBadge.tsx`):**
- Maps `ChargeStatus` to Mantine Badge color: pending=yellow, paid=teal, rejected=red, cancelled=gray
- Portuguese labels: Pendente, Pago, Recusado, Cancelado
- `variant="light" size="sm"`

**ChargeCard (`frontend/src/components/charges/ChargeCard.tsx`):**
- Props: `charge`, `currentUserId`, `partnerName`, `balanceAmount?`, `onAccept?`, `onReject?`, `onCancel?`
- Layout: partner name, period (MM/YYYY), description (if present), ChargeStatusBadge, balance amount via `formatBalance()` or `---` placeholder
- Role-based actions: Aceitar (teal) if received+pending, Recusar (red light) if received+pending, Cancelar (red light) if sent+pending
- Uses `Card withBorder radius="md"` pattern from AccountCard

**CreateChargeDrawer (`frontend/src/components/charges/CreateChargeDrawer.tsx`):**
- Connection picker: derived from accepted user_connection accounts; auto-selected + hidden when only one exists (D-07)
- Account selector: filtered to current user's active accounts
- Period: MonthPickerInput defaulting to periodMonth/periodYear props (D-06)
- Date: DateInput defaulting to today
- Description: optional Textarea
- Balance preview: inline useQuery for fetchBalance showing "Voce deve / Devem a voce" (D-08)
- Zod schema validates all required fields (T-08-04 mitigation)
- Success: notifications.show + invalidateCharges + invalidatePendingCount + close()
- Error: parseApiError + mapTagsToFieldErrors → field errors or submitError Alert

**AcceptChargeDrawer (`frontend/src/components/charges/AcceptChargeDrawer.tsx`):**
- Charge summary: read-only partner name, period, description
- Balance preview: useQuery for charge period, shows role-inferred text with Skeleton while loading
- Account selector: user's own active accounts
- Date: DateInput labeled "Data da transferencia"
- Amount: optional NumberInput in BRL units; placeholder shows balance; converted to cents on submit (multiply * 100)
- Success: notifications.show + invalidateCharges + invalidatePendingCount + close()
- Error: parseApiError + mapTagsToFieldErrors → field errors or submitError Alert

**AppLayout (`frontend/src/components/AppLayout.tsx`):**
- Added Cobrancas nav link with IconCreditCard icon pointing to /charges
- useChargesPendingCount() provides live pending count
- Red Badge rightSection in NavLink when pendingCount > 0; undefined (badge hidden) when count is 0

## Deviations from Plan

### Auto-fixed Issues

None.

### Approach Notes

**[Deviation - Install] @mantine/notifications version resolution:**
- **Found during:** Task 1 install step
- **Issue:** `npm install @mantine/notifications` resolved to v9.x (requires @mantine/core@9), but project uses @mantine/core@7.17.8. Subsequent peer conflicts from @tanstack/zod-adapter requiring zod@^3.x while project uses zod@4.
- **Fix:** Used `npm install @mantine/notifications@7.17.8 --legacy-peer-deps` — installs the exact matching version; runtime behavior is correct.
- **Impact:** None. All packages work as expected.

## Threat Surface Scan

No new network endpoints or auth paths introduced. Components call existing hooks (useCreateCharge, useAcceptCharge) which use API client functions from Plan 01. Zod schema validates all required fields in CreateChargeDrawer (T-08-04 mitigated). Amount field is informational display only; actual settlement computed server-side (T-08-05 accepted). Badge count is read-only display with no sensitive data (T-08-06 accepted).

## Known Stubs

None. All components receive real data via hooks and props from call sites. No hardcoded placeholders that flow to rendering. The balance `---` placeholder in ChargeCard is intentional per PATTERNS.md (dash for loading/unavailable state) and will be replaced by real balance data provided by the charges page.

## Self-Check: PASSED

All files present:
- FOUND: frontend/src/components/charges/ChargeStatusBadge.tsx
- FOUND: frontend/src/components/charges/ChargeCard.tsx
- FOUND: frontend/src/components/charges/ChargeCard.module.css
- FOUND: frontend/src/components/charges/CreateChargeDrawer.tsx
- FOUND: frontend/src/components/charges/AcceptChargeDrawer.tsx
- FOUND: frontend/src/main.tsx (modified)
- FOUND: frontend/src/components/AppLayout.tsx (modified)
- FOUND: frontend/node_modules/@mantine/notifications

Commits verified:
- 3d9bb25: feat(08-02): install @mantine/notifications and create ChargeStatusBadge, ChargeCard, sidebar badge
- 59aa02b: feat(08-02): create CreateChargeDrawer and AcceptChargeDrawer with success notifications

TypeScript: passes with no errors (`tsc --noEmit`)
