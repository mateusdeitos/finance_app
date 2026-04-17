---
phase: 10-user-avatar-system
plan: 03
subsystem: frontend-avatar-wiring
tags: [avatar, frontend, account-card, transaction-row, color-picker, account-form]
dependency_graph:
  requires: [UserAvatar_component, AccountAvatar_component, ColorSwatchPicker_component, getInitials_utility, avatar_types]
  provides: [avatar_transaction_rows, avatar_account_cards, account_color_picker, account_drawer_color_wiring]
  affects: [TransactionRow, AccountCard, AccountForm, AccountDrawer]
tech_stack:
  added: []
  patterns: [tooltip_wrapped_avatars, zod_hex_validation, rhf_color_field]
key_files:
  created: []
  modified:
    - frontend/src/components/transactions/TransactionRow.tsx
    - frontend/src/components/transactions/TransactionRow.module.css
    - frontend/src/components/accounts/AccountCard.tsx
    - frontend/src/components/accounts/AccountForm.tsx
    - frontend/src/components/accounts/AccountDrawer.tsx
decisions:
  - "Changed transfer arrow from IconArrowDown (vertical Stack) to IconArrowRight (horizontal Group) to match avatar pair layout"
  - "Wrapped AccountAvatar in span elements for Mantine Tooltip ref attachment"
  - "Removed unused transferAccounts/transferArrow CSS classes after layout change"
metrics:
  duration: 180s
  completed: "2026-04-17T17:56:30Z"
  tasks_completed: 2
  tasks_total: 3
  files_created: 0
  files_modified: 5
---

# Phase 10 Plan 03: Frontend Avatar Wiring & Color Picker Summary

Wired AccountAvatar into TransactionRow (transfers show source->dest avatar pair, non-transfers show single avatar, all with Tooltip) and AccountCard, integrated ColorSwatchPicker into AccountForm with zod hex validation, and connected avatar_background_color through AccountDrawer for both create and edit flows.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | TransactionRow AccountCell rewrite | cf2973a | Done |
| 2 | AccountCard + AccountForm + AccountDrawer wiring | decbec6 | Done |
| 3 | Visual verification of complete avatar system | - | Pending (human-verify checkpoint, deferred) |

## Changes Made

### Task 1: TransactionRow AccountCell rewrite
- Replaced text-based account names with AccountAvatar components (size="xs", 20px)
- Transfer rows now show `[source avatar] -> [dest avatar]` horizontally with IconArrowRight
- Non-transfer rows show single account avatar
- All avatars wrapped in Mantine Tooltip showing account name on hover
- Avatars wrapped in `<span>` for Tooltip ref forwarding
- Removed unused Stack import, replaced IconArrowDown with IconArrowRight
- Removed `.transferAccounts` and `.transferArrow` CSS classes (no longer needed after vertical-to-horizontal layout change)

### Task 2: AccountCard + AccountForm + AccountDrawer wiring
- AccountCard: Added AccountAvatar (size="md", 38px) left of account name with proper flex layout
- AccountForm: Extended zod schema with `avatar_background_color` field (hex regex validation)
- AccountForm: Added `useWatch` for color field and ColorSwatchPicker component with "Cor do avatar" label
- AccountForm: Updated defaultValues and reset to include avatar_background_color with '#457b9d' default
- AccountDrawer: Updated initialValues to include `avatar_background_color: account.avatar_background_color ?? '#457b9d'` for edit mode
- AccountDrawer: Updated payload to include `avatar_background_color: values.avatar_background_color` for persistence

### Task 3: Visual verification (deferred)
- Human-verify checkpoint for complete avatar system visual inspection
- Covers: header OAuth photo, transaction row avatars, account card avatars, color picker in form, edit-mode color pre-fill, split settings partner avatar

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all components are fully wired with real data sources.

## Verification

- `tsc --noEmit` passes with zero errors after both tasks
- `grep "AccountAvatar" frontend/src/components/transactions/TransactionRow.tsx` confirms avatar usage
- `grep "AccountAvatar" frontend/src/components/accounts/AccountCard.tsx` confirms avatar usage
- `grep "ColorSwatchPicker" frontend/src/components/accounts/AccountForm.tsx` confirms color picker
- `grep "avatar_background_color" frontend/src/components/accounts/AccountForm.tsx` confirms schema field
- `grep "avatar_background_color" frontend/src/components/accounts/AccountDrawer.tsx` confirms wiring in both initialValues and payload

## Self-Check: PASSED
