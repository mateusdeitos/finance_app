---
phase: 07
slug: accept-atomic-transfer
status: verified
threats_open: 0
asvs_level: 2
created: 2026-04-16
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| HTTP client → Echo router | Untrusted JSON body + path param; AuthMiddleware extracts userID from JWT | AcceptChargeRequest (account_id, date), charge ID path param |
| client → API (handler → service) | Authenticated user calling Accept; JWT verified by AuthMiddleware — userID comes from ctx, never body | UserID (int64), charge ID, account ID |
| service → repository (GORM) | All writes flow through DBTransaction-owned ctx during Accept | Domain structs, transaction context |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-07-01 | EoP (IDOR) | chargeService.Accept | mitigate | `charge_accept.go:43-45` — Forbidden if caller not ChargerUserID/PayerUserID | CLOSED |
| T-07-02 | EoP (role abuse) | chargeService.Accept | mitigate | `charge_accept.go:50-61` — derives expectedAccepterID from nil account field; Forbidden if mismatch | CLOSED |
| T-07-03 | Tampering (race) | chargeRepository.ConditionalAccept | mitigate | `charge_repository.go:89-101` — conditional UPDATE WHERE status='pending' + RowsAffected check → 409 | CLOSED |
| T-07-04 | Tampering (partial state) | chargeService.Accept | mitigate | `charge_accept.go:99-218` — single DBTransaction wrapping all ops; deferred Rollback | CLOSED |
| T-07-05 | Tampering (ChargeID) | transaction creation | mitigate | `charge_accept.go:167,177,196,205` — ChargeID set on all four transaction structs | CLOSED |
| T-07-06 | Info Disclosure | chargeService.Accept | mitigate | `charge_accept.go:43-45` — IDOR returns Forbidden, not NotFound | CLOSED |
| T-07-07 | Input Validation | AcceptChargeRequest | mitigate | `charge_accept.go:26-34` — AccountID > 0, Date != zero, Amount > 0 if provided | CLOSED |
| T-07-08 | Tampering (SwapIfNeeded) | chargeService.Accept | mitigate | `charge_accept.go:85-87` — single SwapIfNeeded call, locals captured immediately; Pitfall 7 comment | CLOSED |
| T-07-09 | Tampering (nested tx) | chargeService.Accept | mitigate | `charge_accept.go:181,210` — uses transactionRepo.Create directly; file comment documents prohibition | CLOSED |
| T-07-10 | Tampering (stale role) | chargeService.Accept | mitigate | `charge_accept.go:105-125` — balance re-inferred in tx; swap + persist if flipped | CLOSED |
| T-07-11 | Spoofing | ChargeHandler.Accept | mitigate | `charge_handler.go:176` — UserID from appcontext (JWT-backed), never body | CLOSED |
| T-07-12 | Tampering (body) | Body parsing | mitigate | `charge_handler.go:184-186` — c.Bind rejects invalid JSON → 400 | CLOSED |
| T-07-13 | Tampering (path param) | Path param | mitigate | `charge_handler.go:178-181` — strconv.Atoi with error → 400 | CLOSED |
| T-07-14 | EoP (route auth) | Route auth | mitigate | `main.go` — route under /api group with RequireAuth middleware | CLOSED |
| T-07-15 | Info Disclosure (errors) | Error mapping | mitigate | `handler/errors.go` — HandleServiceError delegates to ToHTTPError; no internal error leakage | CLOSED |

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-16 | 15 | 15 | 0 | gsd-security-auditor (sonnet) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-16
