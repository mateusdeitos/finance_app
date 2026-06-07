# Feature Research: Per-Category Monthly Budgets (v1.7)

**Domain:** Per-category monthly spending cap with shared/private scope, in a couples finance app
**Researched:** 2026-06-06
**Confidence:** HIGH (grounded in existing codebase, design-decisions session, and cross-app comparison of YNAB, Monarch Money, EveryDollar, Goodbudget, Copilot)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Budget CRUD (create, edit, delete) | Without CRUD there is no feature | LOW | Must support name/cap/scope/category assignment; edit applies immediately to the running month |
| Per-category monthly cap | The entire concept: each budget is anchored to a category and a monthly spending limit | LOW | Cap stored in cents (int64); same unit as all monetary amounts in this codebase |
| Spend-vs-cap progress display | Every budgeting app shows a progress bar or fraction; users expect it as the primary signal | MEDIUM | "Realizado / Cap" with a progress bar; over-budget displayed distinctly (red / past-end of bar) |
| Shared vs. private scope selection at budget creation | Users expect to choose who the budget counts for; this is the defining distinction in a couples app | MEDIUM | Shared = tied to a `UserConnection`; private = tied to a single user; maps to decisions doc |
| Both partners see a shared budget | In any couples finance tool, a shared budget is visible to both people simultaneously | LOW | The partner who did not create it must be able to read and act on the budget |
| Month-reset on the 1st with no rollover | Non-rollover monthly budgets reset to zero spent each calendar month — users expect a fresh start | LOW | "Realizado" is a SUM within the current calendar month only; no persistence of prior-period state required |
| Categories with no budget: visible but untracked | Spending in a category with no budget is recorded normally (transactions still have categories); the app just has no cap to compare against | LOW | Do not block transactions or show errors; simply omit the category from the budgets view or display it in a distinct "untracked" section |
| Alert when threshold is crossed | Users expect to be told when they are approaching or over their limit; this is standard in every major budgeting app (YNAB, Monarch, EveryDollar, PocketGuard) | MEDIUM | Integrates with existing v1.6 Web Push / Notification infrastructure (`NotificationService.Dispatch`) |
| Alert fires once per threshold crossing, not repeatedly | Industry consensus: re-sending the same alert every time a new transaction arrives after the threshold is crossed trains users to ignore or disable notifications | LOW | Track whether the threshold was already crossed in the current month (a bool flag per budget × threshold × month or derived from state); see Edge Cases below |
| Delete budget stops tracking, preserves transactions | Deleting a budget does not affect underlying transactions or categories; it only removes the cap and progress tracking | LOW | Transaction `category_id` is unaffected; only the budget row is removed |

### Differentiators (Competitive Advantage)

