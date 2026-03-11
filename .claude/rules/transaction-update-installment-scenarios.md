---
paths:
  - "backend/internal/service/transaction_update*.go"
  - "backend/internal/service/transaction_update*_test.go"
---

# Transaction Update — Installment & Split Scenarios

Specification for integration tests covering `TransactionService.Update` when
recurrence and/or split settings change.

---

## Terminology

| Term | Meaning |
|---|---|
| **Recurrence** | `TransactionRecurrence` record + N linked `Transaction` rows (installments) |
| **Installment** | A single `Transaction` belonging to a recurrence (`TransactionRecurrenceID != nil`) |
| **Standalone** | A `Transaction` with no recurrence (`TransactionRecurrenceID == nil`) |
| **Split** | `LinkedTransactions` on a transaction (shared expense with a partner) |
| **propagation=all** | Apply to every installment in the recurrence |
| **propagation=current** | Apply only to the target installment |
| **propagation=current_and_future** | Apply to target installment and all with higher `installment_number` |

---

## Already Covered

| ID | Description |
|---|---|
| InstallmentScenario1 | Standalone, no split → Recurrence (3x monthly), no split — propagation=all |
| InstallmentScenario2 | Recurrence (3x monthly), no split → Standalone, no split — propagation=all, update installment 1 |

---

## Recurrence-only Changes (no split involved)

---

### InstallmentScenario3 — Remove recurrence · propagation=current

**Pre-conditions**
- 1 user, 1 account
- Expense with 3 monthly installments (installments 1, 2, 3), no split
- Target: installment 2

**Update request**
```json
{
  "propagation_settings": "current",
  "recurrence_settings": null
}
```

**Expected result**
- Installment 2 becomes standalone (`TransactionRecurrenceID = null`)
- Installments 1 and 3 remain in the original recurrence unchanged
- Original `TransactionRecurrence` record still exists (still used by installments 1 and 3)
- Total transactions in DB: 3 (1 standalone + 2 with recurrence)

---

### InstallmentScenario4 — Remove recurrence · propagation=current_and_future

**Pre-conditions**
- 1 user, 1 account
- Expense with 3 monthly installments (1, 2, 3), no split
- Target: installment 2

**Update request**
```json
{
  "propagation_settings": "current_and_future",
  "recurrence_settings": null
}
```

**Expected result**
- Installment 2 becomes standalone (`TransactionRecurrenceID = null`)
- Installment 3 (future) is deleted
- Installment 1 (past) remains in the original recurrence
- `TransactionRecurrence` record still exists (used by installment 1)
- Total transactions in DB: 2 (installment 1 with recurrence + installment 2 standalone)

---

### InstallmentScenario5 — Increase installment count · propagation=all

**Pre-conditions**
- 1 user, 1 account
- Expense with 3 monthly installments, no split

**Update request**
```json
{
  "propagation_settings": "all",
  "recurrence_settings": {
    "type": "monthly",
    "repetitions": 5
  }
}
```

**Expected result**
- 5 installments exist linked to the same `TransactionRecurrence`
- Installments 4 and 5 are new rows created after the original installment 3 date
- `TransactionRecurrence.Installments` updated to 5
- All installments have the same `TransactionRecurrenceID`
- Installments 4 and 5 should have month = transaction 3 month + (n-3)

---

### InstallmentScenario6 — Decrease installment count · propagation=all

**Pre-conditions**
- 1 user, 1 account
- Expense with 5 monthly installments, no split

**Update request**
```json
{
  "propagation_settings": "all",
  "recurrence_settings": {
    "type": "monthly",
    "repetitions": 3
  }
}
```

**Expected result**
- Only 3 installments remain linked to the `TransactionRecurrence`
- Installments 4 and 5 are deleted from DB
- `TransactionRecurrence.Installments` updated to 3

---

### InstallmentScenario7 — Decrease installment count · propagation=current_and_future

**Pre-conditions**
- 1 user, 1 account
- Expense with 5 monthly installments (1, 2, 3, 4, 5), no split
- Target: installment 2

**Update request**
```json
{
  "propagation_settings": "current_and_future",
  "recurrence_settings": {
    "type": "monthly",
    "repetitions": 2
  }
}
```

**Expected result**
- Installment 1 remains in the original recurrence (unchanged)
- A new `TransactionRecurrence` with `repetitions=2` is created for installments 2 and 3
- Installments 4 and 5 are deleted
- Total transactions in DB: 3

---

## Split-only Changes (recurrence unchanged)

---

### InstallmentScenario8 — Add split · propagation=all

**Pre-conditions**
- 2 connected users (userA, userB), each with their own account
- userA has an expense with 3 monthly installments, no split

**Update request** (sent by userA)
```json
{
  "propagation_settings": "all",
  "recurrence_settings": { "type": "monthly", "repetitions": 3 },
  "split_settings": [
    { "connection_id": <connectionID>, "percentage": 50 }
  ]
}
```

**Expected result**
- All 3 installments of userA have a linked transaction on userB's account
- All 6 transactions (3 userA + 3 userB) share the same `TransactionRecurrenceID`
- `TransactionRecurrence` record updated/preserved; `Installments` = 3

