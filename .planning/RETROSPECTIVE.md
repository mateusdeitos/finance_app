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

1. Charge entity with status machine (pending → paid/rejected/cancelled) and full DB schema
2. Charge CRUD API with IDOR protection and pending badge count endpoint
3. Atomic charge acceptance with dual-transfer creation and race-condition guard
4. Complete charges frontend — listing with tabs, create/accept/reject/cancel forms, sidebar badge, E2E tests

### What Worked

- Domain-first approach continued from v1.0 — solid foundation before service/handler layers
- Atomic accept flow with conditional UPDATE race guard — clean single-fence pattern
- Non-optimistic mutation pattern for financial state — avoids UI showing incorrect balances
- Shared PeriodNavigator with callback for reuse across transactions and charges pages

### What Was Inefficient

- MILESTONES.md v1.1 entry shipped with empty one-liner placeholders (never filled)
- Handler tests used mock-based approach due to lack of existing handler test patterns — works but less confidence than integration tests

### Patterns Established

- `transactionRepo.Create` directly (bypass service) when inside a service-level DB transaction — avoids nested transactions
- Conditional UPDATE WHERE status='pending' as single atomic fence for race conditions
- `createFileRoute` directly with `_authenticated` prefix instead of wrapper utility — preserves TanStack Router type inference

### Key Lessons

- Financial state mutations should never use optimistic updates — stale balance display is worse than slower UI
- Cross-query invalidation (charges → transactions + balance) needed when one mutation creates records in another domain

---

## Milestone: v1.2 — Transactions Bulk Actions

**Shipped:** 2026-04-17
**Phases:** 2 | **Plans:** 6

### What Was Built

1. Generic BulkProgressDrawer with sequential processing and stop-on-error behavior
2. PropagationSettingsDrawer extended with update-oriented wording and blue confirm button
3. SelectCategoryDrawer (read-only hierarchy) and SelectDateDrawer (bottom date picker) using renderDrawer promise pattern
4. Bulk category/date change wired into SelectionActionBar with menu, SEL-02 silent skip, per-item propagation
5. Backend avatar infrastructure — OAuth extraction, account color column, partner data via correlated subqueries
6. UserAvatar, AccountAvatar, ColorSwatchPicker components wired across entire app

### What Worked

- Reusing existing infrastructure (SelectionActionBar, BulkDeleteProgressDrawer pattern, PropagationSettingsDrawer) — Phase 9 was mostly composition not creation
- renderDrawer promise pattern for sequential drawer chains — clean async flow without callback nesting
- Parallel plan execution (wave-based) — backend and frontend plans ran concurrently where possible
- Correlated subqueries for partner data avoided additional JOINs while keeping single-query performance

### What Was Inefficient

- Multiple fix commits for avatar system (color contrast, size, tooltip offset, referrerPolicy) — visual details hard to get right without live preview during execution
- Phase 10 had 3 verification items marked `human_needed` — could have been caught with automated visual regression tests
- v1.2 REQUIREMENTS.md was never created (requirements lived only in ROADMAP.md phase definitions)

### Patterns Established

- `*string` for optional URL fields (AvatarURL) — NULL not empty string, distinguishes "no value" from "empty"
- Inline CategoryRow component for read-only hierarchy rendering (avoids passing edit props to CategoryCard)
- ColorSwatchPicker with preset grid + ring selection state for color choices

### Key Lessons

- Avatar/visual components need iterative visual verification — plan for 2-3 fix rounds when no live preview available
- Silent skip (SEL-02) is better UX than error dialogs for operations on items user can't modify
- `gorm:"-"` tags needed for virtual fields populated by raw SQL but not stored in the table

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | Lint failures | Test failures |
|-----------|--------|-------|------|---------------|---------------|
| v1.0 Recurrence Redesign | 4 | 8 | 1 | 2 (intrange) | 10+ (missing files on local) |
| v1.1 Charges | 4 | 9 | 6 | 0 | 0 |
| v1.2 Bulk Actions + Avatars | 2 | 6 | 1 | 1 (tagalign) | 1 (BeforeCreate default color) |