Features that set this product apart. Not expected, but materially valuable for a couples app.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Category equivalence mapping between partners | Enables true shared budgets without forcing a shared category model; unique to this app's architecture | HIGH | New `category_mapping` or `connection_category_link` table at the connection level; prerequisite to all shared budget "realizado" calculations; see Dependency section |
| Configurable per-budget alert thresholds | App-wide thresholds are coarse; per-budget thresholds let users be aggressive on groceries and relaxed on entertainment | MEDIUM | Each budget stores an array of threshold percentages (e.g. `[80, 100]`); must support add/remove per budget |
| Shared budget "realizado" reflects full household spend | Most budgeting apps for couples just sum both people's spend naively; this app's settlement-aware model gives the correct household figure by reusing `GetBalance` semantics | HIGH | Shared budget: sum full transaction amounts from both connection members (not just author's net); private budget: author's net only (transaction − settlements), exactly mirroring `GetBalance` with `HideSettlements = false` for shared and category-scoped for private |
| Mid-month cap edit takes effect immediately | EveryDollar and Monarch both recalculate remaining immediately when the cap changes; this is the expected behavior but it requires no period-split history | LOW | Because there is no rollover and no period history stored, the formula is simply `cap − realizado_this_month`; the new cap applies to the current month automatically |
| Private budget shows partner's partial view on shared budget page | Partners can see each other's private budget status without seeing the full private transaction detail | MEDIUM | Requires a read permission model for private budgets; consider whether "partner can see name + % used" is sufficient while hiding cap amount |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem reasonable at first but create complexity or UX problems for v1.7.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Rollover / envelope carry-forward | Users think leftover budget should roll to next month | Requires per-period history, a history table, and complicates the "realizado" query — explicitly rejected in the design decisions session | No rollover: each month starts fresh; users can manually raise the cap if they want to "carry" intent |
| Zero-based budgeting (every dollar assigned) | YNAB's model; very popular | Requires tracking unbudgeted income and forcing allocation decisions before spend occurs; fundamentally changes the app's data model and UX paradigm | Spending-cap model only: set a cap per category, track against it; unbudgeted categories simply have no cap |
| Budget-to-budget transfers | "Move money from one envelope to another" (Goodbudget / YNAB) | Implies budgets have balances; the cap-model only tracks spend vs. limit; moving budget balances requires a balance ledger per budget | Raise one cap, lower another — two edits instead of a transfer |
| Global budget group / summary total | "How much of my total budget is used?" rollup across all categories | Not per-category; requires summing heterogeneous caps; misleading when shared and private budgets coexist with different scopes | Show per-category bars; let users assess visually |
| Auto-categorization / AI category suggestion on budget creation | Feels smart | Adds ML complexity; this app has human-assigned categories | Let user pick category from their existing list when creating a budget |
| Budget templates or copy-from-last-month | Convenient for recurring setup | Adds UI complexity for v1.7; month-reset with same cap achieves the same result automatically since the cap is persistent | Same cap applies every month by default — nothing to copy |
| N-way split budgets | Share a budget across 3+ people | Connection model is pairwise; N-way needs a fundamentally different model; explicitly out of scope in PROJECT.md | Pairwise shared budgets only for v1.7 |
| Sending an alert notification to both partners when threshold crossed | Seems natural for a shared budget | The user who caused the overspend may find it accusatory; requires deciding which partner to notify for private budgets | Notify only the budget's owner (or both if shared); frame as information ("Groceries is at 80%"), not an accusation |

---

## Feature Dependencies

```
Category Equivalence Mapping (connection-level)
    └──required by──> Shared Budget "Realizado" Calculation
                          └──required by──> Shared Budget CRUD + Display

Budget CRUD (per-category, per-user-or-connection)
    └──required by──> Spend-vs-Cap Progress Display
    └──required by──> Threshold Alert Firing

Spend-vs-Cap Progress Display
    └──requires──> GetBalance (existing, category-scoped)
    └──requires──> Category Equivalence Mapping (for shared scope)

Threshold Alert Firing
    └──requires──> Budget CRUD (knows thresholds and scope)
    └──requires──> NotificationService.Dispatch (existing, v1.6)
    └──requires──> PushSubscriptionService (existing, v1.6)
    └──requires──> Threshold-crossed tracking (new: per budget × threshold × month state)

Private Budget "Realizado"
    └──requires──> GetBalance called with CategoryIDs = [author's category] + HideSettlements semantics
    └──uses──> existing TransactionRepository.GetBalance (no code change)

Shared Budget "Realizado"
    └──requires──> GetBalance called for both connection members with mapped categories
    └──requires──> Category Equivalence Mapping (maps partner's category to equivalent)
    └──uses──> existing TransactionRepository.GetBalance (called twice, once per member, then summed)
```

### Dependency Notes

- **Category Equivalence Mapping is a hard prerequisite for shared budgets.** Without it, "realizado" for a shared budget cannot aggregate both partners' category spend correctly, because `CategoryID` is per-user and partner's categories are different rows.
- **GetBalance is reused, not replaced.** The existing `GetBalance` signature already accepts `CategoryIDs []int` and `UserID int`. For a private budget, call it with the author's `CategoryID` and `UserID`. For a shared budget, call it once per member (with each member's mapped `CategoryID`) and sum the results. This avoids a new aggregation query.
- **Threshold alert firing depends on knowing that the threshold was NOT already notified this month.** Introduce a `budget_alert_history` table (budget_id, threshold_percent, year, month) or add a `last_alerted_threshold` + `last_alerted_period` column on the budget row. The simpler approach (column per budget, no history table) works if each budget has a single threshold; a history table is required if multiple thresholds per budget are supported.
- **NotificationService.Dispatch is async/goroutine.** The alert dispatch must follow the same pattern as v1.6 charge and split notifications: fire after DB commit succeeds in a goroutine with `context.Background()`. Never dispatch before commit.

---

## MVP Definition

### Launch With (v1.7)

Minimum viable for the budgets milestone.

