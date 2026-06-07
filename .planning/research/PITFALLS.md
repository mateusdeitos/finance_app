# Pitfalls Research — v1.7 Budgets

**Domain:** Adding a per-category monthly budget system to an existing couples' finance app with split transactions and settlements
**Researched:** 2026-06-06
**Confidence:** HIGH (all findings grounded in the actual codebase; see `transaction_repository.go:GetBalance`, `transaction_create.go:createSettlementsForSplit`, `domain/settlement.go`, `domain/transaction.go`)

---

## Critical Pitfalls

### Pitfall 1: Double-Counting Spend for Shared Budgets via the Settlement/Private Transaction Pair

**What goes wrong:**
A shared budget for "Mercado" should count the full amount paid by both connection members — e.g. User A spends R$100 total, User B's linked transaction on the shared account is R$50. A naive `SUM(amount) WHERE category_id = X AND user_id IN (A, B)` across all transactions will count A's R$100 private transaction **plus** B's R$50 linked transaction for a total of R$150, which is the wrong "full connection spend." The correct answer is R$100 (the original transaction amount).

**Why it happens:**
The split model always creates three rows: the author's private transaction (full amount), a settlement credit on the author's connection account, and a linked transaction debit on the partner's connection account. The linked transaction has no `category_id` (it is set to `nil` in `createTransactions` via `injectLinkedTransactions`). But the author's private transaction has the category. A join that queries by category across both users will only find the author's private transaction — which seems correct at first, but the implementation must explicitly **exclude** category filtering on the settlements and linked-transaction legs to avoid subtle future regressions when category inheritance is added to linked transactions.

Conversely, for private budgets, a query that accidentally includes the settlement credit (which is on the connection account, not the private account) would double-count in the opposite direction: it would add the settlement credit to the net spend calculation, partially canceling the private debit and under-reporting spend.

**How to avoid:**
- For **shared budget realizado**: sum the source (author) transactions where `category_id` matches and `user_id` is any member of the connection **and** `account_id` is NOT a connection account (i.e., source = private accounts only). This is the R$100 leg. The correct model is: "the full amount that any member paid out of their private account for this category during the period."
- For **private budget realizado**: mirror `GetBalance`'s existing settlement rule — subtract from the author's net the split amounts they offloaded. The formula is: `private_spend = author_private_transaction_amount - settlements_credited_from_that_transaction`. The settlements leg in `GetBalance` is `WHERE s.account_id IN <connection_accounts>`, not `WHERE s.source_transaction_id IN <...>`. The budget query must replicate this account-scoped filter, not invent a new transaction-scoped one.
- Prefer **reusing `GetBalance` directly** (via `transactionRepo.GetBalance` with `CategoryIDs` and appropriate `AccountIDs`) rather than writing a new aggregation query. `GetBalance` already handles `HideSettlements`, soft-deleted source transactions (`t.deleted_at IS NULL`), and the settlement account-ID scoping. Budget "realizado" is just a filtered balance with `HideSettlements=false`.
- Write integration tests with the full 3-row split scenario: author's private account + connection account + partner's connection account, then assert the budget realizado equals only the amounts that should count.

**Warning signs:**
- Budget realizado shows a higher number than the raw transaction amount for any split expense.
- `GetBalance` for the same account/period disagrees with the budget realizado by exactly the split amount.
- Unit tests that mock the repo and return a canned sum pass, but an integration test against a real DB with a split transaction fails.

**Phase to address:**
Budget data model and "realizado" query phase (the first backend phase that touches `GetBalance` for budgets). Must be proven correct with an integration test (`ServiceTestWithDBSuite`) before the alert phase builds on top of it.

---

### Pitfall 2: Period Boundary Inconsistency ("This Month" Computed Differently in Multiple Places)

**What goes wrong:**
The app already has a `Period` domain type with explicit `StartDate()` and `EndDate()` methods (`domain/transaction.go`: `StartDate()` returns `time.Date(year, month, 1, 0,0,0,0, time.UTC)`, `EndDate()` returns `time.Date(year, month+1, 0, 23,59,59,999999999, time.UTC)`). If the budget "realizado" query computes the current month's date range ad-hoc (e.g. `time.Now().Month()` without the same clamping), or if the frontend determines "current month" from the browser's local clock while the backend uses UTC, a transaction timestamped at 23:30 Brasília time on January 31 (= 02:30 UTC on February 1) will land in February's budget on the backend but appear under January in the frontend. Since `time.Local = UTC` at startup, the backend is always UTC; the frontend must send the budget period as an explicit `YYYY-MM` string, never infer it from `new Date()` without normalizing to UTC midnight.

