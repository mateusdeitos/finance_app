# Requirements: Couples Finance App — v1.7 Budgets (Orçamentos)

**Defined:** 2026-06-06
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.
**Milestone goal:** Couples can set monthly per-category spending caps — configurable as shared (connection) or private — track actual spend ("realizado") against the cap, and receive configurable alerts as a budget nears or exceeds its limit.
**Source:** Explore session 2026-06-05 (`.planning/notes/shared-budget-design-decisions.md`) + research round 2026-06-06 (`.planning/research/`).

## Milestone v1.7 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Category Equivalence Mapping (MAP)

- [ ] **MAP-01**: Within a connection, a user can define an equivalence between one of their own categories and the partner's category ("my category X ≡ partner's category Y")
- [ ] **MAP-02**: A user can list, edit, and remove the category equivalences for a connection
- [ ] **MAP-03**: The system blocks deletion of a category that is referenced by an active equivalence mapping, returning a tagged error instead of orphaning the mapping

### Budget Management (BUD)

- [ ] **BUD-01**: A user can create a budget for a category with a monthly cap (int64 cents) and a scope of either private or shared
- [ ] **BUD-02**: A shared budget is tied to a connection and requires a category equivalence mapping; a private budget belongs to the creating user only
- [ ] **BUD-03**: A user can edit a budget's cap and alert thresholds, and changes apply immediately to the current month
- [ ] **BUD-04**: A user can delete a budget without affecting the underlying transactions
- [ ] **BUD-05**: A user can list their budgets; for a shared budget, both connection members can see it

### Spend Tracking — "Realizado" (SPEND)

- [ ] **SPEND-01**: For a private budget, the system computes the current month's realized spend as the owner's net spend in the category (transaction amount minus settlements), reusing `GetBalance`
- [ ] **SPEND-02**: For a shared budget, the system computes realized spend as the full amount spent by both connection members across their mapped categories, reusing `GetBalance` (two calls summed; no double-counting of split transactions)
- [ ] **SPEND-03**: Realized spend is scoped to the current calendar month with no rollover — computed over the month with no persisted per-period history
- [ ] **SPEND-04**: A user can retrieve a budget's realized spend, cap, and remaining amount for a given `YYYY-MM` month

### Threshold Alerts (ALERT)

- [ ] **ALERT-01**: A user can configure one or more alert thresholds (percent of cap, e.g. 80% / 100%) per budget and enable or disable alerts for that budget
- [ ] **ALERT-02**: When a transaction write causes a budget's realized spend to cross a configured threshold, a Web Push notification fires (reusing the v1.6 push infrastructure)
- [ ] **ALERT-03**: Each threshold fires at most once per calendar month; the once-per-month latch is set only after a successful push delivery, so a failed delivery is retried on the next qualifying transaction write
- [ ] **ALERT-04**: For a shared budget both connection members are notified; for a private budget only the owner is notified
- [ ] **ALERT-05**: Each budget alert is persisted in the in-app notification inbox with a deep-link to the related budget (reusing the v1.6 inbox)

### Budget Frontend (UI)

- [ ] **UI-01**: A user can open a budgets page that lists each budget with a spend-vs-cap progress bar showing amount, percent, and a distinct over-budget state
- [ ] **UI-02**: A user can create and edit a budget through a form (category, cap, scope, thresholds) with client-side validation
- [ ] **UI-03**: A user can configure category equivalence mappings for a connection from the UI
- [ ] **UI-04**: The budget spend display refreshes after a transaction change without a manual page reload (query cache invalidation)
- [ ] **UI-05**: Selecting a budget-alert notification in the inbox navigates the user to the related budget

## Future Requirements

Deferred to a later milestone. Tracked but not in the current roadmap.

### Budgets (future)

- **BUD-F1**: Historical view of past months' budget performance (requires persisted per-period snapshots)
- **BUD-F2**: Rollover / envelope-style carry-forward of leftover or overspend between months
- **BUD-F3**: N-way budgets split across more than two people (requires a non-pairwise connection model)
- **ALERT-F1**: Trigger an immediate alert when a cap edit (not a transaction) crosses a threshold mid-month

## Out of Scope

Explicitly excluded for v1.7. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Rollover / envelope carry-forward | v1.7 is monthly with no rollover; leftover/overspend does not accumulate |
| Per-period historical snapshots | Realizado is computed on-read for the current month only; no history table in v1.7 |
| N-way splits in budgets | Connection model is pairwise today; multi-person budgets deferred |
| Shared (connection-owned) categories | Too large a structural change; v1.7 bridges per-user categories via an equivalence map |
| New aggregation SQL for realizado | Must reuse `GetBalance` exclusively to avoid divergence/double-counting |
| Alert on cap edit (vs. transaction write) | Alerts fire on transaction writes only; lowering a cap fires on the next qualifying transaction (BUD-F1 future) |
| Scheduler / cron for monthly reset or alert sweep | No job infra exists; month reset and alert latch are handled lazily via `last_fired_period` |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| _pending roadmap_ | — | — |

**Coverage:**
- v1.7 requirements: 22 total
- Mapped to phases: 0 (pending roadmap)

---
*Requirements defined: 2026-06-06*
