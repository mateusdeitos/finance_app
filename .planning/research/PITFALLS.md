# Pitfalls Research: Charges

**Domain:** Charge/debt-settlement feature added to existing couples finance app
**Researched:** 2026-04-14
**Overall confidence:** HIGH (based on direct codebase inspection + known patterns for state-machine financial features)

---

## Critical Pitfalls

### CP-1: Double-Acceptance Race Condition

**What goes wrong:** Two concurrent requests to accept the same charge both read `status = pending`, both pass the status-transition guard, and both proceed to create transfer pairs. The charge ends up `paid` but two sets of transactions exist in the database.

**Why it happens in this codebase:**
The existing `DBTransaction` pattern (`Begin → do work → Commit`) is correct, but only guards against isolation at the application level. Without a database-level lock on the charge row, two goroutines can both pass the "charge is still pending?" check before either commits.

The pattern used in `userConnectionService.UpdateStatus` illustrates the risk — it reads, checks a condition, then writes inside a transaction, but does not take a `SELECT FOR UPDATE` lock. Copying that pattern naively for `AcceptCharge` produces the same window.

**Consequences:** Duplicate transfer pairs (debit and credit) in both users' accounts, double-counted balance, impossible to reconcile without manual DB intervention.

**Prevention:**
- Use `SELECT ... FOR UPDATE` on the charge row at the start of the accept transaction. In GORM: `db.Set("gorm:query_option", "FOR UPDATE").First(&charge, id)`.
- Alternative: a conditional UPDATE with a WHERE clause — `UPDATE charges SET status='paid' WHERE id=? AND status='pending'` — check affected rows; if 0, the charge was already accepted by another request. Return `ErrCodeConflict`.
- Add a DB-level unique index on `(charge_id, status)` as a last-resort constraint if using a status-history table.

**Layer:** Repository + Service. The conditional UPDATE pattern is the cleanest because it eliminates the read-check-write window entirely.

---

### CP-2: Non-Atomic Accept — Transfers Created Without Charge Status Update

**What goes wrong:** The accept flow: (1) mark charge `paid`, (2) create debtor transfer, (3) create creditor transfer. If step 2 or 3 fails mid-way, the charge is `paid` but transfers are missing or partial.

**Why it happens:**
The existing `createTransactions` code is already wrapped in a DB transaction, but the charge's status update and the transaction creation must be in the **same** DB transaction. If the charge service calls `transaction.Create(...)` via `services.Transaction.Create(...)` and that function begins its own nested `dbTransaction.Begin(ctx)`, the inner Begin in PostgreSQL is a savepoint — which is correct — but only if the outer context carries the transaction. The existing `GetTxFromContext` pattern handles this correctly. The risk is forgetting to call the charge-status update *inside* the already-open transaction context, or letting `TransactionService.Create` open a top-level transaction when one already exists.

**Consequences:** Charge appears paid; user sees no corresponding transfers. Balance is not updated. No way for users to trigger re-execution.

**Prevention:**
- Implement `AcceptCharge` as a single service method that:
  1. Opens one DB transaction via `dbTransaction.Begin(ctx)`.
  2. Locks and updates the charge status to `paid`.
  3. Calls an internal (not the public `TransactionService.Create`) helper to insert the two transfer rows, passing the transactional context.
  4. Commits.
- Do not call `services.Transaction.Create` if that method always begins its own transaction — instead, expose an internal `createTransactionsInTx` helper or call the repository directly from the charge service.
- Alternatively, call `services.Transaction.Create` **after** the charge update and let it participate via `GetTxFromContext` — this works provided the context carries the outer `tx` value before `Begin` is re-called.

**Layer:** Service layer (charge service). Architectural decision about whether to call TransactionService directly or bypass it to a shared internal helper.

---

### CP-3: Missing Status Transition Validation

**What goes wrong:** API allows: `pending → cancelled → paid`, `rejected → accepted`, or `paid → pending`. Without an explicit state machine, any status can be set to any other status.

**Why it happens:**
`UserConnectionService.UpdateStatus` accepts any valid status value and writes it. Copying this pattern for charges (which have a more complex lifecycle) means no transition guards.

**Consequences:** A user can re-open a paid charge, accept an already-rejected charge, or cancel a charge that was already accepted and whose transfers already exist.

