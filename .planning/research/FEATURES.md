# Features Research: Charges

**Domain:** Debt-settlement / payment-request feature in a couples finance app
**Researched:** 2026-04-14
**Confidence:** HIGH (grounded in existing codebase + established patterns from Venmo, Splitwise, NuBank Pix)

---

## Table Stakes (must have)

These are behaviors every charge/payment-request system must have. Missing any of these makes the feature feel incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create a charge (creditor → debtor) | Core value proposition — one user is owed money by the other | Low | Needs: amount, description, optional due date |
| Pending state on creation | Charge must wait for debtor's response; immediate execution would be wrong | Low | Status = `pending` |
| Accept charge → auto-create transfer | The defining behavior of this feature; acceptance settles the debt | Medium | Must create linked transfer transactions for both users atomically |
| Reject charge | Debtor disagrees with the amount or reason; must be able to decline | Low | Status = `rejected`; no transfers created |
| Cancel charge | Creditor withdraws the request before it is acted on | Low | Status = `cancelled`; only creditor can cancel; only while pending |
| List charges (sent + received) | Users need to see what they owe and what they are owed | Low | Filter by direction (sent/received) and status |
| Pending badge / counter | User needs ambient awareness of charges awaiting action | Low | Frontend: sidebar badge; backend: count endpoint or include in list |
| Immutability after resolution | Accepted/rejected/cancelled charges must not be editable | Low | Validation rule: status transitions are one-way |
| Link charge to resulting transfer | Audit trail — user can trace which charge caused which transactions | Low | `charge.transfer_transaction_id` FK after acceptance |
| Authorization: only parties can act | Debtor accepts/rejects; creditor cancels; no one else | Low | Validate `userID` against `creditor_user_id` / `debtor_user_id` |

---

## Differentiators (valuable additions)

Features that improve UX or trust without being mandatory.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Description field on charge | Clarity on what the debt is for ("dinner", "rent") reduces disputes | Low | Free text; maps naturally to transfer description |
| Due date (optional) | Light social pressure; useful when timing matters | Low | `due_date *time.Time`; no enforcement needed for v1.1 |
| Partial amount suggestion | Creditor can suggest paying only part of outstanding balance | Medium | Would require validation against Settlement balance; defer |
| Notes / comment on rejection | Debtor can explain why they rejected | Low | `rejection_note string` optional; improves communication |
| View linked transactions after acceptance | From the charge, jump to the created transfer | Low | Frontend only — the `transfer_transaction_id` FK enables this |
| Created-from-settlement shortcut | Creditor sees outstanding Settlement balance and creates charge from it | Medium | Frontend UX; backend just needs the charge creation endpoint |

---

## Anti-features (avoid for v1.1)

Features that are out of scope, over-engineered, or actively harmful for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Balance validation on creation | Already explicitly out of scope per PROJECT.md; adds complexity without clear user benefit now | Trust the users; defer balance guardrails |
| Partial settlement charges | Requires coordination with Settlement domain; increases edge cases significantly | Full-amount charges only for v1.1 |
| Recurring charges | Adds recurrence machinery (already complex in transactions) to a new entity | Out of scope; re-evaluate if users request it |
| Expiry / auto-cancellation | Automatic state transitions require background jobs or cron; adds infra complexity | Manual cancel only; user chooses when to give up |
| Push/email notifications | Requires notification infrastructure not yet in the system | Frontend badge is sufficient for v1.1 |
| Group charges (>2 users) | App is fundamentally two-user; groups break the user-connection model | Not applicable to this domain |
| Charge countering / negotiation | "I'll pay you X instead of Y" flow | Too complex; reject + create new charge covers this |
| Splitwise-style debt simplification | Multi-hop debt graph reduction; not needed for 2-person app | Settlement domain already tracks balances directly |

---

## Charge Entity Design

Recommended fields with rationale for each, designed to fit the existing codebase patterns.

```
Charge {
  id                    int           -- primary key
  creditor_user_id      int           -- user who is owed money (created the charge)
  debtor_user_id        int           -- user who owes money (must accept/reject)
  connection_id         int           -- FK to user_connections; scopes the relationship; also used to resolve accounts
  amount                int64         -- in cents, consistent with Transaction.Amount
  description           string        -- what the debt is for; used as transfer description on acceptance
  status                ChargeStatus  -- pending | accepted | rejected | cancelled
  due_date              *time.Time    -- optional; informational only
  rejection_note        *string       -- optional; set by debtor on rejection
  transfer_transaction_id *int        -- FK to transactions; set when accepted; the creditor-side transfer
  created_at            *time.Time
  updated_at            *time.Time
}
```

**Field rationale:**

- `creditor_user_id` + `debtor_user_id`: explicit directionality avoids the SwapIfNeeded complexity of UserConnection. The charge has a fixed perspective.
- `connection_id`: required because UserConnection holds the account IDs for both parties. On acceptance, the service calls `connection.FromAccountID` and `connection.ToAccountID` to build the transfer. This also enforces that only connected users can charge each other.
- `amount` in cents: consistent with all other monetary fields in the domain.
- `status` as a string enum: consistent with `UserConnectionStatusEnum`, `SettlementType`, `TransactionType` patterns in this codebase.
- `transfer_transaction_id`: points to the creditor-side transaction (the `income` side of the transfer) as the canonical reference. The linked transfer pair can be traversed via `LinkedTransactions`.
- `rejection_note`: nullable string; only meaningful when status = `rejected`.
- `due_date`: nullable; informational only in v1.1; no enforcement logic needed.

