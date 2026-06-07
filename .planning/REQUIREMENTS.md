# Requirements: Couples Finance App — v1.7 Budgets (Orçamentos)

**Defined:** 2026-06-06
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.
**Milestone goal:** A user can maintain a single monthly budget made up of per-category spending caps, track actual spend ("realizado") per category against each cap, and receive configurable alerts as a category nears or exceeds its cap.
**Scope note:** This milestone covers a **single private budget per user**, composed of **per-category caps**. Multiple budgets per user, shared (connection-level) budgets, and the category equivalence mapping they require are all deferred to a future milestone.
**Source:** Explore session 2026-06-05 (`.planning/notes/shared-budget-design-decisions.md`) + research round 2026-06-06 (`.planning/research/`).

## Milestone v1.7 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Budget Management (BUD)

- [ ] **BUD-01**: A user can create their monthly budget by adding one or more of their own categories, each with its own cap (int64 cents)
- [ ] **BUD-02**: A user can edit their budget — add a category cap, change a category's cap, or remove a category — with changes applying immediately to the current month
- [ ] **BUD-03**: A user has at most one budget, and each category appears in it at most once (one cap per category)
- [ ] **BUD-04**: A user can view their budget with the cap for each included category
- [ ] **BUD-05**: A user can remove a category cap, or delete the whole budget, without affecting the underlying transactions

### Spend Tracking — "Realizado" (SPEND)

- [ ] **SPEND-01**: For each category in the budget, the system computes the current month's realized spend as the owner's net spend in that category (transaction amount minus settlements), reusing `GetBalance`; a split/shared transaction counts only the portion the owner actually paid
- [ ] **SPEND-02**: Realized spend is scoped to the current calendar month with no rollover — computed over the month with no persisted per-period history
- [ ] **SPEND-03**: A user can retrieve their budget with, per category, the cap, realized spend, and remaining amount for a given `YYYY-MM` month

### Threshold Alerts (ALERT)

- [ ] **ALERT-01**: A user can configure one or more alert thresholds (percent of cap, e.g. 80% / 100%) per category cap and enable or disable alerts for that cap
- [ ] **ALERT-02**: When a transaction write causes a category's realized spend to cross a configured threshold, a Web Push notification fires to the budget owner (reusing the v1.6 push infrastructure)
- [ ] **ALERT-03**: Each threshold fires at most once per calendar month per category; the once-per-month latch is set only after a successful push delivery, so a failed delivery is retried on the next qualifying transaction write
- [ ] **ALERT-04**: Each budget alert is persisted in the owner's in-app notification inbox with a deep-link to the budget and the relevant category (reusing the v1.6 inbox)

### Budget Frontend (UI)

- [ ] **UI-01**: A user can open a budget page that lists each category cap with a spend-vs-cap progress bar showing amount, percent, and a distinct over-budget state
- [ ] **UI-02**: A user can add and edit category caps (category, cap, thresholds) through a form with client-side validation
- [ ] **UI-03**: The budget spend display refreshes after a transaction change without a manual page reload (query cache invalidation)
- [ ] **UI-04**: Selecting a budget-alert notification in the inbox navigates the user to their budget

## Future Requirements

Deferred to a later milestone. Tracked but not in the current roadmap.

### Shared Budgets (future — deferred from v1.7 scope cut)

- **SHARED-F1**: Category equivalence mapping between connected users ("my category X ≡ partner's category Y"), scoped to a connection
- **SHARED-F2**: Block deletion of a category referenced by an active equivalence mapping
- **SHARED-F3**: Shared budget tied to a connection, with per-category realized spend = full amount spent by both members across mapped categories (two `GetBalance` calls summed, no double-counting)
- **SHARED-F4**: Shared budget visible to both connection members; threshold alert notifies both members
- **SHARED-F5**: UI to configure category equivalence mappings for a connection

### Budgets (future)

- **BUD-F1**: Multiple budgets per user (e.g. distinct budgets per goal or context)
- **BUD-F2**: Historical view of past months' budget performance (requires persisted per-period snapshots)
- **BUD-F3**: Rollover / envelope-style carry-forward of leftover or overspend between months
- **BUD-F4**: N-way budgets split across more than two people (requires a non-pairwise connection model)
- **ALERT-F1**: Trigger an immediate alert when a cap edit (not a transaction) crosses a threshold mid-month

## Out of Scope

Explicitly excluded for v1.7. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multiple budgets per user | v1.7 ships a single budget per user composed of per-category caps; multiple budgets deferred (BUD-F1) |
| Shared / connection-level budgets | v1.7 is private only; shared budgets + the category mapping they need are deferred (SHARED-F1..F5) |
| Category equivalence mapping | Only needed to bridge per-user categories for shared budgets, which are out of scope this milestone |
| Rollover / envelope carry-forward | v1.7 is monthly with no rollover; leftover/overspend does not accumulate |
| Per-period historical snapshots | Realizado is computed on-read for the current month only; no history table in v1.7 |
| New aggregation SQL for realizado | Must reuse `GetBalance` exclusively to avoid divergence/double-counting |
| Alert on cap edit (vs. transaction write) | Alerts fire on transaction writes only; lowering a cap fires on the next qualifying transaction (ALERT-F1 future) |
| Scheduler / cron for monthly reset or alert sweep | No job infra exists; month reset and alert latch are handled lazily via `last_fired_period` |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUD-01 | Phase 27 | Pending |
| BUD-02 | Phase 27 | Pending |
| BUD-03 | Phase 27 | Pending |
| BUD-04 | Phase 27 | Pending |
| BUD-05 | Phase 27 | Pending |
| SPEND-01 | Phase 27 | Pending |
| SPEND-02 | Phase 27 | Pending |
| SPEND-03 | Phase 27 | Pending |
| ALERT-01 | Phase 28 | Pending |
| ALERT-02 | Phase 28 | Pending |
| ALERT-03 | Phase 28 | Pending |
| ALERT-04 | Phase 28 | Pending |
| UI-01 | Phase 29 | Pending |
| UI-02 | Phase 29 | Pending |
| UI-03 | Phase 29 | Pending |
| UI-04 | Phase 29 | Pending |

**Coverage:**
- v1.7 requirements: 16 total
- Mapped to phases: 16/16 (100%)

---
*Requirements defined: 2026-06-06 — single private budget per user, per-category caps*
*Traceability populated: 2026-06-07 — roadmap created (Phases 26–29)*