---

### InstallmentScenario9 — Remove split · propagation=all

**Pre-conditions**
- 2 connected users (userA, userB), each with their own account
- userA has an expense with 3 monthly installments, with split (50/50)

**Update request** (sent by userA)
```json
{
  "propagation_settings": "all",
  "recurrence_settings": { "type": "monthly", "repetitions": 3 },
  "split_settings": []
}
```

**Expected result**
- All 3 linked transactions of userB are deleted
- userA's 3 installments remain, with `LinkedTransactions = []`
- `TransactionRecurrence` record preserved

---

### InstallmentScenario10 — Add split · propagation=current

**Pre-conditions**
- 2 connected users, each with their own account
- userA has 3 monthly installments, no split
- Target: installment 2

**Update request**
```json
{
  "propagation_settings": "current",
  "recurrence_settings": { "type": "monthly", "repetitions": 3 },
  "split_settings": [{ "connection_id": <connectionID>, "percentage": 50 }]
}
```

**Expected result**
- Only installment 2 of userA gains a linked transaction on userB's account
- Installments 1 and 3 remain without split
- All 4 transactions (3 userA + 1 userB) exist; userB's linked installment shares the same `TransactionRecurrenceID` as installment 2

---

### InstallmentScenario11 — Add split · propagation=current_and_future

**Pre-conditions**
- 2 connected users, each with their own account
- userA has 3 monthly installments, no split
- Target: installment 2

**Update request**
```json
{
  "propagation_settings": "current_and_future",
  "recurrence_settings": { "type": "monthly", "repetitions": 3 },
  "split_settings": [{ "connection_id": <connectionID>, "percentage": 50 }]
}
```

**Expected result**
- Installments 2 and 3 of userA each gain a linked transaction on userB's account
- Installment 1 remains without split
- Total transactions in DB: 5 (3 userA + 2 userB)

---

## Combined: Recurrence + Split Changes

---

### InstallmentScenario12 — Remove recurrence + add split · propagation=all

**Pre-conditions**
- 2 connected users, each with their own account
- userA has 3 monthly installments, no split
- Target: installment 1

**Update request**
```json
{
  "propagation_settings": "all",
  "recurrence_settings": null,
  "split_settings": [{ "connection_id": <connectionID>, "percentage": 50 }]
}
```

**Expected result**
- Installments 2 and 3 are deleted
- Installment 1 becomes standalone with a linked transaction on userB's account
- `TransactionRecurrence` record deleted
- Total transactions in DB: 2 (installment 1 for userA + linked for userB)

---

### InstallmentScenario13 — Remove recurrence + remove split · propagation=all

**Pre-conditions**
- 2 connected users, each with their own account
- userA has 3 monthly installments, with split (50/50)
- Target: installment 1

**Update request**
```json
{
  "propagation_settings": "all",
  "recurrence_settings": null,
  "split_settings": []
}
```

**Expected result**
- Installments 2 and 3 (userA) deleted
- Linked transactions for userB (all 3) deleted
- Installment 1 becomes standalone with no split
- `TransactionRecurrence` record deleted
- Total transactions in DB: 1

---

### InstallmentScenario14 — Remove recurrence + remove split · propagation=current

**Pre-conditions**
- 2 connected users, each with their own account
- userA has 3 monthly installments, with split (50/50)
- Target: installment 2

**Update request**
```json
{
  "propagation_settings": "current",
  "recurrence_settings": null,
  "split_settings": []
}
```

**Expected result**
- Installment 2 (userA) becomes standalone with no split
- userB's linked transaction for installment 2 is deleted
- Installments 1 and 3 (userA + their linked userB transactions) remain in the original recurrence unchanged
- `TransactionRecurrence` record preserved
- Total transactions in DB: 5 (2 userA in recurrence + 2 userB linked + 1 userA standalone)

---

### InstallmentScenario15 — Increase installments + add split · propagation=all

**Pre-conditions**
- 2 connected users, each with their own account
- userA has 3 monthly installments, with split (50/50)
- Target: installment 1

**Update request**
```json
{
  "propagation_settings": "all",
  "recurrence_settings": { "type": "monthly", "repetitions": 5 },
  "split_settings": [{ "connection_id": <connectionID>, "percentage": 50 }]
}
```

**Expected result**
- 5 installments for userA, each with a linked transaction for userB
- Total transactions in DB: 10
- `TransactionRecurrence.Installments` = 5

---

### InstallmentScenario16 — Decrease installments + remove split · propagation=all

**Pre-conditions**
- 2 connected users, each with their own account
- userA has 5 monthly installments, with split (50/50)

**Update request**
```json
{
  "propagation_settings": "all",
  "recurrence_settings": { "type": "monthly", "repetitions": 3 },
  "split_settings": []
}
```

**Expected result**
- Installments 4 and 5 (userA) deleted
- All 5 linked transactions for userB deleted
- 3 installments for userA remain, no split
- `TransactionRecurrence.Installments` = 3
- Total transactions in DB: 3