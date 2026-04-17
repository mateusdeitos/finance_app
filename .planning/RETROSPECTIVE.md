# Retrospective

## Milestone: v1.0 — Recurrence Redesign

**Shipped:** 2026-04-10
**Phases:** 4 | **Plans:** 8

### What Was Built

1. Replaced `RecurrenceSettings.Repetitions | EndDate` with `CurrentInstallment + TotalInstallments` in the Go domain layer
2. Fixed the create loop to start from `current_installment` with date offsets relative to that base
3. Replaced the recurrence form in React — "Parcela atual" + "Total de parcelas" inputs with cross-field Zod validation
4. Updated TypeScript types, payload builder, form schema, and Swagger docs
5. Added integration tests for canonical create cases and unit tests for all three validation rules
6. Updated all existing Playwright e2e seeds; added new recurrence e2e tests

### What Worked

- Domain-first approach: fixing the struct in Phase 1 before touching services made downstream work mechanical
- Reusing `validateRecurrenceSettings` across create and update paths avoided divergence
- Using API-seeded e2e tests (not UI-driven) for recurrence assertions avoided flakiness from shared DB row counts
- Yolo mode: zero confirmation prompts across 8 plans executed autonomously

### What Was Inefficient

- Test files (`transaction_business_rules_test.go`, `transaction_coverage_gaps_test.go`, `transaction_validation_test.go`) existed on the remote branch but were missing locally — they were committed to a divergent branch that was never merged, causing CI failures only discovered after push
- The lint failure (`intrange`) on the two new test loops was also only caught post-push — could have been caught with a local `golangci-lint run` step in the execute workflow

### Patterns Established

- When restoring missing files from git history: use `git log --all --oneline --name-only | grep <filename>` to find the commit, then `git show <sha>:path > destination`
- Always run `golangci-lint run ./...` locally before pushing when new test files are added
- `for i := range N` (Go 1.22+) is required by the `intrange` linter — prefer over `for i := 0; i < N; i++`

### Key Lessons

- Check `git log --all` (not just `HEAD`) when CI references files that don't exist locally — they may be in unreachable commits on the remote
- The `intrange` linter enforces Go 1.22 integer range syntax; new test loops need to use `for i := range N`
- `status: human_needed` in VERIFICATION.md does not block `/gsd-next` (only `FAIL` items do)

---

## Milestone: v1.1 — Charges

**Shipped:** 2026-04-16
**Phases:** 4 | **Plans:** 9

### What Was Built

1. Charge domain entity with status machine (pending → paid/rejected/cancelled) and DB schema
2. Charge CRUD API with IDOR protection and connection-scoped listing
3. Atomic charge acceptance with race-condition guard (conditional UPDATE WHERE status='pending')
4. Charges frontend with two-tab layout, period navigation, ChargeCards, and confirmation modals

### What Worked

- Role re-inference from live balance during accept — handles balance flips between creation and acceptance
- Direct `transactionRepo.Create` in accept flow bypasses nested DB transaction issues
- Shared `PeriodNavigator` component reused from transactions page
- `createAuthenticatedRoute` utility streamlined page setup

### What Was Inefficient

- E2e test flakiness from shared partner accounts — required unique-per-test partners to prevent 403s
- Mantine Drawer root detection unreliable — had to wait for inner elements instead

### Patterns Established

- Conditional UPDATE as atomic fence (no SELECT FOR UPDATE needed)
- `payer_user_id`/`charger_user_id` explicit directional fields over connection orientation
- Non-optimistic mutation pattern for financial state transitions

### Key Lessons

- Playwright tests sharing partner users across test runs causes race conditions — isolate test data per run
- Mantine Drawer mounting order means inner content loads after root — wait on inner elements

---

## Milestone: v1.2 — Bulk Actions & Observability

**Shipped:** 2026-04-17
**Phases:** 2 | **Plans:** 5

### What Was Built

1. Generic `BulkProgressDrawer` component for per-transaction update progress
2. `SelectCategoryDrawer` and `SelectDateDrawer` using renderDrawer promise pattern
3. `SelectionActionBar` dropdown with bulk category/date/delete actions integrated end-to-end
4. `pkg/applog` — context-scoped zerolog wrapper with pointer-mutation field accumulation
5. HTTP logging middleware with X-Request-ID, dynamic log levels, and Stripe's single-log pattern

### What Worked

- Reusing existing selection infrastructure (selectedIds, toggleSelection, checkboxes) — zero new selection code needed
- renderDrawer promise pattern — clean async flow for input-gathering drawers
- Pointer mutation on logger (`*zerolog.Logger`) — fields from any layer accumulate on same instance
- `getEligibleIds()` silent filter — security boundary without user-facing errors

### What Was Inefficient

- Echo v4 HTTPErrorHandler runs after middleware chain, so `c.Response().Status` reads 200 when error returned — required deriving status from `echo.HTTPError.Code` directly (caught by tests)
- Bulk update initially sent partial payload, causing data loss on non-updated fields — required sending full transaction payload

### Patterns Established

- `applog.FromContext()` returns nop logger when absent — safe for unit tests without logger setup
- `severity` field name for Cloud Run (Cloud Logging parses it natively)
- Custom middleware over hlog package — hlog designed for net/http + alice, doesn't fit Echo

### Key Lessons

- Echo error handlers run *after* the middleware chain completes — middleware can't rely on `c.Response().Status` for error responses
- Bulk updates must send full entity payload, not just changed fields — partial updates cause silent data loss
- Authorization headers must never be logged — log method, path, IP, status, latency, request_id, user_id only

### Cost Observations

- 2 phases, 5 plans executed in single session
- Phase 9 (frontend) reused heavy existing infrastructure — fast execution
- Phase 10 (backend) was greenfield but small scope — 2 plans sufficient

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | Files Changed | LOC |
|-----------|--------|-------|------|---------------|-----|
| v1.0 Recurrence Redesign | 4 | 8 | 1 | 27 | +3460/-489 |
| v1.1 Charges | 4 | 9 | 6 | — | — |
| v1.2 Bulk Actions & Observability | 2 | 5 | 1 | 75 | +7324/-394 |
