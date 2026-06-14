---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Budgets
status: executing
last_updated: "2026-06-14T12:00:00.000Z"
last_activity: 2026-06-14 -- Phase 26 Plan 01 complete (budgets + budget_alert_thresholds migrations)
progress:
  total_phases: 13
  completed_phases: 4
  total_plans: 19
  completed_plans: 17
  percent: 89
---

## Current Position

Phase: 26 (db-migrations-domain-types) — EXECUTING
Plan: 2 of 3
Status: Executing Phase 26 (Plan 01 complete)
Last activity: 2026-06-14 -- Phase 26 Plan 01 complete (budgets + budget_alert_thresholds migrations)
Resume: .planning/phases/26-db-migrations-domain-types/26-02-PLAN.md

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-06)

**Core value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.
**Current focus:** Phase 26 — db-migrations-domain-types

## Performance Metrics

- v1.0: 4 phases, 8 plans, 1 day (2026-04-09 → 2026-04-10)
- v1.1: 4 phases, 9 plans (2026-04-10 → 2026-04-16)
- v1.2: 2 phases, 6 plans, 1 day (2026-04-17)
- v1.3: 1 phase (partial), 2 plans (2026-04-18 → 2026-04-20) — Phase 12 deferred
- v1.4: 3 phases (13–15), 5 plans (2026-04-20 → 2026-05-05) — shipped
- v1.5: 5 phases (16–19, 21), 7 plans (2026-05-05 → 2026-05-07) — shipped (P20 skipped post-gate)
- v1.6: 4 phases (22–25) — shipped 2026-05-30

## Accumulated Context

### Decisions