- [ ] **Category Equivalence Mapping** — prerequisite; without it, shared budget "realizado" cannot be calculated
- [ ] **Budget CRUD** — create a budget (category, cap in cents, scope: shared/private, thresholds array), edit cap and thresholds, delete
- [ ] **Spend-vs-cap "realizado"** — computed on-read using GetBalance; displayed as amount + percentage + progress bar
- [ ] **Month-reset (no rollover)** — "realizado" is always the current calendar month's spend; no persisted history needed
- [ ] **Shared budget visible to both partners** — both users in a connection can read a shared budget
- [ ] **Threshold alert push notification** — fires once when realizado first crosses each configured threshold within the month; reuses v1.6 NotificationService.Dispatch
- [ ] **Frontend: budget list and progress view** — one screen showing all budgets with progress bars; tap to see detail
- [ ] **Frontend: budget create/edit form** — category selector, cap input, scope selector, threshold configuration
- [ ] **Frontend: category mapping configuration** — UI for the user to declare "My category X ≡ partner's category Y"

### Add After Validation (v1.x)

- [ ] **Historical view of past months** — requires per-period stored snapshots; deferred because v1.7 is compute-on-read only
- [ ] **Budget templates / quick-copy** — convenience feature; deferred until enough budgets exist to make copying worthwhile
- [ ] **Partner's private budget partial visibility** — "partner is at 70% of their private food budget" without revealing the cap amount

### Future Consideration (v2+)

- [ ] **Rollover / envelope carry-forward** — requires per-period history table; explicitly out of scope in decisions doc
- [ ] **N-way budgets** — requires N-way connection model
- [ ] **Budget suggestions based on historical spend** — requires spend history and ML or statistical analysis

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Category equivalence mapping | HIGH (blocks shared budgets) | HIGH (new table + UI) | P1 |
| Budget CRUD | HIGH (core feature) | MEDIUM | P1 |
| Spend-vs-cap progress display | HIGH (core value) | LOW (reuses GetBalance) | P1 |
| Month reset / no rollover | HIGH (expected behavior) | LOW (no storage, compute-on-read) | P1 |
| Threshold alerts (push) | HIGH (proactive awareness) | MEDIUM (reuses v1.6 infra) | P1 |
| Both partners see shared budget | HIGH (couples-specific) | LOW (authorization check) | P1 |
| Mid-month cap edit takes effect immediately | MEDIUM (UX quality) | LOW (formula is stateless) | P2 |
| Categories with no budget: visible untracked | MEDIUM (completeness) | LOW (filter/section in UI) | P2 |
| Delete budget: keep transactions intact | HIGH (data safety) | LOW (soft-delete or hard-delete budget row only) | P1 |
| Alert fires once per threshold | MEDIUM (notification hygiene) | MEDIUM (needs threshold-crossed state) | P1 |

---

## Edge Cases the Requirements Must Cover

These are not optional considerations — each one maps to a concrete behavior or validation rule that the implementation must define before coding begins.

### EC-1: Uncategorized Transactions (category_id IS NULL)

Transactions can be stored with `category_id = NULL` (e.g. after CSV import with no category selected, or if a category was deleted and `NullifyCategory` ran).

**Required behavior:** Budget "realizado" only sums transactions with the specific `category_id` assigned to the budget. Null-category transactions are not counted in any budget. They must also not cause budget queries to fail.

**Implementation note:** The existing `GetBalance` filter already uses `CategoryIDs []int`; passing a non-empty list implicitly excludes null-category transactions.

### EC-2: A Connected User Has No Mapped Category

A shared budget requires each partner to have a mapped category. If the category mapping is incomplete (user A mapped "Mercado" but user B has not set an equivalent), the shared budget "realizado" for user B's side is zero — not an error.

**Required behavior:** Compute realizado using only the categories that are mapped. Display a warning in the UI that the partner's category is not mapped and the figure may be incomplete. Do NOT block creation of the shared budget; allow it to be created with an incomplete mapping.

**Implementation note:** The budget creation endpoint should accept a `connection_category_mapping_id` reference (not raw category IDs for both sides). At compute time, if the partner's mapped category is absent, skip their leg of the GetBalance call and flag the response.

### EC-3: Deleting a Category That Has a Budget

`CategoryService.Delete` already handles this for transactions via `NullifyCategory` and `ReassignCategory`. Budget rows that reference the deleted category must also be handled.

**Required behavior options (choose one and document it):**
- Option A: Block category deletion if a budget references it (return 409 CONFLICT with tag `BUDGET.CATEGORY_IN_USE`).
- Option B: Soft-delete / archive the budget automatically when its category is deleted (budget becomes "orphaned"; show as archived in UI).
- Option C: Require the user to delete the budget first (same UX pattern as reassigning category on transaction delete).