**Prevention:**
Define an explicit transition table in the domain layer:

```
pending  → paid       (creditor accepts)
pending  → rejected   (creditor rejects)
pending  → cancelled  (debtor cancels)
paid     → (terminal, no transitions)
rejected → (terminal, no transitions)
cancelled → (terminal, no transitions)
```

Implement `ValidateTransition(from, to ChargeStatus) error` in `domain/charge.go`. Call this in the service before any write. Return `ErrCodeBadRequest` with a meaningful tag like `CHARGE.INVALID_STATUS_TRANSITION`.

**Layer:** Domain model + Service layer.

---

### CP-4: Authorization Not Scoped to Connection Membership

**What goes wrong:** Any authenticated user can call `POST /api/charges` or `PATCH /api/charges/:id/accept` for any charge ID, as long as they're authenticated.

**Why it happens:**
This is a known gap in the existing code — `UserConnectionHandler.Search` does not filter by `userID`, and `UserConnectionService.Delete` does no ownership check. Charges are inherently bilateral and involve two specific users. Without explicit "does this user own or is a party to this charge?" checks, IDOR (insecure direct object reference) allows any user to read or mutate any charge.

**Consequences:** Data leakage (one user can list another couple's charges); a malicious user can accept or cancel charges belonging to unrelated connections.

**Prevention (see Authorization Pitfalls section for detail):**
- On all charge mutations, fetch the charge and verify `charge.CreditorUserID == currentUserID || charge.DebtorUserID == currentUserID`.
- Additionally verify that the underlying `UserConnection` is in `accepted` status at the time of creation.
- For accept/reject, verify `charge.CreditorUserID == currentUserID` (creditor decides).
- For cancel, verify `charge.DebtorUserID == currentUserID` (debtor can cancel their own request).

**Layer:** Service layer (not handler). Handlers pass `userID` from `appcontext`; services enforce the invariant.

---

### CP-5: Orphaned Charges After Connection Deletion

**What goes wrong:** A `UserConnection` is deleted (or transitions away from `accepted`) while charges in `pending` status exist against it. The charge record now references a non-existent or invalid connection. The accept flow then tries to look up account IDs from the connection and finds nothing.

**Why it happens:**
`UserConnectionService.Delete` has no cascade logic — it calls `userConnectionRepo.Delete(ctx, id)` and returns. No charge cleanup is performed. The existing settlement pattern has the same gap: settlements reference `source_transaction_id` without cascading deletes.

**Consequences:**
- Pending charges become permanently unresolvable.
- If acceptance is attempted, it fails with a confusing "connection not found" error.
- The badge count includes charges that can never be acted upon.

**Prevention:**
- On connection deletion, also cancel all `pending` charges associated with that connection. Do this atomically in `UserConnectionService.Delete` (which currently ignores `userID` — a secondary bug).
- If soft-deleting connections is ever added, apply the same logic.
- Alternatively, add a DB-level FK constraint with `ON DELETE CASCADE` or `ON DELETE RESTRICT` and decide at the schema level. RESTRICT is safer (prevents deletion while charges are pending; force user to resolve first).

**Layer:** Service layer (`UserConnectionService.Delete`) + migration for FK constraint.

---

## Authorization Pitfalls

### AP-1: Only the Creditor Should Accept or Reject

**Wrong assumption:** "Either party can accept."

**Correct rule:** The user who *receives* money is the creditor. The debtor creates the charge (they owe money). The creditor accepts (agreeing to the transfer) or rejects (refusing). The debtor can cancel before the creditor acts.

This mirrors the existing `UpdateStatus` pattern where `existing[0].ToUserID != userID` is the gate — but for charges, the directionality is more explicit. Model this clearly in the domain struct with named fields (`CreditorUserID`, `DebtorUserID`) rather than relying on `FromUserID/ToUserID` conventions that require `SwapIfNeeded` reasoning.

**Prevention:** Enforce in service method signature: `AcceptCharge(ctx, creditorUserID, chargeID)` — inside, assert `charge.CreditorUserID == creditorUserID`. Return `errors.Forbidden(...)` if not.

**Layer:** Service layer.

---

### AP-2: Charge Creation Requires an Active Connection

**Wrong assumption:** "Any two users with a historical connection can create charges."

**Correct rule:** Only users with an `accepted` UserConnection should be able to create charges against each other. A `pending` connection (invite sent, not yet accepted) must not allow charges.

**Why it matters:** The `AcceptCharge` flow depends on `FromAccountID` and `ToAccountID` from the connection to create transfers. These accounts are only created when the connection is accepted (`AcceptInviteByExternalID`). Allowing charge creation against a `pending` connection either fails at acceptance time or creates transfers to non-existent accounts.

**Prevention:** In `ChargeService.Create`, load the `UserConnection`, verify `ConnectionStatus == accepted`. Return `errors.BadRequest("connection must be accepted to create charges")`.

**Layer:** Service layer.

---

### AP-3: Account Ownership Not Verified on Transfer Creation

**What goes wrong:** When auto-creating transfers on charge acceptance, the code derives source and destination accounts from the `UserConnection` record. If a user has changed their default connection account (if that feature exists or is added later), the charge may reference stale account IDs stored at charge-creation time versus current connection accounts.

**Prevention:** At the moment of acceptance, re-fetch the `UserConnection` to get the current `FromAccountID`/`ToAccountID` rather than reading them from the charge record. If the charge stores account IDs at creation time, document this as a deliberate snapshot decision and add a migration note.

**Layer:** Service layer design decision, document explicitly.

---

## Data Integrity Pitfalls

### DI-1: Charge Amount Stored in Dollars Instead of Cents

**What goes wrong:** All existing `Amount` fields are stored in cents (int64). If the charge form or API serialization accidentally passes a float or full-currency value (e.g., `10.50` instead of `1050`), stored amounts will be wrong by a factor of 100.

**Why it happens:** The frontend currently uses integer-only amount fields in the transaction form, but a new charge form might be built by a different developer who doesn't check this convention.

**Prevention:** Add `amount must be in cents (int64 > 0)` to the charge domain validation. Add a comment on the `Amount` field in `domain/charge.go` mirroring the existing `// Amount in cents` comments elsewhere. Add a frontend utility to convert display currency to cents before submission.

**Layer:** Domain validation + frontend API payload builder.

---

### DI-2: Transfer Pair Symmetry Not Enforced

**What goes wrong:** The charge acceptance creates two transfers: one debit from the debtor's account and one credit to the creditor's account. If only one is created (partial failure) and the outer transaction is not properly rolled back, the books are unbalanced.

**Why it happens:** The existing `injectLinkedTransactions` pattern creates a paired transfer in-memory before persisting — this is safe. However, if a charge service calls `TransactionService.Create` twice (once per user) rather than relying on the linked-transaction mechanism, the second call is an independent database operation and can fail after the first commits.

**Prevention:** Model the two transfers as a single cross-user transfer using the existing linked-transaction mechanism (which already handles this for transfers between partner accounts). The charge acceptance should construct a single `TransactionCreateRequest` of type `transfer` with `DestinationAccountID` pointing to the creditor's connection account. The existing `injectLinkedTransactions` code will create the linked pair atomically.

**Layer:** Service layer — reuse existing transfer creation pattern rather than creating two separate transactions.

---

### DI-3: Charge Status Not Updated if Transaction Creation Fails

Covered in CP-2. Additional note: if status update is done last (rather than first within the transaction), a panic or context cancellation between transaction creation and status update leaves transfers orphaned without a `paid` charge. Always update status first, create transfers second — both inside one DB transaction. On rollback, both are undone cleanly.

**Layer:** Service layer (ordering of operations within the accept transaction).

---

### DI-4: No Guard Against Self-Charges

**What goes wrong:** A user creates a charge against themselves (both `CreditorUserID` and `DebtorUserID` are the same). The auto-transfer on acceptance creates a transfer from the user's account to their own account, which is nonsensical.

**Prevention:** In `ChargeService.Create`, validate `creditorUserID != debtorUserID`. Return `errors.BadRequest("cannot create a charge against yourself")`.

**Layer:** Service layer validation.

---

### DI-5: Charge Amount of Zero or Negative

The existing transaction validation already guards `amount > 0`. The same validation must be applied to charges. A `0`-amount charge would produce a no-op transfer which is valid technically but meaningless and confusing.

**Prevention:** Same validation pattern as `ErrAmountMustBeGreaterThanZero`. Add to domain-level charge validation.

**Layer:** Domain validation.

---

## Frontend Pitfalls

### FE-1: Badge Count Goes Stale After Accept/Reject Actions

**What goes wrong:** The sidebar badge shows the count of pending charges requiring the current user's action. After the user accepts or rejects a charge in the list, the badge count does not update until the next page load or manual refresh.

**Why it happens:** The `QueryKeys` pattern invalidates only the queries explicitly listed in `onSuccess`. If the badge query (`QueryKeys.Charges` or a dedicated `QueryKeys.PendingChargesCount`) is not in that list, it stays cached.

**Prevention:**
- Add `QueryKeys.PendingChargesCount` (or `QueryKeys.Charges`) to the `QueryKeys` constant before building any charge hooks.
- In `useAcceptCharge`, `useRejectCharge`, and `useCancelCharge` mutation hooks, invalidate `[QueryKeys.Charges]` in `onSuccess` — the badge component should derive its count from the same query, not a separate count endpoint.
- If a separate count endpoint is used for the badge, ensure it shares a query key that is invalidated by the same mutations.

**Layer:** Frontend mutation hooks + `QueryKeys` constant.

---

### FE-2: Optimistic Updates Showing Wrong State on Network Failure

**What goes wrong:** If optimistic updates are used (e.g., immediately removing a charge from the pending list after clicking Accept), and the network request fails, the charge disappears from the UI temporarily. On query refetch, it reappears — confusing the user who believed they completed the action.

**Why it happens:** TanStack Query's optimistic update pattern requires careful `onError` rollback. The existing codebase does not use optimistic updates (mutations rely on `invalidateQueries` in `onSuccess` only). Adding optimistic updates for charges without implementing the rollback path in `onError` creates the confusion.

**Prevention:** Do not use optimistic updates for charge status transitions. These are financial operations — latency on a spinner is acceptable; phantom state changes are not. Use the existing non-optimistic pattern: show a loading state, invalidate on success, let the list re-render from server truth.

**Layer:** Frontend mutation hooks. Enforce in code review.

---

### FE-3: List Shows Both Sent and Received Charges Without Clear Visual Distinction

**What goes wrong:** The listing endpoint returns both charges where the current user is the debtor (sent) and charges where they are the creditor (received). Without visual distinction, the user cannot tell which charges require their action and which are waiting on the partner.

**Why it happens:** A single list endpoint returning all charges is simpler to build, but the UI needs to separate "awaiting my action" from "awaiting partner's action."

**Prevention:**
- On the backend, the list endpoint should accept a filter: `role=creditor|debtor|all`.
- On the frontend, the listing page should show two sections: "Cobranças recebidas" (received, requires your action) and "Cobranças enviadas" (sent, waiting on partner).
- The badge count should reflect only charges where `currentUser == creditor AND status == pending` (actions required from the current user).

**Layer:** API design (filter parameter) + frontend list component.

---

### FE-4: Form Allows Submitting Without a Selected Connection

**What goes wrong:** If the charge creation form uses a connection selector and the user submits without selecting one (or the selector defaults to `undefined`), the API receives `connection_id: 0` or `undefined`. The backend validates `connectionID > 0` but the error message may not map cleanly to the form field.

**Prevention:**
- Add a Zod schema rule: `connectionId: z.number().int().positive("Selecione um parceiro")`.
- Ensure the `mapTagsToFieldErrors` utility covers a `CHARGE.INVALID_CONNECTION_ID` tag mapping to the `connectionId` field — following the same pattern used for transaction split settings.

**Layer:** Frontend form validation + error tag mapping.

---

### FE-5: Navigation to Charges Page Doesn't Invalidate Badge Until Re-render

**What goes wrong:** The user navigates to the charges page, accepts a charge, navigates away. The badge shows the old count because the sidebar renders from a cached query that was not re-fetched after navigation.

**Why it happens:** TanStack Query caches queries by key. If the sidebar badge is mounted persistently in `AppLayout` (which it is, given `_authenticated.tsx` wraps all routes), it holds a stale cache entry.

**Prevention:**
- Ensure the badge query has a short `staleTime` (0 or a few seconds) so re-renders trigger a background refetch.
- The mutation `onSuccess` invalidation (FE-1 prevention) is the primary fix — if that is correct, the badge re-renders immediately after any charge action anywhere in the app.

**Layer:** Frontend query configuration (`staleTime`) + mutation invalidation.

---

## Prevention Strategy

| Pitfall | Priority | Layer | Concrete Action |
|---------|----------|-------|-----------------|
| CP-1 Race condition on accept | CRITICAL | Repository / Service | `SELECT FOR UPDATE` or conditional UPDATE with affected-rows check |
| CP-2 Non-atomic accept | CRITICAL | Service | Single DB transaction wrapping status update + both transfers; use `GetTxFromContext` pattern |
| CP-3 Status transition guard | HIGH | Domain | `ValidateTransition(from, to)` in `domain/charge.go`; call in service before any status write |
| CP-4 IDOR authorization | HIGH | Service | `charge.CreditorUserID == currentUserID` / `charge.DebtorUserID == currentUserID` checks in every mutation method |
| CP-5 Orphaned charges on connection delete | HIGH | Service | Cancel pending charges in `UserConnectionService.Delete`, atomically |
| AP-1 Creditor-only accept/reject | HIGH | Service | Enforce in `AcceptCharge` / `RejectCharge` method signatures |
| AP-2 Connection must be accepted | MEDIUM | Service | Validate `ConnectionStatus == accepted` in `ChargeService.Create` |
| AP-3 Stale account IDs | MEDIUM | Service | Re-fetch connection at acceptance time, not from charge record |
| DI-1 Amount in cents | MEDIUM | Domain + Frontend | Validation + code comment + frontend cents converter |
| DI-2 Transfer pair symmetry | HIGH | Service | Use single cross-user transfer via existing linked-transaction mechanism |
| DI-3 Status updated after transfer | HIGH | Service | Status first, transfers second — both in one transaction |
| DI-4 Self-charge | LOW | Service | `creditorUserID != debtorUserID` validation |
| DI-5 Zero amount | MEDIUM | Domain | Same guard as existing `ErrAmountMustBeGreaterThanZero` |
| FE-1 Stale badge | HIGH | Frontend hooks | Add `QueryKeys.Charges` invalidation to all charge mutation hooks |
| FE-2 Optimistic update rollback | MEDIUM | Frontend hooks | Do not use optimistic updates for charge transitions; use loading state |
| FE-3 No sent/received distinction | HIGH | API + Frontend | Filter param on list endpoint; two-section UI; badge = creditor+pending only |
| FE-4 Form missing connection | MEDIUM | Frontend form | Zod `z.number().int().positive()` on connectionId |
| FE-5 Badge stale after navigation | MEDIUM | Frontend query config | Short `staleTime` + correct mutation invalidation covers this |

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| DB migration for charges table | Missing `status` column index — list queries filter by status heavily | Add `CREATE INDEX charges_status_idx ON charges(status)` in migration |
| AcceptCharge service method | CP-1 + CP-2 are both present simultaneously if naively implemented | Write the conditional UPDATE first, verify 1 row affected, then open transfer creation — all in one transaction |
| ChargeService wiring in Services struct | `ChargeService` will need `TransactionService` for transfer creation — circular dependency risk exists (same as `TransactionService` needs `Services`) | Follow existing pattern: pass `*Services` to `ChargeService` constructor; accept the circular dependency via pointer indirection in `main.go` |
| Frontend badge component | FE-1 + FE-5 are both triggered by first badge implementation | Make badge derive count from the main charges query, not a separate count endpoint |
| Integration tests | Double-accept test is non-trivial to test with a single DB | Use `sync.WaitGroup` + goroutines in test to simulate concurrent accepts; assert exactly one pair of transfers created |

---

## Sources

- Direct inspection of `/workspace/backend/internal/` (domain, service, repository, handler layers) — HIGH confidence
- Direct inspection of `/workspace/frontend/src/` (hooks, queryKeys, drawer patterns) — HIGH confidence
- PostgreSQL `SELECT FOR UPDATE` documentation and known race condition patterns in financial systems — HIGH confidence
- TanStack Query cache invalidation patterns (version in use: consistent with React Query v5 patterns in codebase) — HIGH confidence
