# Phase 7 Context: Accept + Atomic Transfer

**Phase:** 7 — Accept + Atomic Transfer
**Goal:** Accepting a charge atomically settles the debt by creating two intra-account transfers (one per user) in a single DB transaction, with no possibility of double-acceptance.
**Requirements:** CHG-04, CHG-09, CHG-10, CHG-11
**Date:** 2026-04-15

---

## Decisions

### 1. Accept Request Shape

`POST /api/charges/:id/accept`

```json
{
  "account_id": 5,     // required — accepter's private account (fills the missing account on the charge)
  "amount": 12000,     // optional (cents) — if omitted, system recomputes from connection account balance
  "date": "2026-03-31" // required — date for the two created transfers
}
```

**Validation rules:**
- `account_id` required
- `date` required — used as the date for the **accepter's own transfer**
- `amount` optional (cents); if omitted, computed from connection account balance for the charge's period (absolute value)
- If `amount` is provided, it overrides the computed balance — the user may choose to settle for more or less

### 2. Who Accepts (Non-Initiating Party Rule)

The non-initiating party (the party who did NOT create the charge) is the one who can accept:

| Charge created by | Who can accept |
|-------------------|----------------|
| Charger (ChargerAccountID set, PayerAccountID null) | Payer |
| Payer (PayerAccountID set, ChargerAccountID null) | Charger |

**Authorization check at accept time:**
- Load charge by ID
- IDOR check: if caller is neither charger nor payer → 403
- Determine expected accepter based on which account is null on the charge
- If caller is NOT the expected accepter → 403

### 3. Two Intra-Account Transfers (not a cross-user transfer)

Accept creates **two separate same-user transfers**, each between the user's connection account and their private account:

**Charger's transfer:**
```
FROM: charger's connection account (UserConnection.FromAccountID or ToAccountID after SwapIfNeeded from charger's perspective)
TO:   ChargerAccountID on the charge (private account)
```
Effect: debits charger's shared account, credits their private account → zeroes out connection balance

**Payer's transfer:**
```
FROM: PayerAccountID on the charge (private account)
TO:   payer's connection account (UserConnection.FromAccountID or ToAccountID after SwapIfNeeded from payer's perspective)
```
Effect: debits payer's private account, credits their shared account → zeroes out connection balance

Both transfers use the same `amount` and `date` from the accept request.
Both transfers have `charge_id` set to the originating charge ID.

**Implementation note (Claude's Discretion):** Both `TransactionService.Create` calls + the charge status UPDATE must happen inside a single GORM `db.Transaction` scope for atomicity. If either transfer fails, both must be rolled back.

### 4. Phase 6 Create — Retroactive Changes Needed

**These changes are part of Phase 7 scope** (they must be in place for the accept flow to work correctly):

#### 4a. Remove `role` field — infer from connection account balance

The `role` field (`"charger"` / `"payer"`) is removed from the create request. The system derives the role from the caller's connection account balance for the specified period:

| Balance | Inferred role |
|---------|---------------|
| Positive (caller is owed money) | `charger` — caller's ChargerAccountID is set from `my_account_id` |
| Negative (caller owes money) | `payer` — caller's PayerAccountID is set from `my_account_id` |
| Zero | Reject — cannot create a charge when the balance is zero (400) |

#### 4b. `date` field added to create request

The create request requires a `date` field. This date is stored on the `Charge` entity and used as the date for the **initiator's own transfer** at accept time.

Each user provides the date for their own transfer:
- Initiating party provides `date` in the create request → used for their intra-account transfer
- Accepting party provides `date` in the accept request → used for their intra-account transfer

Both transfers are created atomically at accept time, but each uses the date from the party who provided their account.

#### 4c. `my_account_id` becomes required

Nullable `my_account_id` was in the original Phase 6 design. It is now required — the initiating party must always provide their private account at creation time.

### 5. Settlement Amount Computation

At accept time (when `amount` is omitted from request):
1. Call `TransactionRepository.GetBalance` (or `TransactionService.GetBalance`) with:
   - `UserID = chargerUserID`
   - `Period = charge.PeriodMonth / charge.PeriodYear`
   - `AccountIDs = [charger_connection_account_id]`
2. Use `abs(result.Balance)` as the transfer amount
3. If computed balance is zero at accept time and no `amount` provided → reject (no transfer to make)

### 6. Race Condition Guard (already decided in STATE.md)

- Use conditional `UPDATE charges SET status='paid' WHERE id=? AND status='pending'`
- Check affected rows — if 0, a concurrent accept already won → return conflict error (HTTP 409)
- The status update + both transfers all occur inside the same DB transaction
- No SELECT FOR UPDATE needed

### 7. ChargeID on Transfers

Both auto-created transfers must have `charge_id` set to the originating charge ID.

**Implementation note:** `TransactionCreateRequest` likely needs a `ChargeID *int` field added. The planner should check whether this field already exists and add it if not.

---

## Claude's Discretion

- DI wiring: inject `*Services` (or just `TransactionService`) into `chargeService` — same pattern as `transactionService`
- Exact GORM transaction scope implementation (e.g., `db.Transaction(func(tx *gorm.DB) error {...})`)
- HTTP 409 for concurrent double-accept conflict
- Whether to store the computed-at-creation balance on the charge for display purposes (probably not, out of scope)
- How to query connection account ID for each user (use `UserConnection.SwapIfNeeded` and read `FromAccountID` / `ToAccountID`)

---

## Deferred Ideas

- **Cascade delete behavior**: User mentioned "if charge is deleted, delete those transactions". Since charges transition to terminal states (paid/rejected/cancelled), hard-deletion is unlikely — this is a future concern. If needed, add `ON DELETE CASCADE` to `transactions.charge_id` FK in a future migration.
- **Display computed balance in charge response**: Show the live settlement amount as part of the charge detail API so the frontend can pre-fill the amount field.

---

## Canonical Refs

- `backend/internal/service/charge_service.go` — existing chargeService (Add: DI + Accept method)
- `backend/internal/service/interfaces.go` — ChargeService interface (Add: Accept method)
- `backend/internal/handler/charge_handler.go` — Add: accept handler + route
- `backend/internal/domain/charge.go` — Charge domain struct + ValidateTransition (needs `Date *time.Time` field added)
- `backend/internal/domain/transaction.go` — TransactionCreateRequest (may need ChargeID field)
- `backend/internal/service/transaction_create.go` — injectLinkedTransactions (same-user transfer path)
- `backend/internal/repository/interfaces.go` — TransactionRepository.GetBalance
- `backend/internal/domain/user_connection.go` — SwapIfNeeded, FromAccountID/ToAccountID
- `.planning/phases/05-charge-domain-db/05-CONTEXT.md` — Phase 5 entity decisions
- `.planning/phases/06-charge-repository-service-api-crud-listing/06-CONTEXT.md` — Phase 6 API decisions (role field now removed)
- `.planning/STATE.md` — Accumulated pitfall notes (CP-1, CP-2, DI-2)