**Why it happens:**
v1.7 is the first feature that must answer "what is the current month's spend?" continuously rather than on user demand. Developers often reach for `time.Now()` in a background job or in a threshold-check helper without routing through the `Period` type. The frontend is even more dangerous: JavaScript `new Date().getMonth()` uses the browser's local timezone, so a Brazilian user in UTC-3 sees a different "current month" at rollover time than the backend does.

**How to avoid:**
- The budget period is always represented as a `domain.Period{Month, Year}` value. All realizado queries must use `period.StartDate()` and `period.EndDate()` exclusively — never `time.Now()` directly.
- Alert threshold evaluation must also route through `Period` — i.e., "evaluate budget for period P" passed as a struct, not "evaluate budget for now."
- Frontend sends the period as `"YYYY-MM"` (the existing wire format for `Period`) when fetching budget status. It must derive the current period on page load from the backend's `/api/me` time or from the `date` header in any API response — or simply let the user select the month like the existing transactions page does, which sidesteps the timezone issue entirely.
- If a "current period" is truly needed automatically (e.g. dashboard widget), compute it server-side only: add an endpoint that returns `{period: "2026-06"}` derived from `time.Now().UTC()`.

**Warning signs:**
- Budget spend resets unexpectedly on the first or last day of a month for Brazilian users.
- Integration test that runs near midnight UTC produces a different realizado than a test run at noon.
- Frontend progress bar shows 0% at the start of a new month but the backend already has transactions dated in that month.

**Phase to address:**
Budget data model phase (define `Period` usage contract) and frontend progress UI phase (wire period selection to avoid local-timezone traps). Add a test that creates a transaction at `EndDate()` exactly and asserts it is included, and one at `EndDate() + 1 nanosecond` and asserts it is excluded.

---

### Pitfall 3: Category Mapping Drift — Mapped Categories Deleted, Renamed, or Orphaned

