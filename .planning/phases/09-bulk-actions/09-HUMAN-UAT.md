---
status: partial
phase: 09-bulk-actions
source: [09-VERIFICATION.md]
started: 2026-04-17T02:30:00.000Z
updated: 2026-04-17T02:30:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Ações menu renders and opens
expected: Mantine Menu dropdown with "Alterar categoria", "Alterar data", Menu.Divider, "Excluir" items with correct icons
result: [pending]

### 2. Bulk category change end-to-end with propagation
expected: SelectCategoryDrawer opens → select category → PropagationSettingsDrawer appears (if recurring) with "alterar" copy → BulkProgressDrawer shows sequential progress → success state with count
result: [pending]

### 3. Bulk date change progress and success state
expected: SelectDateDrawer opens → pick date → Aplicar → propagation check → BulkProgressDrawer with animated progress bar → success state → transactions query invalidated
result: [pending]

### 4. SEL-02 silent skip of non-owned linked transactions
expected: Linked transactions where user ≠ original_user_id are silently excluded from bulk actions (no error shown)
result: [pending]

### 5. Error state display on network failure
expected: If API call fails mid-batch, progress drawer shows error state with failed transaction description, error reason, and remaining unprocessed list
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
