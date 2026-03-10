## Requirements

### Requirement: Settlement created for expense split
When a shared expense is created with split settings, the system SHALL create one settlement per split for the transaction author. The settlement type SHALL be `credit`, the amount SHALL equal the linked transaction's amount, and it SHALL reference both the author's transaction (`source_transaction_id`) and the counterpart's transaction (`parent_transaction_id`).

#### Scenario: Expense split creates a credit settlement for the author
- **WHEN** User1 creates an expense of R$500 with 50% split to User2
- **THEN** one settlement is created with `user_id = User1`, `type = credit`, `amount = 250`, `source_transaction_id = User1's transaction ID`, `parent_transaction_id = User2's transaction ID`

#### Scenario: Expense split settlement account matches author's account
- **WHEN** a split expense is created
- **THEN** the settlement's `account_id` equals the author's transaction `account_id`

---

### Requirement: Settlement created for income split
When a shared income is created with split settings, the system SHALL create one settlement per split for the transaction author. The settlement type SHALL be `debit`.

#### Scenario: Income split creates a debit settlement for the author
- **WHEN** User1 creates an income of R$500 with 50% split to User2
- **THEN** one settlement is created with `user_id = User1`, `type = debit`, `amount = 250`, `source_transaction_id = User1's transaction ID`, `parent_transaction_id = User2's transaction ID`

---

### Requirement: No settlement created for non-split transactions
The system SHALL NOT create any settlements when a transaction is created without split settings.

#### Scenario: Plain expense has no settlement
- **WHEN** a user creates an expense without split settings
- **THEN** no settlement rows exist for that transaction

#### Scenario: Plain income has no settlement
- **WHEN** a user creates an income without split settings
- **THEN** no settlement rows exist for that transaction

#### Scenario: Same-user transfer has no settlement
- **WHEN** a user creates a transfer between their own accounts
- **THEN** no settlement rows exist for that transaction

#### Scenario: Cross-user transfer has no settlement
- **WHEN** a user creates a transfer to another user's account
- **THEN** no settlement rows exist for that transaction

---

### Requirement: Settlement creation is atomic with transaction creation
The system SHALL create settlements within the same database transaction as the parent and linked transactions. If settlement creation fails, the entire transaction create operation SHALL be rolled back.

#### Scenario: Rollback on settlement failure
- **WHEN** settlement creation fails during a split expense create
- **THEN** no transactions and no settlements are persisted