**What goes wrong:**
A category equivalence map says "A.category_id=12 ≡ B.category_id=37". User A then deletes category 12 (which already triggers `NullifyCategory` on all A's transactions). The mapping row still exists pointing at `category_id=12`. Now the shared budget for that mapping silently produces 0 realizado because no transaction has `category_id=12` anymore — it has been nullified. No error is raised; the budget simply looks like no money was spent.

The inverse failure: User A renames category 12 but the budget display still calls it by the stale name fetched at budget creation time rather than the current category name.

The many-to-one failure: A user maps two of their categories (e.g. "Supermercado" and "Mercado") to the partner's single "Groceries" category. If the budget query sums both mapped categories, spend is counted correctly. But if only one mapping is honored (e.g. the system only stores one side of the equivalence), half the spend disappears.

**Why it happens:**
Categories are mutable. The existing `NullifyCategory` and `ReassignCategory` repository methods run in the category-delete flow but have no knowledge of the budget mapping table. Mapping tables are typically set-and-forget, with no cascade logic when referenced entities change.

**How to avoid:**
- The `category_mapping` table must use `ON DELETE SET NULL` (or `RESTRICT`) foreign keys on both `user_a_category_id` and `user_b_category_id`. `RESTRICT` is safer: it prevents deleting a category that is in an active budget mapping, forcing the user to remap first. Add a user-facing error using the existing `ServiceError` pattern (e.g. `BUDGET.CATEGORY_IN_ACTIVE_MAPPING`).
- Alternatively, use `ON DELETE SET NULL` and treat a null-side mapping as "unmapped": the shared budget degrades to only counting the non-null side, and a UI warning is shown.
- Category delete handler must call a new `budget mapping service` method that either blocks the delete or cleans up the dangling mapping — same pattern as `NullifyCategory`.
- The mapping is owned by the connection (stored at the connection level, as the design notes state). When a connection is deleted or goes non-accepted, all its mappings must cascade-delete.
- Frontend must always resolve category names live from the categories query (by ID) rather than caching names in the mapping row itself.

**Warning signs:**
- A shared budget shows 0% realizado in the middle of a month when transactions clearly exist.
- After a category delete, the budget card still appears (no error) but the spend is wrong.
- DB query on `category_mappings` returns rows where one side's `category_id` no longer exists in the `categories` table.

**Phase to address:**
Category equivalence mapping phase (the prerequisite phase). FK constraints and cascade behavior must be defined in the migration. The category-delete service path must be updated in the same phase.

---

### Pitfall 4: Shared vs. Private Scope Leakage

**What goes wrong:**
A private budget for User A's "Transporte" accidentally includes the linked transaction that was created on User A's connection account when User B split a transport expense with A. That linked transaction belongs to `user_id = A` and has `account_id = connection_account`, and its `category_id = nil` (as per `injectLinkedTransactions`). So the leakage cannot come from category matching — but it can come from account-scope leakage.

The symmetric failure: a shared budget accidentally includes only the private-account half of a split transaction (missing the partner's side), producing the same result as a private budget.

A subtler failure: the "private budget uses author's net portion" rule means we should subtract the settlement credit that A posted to their connection account. If the query omits the `HideSettlements=false` settlement subtraction, A's private budget shows the gross R$100 instead of the net R$50 they actually bore.

**Why it happens:**
The shared/private scope is determined at budget creation but the query implementation must honor it at every subsequent realizado evaluation. A developer new to the settlement model may copy a simple `WHERE user_id = ? AND category_id = ?` query without accounting for settlements.

**How to avoid:**
- Define the scope semantics in code as a well-named helper, not as inline SQL variations. Example: `buildBudgetBalanceFilter(budget) domain.BalanceFilter` returns the correct `AccountIDs`, `CategoryIDs`, and `HideSettlements` based on `budget.Scope`.
- For **private scope**: `AccountIDs = user's private accounts (exclude connection accounts)`, `HideSettlements = false` (so settlements reduce the net correctly), `CategoryIDs = [budget.categoryID]`.
- For **shared scope**: the query must union the spend from **both** members. The cleanest approach is two `GetBalance` calls — one per member, each scoped to their private accounts and the mapped category on their side — and sum the results. Alternatively, issue one raw SQL query that sums over both `user_id` values but filters to private accounts only. The settlement leg should be excluded for the shared query (the shared budget counts gross spend, not net-of-settlement, because the point is "how much did the couple spend on this category total").
- Write explicit test cases: (a) User A has private budget, splits transaction with B — realizado equals A's net only. (b) Same scenario with shared budget — realizado equals full transaction amount.

**Warning signs:**
- Private budget realizado equals the full transaction amount even after a 50/50 split (missing settlement netting).
- Shared budget realizado is half the expected amount (only counting one partner).
- Changing a budget from shared to private (if allowed) does not recompute correctly.

**Phase to address:**
Budget data model phase, specifically the `realizado` calculation design. Lock this down before the frontend phase renders the progress bar, because a wrong number shown in production is trust-destroying for a finance app.

---

### Pitfall 5: Alert Spam — Firing on Every Write Instead of on Threshold Crossing

**What goes wrong:**
Every time a transaction is created or updated, the service re-evaluates the budget. If realizado crosses the 80% threshold and there are 5 transactions in the same day, the user receives 5 push notifications for the 80% threshold. If the user edits a transaction slightly (e.g., changes the description), the realizado hasn't changed but the evaluation runs again and fires another notification because there is no record of "already notified at 80%."

The inverse: a "flapping" scenario where realizado oscillates around the threshold (transaction create → alert fires; transaction update reduces amount → realizado drops below threshold; another transaction create → alert fires again, same threshold). Users receive alternating alerts with no clear resolution.

**Why it happens:**
The v1.6 push system (`Dispatch`) is "best-effort" and fires from a goroutine after commit. It has no concept of deduplication across calls. If the budget threshold check is performed inline in the transaction service, it runs on every create/update without memory of prior alerts.

**How to avoid:**
- Persist alert state in the database. Add an `budget_alert_logs` table (or a `last_alerted_threshold` column on the budget row) that records, per budget per period, the highest threshold that has already been notified. An alert for threshold T fires only when: (a) realizado crosses T for the first time this period, and (b) `last_alerted_threshold < T`.
- Use `UPDATE budgets SET last_alerted_threshold = T WHERE id = ? AND last_alerted_threshold < T` as a conditional write (single atomic fence, same pattern as the charge accept race guard). This prevents double-firing even under concurrent writes.
- Reset `last_alerted_threshold` to 0 (or NULL) at the start of each new period — either lazily on first access or via a daily Cloud Run job.
- The threshold evaluation must run **after** the DB commit (same post-commit goroutine pattern as v1.6), and must read the committed realizado via a fresh DB connection (not the committed transaction's in-memory state), consistent with the `//nolint:contextcheck` detached context pattern already in place.
- Deduplicate at the notification level too: the existing `Dispatch` method already groups by `(recipientUserID, type)` — for budget alerts, include `budget_id` and `threshold` in the grouping key to ensure one push per threshold crossing.

**Warning signs:**
- Inbox notification count jumps by 3–5 for a single transaction create.
- User receives the "80% budget" notification on two consecutive days even though they made no transactions on the second day.
- `notification` table has multiple rows of type `budget_alert` with the same `entity_id` (budget ID) and same threshold within the same calendar month.

**Phase to address:**
Budget alert phase. The `last_alerted_threshold` guard must be designed and implemented before any alert-triggering code is wired to the transaction create/update path. Do not ship threshold evaluation without the deduplication fence in the same phase.

---

### Pitfall 6: Alert Firing for the Wrong Partner

**What goes wrong:**
A shared budget belongs to a `UserConnection`. When the threshold is crossed, both partners should receive the alert (it is their shared budget). But if the alert code naively sends to `budget.UserID` (the budget creator), the partner never sees the alert. The reverse is also dangerous: if a private budget's alert is accidentally sent to the partner (e.g., by looking up both `FromUserID` and `ToUserID` of the connection), private spend data is leaked.

**Why it happens:**
The `Dispatch` API takes explicit `RecipientUserID` fields. The notification build code for charges and split transactions already has this correct because the recipient is unambiguous (the other party). For budgets, the recipient logic depends on scope: shared → both connection members; private → the budget owner only.

**How to avoid:**
- Add a `recipients() []int` method or equivalent on the budget domain type that returns the correct user IDs based on scope. For private, `[budget.UserID]`. For shared, `[connection.FromUserID, connection.ToUserID]`.
- Validate in tests: assert that a private budget alert event has exactly one recipient (the owner) and that the recipient is NOT the partner.
- Validate that a shared budget alert event has exactly two recipients and that both are members of the connection.
- Reuse the existing `NotificationEvent.RecipientUserID` field — emit one event per recipient (same pattern as `split_created` events in `transaction_create.go`).

**Warning signs:**
- Partner receives a push saying "your 'Personal' budget is at 80%" for a budget they did not create.
- A shared budget alert arrives for one partner but not the other.
- Notification inbox shows budget alert for user B even though the budget `user_id = A` and scope is private.

**Phase to address:**
Budget alert phase, in the same sub-task that builds the `buildBudgetAlertEvents` helper. Cover both shared and private scope with unit tests against mock recipients before wiring to `Dispatch`.

---

### Pitfall 7: Concurrency — Transaction Write Re-evaluates Budget Without Atomicity

**What goes wrong:**
Two transactions are created simultaneously for the same category in the same period. Both read the current realizado (say, 70%), both determine threshold not crossed, both commit their transaction rows, then both post-commit goroutines evaluate and both see 90% and both fire the alert. Result: two identical alert notifications, and `last_alerted_threshold` is written twice in a race.

A related failure: the budget `last_alerted_threshold` update races with a concurrent budget delete. If the update wins after the delete, it inserts a ghost row (or fails silently), and the delete is not respected.

**Why it happens:**
The post-commit goroutine pattern (used for all v1.6 notifications) is inherently racy when multiple writes occur concurrently. The pattern works for v1.6 because `split_created` and `charge_received` notifications are idempotent from the user perspective (duplicate notifications are annoying but not catastrophic). For budget alerts, a duplicate notification at threshold crossing is more disruptive.

**How to avoid:**
- Use the conditional `UPDATE ... WHERE last_alerted_threshold < ?` pattern as the sole write fence. Even if two goroutines race, only one UPDATE wins (PostgreSQL row-level locking), and the other sees 0 rows affected and skips the notification. The comparison is: if `rowsAffected == 0`, skip push.
- Never read-then-write for the threshold state. The conditional UPDATE eliminates the TOCTOU window.
- For the budget delete race: check `rowsAffected == 0` after the UPDATE to handle the case where the budget was deleted between the transaction commit and the post-commit goroutine.
- Tests: write a test that creates two transactions in the same category simultaneously (two goroutines, one test DB) and asserts that exactly one alert notification was persisted.

**Warning signs:**
- Alert log table has duplicate rows for the same budget/period/threshold.
- `last_alerted_threshold` oscillates between values under load tests.
- Notification inbox shows two identical "80% budget" entries posted within milliseconds.

**Phase to address:**
Budget alert phase (concurrent with pitfall 5 prevention). The conditional UPDATE fence is the key implementation detail and should be in the first commit of the alert evaluation logic.

---

### Pitfall 8: Migration Safety — Soft Deletes, Category Nullification, and Rollback Symmetry

**What goes wrong:**
New tables (`budgets`, `budget_alert_logs`, `category_mappings`) reference `categories.id`, `user_connections.id`, and `users.id`. If a `Down` migration drops the `budgets` table but forgets to drop the FK index first, the rollback fails in PostgreSQL (FK constraints block the index drop order). Conversely, if the `Down` migration is not written at all (a common shortcut), the project loses the ability to roll back a failed Cloud Run deployment.

A soft-delete interaction: transactions are soft-deleted via `deleted_at`. The `GetBalance` query already guards `WHERE t.deleted_at IS NULL` in the settlements leg. A new budget realizado query that joins settlements without this guard will count spend from soft-deleted transactions, inflating realizado.

**Why it happens:**
Migrations are easy to write for the `Up` path and easy to skip the `Down` path. FK constraint ordering in `Down` migrations is non-obvious. Soft-delete guards are already in `GetBalance` but a new query written from scratch by a developer unfamiliar with the pattern will miss them.

**How to avoid:**
- Always run `just migrate-create <name>` (never hand-write the file), which scaffolds the timestamp and the `+goose Up` / `+goose Down` blocks as a reminder.
- The `Down` block must drop objects in reverse-FK order: drop indexes → drop FK constraints → drop the table. Test the `Down` block locally before merging.
- Any new SQL query that touches `transactions` or `settlements` must include `WHERE transactions.deleted_at IS NULL` (and `WHERE t.deleted_at IS NULL` in any join). Add a linter comment or code review checklist item.
- Integration tests (`ServiceTestWithDBSuite`) apply migrations via goose at container start — a broken `Down` migration is caught there if tests run the rollback.

**Warning signs:**
- `just migrate-up` succeeds but `just migrate-down` fails with a constraint error.
- Budget realizado is higher than expected; adding `AND deleted_at IS NULL` to the debug query drops it to the correct value.
- CI passes but a manual rollback on Cloud Run fails.

**Phase to address:**
Budget data model phase (migration authoring). The down migration must be tested locally before any subsequent phase builds on top of the schema.

---

### Pitfall 9: Best-Effort Push Losing an Alert Permanently

**What goes wrong:**
The v1.6 push system dispatches in a goroutine after commit and logs failures but does not retry. For split notifications this is acceptable — missing a "you have a new split" push is mildly annoying. For budget alerts ("you've hit 100% of your budget") the stakes are higher because the alert is the primary user value proposition of the feature. If the push service is temporarily unavailable and the goroutine fails, the `last_alerted_threshold` is already set (written in the same atomic UPDATE step), so the alert will never fire again for that threshold in that period.

**Why it happens:**
The v1.6 decision document explicitly deferred "queued / retried push delivery" (Cloud Tasks). That decision is correct for v1.6 but must be revisited for budget alerts, where a missed alert is functionally a missed feature delivery.

**How to avoid:**
- Decouple the `last_alerted_threshold` write from the push dispatch. Write sequence: (1) persist inbox notification row (already best-effort in `Dispatch`); (2) send push; (3) **only** update `last_alerted_threshold` if at least one push was delivered (or if there are no active subscriptions — in which case the inbox row is enough). If the push fails, leave `last_alerted_threshold` at its previous value so the next transaction write re-evaluates and retries the push.
- This creates a risk of double-notification if push eventually succeeds on the second attempt — mitigate by checking the inbox for an existing unread notification of the same type/entity before persisting another. This is a lightweight dedup, not full idempotency.
- For v1.7, document this as a known limitation and prefer the inbox row (always persisted) as the reliable delivery path. Push is best-effort. The roadmap phase notes should flag this for v1.8 retry infrastructure.

**Warning signs:**
- User's inbox shows a "budget at 80%" notification but they never got a push.
- After a push service outage, no further alerts fire for the rest of the month even though new transactions are added.
- `last_alerted_threshold = 80` in the DB but the user's inbox is empty (the inbox persist also failed).

**Phase to address:**
Budget alert phase. The `last_alerted_threshold` update timing relative to push dispatch must be an explicit design decision in that phase, documented in a comment alongside the dispatch goroutine.

---

### Pitfall 10: Frontend — Stale TanStack Query Cache After Transaction Changes Budget Spend

**What goes wrong:**
User creates a transaction in the "Mercado" category. The `useCreateTransaction` mutation succeeds and the caller invalidates `QueryKeys.Transactions`. The budget progress bar for "Mercado" does not update because `QueryKeys.BudgetStatus` (or whatever the budget query key is named) was not invalidated. The progress bar shows stale spend until the next page reload or the next poll interval.

The inverse: the budget progress bar is refetched on every transaction mutation (by adding `QueryKeys.BudgetStatus` to every mutation's `onSuccess` invalidations), but this is done incorrectly by hard-coding it inside mutation hooks, violating the frontend convention that "invalidation is the caller's responsibility."

**Why it happens:**
Budget spend depends on transactions, but TanStack Query has no automatic dependency tracking between query keys. Every place a transaction is created, updated, deleted, or bulk-changed must also invalidate the budget status cache. In v1.7, that is at least: create transaction, update transaction, delete transaction, bulk category change, bulk date change, bulk split.

**How to avoid:**
- Centralize budget status invalidation in a `useBudgetStatus` hook that exposes an `invalidate` function (same pattern as all other query hooks). The invalidation is the caller's responsibility.
- In the page component that shows both transactions and budget progress, call `budgetStatus.invalidate()` in every mutation's `onSuccess` alongside `transactions.invalidate()`. This is explicit and visible at the call site.
- Add a `QueryKeys.BudgetStatus` entry to `src/utils/queryKeys.ts` in the same phase that creates the budget status endpoint.
- Write a Playwright e2e test that creates a transaction, then asserts the budget progress bar updates without a page reload.

**Warning signs:**
- Budget progress bar shows a number that disagrees with the transaction list totals until the page is refreshed.
- After a bulk category change moves transactions into the budget's category, the bar doesn't update.
- Stale cache is masked by a short `staleTime` setting that polls frequently — the underlying invalidation bug is hidden until `staleTime` is increased.

**Phase to address:**
Frontend budget progress UI phase. Invalidation wiring is a known TanStack Query pitfall for cross-domain queries and must be explicitly tested with an e2e scenario.

---

### Pitfall 11: Frontend — Rounding Cents in the Progress Bar

**What goes wrong:**
Budget cap is R$300,00 (30000 cents). Realizado is R$127,34 (12734 cents). The progress percentage is `12734 / 30000 = 42.4466...%`. If the frontend computes this as `(realizado / cap) * 100` using JavaScript floating-point and then passes the result directly to Mantine's `Progress` component, rounding errors accumulate. More importantly, if the display formats the realizado in reais by dividing cents by 100 using floating-point (e.g., `12734 / 100 = 127.33999...`), the displayed amount can be 1 cent off.

**Why it happens:**
The frontend convention ("amounts are cents end-to-end, format via `formatCents` only at display layer") is documented in `frontend/CLAUDE.md` and already has a utility at `src/utils/formatCents.ts`. But the progress percentage calculation is a new computation type (not a format, but a ratio) that developers may implement ad-hoc.

**How to avoid:**
- Keep cap and realizado in cents (int64 equivalent in TypeScript: `number` is safe for amounts up to 2^53). Compute the ratio as `(realizado / cap) * 100` in floating-point — this is fine for display-only percentages (the Mantine `Progress` value can be a float).
- Never convert cents to reais (divide by 100) for any intermediate arithmetic. Only call `formatCents` at the final display layer.
- Add a pure utility function `budgetProgressPercent(realizadoCents: number, capCents: number): number` that handles the 0-cap edge case (return 0 or 100 when `capCents === 0`). Place it in `src/utils/` and test it.
- Clamp the progress bar to a maximum of 100% visually (even when realizado > cap), while still showing the over-budget amount numerically in the label.

**Warning signs:**
- Progress bar shows 99.99% when realizado equals cap exactly.
- Display shows R$127,33 when the DB stores 12734 cents (R$127,34).
- Division by zero crash when a budget cap is somehow 0.

**Phase to address:**
Frontend budget progress UI phase. The `budgetProgressPercent` utility should be written and unit-tested before the progress component is built.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Compute realizado with a new hand-written SQL query instead of reusing `GetBalance` | One-shot development speed | Duplicates the soft-delete guard, settlement account-scoping, and period boundary logic; diverges silently when `GetBalance` is later updated | Never — reuse `GetBalance` |
| Skip the `last_alerted_threshold` fence and rely only on dedup at the notification table | Simpler alert code | Duplicate push notifications under concurrent writes; user trust eroded | Never for the threshold fence; notification-table dedup is additive, not a replacement |
| Store the category mapping as a plain text name match instead of FK-linked IDs | No migration needed | Fragile on rename, silent breakage on delete | Never — the design notes explicitly rejected name matching |
| Use `time.Now()` directly in period computations | Convenient | Timezone bugs at month rollover, test non-determinism | Never — always use `domain.Period.StartDate()` / `domain.Period.EndDate()` |
| Hard-code budget invalidation inside mutation hooks | Fewer lines at call sites | Violates the established frontend convention; makes it impossible to selectively suppress invalidation in tests | Never — follow the "invalidation is the caller's responsibility" pattern |
| Skip the `Down` migration block | Faster migration authoring | Cannot roll back a failed Cloud Run deployment; CI cannot test rollbacks | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `GetBalance` for realizado | Pass `HideSettlements: true` (seems like it hides noise) | Pass `HideSettlements: false` so the settlements leg nets the private budget correctly; for shared budgets, pass `HideSettlements: true` only if the query is scoped to private accounts and no settlement subtraction is needed |
| v1.6 `Dispatch` for budget alerts | Add a `NotificationTypeBudgetAlert` and call `Dispatch` on every transaction write | Gate `Dispatch` behind the conditional `last_alerted_threshold` UPDATE; only call `Dispatch` when the UPDATE returns `rowsAffected > 0` |
| Category delete path (`NullifyCategory` / `ReassignCategory`) | Forget to clean up category mapping rows | Call a new `budgetMappingService.HandleCategoryDelete(categoryID)` from `CategoryService.Delete`, either blocking the delete (RESTRICT) or nullifying the mapping side |
| Swagger spec regeneration after adding budget handlers | Forget to run `just generate-docs` | Frontend TypeScript types are generated from the spec; run `just generate-docs` in the same PR that adds or changes any budget handler annotation |
| TanStack Query cache for budget status | Budget status query uses a plain string key, not the centralized `QueryKeys` const | Add `BudgetStatus` (and `BudgetList`, `CategoryMappings`) to `src/utils/queryKeys.ts` before writing any query hook |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Evaluating budget realizado on every transaction write synchronously in the request path | Transaction create endpoint latency spikes (the realizado query hits `transactions` + `settlements` for the whole month) | Evaluate in the post-commit goroutine, same as notifications; or cache realizado with a short TTL | At ~100 transactions/month per budget, the query is fast; at ~10K rows per period (bulk import), it is measurable |
| Fetching all budgets and all category mappings on every budget status page render | Over-fetching; slow initial load | Use separate query keys with appropriate `staleTime`; budget list rarely changes (user explicitly manages it), so a longer `staleTime` (5 min) is acceptable | Noticeable at 20+ budgets with complex mappings |
| N+1 on category mapping resolution (one DB call per mapped category pair) | Slow shared budget realizado query | Batch all mapped category IDs into a single `GetBalance` call with `CategoryIDs` array | At ~10 mapped categories per connection; unlikely to be a real problem for a couples' app |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| IDOR on budget read/write — any authenticated user can read another user's budget by ID | Private spend data of another user exposed | Always validate `budget.UserID == authenticatedUserID` (for private) or `budget.ConnectionID IN user's accepted connections` (for shared) at the service layer, same pattern as charge IDOR guard |
| Category mapping exposed cross-user — User B reads User A's category list via the mapping API | User A's category taxonomy (which can be revealing) exposed | The mapping API must only return category names/IDs for the authenticated user's side; partner's categories are only returned if the authenticated user is part of the connection |
| Budget alert notification sent to the wrong user reveals spend amounts in the push body | User A sees User B's private spend amount in a push notification | Enforce `recipients()` logic (Pitfall 6); never include spend amounts in a push payload unless the recipient is confirmed to be authorized to see that budget |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Progress bar shows percentage only, no absolute amounts | User cannot tell if 80% means R$8 or R$800 | Show both: "R$127,34 / R$300,00 (42%)" — the Mantine `Progress` label supports this |
| No visual distinction when realizado > cap (over-budget) | User doesn't notice they've overspent | Use a different color (e.g., red) and a numeric "R$XX over budget" label when realizado > cap; do not just clamp the bar at 100% |
| Category mapping UI requires the user to know their partner's category names | Friction during setup; couple must coordinate | Show both users' category lists side-by-side in the mapping UI, with a search field; fetch partner categories via the connection API |
| Alert threshold is a fixed 80%/100% in v1.7 | Some couples want different thresholds | The design calls for configurable per-budget thresholds; make this a first-class field in the budget create/edit form, not a system default that is hard to change later |
| Shared budget "realizado" includes a partner's transaction for a category the user can't see (unmapped partner category) | Confusing spend attribution | Only sum transactions for categories that are explicitly mapped; un-mapped partner spend is not included in the shared budget (matches the category mapping prerequisite requirement) |

---

## "Looks Done But Isn't" Checklist

- [ ] **Budget realizado correctness:** Verified with an integration test that creates a split transaction and asserts the shared budget realizado equals the full transaction amount, and the private budget realizado equals the author's net-of-settlement portion.
- [ ] **Period boundaries:** A transaction timestamped at exactly `period.EndDate()` is included; one at `period.EndDate() + 1ns` is excluded. Tested with `ServiceTestWithDBSuite`.
- [ ] **Soft-delete guard:** A soft-deleted transaction is NOT counted in realizado. Add a test that creates a transaction, deletes it, and checks realizado returns 0.
- [ ] **Category mapping FK cascade:** Deleting a mapped category either blocks (RESTRICT) or nullifies the mapping and shows a UI warning. Tested manually and in an integration test.
- [ ] **Alert deduplication fence:** `last_alerted_threshold` conditional UPDATE prevents double-firing. Tested with a concurrent goroutine test.
- [ ] **Alert recipient correctness:** A private budget alert notification has exactly one recipient (the owner). A shared budget alert has both connection members. Verified with unit tests.
- [ ] **Frontend cache invalidation:** Creating a transaction updates the budget progress bar without a page reload. Verified with a Playwright e2e test.
- [ ] **Down migration tested:** `just migrate-down` runs to completion on a local DB before the migration PR is merged.
- [ ] **Swagger spec regenerated:** `just generate-docs` was run after adding budget handlers; the frontend TypeScript types reflect the new endpoints.
- [ ] **IDOR protection:** Fetching another user's budget by ID returns 403. Tested with a handler unit test.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Double-counting discovered in production | HIGH | Issue a data migration to recompute all affected budgets' realizado; send a correction notification to affected users; hotfix the query before next period |
| Alert spam fired before dedup fence was added | MEDIUM | Deduplicate notification rows retroactively with a SQL cleanup; send apology notification; hotfix alert code |
| Category mapping FK not enforced, orphaned mappings exist | MEDIUM | Write a one-off migration to delete mapping rows where either `category_id` no longer exists; add FK constraint with `ON DELETE CASCADE` |
| Down migration missing, Cloud Run rollback fails | HIGH | Write the Down migration post-hoc; apply it manually via `just migrate-down`; requires a maintenance window |
| Frontend stale cache for budget progress | LOW | Add missing invalidation call in the next deploy; no data corruption, only a UX delay |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Spend double-counting (Pitfall 1) | Budget data model + realizado query phase | Integration test: split tx → assert shared budget realizado == full amount, private == net |
| Period boundary bugs (Pitfall 2) | Budget data model phase + frontend period selection | Unit test at `EndDate()` boundary; e2e: budget shows correct month |
| Category mapping drift (Pitfall 3) | Category equivalence mapping phase (prerequisite) | Integration test: delete mapped category → blocked or budget shows warning |
| Scope leakage (Pitfall 4) | Budget data model phase | Integration test: private budget excludes partner spend; shared budget includes both |
| Alert spam (Pitfall 5) | Budget alert phase — conditional UPDATE fence first | Concurrent write test: two simultaneous transactions → exactly one alert persisted |
| Alert wrong recipient (Pitfall 6) | Budget alert phase — `recipients()` helper | Unit test: private budget alert has 1 recipient; shared has 2 |
| Concurrency race on alert state (Pitfall 7) | Budget alert phase — alongside Pitfall 5 | Goroutine concurrency test; assert `last_alerted_threshold` written once |
| Migration/rollback safety (Pitfall 8) | Budget data model phase — migration authoring | Run `just migrate-down` locally before PR merge |
| Best-effort push losing alert (Pitfall 9) | Budget alert phase — threshold write timing | Manual test: simulate push failure, verify inbox row persisted, verify threshold not yet updated |
| Frontend stale cache (Pitfall 10) | Frontend budget progress UI phase | Playwright: create transaction → assert progress bar updates without reload |
| Cents rounding in progress bar (Pitfall 11) | Frontend budget progress UI phase | Unit test `budgetProgressPercent` with edge cases: cap=0, realizado=cap, realizado > cap |

---

## Sources

- Codebase: `backend/internal/repository/transaction_repository.go` — `GetBalance` implementation (lines 334–455), `FindOrphanedSettlementTransactions` (lines 225–315)
- Codebase: `backend/internal/service/transaction_create.go` — `createSettlementsForSplit`, `injectLinkedTransactions`
- Codebase: `backend/internal/domain/transaction.go` — `Period.StartDate()`, `Period.EndDate()`, `SplitSettings`
- Codebase: `backend/internal/domain/settlement.go` — `Settlement` domain type, account-ID scoping
- Codebase: `backend/internal/service/notification_service.go` — `Dispatch`, post-commit goroutine pattern, dedup by `(recipientUserID, type)`
- Codebase: `backend/internal/service/transaction_create.go` — `//nolint:contextcheck` detached context pattern for post-commit goroutines
- Design notes: `.planning/notes/shared-budget-design-decisions.md` — scope semantics, split semantics mirroring `GetBalance`
- Project notes: `.planning/PROJECT.md` — v1.7 out-of-scope decisions (no rollover, no retry push infra)
- Codebase: `backend/CLAUDE.md` — `DBTransaction` pattern, conditional UPDATE race guard, soft-delete conventions, error tag conventions
- Codebase: `frontend/CLAUDE.md` — TanStack Query invalidation convention, `QueryKeys` centralization, cents-only arithmetic rule

---
*Pitfalls research for: v1.7 Budgets module on an existing Go/React couples' finance app*
*Researched: 2026-06-06*
