---
phase: 5
slug: charge-domain-db
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | go test |
| **Config file** | backend/justfile (uses `just test-unit` and `just test-integration`) |
| **Quick run command** | `cd backend && go test ./internal/domain/... -short` |
| **Full suite command** | `cd backend && go test ./internal/domain/... ./internal/entity/...` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && go test ./internal/domain/... -short`
- **After every plan wave:** Run `cd backend && go test ./internal/domain/... ./internal/entity/...`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | CHG-01 | — | N/A | unit | `cd backend && go test ./internal/domain/... -run TestCharge -short` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | CHG-07 | — | N/A | unit | `cd backend && go test ./internal/domain/... -run TestChargeValidateTransition -short` | ❌ W0 | ⬜ pending |
| 5-01-03 | 01 | 2 | CHG-02 | — | N/A | manual | `just migrate-up` succeeds on fresh DB | N/A | ⬜ pending |
| 5-01-04 | 01 | 2 | TXN-01 | — | N/A | manual | `just migrate-up` adds charge_id column | N/A | ⬜ pending |
| 5-01-05 | 01 | 1 | TXN-02 | — | N/A | unit | `cd backend && go test ./internal/domain/... -run TestTransaction -short` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/internal/domain/charge_test.go` — stubs for CHG-01, CHG-07 (ChargeStatus IsValid, ValidateTransition)

*Existing go test infrastructure covers all other requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `charges` table created with correct constraints | CHG-02 | DB migration requires running DB | `just migrate-up` on fresh DB; `\d charges` in psql shows all FK + CHECK constraints |
| `transactions.charge_id` column added | TXN-01 | DB migration | `\d transactions` shows nullable `charge_id` FK column |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
