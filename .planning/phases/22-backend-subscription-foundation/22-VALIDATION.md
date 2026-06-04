---
phase: 22
slug: backend-subscription-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-30
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `testify/suite` v1.11.1 + testcontainers-go v0.40.0 |
| **Config file** | none — integration tests gated by `//go:build integration` (`-tags=integration`) |
| **Quick run command** | `just test-unit` (service unit tests with mocks, no DB) |
| **Full suite command** | `just test-integration` (real Postgres via testcontainers; requires Docker) |
| **Estimated runtime** | ~30–60 seconds (integration, container spin-up dominated) |

---

## Sampling Rate

- **After every task commit:** Run `just test-unit`
- **After every plan wave:** Run `just test-integration`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (assigned by planner) | 01 | 1 | SUB-03 | T-22-IDOR | POST stores subscription for context user only | integration | `go test -tags=integration ./internal/service/ -run TestPushSubscription` | ❌ W0 | ⬜ pending |
| (assigned by planner) | 01 | 1 | SUB-03 | — | POST upserts (replaces) when endpoint already exists | integration | same | ❌ W0 | ⬜ pending |
| (assigned by planner) | 01 | 1 | SUB-03 | T-22-IDOR | DELETE scoped to `user_id = ? AND endpoint = ?` | integration | same | ❌ W0 | ⬜ pending |
| (assigned by planner) | 01 | 1 | SUB-03 | — | `DeleteByEndpointAdmin` removes row without userID check (prune capability) | integration | same | ❌ W0 | ⬜ pending |
| (assigned by planner) | 01 | 1 | SUB-04 | — | GET returns `{"subscribed":true}` when subscription exists | integration | same | ❌ W0 | ⬜ pending |
| (assigned by planner) | 01 | 1 | SUB-04 | — | GET returns `{"subscribed":false}` when subscription absent | integration | same | ❌ W0 | ⬜ pending |
| (assigned by planner) | 01 | 1 | SUB-03 | — | App builds/starts with VAPID keys present | build | `go build ./cmd/server/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `internal/service/push_subscription_service_test.go` — integration suite embedding `ServiceTestWithDBSuite`, covers SUB-03, SUB-04
- [ ] `internal/service/test_setup_with_db.go` — extend `ServiceTestWithDBSuite.SetupTest` with `PushSubscriptionRepository` (and `NotificationRepository` placeholder) fields

*Both new test files follow the existing `ServiceTestWithDBSuite` pattern — no new test framework needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Actual 404/410 prune against a live push service | SUB-03 | Real push delivery is wired in Phase 23; Phase 22 only delivers the `DeleteByEndpointAdmin` capability | Deferred to Phase 23 verification |

*All Phase 22 storage/endpoint behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
