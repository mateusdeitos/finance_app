---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Transaction Templates
status: executing
stopped_at: Phase 27 Plan 04 executed (Phase 27 complete)
last_updated: "2026-07-09T00:01:40Z"
last_activity: 2026-07-09 -- 27-04 (testcontainers integration suite: cap race SAFE-01, IDOR 404 SAFE-02, duplicate, validation, ordering, isolation) executed -- Phase 27 complete
progress:
  total_phases: 15
  completed_phases: 6
  total_plans: 23
  completed_plans: 22
  percent: 96
---

## Current Position

Phase: 27 (complete) -- Phase 28 next
Plan: 04 complete (Phase 27 finished: 4/4 plans)
Status: Executing
Last activity: 2026-07-09 -- 27-04 (testcontainers integration suite: cap race SAFE-01, IDOR 404 SAFE-02, duplicate, validation, ordering, isolation) executed -- Phase 27 complete

Progress: [██████████] 96%

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-07)

**Core value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.
**Current focus:** Phase 26 — backend-foundation

## Performance Metrics

- v1.0: 4 phases, 8 plans, 1 day (2026-04-09 → 2026-04-10)
- v1.1: 4 phases, 9 plans (2026-04-10 → 2026-04-16)
- v1.2: 2 phases, 6 plans, 1 day (2026-04-17)
- v1.3: 1 phase (partial), 2 plans (2026-04-18 → 2026-04-20) — Phase 12 deferred
- v1.4: 3 phases (13–15), 5 plans (2026-04-20 → 2026-05-05) — shipped
- v1.5: 5 phases (16–19, 21), 7 plans (2026-05-05 → 2026-05-07) — shipped (P20 skipped post-gate)
- v1.6: 4 phases (22–25) — completed

## Accumulated Context

### Decisions

- Dedicated `transaction_templates` table (NOT `is_template` column) — isolates templates from all financial query paths
- Split config stored as typed JSONB `[]domain.SplitSettings` on the template row — not a join table
- Tags via `template_tags` join table mirroring `transaction_tags` — FK integrity + cascade on tag delete
- CategoryService.Delete must call `templateRepo.NullifyCategory` to avoid CP-8 (latent 400 on apply)
- 3-template cap enforced via conditional INSERT in service (race-safe); no DB trigger
- IDOR: all endpoints gate on `WHERE user_id = ?`; 404 on mismatch (not 403)
- Phase 28 (SplitSettingsFields mode) is a discrete design decision phase — unresolved open question from research
- [26-01] domain.SplitSettings reused verbatim in TransactionTemplatePayload (not redeclared) — ensures both split modes round-trip faithfully (TMPL-05)
- [26-01] No DisallowUnknownFields on TransactionTemplatePayload in Phase 26 — strict unmarshal wired in Phase 27 service (D-01b)
- [26-02] TransactionTemplatePayload entity type is a type alias of domain.TransactionTemplatePayload — avoids struct duplication and makes cast-based converters trivial
- [26-02] Typed Scan/Value on entity payload rather than untyped JSONB map — enforces payload schema at the Go type level
- [27-01] TEMPLATE.LIMIT_REACHED and TEMPLATE.DUPLICATE_NAME use ErrCodeAlreadyExists (409), not ErrCodeValidation (400) — deliberately diverges from the CATEGORY.DUPLICATE_NAME precedent's actual (incorrect) code
- [27-01] Create's race-safe cap uses a single .Raw(INSERT...RETURNING...).Scan(&created) statement rather than .Rows()+ScanRows() — simpler, still respects the entity's JSONB Scan/Value, and RowsAffected==0 on the result signals the cap was hit
- [27-02] TransactionTemplateService.Create/Update wrap the duplicate-name pre-check + write in one DBTransaction (category_service.Create skeleton); Update's duplicate check excludes the row's own id so a no-op rename doesn't false-positive
- [27-03] PUT /api/transaction-templates/:id returns 204 (no re-fetch) since this phase has no GET /:id endpoint; client already holds the full replacement payload it sent
- [27-03] Handler tests prove IDOR by sending a spoofed `user_id` in the Create request body (silently dropped by lenient unmarshal, no UserID field on the DTO) and asserting the mock receives the CONTEXT userID instead
- [27-04] testcontainers integration suite (no `//go:build integration` tag, matching `user_connection_service_test.go` precedent) proves SAFE-01 (concurrent double-create at count=2 -> exactly one success + one TEMPLATE.LIMIT_REACHED, final count==3) and SAFE-02 (cross-user Update/Delete -> pkgErrors.IsNotFound, never Forbidden) against real PostgreSQL; Docker unavailable in this execution environment ("rootless Docker not found"), so the suite compiles/vets clean but actual execution is deferred to CI — Phase 27 (Backend CRUD API) is now fully complete

### Todos

- Run v1.6 integration tests with Docker when available
- Run Phase 27 (27-04) testcontainers integration suite with Docker in CI to confirm SAFE-01/SAFE-02 assertions pass against a live PostgreSQL container
- v1.3 backlog: Frontend edit form for linked transactions (FE-01..FE-05) — revisit later
- v1.5 follow-up: issue #116 (duplicate-check fires on action flip) — separate PR
- Phase 29: Read `CurrencyInput.tsx` before implementing `reset({ amount: 0 })` to confirm blank display behavior

### Blockers

None

## Deferred Items

| Category | Item | Status |
|----------|------|--------|
| backlog | v1.3 Phase 12: Frontend Edit Form for linked transactions (FE-01..FE-05) | deferred |
| uat_gap | Phase 07: 07-UAT.md | partial |
| uat_gap | Phase 09: 09-HUMAN-UAT.md (5 pending scenarios) | partial |
| verification_gap | Phase 08: 08-VERIFICATION.md | human_needed |
| verification_gap | Phase 09: 09-VERIFICATION.md | human_needed |
| verification_gap | Phase 10: 10-VERIFICATION.md | human_needed |

## Session Continuity

Last session: 2026-07-09T00:01:40Z
Stopped at: Phase 27 Plan 04 executed (Phase 27 complete)
Resume file: .planning/phases/28-splitsettingsfields-template-mode (Phase 28 not yet planned)