**Recommendation:** Option A is safest for v1.7 because it is explicit and preserves user intent. The category delete flow already has a confirmation dialog; the error message can instruct the user to delete the budget first.

### EC-4: Deleting a Category That Has an Equivalence Mapping

Similarly, if a category is part of a `connection_category_mapping`, deleting it breaks the mapping.

**Required behavior:** Same as EC-3. Block deletion if the category is part of an active mapping, or cascade-delete the mapping and orphan the shared budget.

### EC-5: A Transaction's Category Changes Mid-Month

A user edits a transaction and assigns it to a different category (or removes the category entirely). This changes which budget "realizado" the transaction contributes to.

**Required behavior:** Since "realizado" is computed on-read (not cached), a category change is reflected in the next budget load automatically. No special handling required at the transaction update layer.

**Alert implication:** If the re-categorization pushes a budget over a threshold, the alert fires on the next "realizado" computation that detects the new crossing — only if the threshold has not been marked as already-alerted for this month. This can cause a threshold to be crossed "retroactively" if the user re-categorizes past transactions mid-month.

### EC-6: Mid-Month Cap Edit and Threshold Re-Evaluation

A user lowers the cap mid-month. The new cap may be lower than the current "realizado", pushing the budget immediately over 100%.

**Required behavior:** Recalculate threshold state after any cap edit. If the new cap causes a previously-uncrossed threshold to be crossed, fire the alert. If the new cap causes a previously-crossed threshold to be un-crossed (cap raised), reset the threshold-alerted flag so the alert can fire again if spending later reaches the threshold.

**Implementation note:** Store `threshold_alerted_at` per threshold + period. Clear it when the cap increases past the point where the threshold is no longer crossed.

### EC-7: Partner Without a Connection (Connection Deleted Mid-Budget)

A shared budget is tied to a `UserConnection`. If the connection is deleted (partners disconnect), the shared budget has no valid scope.

**Required behavior:** When the connection is deleted, shared budgets tied to that connection must be archived or deleted. Block connection deletion if shared budgets exist (same pattern as EC-3, Option A), OR cascade-archive the budgets automatically.

**Recommendation:** Cascade-archive is safer UX than blocking; the user is already confirmed the disconnect action.

### EC-8: Shared Budget — Who Gets the Alert Notification?

When a shared budget crosses a threshold, both partners should be notified (the one who spent may not be the one who set the budget).

**Required behavior:** Fire the alert notification to BOTH users in the connection. The notification payload identifies which shared budget and which threshold. Use the existing `NotificationService.Dispatch` with two `NotificationEvent` entries (one per user).

**Alert framing:** "Orçamento Mercado está em 80%" — category name + threshold; no partner attribution to avoid blame framing.

### EC-9: Alert — Threshold Already Crossed, More Transactions Added

User is at 85% of cap. They spend more. Budget is now at 95%. The 80% threshold was already notified; the 100% threshold has not been crossed yet.

**Required behavior:** No re-alert for 80%. Alert fires when 100% threshold is crossed. Each threshold is a one-way latch per budget per calendar month.

**Implementation note:** `budget_alert_history(budget_id, threshold_percent, month_year)` is the canonical approach when multiple thresholds are configured per budget (simpler than a column per threshold). A unique constraint on `(budget_id, threshold_percent, month_year)` prevents double-inserts naturally.

### EC-10: Month Boundary — Alert State Reset

On the 1st of the new month, "realizado" resets to zero. Previously crossed thresholds should be treated as uncrossed for the new month.

**Required behavior:** Alert history is month-scoped. Because `budget_alert_history` stores `month_year`, old rows do not affect the new month. No cleanup job is strictly required; old history rows are inert. (Optional: prune history rows older than N months to keep the table small.)

### EC-11: Private Budget for Transaction Created by the Other Partner (Linked Transactions)

In a shared expense, the linked transaction created on the partner's connection account has `user_id = partner` and `category_id` set to the partner's category. This transaction should NOT count toward the author's private budget.

**Required behavior:** Private budget "realizado" uses `GetBalance` filtered by `user_id = budget_owner` and `category_id = budget_category`. Because `GetBalance` already scopes by `user_id`, the partner's linked transaction is excluded automatically. This is correct behavior.

### EC-12: Subcategory Transactions vs. Parent Category Budget

Categories support a parent/child hierarchy (`category.ParentID`). If a user has a budget on "Alimentação" (parent) and transactions in "Mercado" and "Restaurante" (children), which counts?

**Required behavior:** Budget is always attached to a specific category ID. Whether transactions in child categories count against a parent budget is a design decision that must be explicit.

