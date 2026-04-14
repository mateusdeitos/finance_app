# Requirements: v1.1 Charges

**Defined:** 2026-04-14
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.

---

## Active Requirements

### Backend — Charge Entity & Persistence

- [ ] **CHG-01**: System provides a `Charge` entity with fields: `id`, `author_user_id`, `author_destination_account_id` (nullable), `connection_id`, `period_month`, `period_year`, `status` (pending/paid/rejected/cancelled)
- [ ] **CHG-02**: DB migration creates the `charges` table with FK on `connection_id` (ON DELETE RESTRICT)

### Backend — Charge Lifecycle API

- [ ] **CHG-03**: User can create a charge linked to one of their active connections for a given period
- [ ] **CHG-04**: User can accept a pending charge received from a connected user, providing a source account for the debtor transfer
- [ ] **CHG-05**: User can reject a pending charge received from a connected user
- [ ] **CHG-06**: User (author only) can cancel a pending charge they created
- [ ] **CHG-07**: System validates status transitions in the domain layer (only `pending` charges can be accepted/rejected/cancelled; terminal states have no valid exits)
- [ ] **CHG-08**: System enforces IDOR protection — only parties to the charge (author or recipient via connection) can view or act on it

### Backend — Auto-Transfer on Accept

- [ ] **CHG-09**: On charge acceptance, system atomically creates two transfers inside a single DB transaction: debtor→connection account and connection→creditor account
- [ ] **CHG-10**: Acceptance uses a conditional UPDATE (`WHERE status = 'pending'`) to prevent double-accept race conditions; returns error if `RowsAffected == 0`
- [ ] **CHG-11**: Auto-created transfers have `charge_id` set to link them back to the originating charge

### Backend — Transaction Enhancement

- [ ] **TXN-01**: DB migration adds nullable `charge_id` column (FK to `charges.id`) to the `transactions` table
- [ ] **TXN-02**: Transaction domain model and GORM entity include `charge_id` field

### Backend — Charge Listing

- [ ] **CHG-12**: User can list charges they authored (sent), filterable by status and period
- [ ] **CHG-13**: User can list charges they received (as the other party in the connection), filterable by status and period
- [ ] **CHG-14**: System provides an endpoint returning the count of pending charges requiring the authenticated user's action (for the sidebar badge)

### Frontend — Charges Page

- [ ] **FE-01**: User can navigate to a charges listing page via a sidebar link
- [ ] **FE-02**: Charges page displays sent and received charges in separate sections with status indicators
- [ ] **FE-03**: User can create a charge via a form (select connection, period, destination account)
- [ ] **FE-04**: User can accept a received charge via a form (specifying source account for the debtor transfer)
- [ ] **FE-05**: User can reject a received charge with a single action
- [ ] **FE-06**: User (author only) can cancel a sent pending charge with a single action

### Frontend — Sidebar Badge

- [ ] **FE-07**: Sidebar nav link for charges displays a badge showing the count of pending charges requiring the logged-in user's action
- [ ] **FE-08**: Badge is hidden when there are no pending charges to act on

---

## Future Requirements

_(Deferred — not in v1.1 scope)_

- Balance validation before charge creation (user explicitly deferred)
- Charge amount field (current design derives value from connection balance at settle time)
- Push/email notifications for charge events
- Charge dispute flow beyond reject (e.g., counter-offer)

---

## Out of Scope

- **Balance validation on charge creation** — user explicitly excluded; no blocking check on connection balance
- **author_transaction_id / destination_user_transaction_id on Charge** — redundant given `charge_id` on transactions; dropped for simpler schema
- **Push notifications** — sidebar badge via polling is sufficient for v1.1

---

## Traceability

| REQ-ID | Phase | Notes |
|--------|-------|-------|
| CHG-01 | Phase 5 | Charge domain struct and GORM entity |
| CHG-02 | Phase 5 | DB migration: charges table |
| CHG-03 | Phase 6 | ChargeService.Create + handler |
| CHG-04 | Phase 7 | ChargeService.Accept + handler (depends on atomic transfer) |
| CHG-05 | Phase 6 | ChargeService.Reject + handler |
| CHG-06 | Phase 6 | ChargeService.Cancel + handler |
| CHG-07 | Phase 5 | ValidateTransition in domain layer |
| CHG-08 | Phase 6 | IDOR checks in all service methods |
| CHG-09 | Phase 7 | Atomic dual-transfer in single DB transaction |
| CHG-10 | Phase 7 | Conditional UPDATE WHERE status='pending' + RowsAffected check |
| CHG-11 | Phase 7 | charge_id set on auto-created transfer transactions |
| TXN-01 | Phase 5 | DB migration: charge_id column on transactions |
| TXN-02 | Phase 5 | Transaction domain model + entity charge_id field |
| CHG-12 | Phase 6 | ChargeService.List (sent) + handler |
| CHG-13 | Phase 6 | ChargeService.List (received) + handler |
| CHG-14 | Phase 6 | Pending-count endpoint + handler |
| FE-01  | Phase 8 | Sidebar link + page routing |
| FE-02  | Phase 8 | Charges listing page (sent/received sections) |
| FE-03  | Phase 8 | Create charge form |
| FE-04  | Phase 8 | Accept charge form |
| FE-05  | Phase 8 | Reject charge action |
| FE-06  | Phase 8 | Cancel charge action |
| FE-07  | Phase 8 | Sidebar badge with pending count |
| FE-08  | Phase 8 | Badge hidden when count is zero |

**Coverage:** 24/24 requirements mapped ✓

---

*Requirements defined: 2026-04-14*
