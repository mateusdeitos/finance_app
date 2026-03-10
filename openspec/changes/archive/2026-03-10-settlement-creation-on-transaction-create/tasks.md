## 1. Transaction ↔ Settlement Association

- [x] 1.1 Add `SettlementsFromSource []Settlement` field to `domain.Transaction` (json omitempty)
- [x] 1.2 Add `SettlementsFromSource []Settlement` has-many field to `entity.Transaction` with `gorm:"foreignKey:SourceTransactionID;<-:false"`
- [x] 1.3 Update `entity.Transaction.ToDomain()` and `TransactionFromDomain()` to map the `SettlementsFromSource` slice
- [x] 1.4 Add `WithSettlements bool` field to `domain.TransactionFilter`
- [x] 1.5 In `transaction_repository.go` `Search`, add `Preload("SettlementsFromSource")` when `filter.WithSettlements == true`

## 2. Wire Settlement into Test Suite

- [x] 2.1 Add `SettlementRepository repository.SettlementRepository` field to `ServiceTestWithDBSuite` in `test_setup_with_db.go`
- [x] 2.2 Instantiate `repository.NewSettlementRepository(suite.DB)` and add it to `suite.Repos.Settlement` in `SetupTest`
- [x] 2.3 Instantiate `NewSettlementService(suite.Repos)` and assign it to `suite.Services.Settlement` in `SetupTest`

## 3. Settlement Creation in Transaction Create Flow

- [x] 3.1 In `createTransactions` (`transaction_create.go`), after `transactionRepo.Create` returns `t`, add a helper call `s.createSettlementsForSplit` when `req.TransactionType != TransactionTypeTransfer && len(req.SplitSettings) > 0`
- [x] 3.2 Implement `createSettlementsForSplit(ctx, userID int, authorTransaction *domain.Transaction, transactionType domain.TransactionType)` — iterates `authorTransaction.LinkedTransactions`, creates one settlement per entry with correct type (credit for expense, debit for income)

## 4. Update Integration Tests

- [x] 4.1 In `TestCreateSharedExpense`: re-fetch transactions with `WithSettlements: true` and assert one credit settlement is preloaded with correct fields
- [x] 4.2 In `TestCreateSharedExpenseWithToUserAsOwner`: assert one credit settlement is preloaded on the creator's transaction
- [x] 4.3 In `TestCreateExpense`: assert `SettlementsFromSource` is empty when fetched with `WithSettlements: true`
- [x] 4.4 In `TestCreateIncome`: assert `SettlementsFromSource` is empty when fetched with `WithSettlements: true`
- [x] 4.5 In `TestCreateTransfer`: assert `SettlementsFromSource` is empty when fetched with `WithSettlements: true`
- [x] 4.6 In `TestTransferBetweenDifferentUsers`: assert `SettlementsFromSource` is empty for all transactions
