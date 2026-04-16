---
phase: 7
slug: accept-atomic-transfer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | go test (testify/suite + testcontainers) |
| **Config file** | backend/justfile |
| **Quick run command** | `cd backend && go test ./internal/service/... -short -run TestCharge` |
| **Full suite command** | `cd backend && go test -tags=integration ./internal/service/... -run TestCharge` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && go test ./internal/service/... -short -run TestCharge`
- **After every plan wave:** Run `cd backend && go test -tags=integration ./internal/service/... -run TestCharge`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 0 | CHG-04 | — | N/A | integration | `cd backend && go test -tags=integration ./internal/service/... -run TestChargeService/TestAccept` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | CHG-09 | — | N/A | integration | `cd backend && go test -tags=integration ./internal/service/... -run TestChargeService/TestAccept_Atomic` | ❌ W0 | ⬜ pending |
| 7-01-03 | 01 | 1 | CHG-10 | — | N/A | integration | `cd backend && go test -tags=integration ./internal/service/... -run TestChargeService/TestAccept_DoubleAccept` | ❌ W0 | ⬜ pending |
| 7-01-04 | 01 | 2 | CHG-11 | — | Returns 403 for non-payer | integration | `cd backend && go test -tags=integration ./internal/service/... -run TestChargeService/TestAccept_Authz` | ❌ W0 | ⬜ pending |
| 7-02-01 | 02 | 1 | CHG-04 | — | N/A | integration | `cd backend && go test -tags=integration ./internal/handler/... -run TestChargeHandler/TestAccept` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/internal/service/charge_service_test.go` — test stubs for CHG-04, CHG-09, CHG-10, CHG-11
- [ ] Update `backend/internal/service/test_setup_with_db.go` — wire ChargeRepository and chargeService

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Concurrent double-accept race | CHG-10 | Requires concurrent goroutines to reproduce race condition deterministically | Run two goroutines simultaneously calling Accept on same charge; assert exactly one succeeds and one returns conflict |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
