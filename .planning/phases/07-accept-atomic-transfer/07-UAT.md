---
status: testing
phase: 07-accept-atomic-transfer
source:
  - 07-01-SUMMARY.md
  - 07-02-SUMMARY.md
started: 2026-04-15T18:30:00Z
updated: 2026-04-15T22:55:00Z
---

## Current Test

number: 2
name: Accept Charge — Happy Path
expected: |
  As the accepter (the party whose account_id is nil on the charge), POST /api/charges/{id}/accept
  with `{"account_id": <your account>, "date": "2026-04-15T12:00:00Z"}` returns 204 No Content.
  Afterward: charge status=paid, four transactions exist with charge_id set (two linked transfer pairs — charger's connection→private, payer's private→connection), and GET /api/charges/{id} reflects the updated accepted state.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running backend. Run `just migrate-up` then `just run` from scratch. Server boots without errors, migration `20260415000000_add_date_to_charges.sql` applies cleanly (charges.date TIMESTAMPTZ NOT NULL column exists), and the app responds to a basic health/ping request.
result: pass

### 2. Accept Charge — Happy Path
expected: |
  As the accepter (the party whose account_id is nil on the charge), POST /api/charges/{id}/accept
  with `{"account_id": <your account>, "date": "2026-04-15T12:00:00Z"}` returns 204 No Content.
  Afterward: charge status=paid, four transactions exist with charge_id set (two linked transfer pairs — charger's connection→private, payer's private→connection), and GET /api/charges/{id} reflects the updated accepted state.
result: [pending]

### 3. Double Accept Rejected
expected: |
  Call POST /api/charges/{id}/accept a second time after the first succeeds. Response is 409 Conflict
  (no additional transactions created, no duplicate transfers).
result: [pending]

### 4. Non-Party Forbidden
expected: |
  A user who is NEITHER ChargerUserID nor PayerUserID on the charge calls POST /api/charges/{id}/accept.
  Response is 403 Forbidden. No charge state changes.
result: [pending]

### 5. Initiator Cannot Accept Own Charge
expected: |
  The user who CREATED the charge (the initiator — their account_id is already set on the charge)
  calls POST /api/charges/{id}/accept. Response is 403 Forbidden (only the counterparty can accept).
result: [pending]

### 6. Bad Path ID → 400
expected: |
  POST /api/charges/abc/accept → 400 Bad Request. Service layer not invoked.
result: [pending]

### 7. Malformed JSON Body → 400
expected: |
  POST /api/charges/{id}/accept with body `{invalid json` → 400 Bad Request.
result: [pending]

### 8. Atomic Rollback on Failure
expected: |
  If the second transfer creation fails (e.g., FK violation via non-existent account_id in the request),
  NO partial state is persisted: charge remains status=pending, no orphaned transactions, integration
  test `TestAccept_Atomic` passes (`just test-integration` or targeted `go test -tags=integration -run TestChargeService/TestAccept_Atomic`).
result: [pending]

### 9. Role Re-Inference on Balance Flip
expected: |
  When the charger's period balance flipped since charge creation (balance now negative), acceptance
  swaps ChargerAccountID ↔ PayerAccountID inside the same tx and still produces correct dual transfers.
  Integration test `TestAccept_RoleReinference_BalanceFlipped` passes.
result: [pending]

### 10. Swagger Docs Updated
expected: |
  Open /swagger/index.html (or inspect backend/docs/swagger.json). Endpoint `POST /api/charges/{id}/accept`
  is documented with `domain.AcceptChargeRequest` body and 204/400/401/403/404/409 responses.
result: [pending]

### 11. Full Backend Test Suite Green
expected: |
  Run `just test` from backend/. All unit + integration tests pass — including the 7 ChargeServiceTestSuite
  tests from 07-01 and the 5 ChargeHandler_Accept tests from 07-02.
result: [pending]

## Summary

total: 11
passed: 1
issues: 0
pending: 10
skipped: 0

## Gaps

[none yet]
