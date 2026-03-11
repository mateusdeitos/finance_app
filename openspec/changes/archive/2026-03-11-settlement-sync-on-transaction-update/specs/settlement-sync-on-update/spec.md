## ADDED Requirements

### Requirement: Settlements sync on transaction update
After a transaction is persisted in the update loop, the system SHALL upsert settlements to match the current state of `LinkedTransactions`. For each updated transaction, existing settlements for that source transaction SHALL be deleted and recreated from the new `LinkedTransactions`.

#### Scenario: Amount change syncs settlement amount
- **WHEN** a shared expense is updated with a new amount
- **THEN** the settlement amount is updated to reflect the new split amount

#### Scenario: Type change from expense to income flips settlement type
- **WHEN** a shared expense is updated to income type
- **THEN** the existing credit settlement is replaced by a debit settlement

#### Scenario: Type change from income to expense flips settlement type
- **WHEN** a shared income is updated to expense type
- **THEN** the existing debit settlement is replaced by a credit settlement

#### Scenario: Added split creates new settlement
- **WHEN** a transaction without a split is updated to include a split
- **THEN** a new settlement is created for the new linked transaction

#### Scenario: Removed split deletes settlement via cascade
- **WHEN** a split is removed from a transaction update
- **THEN** the linked transaction is deleted and its settlement is removed via ON DELETE CASCADE on parent_transaction_id

#### Scenario: Account change syncs settlement account
- **WHEN** the author's account is changed on an update
- **THEN** the settlement account_id is updated to match the new account

#### Scenario: New installment with split creates settlement
- **WHEN** a recurring transaction is updated to add more installments that include splits
- **THEN** settlements are created for each new installment's linked transactions

#### Scenario: Transfer transaction has no settlement sync
- **WHEN** a transaction is updated and its type is transfer
- **THEN** no settlement sync is performed for that transaction

#### Scenario: Transaction with no linked transactions has no settlement sync
- **WHEN** a transaction is updated and has no split (no linked transactions)
- **THEN** no settlement sync is performed

#### Scenario: Propagation current only syncs the current installment
- **WHEN** a recurring shared transaction is updated with propagation=current
- **THEN** only the settlement for the current installment is updated; other installments' settlements are unchanged

#### Scenario: Propagation current_and_future syncs current and future installments
- **WHEN** a recurring shared transaction is updated with propagation=current_and_future
- **THEN** settlements for the current and all future installments are updated; past installments' settlements are unchanged

#### Scenario: Propagation all syncs all installments
- **WHEN** a recurring shared transaction is updated with propagation=all
- **THEN** settlements for all installments are updated