**Status transition rules (one-way finite state machine):**

```
pending → accepted   (debtor action)
pending → rejected   (debtor action; rejection_note optionally set)
pending → cancelled  (creditor action)

accepted, rejected, cancelled → (terminal; no further transitions)
```

---

## User Flow Analysis

### Create flow (creditor)

1. Creditor opens "New Charge" form.
2. Selects the connected partner (resolved via `user_connections` — for a 2-person app this is implicit if only one connection exists).
3. Enters amount and description. Optionally sets a due date.
4. Submits → `POST /api/charges` → charge created with status = `pending`.
5. Debtor sees a badge/notification indicator that a charge is waiting.

**Backend contract:**
- Validate that a `UserConnection` with status = `accepted` exists between the two users.
- Validate amount > 0.
- Validate description is non-empty.
- No balance check (explicitly out of scope).
- Return the created charge with `id` and `status = pending`.

---

### Accept flow (debtor)

1. Debtor opens charges list, sees pending charge.
2. Reviews amount and description.
3. Taps "Accept".
4. System shows confirmation ("This will create a transfer of R$X from your account to [partner]").
5. Debtor confirms → `PATCH /api/charges/{id}/accept`.
6. Backend (in a single DB transaction):
   a. Validates charge is `pending` and caller is `debtor_user_id`.
   b. Resolves accounts from `UserConnection` (debtor account = debtor side, creditor account = creditor side).
   c. Calls `TransactionService.Create` to create the linked transfer pair (same pattern as existing cross-user transfers using `DestinationAccountID`).
   d. Sets `charge.status = accepted`, sets `charge.transfer_transaction_id` to the created transaction ID.
   e. Commits.
7. Frontend navigates to transaction list or shows success state.

**Key dependency:** The `TransactionService.Create` for transfers already handles creating two linked `Transaction` rows (debit + credit). The ChargeService wraps this existing capability.

**Account resolution logic:**
```
connection.SwapIfNeeded(debtorUserID)
debtorAccountID  = connection.FromAccountID
creditorAccountID = connection.ToAccountID
```

The transfer `TransactionCreateRequest` uses:
- `AccountID = debtorAccountID` (source — money leaves here)
- `DestinationAccountID = &creditorAccountID`
- `Amount = charge.Amount`
- `Description = charge.Description`
- `TransactionType = transfer`
- `Date = today`

---

### Reject flow (debtor)

1. Debtor opens pending charge.
2. Taps "Reject". Optionally enters a note ("Amount is wrong, should be R$50").
3. Submits → `PATCH /api/charges/{id}/reject` with optional `{ rejection_note: "..." }`.
4. Backend validates charge is `pending` and caller is `debtor_user_id`.
5. Sets `status = rejected`, stores `rejection_note`.
6. No transfers created.
7. Creditor can see the rejection (and note) in their sent charges list.

---

### Cancel flow (creditor)

1. Creditor opens sent charges list, sees a pending charge.
2. Taps "Cancel".
3. Confirms → `PATCH /api/charges/{id}/cancel`.
4. Backend validates charge is `pending` and caller is `creditor_user_id`.
5. Sets `status = cancelled`.
6. No transfers created.

---

### List flow (both users)

- `GET /api/charges?direction=received&status=pending` — what I owe (debtor perspective)
- `GET /api/charges?direction=sent&status=pending` — what I am owed (creditor perspective)
- `GET /api/charges` — all charges involving the current user (both sides)

**Filter fields for `ChargeFilter`:**
```
status        []ChargeStatus
direction     "sent" | "received"  (resolved to creditor_user_id / debtor_user_id filter)
connection_id int
limit, offset int
```

---

## Dependencies on Existing Features

| Dependency | How Used | Risk |
|------------|----------|------|
| `UserConnection` (accepted) | Validates relationship exists; provides account IDs for auto-transfer | LOW — already well-defined |
| `TransactionService.Create` (transfer type) | Auto-creates the linked transfer pair on acceptance | LOW — existing capability, just called from ChargeService |
| `LinkedTransactions` | The created transfer naturally links both sides; charge stores one FK | LOW — existing mechanism |
| `appcontext.GetUserIDFromContext` | Authorization — caller must be creditor or debtor | LOW — standard pattern |
| DB transaction (`dbTransaction.Begin`) | Accept must be atomic: create transfer + update charge in one transaction | LOW — pattern already used in TransactionService |

---

## Confidence Notes

- Status lifecycle (pending/accepted/rejected/cancelled): HIGH confidence — this is the universal pattern across Venmo, NuBank Pix requests, and Splitwise's own historical accept/reject flow.
- Auto-transfer on accept: HIGH confidence — stated as the core feature in PROJECT.md; maps cleanly to existing `TransactionService.Create` with transfer type.
- Entity fields: HIGH confidence — derived directly from existing domain patterns in this codebase.
- Splitwise removed accept/reject for settlements (MEDIUM confidence from community reports) — this app's design goes the opposite direction by design, which is appropriate since charges are explicit requests, not auto-recorded settlements.
