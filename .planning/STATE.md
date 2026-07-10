---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Transaction Templates
status: executing
stopped_at: Phase 30 in progress (2/3 plans) -- TemplateFormDrawer + TemplatesManagementDrawer + toolbar entry point (30-02) landed
last_updated: "2026-07-10T19:30:00Z"
last_activity: 2026-07-10 -- 30-02 (TemplateFormDrawer create/edit, TemplatesManagementDrawer list/delete with 3-cap, "Gerenciar modelos" toolbar entry point) executed
progress:
  total_phases: 15
  completed_phases: 8
  total_plans: 28
  completed_plans: 27
  percent: 96
---

## Current Position

Phase: 30 in progress (2/3 plans) -- Save-as-template (30-03) remains
Plan: 30-02 complete
Status: Executing
Last activity: 2026-07-10 -- 30-02 (TemplateFormDrawer + TemplatesManagementDrawer + toolbar entry point) executed

Progress: [█████████▌] 96%

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
- [28-01] templateMode is additive (default false) threaded through SplitSettingsFields -> SplitRow -> SplitRowControls; per-row `= R$ X` preview and `Soma X%` footer suppressed via explicit `&& !templateMode` guards (not just the pre-existing `totalAmount > 0` guard) per locked decision D-01 (suppress, no placeholder); %/R$ SegmentedControl toggle stays functional — Phase 28 (SplitSettingsFields Template Mode) is now complete, unblocking Phase 29/30
- [29-01] Data layer only (read-only): Transactions.Template/TemplatePayload types reuse SplitSetting/TransactionType verbatim (no redeclaration); fetchTransactionTemplates mirrors fetchAccounts exactly (no Content-Type header on GET, credentials:'include' only) instead of the plan's illustrative snippet which included the header; useTransactionTemplates mirrors useAccounts's select-generic + invalidate + 5min staleTime shape — no mutation hooks yet (Phase 30 scope)
- [29-02] buildTemplateFormPatch clears a stale account_id to 0 (the form's existing "unselected" sentinel), not undefined/null — TransactionFormValues.account_id is a strict non-nullable number in the zod schema; category_id/destination_account_id clear to null (nullable in schema); stale tag_ids are dropped, valid ones mapped to names. Return type is Pick<TransactionFormValues, ...> (fully-required 7-field subset) rather than the plan's illustrative Partial<TransactionFormValues>, avoiding non-null assertions at the TransactionForm call site. TemplateQuickChips is gated to create mode only via an additive showTemplateChips prop on TransactionForm (default false); CreateTransactionDrawer passes it, UpdateTransactionDrawer does not — Phase 29 (Frontend Chip Apply Flow) is now complete, APPLY-01..04 all done
- [30-01] Data layer write side only (no UI yet): createTransactionTemplate/updateTransactionTemplate/deleteTransactionTemplate mirror categories.ts's exact fetch options + `data.message ?? 'fallback'` error-body parsing (including on DELETE, which the plan's illustrative snippet omitted); the 3 mutation hooks return `{ mutation }` only, caller owns `onSuccess`/invalidation, matching useCategories.ts. buildTemplatePayloadFromForm maps each split_settings row explicitly (`connection_id`/`percentage`/`amount`/`date: s.date ?? undefined`) instead of assigning `values.split_settings` directly — TransactionFormValues' split date is `string | null | undefined` (zod `.nullable().optional()`) while Transactions.SplitSetting.date is `string | undefined`, so a direct assignment fails tsc; mirrors buildTransactionPayload.ts's existing per-row date normalization. MNG-01/MNG-02 stay open (Pending) until 30-02/30-03 land the actual UI — this plan only unblocks them.
- [30-02] templateFormSchema.ts reuses applySharedRefinements + splitSettingSchema from transactionFormSchema.ts (imported, not duplicated) with a constant recurrenceEnabled:false shape; TemplateFormFields.tsx was split out of TemplateFormDrawer.tsx (plan-sanctioned extraction) and landed at 253 lines (over the ~200 guideline) since it carries 4 Select/SegmentedControl Controller blocks mirroring TransactionForm's own larger field section — documented, not further split. buildTemplatePayloadFromForm (Plan-01, typed `values: TransactionFormValues`) is called with an explicit full-shape object literal (7 template fields + amount:0/date:''/recurrence-nulls, none read by the builder) rather than a spread, to stay type-safe without touching the Plan-01 file. Delete confirmation is an inline expand-in-row (local useState in TemplateListRow), not a separate confirm-drawer file, keeping the file set to the plan's declared scope plus the two plan-sanctioned subcomponents (TemplateFormFields, TemplateListRow). Reused existing TransactionsTestIds (SelectAccount/SelectCategory/SelectDestinationAccount/SegmentedTransactionType/TagsInput/InputDescription/Option*) for the copied field Controllers instead of minting Template-prefixed duplicates. MNG-01 is now fully satisfied (management surface reachable, list + create/edit/delete + immediate refresh); MNG-02 remains open for 30-03.

### Todos

- Run v1.6 integration tests with Docker when available
- Run Phase 27 (27-04) testcontainers integration suite with Docker in CI to confirm SAFE-01/SAFE-02 assertions pass against a live PostgreSQL container
- v1.3 backlog: Frontend edit form for linked transactions (FE-01..FE-05) — revisit later
- v1.5 follow-up: issue #116 (duplicate-check fires on action flip) — separate PR
- Phase 30 (Frontend Management UI), plan 03 remaining: "Save as template" mini-drawer + footer button, 3-cap disable (30-03) — the mutation data layer (30-01) and management/form drawers (30-02) have landed and are ready to consume

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

Last session: 2026-07-10T19:30:00Z
Stopped at: Phase 30 in progress (2/3 plans) -- TemplateFormDrawer + TemplatesManagementDrawer + toolbar entry point landed
Resume file: None -- next up is 30-03 (Save-as-template mini-drawer + footer button, 3-cap disable)