- v1.0 shipped 2026-04-10. Archived: `.planning/milestones/v1.0-ROADMAP.md`
- v1.1 shipped 2026-04-16. Archived: `.planning/milestones/v1.1-ROADMAP.md`
- v1.2 shipped 2026-04-17. Archived: `.planning/milestones/v1.2-ROADMAP.md`
- v1.3 shipped 2026-04-20 (partial — Phase 11 only). Archived: `.planning/milestones/v1.3-ROADMAP.md`. Phase 12 deferred to backlog.
- v1.4 shipped 2026-05-05 (Phases 13–15). Archived: `.planning/milestones/v1.4-ROADMAP.md`. Phase dirs moved to `.planning/milestones/v1.4-phases/`.
- v1.5 shipped 2026-05-07 (Phases 16–19, 21; Phase 20 skipped post-gate). Archived: `.planning/milestones/v1.5-ROADMAP.md`, `.planning/milestones/v1.5-RETROSPECTIVE.md`. Phase dirs moved to `.planning/milestones/v1.5-phases/`. Headline: description keystroke 761ms→3.5ms (218×); amount keystroke 929ms→5.6ms (166×). Open follow-up: issue #116 (duplicate-check fires on action flip duplicate→import).
- v1.6 roadmap created 2026-05-30 — Web Push (VAPID) via 4 phases (22–25): backend subscription foundation, notification events + inbox API, frontend subscribe/SW, frontend inbox UI.
- Phase 22 Plan 01 complete 2026-05-30 — webpush-go v1.4.0 added, VAPIDConfig wired from env, push_subscriptions+notifications migrations created, domain+entity types defined with round-trip conversion. UNIQUE constraint on endpoint alone (not composite); no gorm.Model on PushSubscription (hard deletes); empty-string VAPID defaults with Plan 03 startup validation.
- Phase 22 Plan 02 complete 2026-05-30 — PushSubscriptionRepository + NotificationRepository interfaces registered in interfaces.go; push_subscription_repository.go implemented with ON CONFLICT upsert, IDOR-scoped DeleteByEndpoint + ExistsForUser, admin-prune DeleteByEndpointAdmin; notification_repository.go stub; mocks regenerated via mockery; ServiceTestWithDBSuite extended with both repo fields + SetupTest instantiation + Repos literal.
- Phase 22 Plan 03 complete 2026-05-30 — PushSubscriptionService with input validation (endpoint/p256dh/auth) + IDOR-safe userID handling; integration test suite (8 test cases); PushSubscriptionHandler (POST/DELETE/GET with swagger annotations); VAPID startup guard in main.go; DI wiring + 3 authenticated routes; swagger regenerated with push-subscriptions paths. Integration tests compile-checked; Docker-deferred for execution.
- Phase 23 Plan 02 complete 2026-05-30 — NotificationService (panic-safe Dispatch + D-08 coalescing + PushSender injectable + 404/410 prune + pt-BR D-07 copy) + NotificationHandler (4 IDOR-scoped inbox endpoints) + DI wiring + route registration (/unread-count, /read-all before /:id/read); MockNotificationService + MockPushSender regenerated; swagger regenerated with 4 /api/notifications paths; go build ./... + go vet green.
- [Phase ?]: NOTIF-01..04 hooks use post-commit goroutine with context.Background(); D-02 cosmetic-silent, D-03 self-edit guard, D-04 remove-still-notifies in maybeDispatchSplitUpdatedNotification
- v1.7 roadmap created 2026-06-07 — Budgets (private only) via 4 phases (26–29): DB migrations + domain types, budget CRUD + realizado, threshold alerts, frontend. Key decisions: realizado reuses GetBalance exclusively (HideSettlements=false for private); last_fired_period latch set only after successful push delivery; alerts fire on transaction writes only (post-commit goroutine, same pattern as v1.6); no category equivalence mapping in v1.7 (private budgets only); period uses domain.Period helpers throughout.
- Phase 26 context gathered 2026-06-07 (26-CONTEXT.md). Decisions: (D-26-1) private-only schema — NO scope/connection_id/category_mapping_id/CHECK despite research ARCHITECTURE.md's shared design (it predates the scope cut); (D-26-2) ship BudgetScope Go type with Private constant only (ROADMAP deliverable, zero DB cost); (D-26-4) "remove cap" = hard DELETE (thresholds cascade), no deleted_at; (D-26-5) `active` = pause toggle, BudgetFilter.ActiveOnly; (D-26-6) per-threshold `enabled BOOLEAN` on budget_alert_thresholds (beyond ROADMAP's 3-col list); (D-26-7) `last_fired_period` = nullable TEXT 'YYYY-MM' matching SPEND-03 API format; (D-26-8) realizado uses domain.Period.StartDate()/EndDate() exclusively, boundary unit test required.
- Phase 26 Plan 01 complete 2026-06-14 — budgets migration (20260614113028) and budget_alert_thresholds migration (20260614113109) created; all acceptance criteria verified; Docker-deferred static Down-symmetry proof confirms symmetric rollback ordering (child dropped before parent under goose).

### Todos

- Run integration tests with Docker when available
- v1.3 backlog: Frontend edit form for linked transactions (FE-01..FE-05) — revisit when planning v1.6+
- v1.5 follow-up: issue #116 (duplicate-check fires on action flip duplicate→import) — separate PR
- v1.5 follow-ups parked in `.planning/milestones/v1.5-RETROSPECTIVE.md` → "Open follow-ups" (React Compiler wiring; cenário 3/4 row-internal cost; in-flight request cancellation; perf budget CI gate; bulk-select migration; counted-render e2e test)
- v1.7: write Down migrations and test locally with `just migrate-down` before proceeding past Phase 26
- v1.7: ensure `budgetProgressPercent(realizadoCents, capCents)` utility handles cap=0 edge case (return 0, not divide-by-zero)

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
| Phase 23 P23-03 | 25 | - tasks | - files |
| v1.7 future | SHARED-F1..F5: Shared budgets + category equivalence mapping | deferred to future milestone |
| v1.7 future | BUD-F1: Multiple budgets per user | deferred to future milestone |
| v1.7 future | ALERT-F1: Alert on cap edit (not just transaction write) | deferred to future milestone |