**Recommendation for v1.7:** Budget applies only to the exact `category_id` it was created for; child categories are not aggregated automatically. This matches the existing `GetBalance` filter behavior (exact ID match). Users who want to track all food spend create a budget on the parent category and assign all food transactions to the parent category (or accept that the sub-split is not captured).

---

## Competitor Feature Analysis

| Feature | YNAB | Monarch Money | EveryDollar | Goodbudget | v1.7 Approach |
|---------|------|---------------|-------------|------------|---------------|
| Per-category cap model | Yes (Targets, not hard caps) | Yes (monthly limits) | Yes (Planned amount) | Yes (envelope) | Yes — hard monthly cap |
| Progress bar display | Yes (color-coded) | Yes (bar + amounts) | Yes (Spent / Remaining) | Yes (envelope fill) | Yes — realizado / cap + bar |
| No-rollover month reset | No (zero-based, money persists) | Optional per category | Default behavior | Envelope fills each month | Yes — always; no-rollover is non-configurable |
| Mid-month cap edit | Yes (real-time) | Yes (real-time) | Yes (real-time) | Yes (real-time) | Yes — stateless recalc |
| Shared couple budget | Via joint accounts | Full household view | Not couples-specific | Via shared household | Shared scope tied to UserConnection |
| Categories with no budget | Show spend with no cap | Shown in "untracked" | Not shown in budget | Not applicable | Show in untracked section or omit |
| Push alerts | No push; in-app | Yes (mobile push) | Yes (mobile push) | No | Yes — via v1.6 Web Push infra |
| Threshold configuration | Fixed (overspent = red) | Not configurable | Not configurable | Not configurable | Configurable per budget (e.g. 80%, 100%) |
| Couples category mapping | N/A (shared accounts) | N/A (one budget) | N/A | N/A | Category equivalence map at connection level — unique |

---

## Dependencies on Existing Features

| Existing Feature | How Used in v1.7 | Risk |
|------------------|------------------|------|
| `domain.Category` (per-user, `category_id`) | Budget is attached to one category ID; "realizado" filtered by it | LOW — stable domain type |
| `UserConnection` (accepted) | Shared budget scope references connection ID; equivalence map lives at connection level | LOW — well-defined, stable |
| `TransactionRepository.GetBalance` | Drives "realizado" calculation; call with `CategoryIDs`, `UserID`, and current month `Period` | LOW — existing interface; no changes needed |
| `domain.BalanceFilter.CategoryIDs` | Already present; enables per-category balance sum | LOW — confirmed in repository code |
| `NotificationService.Dispatch` | Budget threshold alert delivery; same goroutine-after-commit pattern as v1.6 | LOW — interface is generic, accepts `[]NotificationEvent` |
| `PushSubscriptionService` | Backing delivery of alerts to devices | LOW — already wired; no changes needed |
| `CategoryService.Delete` | Must be extended to check for budget references before deleting | MEDIUM — adds a new pre-delete guard |

---

## Sources

- YNAB targets and category behavior: https://www.ynab.com/blog/ynab-targets, https://support.ynab.com/en_us/categories/planning-HJgZB2C69
- Monarch Money rollover and couples features: https://help.monarch.com/hc/en-us/articles/4411119762196-Rollover-Budgets, https://www.monarch.com/for-couples
- EveryDollar Planned/Spent/Remaining model: https://everydollar.help.ramseysolutions.com/hc/en-us/articles/22368992992397-Differences-Between-Planned-Spent-and-Remaining
- Goodbudget envelope model: https://goodbudget.com/envelope-budgeting/
- Notification frequency best practices: https://appbot.co/blog/app-push-notifications-2026-best-practices/
- Couples app shared/individual budget visibility: https://getfinny.app/blog/budgeting-app-for-couples
- Budget app category deletion UX: https://actualbudget.org/docs/budgeting/categories/
- Azure budget alert threshold pattern (fire-once-per-threshold): https://www.pump.co/blog/azure-budgets/
- Existing codebase: `backend/internal/domain/category.go`, `domain/balance.go`, `domain/user_connection.go`, `repository/interfaces.go`, `repository/transaction_repository.go` (GetBalance implementation), `service/interfaces.go` (NotificationService.Dispatch)
- Design decisions: `.planning/notes/shared-budget-design-decisions.md` (2026-06-05)

---

*Feature research for: Per-category monthly budgets module — v1.7 (Orçamentos)*
*Researched: 2026-06-06*
