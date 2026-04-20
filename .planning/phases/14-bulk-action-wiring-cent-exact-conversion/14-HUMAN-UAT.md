---
status: deferred_to_ci
phase: 14-bulk-action-wiring-cent-exact-conversion
source: [14-VERIFICATION.md]
started: 2026-04-20T00:00:00Z
updated: 2026-04-20T00:00:00Z
routed_to: phase-15-ci-e2e
---

## Current Test

[deferred to Phase 15 CI e2e — project policy: e2e verified via PR CI, not local/manual]

## Tests

### 1. Full happy-path Divisão flow (1 connected account)
expected: Divisão menu item enabled; clicking opens BulkDivisionDrawer; submit applies split_settings to all selected non-transfer transactions via BulkProgressDrawer; network payloads contain only `connection_id` and `amount` — no `percentage` field.
result: [deferred to Phase 15 CI e2e]
covered_by: Phase 15 happy-path Playwright test (TEST-01)

### 2. Disabled state with 0 connected accounts
expected: Divisão item visibly disabled; Portuguese hint "Conecte uma conta para usar esta ação." renders; click is a no-op.
result: [deferred to Phase 15 CI e2e]
covered_by: Phase 15 disabled-state Playwright assertion (can be added alongside TEST-01)

### 3. Transfer silent-skip in mixed selection
expected: Transfer transactions are silently absent from BulkProgressDrawer rows; no error surfaced; non-transfers processed normally.
result: [deferred to Phase 15 CI e2e]
covered_by: Phase 15 happy-path Playwright test (TEST-01) includes silent-skip assertion

## Summary

total: 3
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 0
deferred: 3

## Gaps

None — all items covered by Phase 15 e2e coverage. Phase 15 success criteria require a green Playwright run in CI, which validates these items on the PR.
