## 1. Core Implementation

- [x] 1.1 Add `syncSettlementsForTransaction` helper in `transaction_update.go` — deletes settlements by `SourceTransactionID`, then inserts from `own.LinkedTransactions` (credit for expense, debit for income; skip if transfer or no linked transactions)
- [x] 1.2 Call `syncSettlementsForTransaction` after `transactionRepo.Create` and after `transactionRepo.Update` in the update loop

## 2. Integration Tests

- [x] 2.1 Test: amount change updates settlement amount
- [x] 2.2 Test: type change expense→income flips credit→debit settlement
- [x] 2.3 Test: type change income→expense flips debit→credit settlement
- [x] 2.4 Test: added split (no split → with split) creates settlement
- [x] 2.5 Test: removed split (with split → no split) deletes settlement via cascade
- [x] 2.6 Test: account change updates settlement account_id
- [x] 2.7 Test: propagation=current only updates current installment's settlement
- [x] 2.8 Test: propagation=current_and_future updates current+future installments' settlements
- [x] 2.9 Test: propagation=all updates all installments' settlements
