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

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | Lint failures | Test failures |
|-----------|--------|-------|------|---------------|---------------|
| v1.0 Recurrence Redesign | 4 | 8 | 1 | 2 (intrange) | 10+ (missing files on local) |
