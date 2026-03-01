package service

import (
	"context"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
	"github.com/stretchr/testify/suite"
)

type TransactionUpdateWithDBTestSuite struct {
	ServiceTestWithDBSuite
}

func (suite *TransactionUpdateWithDBTestSuite) TestUpdateOwnExpense() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	category2, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	tag, err := suite.createTestTag(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test tag: %v", err)
	}

	tag2, err := suite.createTestTag(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test tag: %v", err)
	}

	d := now()

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		Tags:            []domain.Tag{*tag},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().NotNil(transaction)
	transactionID := t.ID

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		Amount:          lo.ToPtr(int64(200)),
		TransactionType: lo.ToPtr(domain.TransactionTypeIncome),
		AccountID:       lo.ToPtr(account2.ID),
		CategoryID:      lo.ToPtr(category2.ID),
		Tags:            []domain.Tag{*tag2},
		Date:            lo.ToPtr(d.AddDate(0, 0, 1)),
		Description:     lo.ToPtr("Test transaction updated"),
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{transactionID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().NotNil(t)
	suite.Assert().NoError(err)
	suite.Assert().Equal(int64(200), t.Amount)
	suite.Assert().Equal(domain.TransactionTypeIncome, t.Type)
	suite.Assert().Equal(domain.OperationTypeCredit, t.OperationType)
	suite.Assert().Equal(account2.ID, t.AccountID)
	suite.Assert().Equal(category2.ID, lo.FromPtr(t.CategoryID))

	suite.Assert().Len(t.Tags, 1)
	suite.Assert().Equal(tag2.ID, t.Tags[0].ID)

	suite.Assert().Equal(d.AddDate(0, 0, 1), t.Date)
	suite.Assert().Equal("Test transaction updated", t.Description)
	suite.Assert().Equal(user.ID, t.UserID)
	suite.Assert().Equal(user.ID, lo.FromPtr(t.OriginalUserID))
}

func (suite *TransactionUpdateWithDBTestSuite) TestBlockUpdatesOnOtherUsersTransactions() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user 1: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user 2: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	d := now()

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().NotNil(transaction)
	transactionID := t.ID

	err = suite.Services.Transaction.Update(ctx, transactionID, user2.ID, &domain.TransactionUpdateRequest{
		Description: lo.ToPtr("Test transaction updated"),
	})
	suite.Assert().Error(err)
	suite.Assert().True(pkgErrors.IsNotFound(err))
}

// expense/income	FALSE	expense/income	nil	-	- update description, amount, category, account if informed
func (suite *TransactionUpdateWithDBTestSuite) TestScenario1_OwnExpenseToOwnIncome() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	d := now()

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		Tags:            []domain.Tag{{Name: "Test tag"}},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 1 {
		suite.T().Fatalf("Expected 1 transactions, got %d", len(transactions))
	}

	t := transactions[0]

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		Amount:         100,
		Type:           domain.TransactionTypeExpense,
		OperationType:  domain.OperationTypeDebit,
		AccountID:      account.ID,
		CategoryID:     lo.ToPtr(category.ID),
		Date:           d,
		Description:    "Test transaction",
		Tags:           []domain.Tag{{Name: "Test tag"}},
		UserID:         user.ID,
		OriginalUserID: lo.ToPtr(user.ID),
	})

	transactionID := t.ID

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category2, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		Amount:          lo.ToPtr(int64(200)),
		TransactionType: lo.ToPtr(domain.TransactionTypeIncome),
		AccountID:       lo.ToPtr(account2.ID),
		CategoryID:      lo.ToPtr(category2.ID),
		Tags:            []domain.Tag{{Name: "Test tag 2"}},
		Date:            lo.ToPtr(d.AddDate(0, 0, 1)),
		Description:     lo.ToPtr("Test transaction updated"),
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{transactionID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		ID:                      transactionID,
		Amount:                  200,
		Type:                    domain.TransactionTypeIncome,
		OperationType:           domain.OperationTypeCredit,
		AccountID:               account2.ID,
		CategoryID:              lo.ToPtr(category2.ID),
		Date:                    d.AddDate(0, 0, 1),
		Description:             "Test transaction updated",
		Tags:                    []domain.Tag{{Name: "Test tag 2"}},
		UserID:                  user.ID,
		OriginalUserID:          lo.ToPtr(user.ID),
		TransactionRecurrenceID: nil,
	})

}

// expense/income	FALSE	expense/income	not nil	-
//   - update description, amount, category, account if informed
//   - create linked transactions with inverted type using the split_settings property
func (suite *TransactionUpdateWithDBTestSuite) TestScenario2_OwnExpenseToOwnIncomeWithLinkedTransactions() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	d := now()

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		Tags:            []domain.Tag{{Name: "Test tag"}},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 1 {
		suite.T().Fatalf("Expected 1 transactions, got %d", len(transactions))
	}

	t := transactions[0]

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		Amount:         100,
		Type:           domain.TransactionTypeExpense,
		OperationType:  domain.OperationTypeDebit,
		AccountID:      account.ID,
		CategoryID:     lo.ToPtr(category.ID),
		Date:           d,
		Description:    "Test transaction",
		Tags:           []domain.Tag{{Name: "Test tag"}},
		UserID:         user.ID,
		OriginalUserID: lo.ToPtr(user.ID),
	})

	transactionID := t.ID

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category2, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		Amount:          lo.ToPtr(int64(200)),
		TransactionType: lo.ToPtr(domain.TransactionTypeIncome),
		AccountID:       lo.ToPtr(account2.ID),
		CategoryID:      lo.ToPtr(category2.ID),
		Tags:            []domain.Tag{{Name: "Test tag 2"}},
		Date:            lo.ToPtr(d.AddDate(0, 0, 1)),
		Description:     lo.ToPtr("Test transaction updated"),
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{transactionID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		ID:                      transactionID,
		Amount:                  200,
		Type:                    domain.TransactionTypeIncome,
		OperationType:           domain.OperationTypeCredit,
		AccountID:               account2.ID,
		CategoryID:              lo.ToPtr(category2.ID),
		Date:                    d.AddDate(0, 0, 1),
		Description:             "Test transaction updated",
		Tags:                    []domain.Tag{{Name: "Test tag 2"}},
		UserID:                  user.ID,
		OriginalUserID:          lo.ToPtr(user.ID),
		TransactionRecurrenceID: nil,
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  100,
				Type:                    domain.TransactionTypeIncome,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               userConnection.ToAccountID,
				CategoryID:              nil,
				Date:                    d.AddDate(0, 0, 1),
				Description:             "Test transaction updated",
				Tags:                    []domain.Tag{},
				UserID:                  user2.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})
}

// expense/income	TRUE	expense/income	nil	-
//   - update description, amount, category, account if informed
//   - delete all linked_transactions that have transaction_id = transaction.id
func (suite *TransactionUpdateWithDBTestSuite) TestScenario3_OwnExpenseWithLinkedTransactionsToOwnIncomeWithoutSplit() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	d := now()

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		Tags:            []domain.Tag{{Name: "Test tag"}},
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 1 {
		suite.T().Fatalf("Expected 1 transactions, got %d", len(transactions))
	}

	t := transactions[0]

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		Amount:         100,
		Type:           domain.TransactionTypeExpense,
		OperationType:  domain.OperationTypeDebit,
		AccountID:      account.ID,
		CategoryID:     lo.ToPtr(category.ID),
		Date:           d,
		Description:    "Test transaction",
		Tags:           []domain.Tag{{Name: "Test tag"}},
		UserID:         user.ID,
		OriginalUserID: lo.ToPtr(user.ID),
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  50,
				Type:                    domain.TransactionTypeExpense,
				OperationType:           domain.OperationTypeDebit,
				AccountID:               userConnection.ToAccountID,
				CategoryID:              nil,
				Date:                    d,
				Description:             "Test transaction",
				Tags:                    []domain.Tag{},
				UserID:                  user2.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})

	transactionID := t.ID

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category2, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		Amount:          lo.ToPtr(int64(200)),
		TransactionType: lo.ToPtr(domain.TransactionTypeIncome),
		AccountID:       lo.ToPtr(account2.ID),
		CategoryID:      lo.ToPtr(category2.ID),
		Tags:            []domain.Tag{{Name: "Test tag 2"}},
		Date:            lo.ToPtr(d.AddDate(0, 0, 1)),
		Description:     lo.ToPtr("Test transaction updated"),
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{transactionID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		ID:                      transactionID,
		Amount:                  200,
		Type:                    domain.TransactionTypeIncome,
		OperationType:           domain.OperationTypeCredit,
		AccountID:               account2.ID,
		CategoryID:              lo.ToPtr(category2.ID),
		Date:                    d.AddDate(0, 0, 1),
		Description:             "Test transaction updated",
		Tags:                    []domain.Tag{{Name: "Test tag 2"}},
		UserID:                  user.ID,
		OriginalUserID:          lo.ToPtr(user.ID),
		TransactionRecurrenceID: nil,
		LinkedTransactions:      []domain.Transaction{},
	})
}

// expense/income	TRUE	expense/income	not nil
// - update description, amount, category, account if informed
// - change the original transaction_type to income and the linked_transactions to expense
// - check if some linked_transaction need to be created/deleted/updated based on split_settings property"
func (suite *TransactionUpdateWithDBTestSuite) TestScenario4_OwnExpenseWithLinkedTransactionsToOwnIncomeWithSplit() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	d := now()

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		Tags:            []domain.Tag{{Name: "Test tag"}},
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 1 {
		suite.T().Fatalf("Expected 1 transactions, got %d", len(transactions))
	}

	t := transactions[0]

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		Amount:         100,
		Type:           domain.TransactionTypeExpense,
		OperationType:  domain.OperationTypeDebit,
		AccountID:      account.ID,
		CategoryID:     lo.ToPtr(category.ID),
		Date:           d,
		Description:    "Test transaction",
		Tags:           []domain.Tag{{Name: "Test tag"}},
		UserID:         user.ID,
		OriginalUserID: lo.ToPtr(user.ID),
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  50,
				Type:                    domain.TransactionTypeExpense,
				OperationType:           domain.OperationTypeDebit,
				AccountID:               userConnection.ToAccountID,
				CategoryID:              nil,
				Date:                    d,
				Description:             "Test transaction",
				Tags:                    []domain.Tag{},
				UserID:                  user2.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})

	transactionID := t.ID

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category2, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	user3, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	userConnection2, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user3.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	expectedDate := d.AddDate(0, 0, 1)

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		Amount:          lo.ToPtr(int64(200)),
		TransactionType: lo.ToPtr(domain.TransactionTypeIncome),
		AccountID:       lo.ToPtr(account2.ID),
		CategoryID:      lo.ToPtr(category2.ID),
		Tags:            []domain.Tag{{Name: "Test tag 2"}},
		Date:            lo.ToPtr(expectedDate),
		Description:     lo.ToPtr("Test transaction updated"),
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Amount:       lo.ToPtr(int64(75)),
			},
			{
				ConnectionID: userConnection2.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{transactionID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		ID:                      transactionID,
		Amount:                  200,
		Type:                    domain.TransactionTypeIncome,
		OperationType:           domain.OperationTypeCredit,
		AccountID:               account2.ID,
		CategoryID:              lo.ToPtr(category2.ID),
		Date:                    expectedDate,
		Description:             "Test transaction updated",
		Tags:                    []domain.Tag{{Name: "Test tag 2"}},
		UserID:                  user.ID,
		OriginalUserID:          lo.ToPtr(user.ID),
		TransactionRecurrenceID: nil,
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  75,
				Type:                    domain.TransactionTypeIncome,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               userConnection.ToAccountID,
				CategoryID:              nil,
				Date:                    expectedDate,
				Description:             "Test transaction updated",
				Tags:                    []domain.Tag{},
				UserID:                  user2.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
			{
				Amount:                  100,
				Type:                    domain.TransactionTypeIncome,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               userConnection2.ToAccountID,
				CategoryID:              nil,
				Date:                    expectedDate,
				Description:             "Test transaction updated",
				Tags:                    []domain.Tag{},
				UserID:                  user3.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})
}

// expense/income without linked transactions to transfer to same user
//   - change the original transaction_type to transfer and operation_type = 'debit'
//   - create a transaction with account_id = destination_account.id with type transfer and operation_type = 'credit' with the same amount of the original transaction"
func (suite *TransactionUpdateWithDBTestSuite) TestScenario5_OwnExpenseToOwnTransfer() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	d := now()

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          5850 * 100,
		Date:            d,
		Description:     "Test transaction",
		Tags:            []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 1 {
		suite.T().Fatalf("Expected 1 transactions, got %d", len(transactions))
	}

	t := transactions[0]

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		Amount:         5850 * 100,
		Type:           domain.TransactionTypeExpense,
		OperationType:  domain.OperationTypeDebit,
		AccountID:      account.ID,
		CategoryID:     lo.ToPtr(category.ID),
		Date:           d,
		Description:    "Test transaction",
		Tags:           []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
		UserID:         user.ID,
		OriginalUserID: lo.ToPtr(user.ID),
	})

	transactionID := t.ID

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	expectedDate := d.AddDate(0, 0, 1)

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		Amount:               lo.ToPtr(int64(200)),
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account.ID),
		DestinationAccountID: lo.ToPtr(account2.ID),
		Tags:                 []domain.Tag{{Name: "Test tag 4"}},
		Date:                 lo.ToPtr(expectedDate),
		Description:          lo.ToPtr("Test transaction updated to transfer"),
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{transactionID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		ID:                      transactionID,
		Amount:                  200,
		Type:                    domain.TransactionTypeTransfer,
		OperationType:           domain.OperationTypeDebit,
		AccountID:               account.ID,
		CategoryID:              nil,
		Date:                    expectedDate,
		Description:             "Test transaction updated to transfer",
		Tags:                    []domain.Tag{{Name: "Test tag 4"}},
		UserID:                  user.ID,
		OriginalUserID:          lo.ToPtr(user.ID),
		TransactionRecurrenceID: nil,
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  200,
				Type:                    domain.TransactionTypeTransfer,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               account2.ID,
				CategoryID:              nil,
				Date:                    expectedDate,
				Description:             "Test transaction updated to transfer",
				Tags:                    []domain.Tag{{Name: "Test tag 4"}},
				UserID:                  user.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})
}

// expense/income with linked transactions to transfer to same user
//   - change the original transaction_type to transfer and operation_type = 'debit'
//   - delete all linked_transactions and remove the link
//   - create a linked transaction with account_id = destination_account.id with type transfer and operation_type = 'credit' with the same amount of the original transaction"
func (suite *TransactionUpdateWithDBTestSuite) TestScenario6_OwnExpenseWithLinkedTransactionsToOwnTransfer() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	connections, err := suite.createManyConnections(ctx, user.ID, 9)
	if err != nil {
		suite.T().Fatalf("Failed to create many connections: %v", err)
	}

	d := now()

	percentage := 10
	amount := int64(5850 * 100)

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          amount,
		Date:            d,
		Description:     "Test transaction",
		Tags:            []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
		SplitSettings: lo.Map(connections, func(connection *domain.UserConnection, _ int) domain.SplitSettings {
			return domain.SplitSettings{
				ConnectionID: connection.ID,
				Percentage:   lo.ToPtr(percentage),
			}
		}),
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 1 {
		suite.T().Fatalf("Expected 1 transactions, got %d", len(transactions))
	}

	t := transactions[0]

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		Amount:         amount,
		Type:           domain.TransactionTypeExpense,
		OperationType:  domain.OperationTypeDebit,
		AccountID:      account.ID,
		CategoryID:     lo.ToPtr(category.ID),
		Date:           d,
		Description:    "Test transaction",
		Tags:           []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
		UserID:         user.ID,
		OriginalUserID: lo.ToPtr(user.ID),
		LinkedTransactions: lo.Map(connections, func(connection *domain.UserConnection, _ int) domain.Transaction {
			return domain.Transaction{
				Amount:                  int64(float64(amount) * float64(percentage) / 100),
				Type:                    domain.TransactionTypeExpense,
				OperationType:           domain.OperationTypeDebit,
				AccountID:               connection.ToAccountID,
				CategoryID:              nil,
				Date:                    d,
				Description:             "Test transaction",
				Tags:                    []domain.Tag{},
				UserID:                  connection.ToUserID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			}
		}),
	})

	ltIDs := lo.Map(t.LinkedTransactions, func(lt domain.Transaction, _ int) int {
		return lt.ID
	})
	transactionID := t.ID

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	expectedDate := d.AddDate(0, 0, 1)

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		Amount:               lo.ToPtr(int64(200)),
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account.ID),
		DestinationAccountID: lo.ToPtr(account2.ID),
		Tags:                 []domain.Tag{{Name: "Test tag 4"}},
		Date:                 lo.ToPtr(expectedDate),
		Description:          lo.ToPtr("Test transaction updated to transfer"),
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{transactionID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		ID:                      transactionID,
		Amount:                  200,
		Type:                    domain.TransactionTypeTransfer,
		OperationType:           domain.OperationTypeDebit,
		AccountID:               account.ID,
		CategoryID:              nil,
		Date:                    expectedDate,
		Description:             "Test transaction updated to transfer",
		Tags:                    []domain.Tag{{Name: "Test tag 4"}},
		UserID:                  user.ID,
		OriginalUserID:          lo.ToPtr(user.ID),
		TransactionRecurrenceID: nil,
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  200,
				Type:                    domain.TransactionTypeTransfer,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               account2.ID,
				CategoryID:              nil,
				Date:                    expectedDate,
				Description:             "Test transaction updated to transfer",
				Tags:                    []domain.Tag{{Name: "Test tag 4"}},
				UserID:                  user.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})

	ts, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		IDs: ltIDs,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transactions: %v", err)
	}

	suite.Assert().Len(ts, 0, "should delete all linked transactions")

}

// expense/income with linked transactions to transfer to different user
//   - change the original transaction_type to transfer and operation_type = 'debit'
//   - delete all linked_transactions and remove the link
//   - create a linked transaction with account_id = destination_account.id with type transfer and operation_type = 'credit' with the same amount of the original transaction"
func (suite *TransactionUpdateWithDBTestSuite) TestScenario6_OwnExpenseWithLinkedTransactionsToTransferToDifferentUser() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	connections, err := suite.createManyConnections(ctx, user.ID, 9)
	if err != nil {
		suite.T().Fatalf("Failed to create many connections: %v", err)
	}

	d := now()

	percentage := 10
	amount := int64(5850 * 100)

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          amount,
		Date:            d,
		Description:     "Test transaction",
		Tags:            []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
		SplitSettings: lo.Map(connections, func(connection *domain.UserConnection, _ int) domain.SplitSettings {
			return domain.SplitSettings{
				ConnectionID: connection.ID,
				Percentage:   lo.ToPtr(percentage),
			}
		}),
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 1 {
		suite.T().Fatalf("Expected 1 transactions, got %d", len(transactions))
	}

	t := transactions[0]

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		Amount:         amount,
		Type:           domain.TransactionTypeExpense,
		OperationType:  domain.OperationTypeDebit,
		AccountID:      account.ID,
		CategoryID:     lo.ToPtr(category.ID),
		Date:           d,
		Description:    "Test transaction",
		Tags:           []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
		UserID:         user.ID,
		OriginalUserID: lo.ToPtr(user.ID),
		LinkedTransactions: lo.Map(connections, func(connection *domain.UserConnection, _ int) domain.Transaction {
			return domain.Transaction{
				Amount:                  int64(float64(amount) * float64(percentage) / 100),
				Type:                    domain.TransactionTypeExpense,
				OperationType:           domain.OperationTypeDebit,
				AccountID:               connection.ToAccountID,
				CategoryID:              nil,
				Date:                    d,
				Description:             "Test transaction",
				Tags:                    []domain.Tag{},
				UserID:                  connection.ToUserID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			}
		}),
	})

	ltIDs := lo.Map(t.LinkedTransactions, func(lt domain.Transaction, _ int) int {
		return lt.ID
	})
	transactionID := t.ID

	destination := connections[0]

	expectedDate := d.AddDate(0, 0, 1)

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		Amount:               lo.ToPtr(int64(200)),
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account.ID),
		DestinationAccountID: lo.ToPtr(destination.ToAccountID),
		Tags:                 []domain.Tag{{Name: "Test tag 4"}},
		Date:                 lo.ToPtr(expectedDate),
		Description:          lo.ToPtr("Test transaction updated to transfer"),
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{transactionID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		ID:                      transactionID,
		Amount:                  200,
		Type:                    domain.TransactionTypeTransfer,
		OperationType:           domain.OperationTypeDebit,
		AccountID:               account.ID,
		CategoryID:              nil,
		Date:                    expectedDate,
		Description:             "Test transaction updated to transfer",
		Tags:                    []domain.Tag{{Name: "Test tag 4"}},
		UserID:                  user.ID,
		OriginalUserID:          lo.ToPtr(user.ID),
		TransactionRecurrenceID: nil,
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  200,
				Type:                    domain.TransactionTypeTransfer,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               destination.ToAccountID,
				CategoryID:              nil,
				Date:                    expectedDate,
				Description:             "Test transaction updated to transfer",
				Tags:                    []domain.Tag{},
				UserID:                  destination.ToUserID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})

	ts, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		IDs: ltIDs,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transactions: %v", err)
	}

	suite.Assert().Len(ts, 0, "should delete all linked transactions")

}

func (suite *TransactionUpdateWithDBTestSuite) TestScenario7_OwnTransfer() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	d := now()

	amount := int64(5850 * 100)

	transaction := domain.TransactionCreateRequest{
		AccountID:            account.ID,
		TransactionType:      domain.TransactionTypeTransfer,
		DestinationAccountID: lo.ToPtr(account2.ID),
		Amount:               amount,
		Date:                 d,
		Description:          "Test transaction",
		Tags:                 []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 1 {
		suite.T().Fatalf("Expected 1 transactions, got %d", len(transactions))
	}

	t := transactions[0]

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		Amount:         amount,
		Type:           domain.TransactionTypeTransfer,
		OperationType:  domain.OperationTypeDebit,
		AccountID:      account.ID,
		Date:           d,
		Description:    "Test transaction",
		Tags:           []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
		UserID:         user.ID,
		OriginalUserID: lo.ToPtr(user.ID),
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  amount,
				Type:                    domain.TransactionTypeTransfer,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               account2.ID,
				CategoryID:              nil,
				Date:                    d,
				Description:             "Test transaction",
				Tags:                    []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
				UserID:                  user.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})

	expectedDate := d.AddDate(0, 0, 1)

	account3, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	err = suite.Services.Transaction.Update(ctx, t.ID, user.ID, &domain.TransactionUpdateRequest{
		Amount:               lo.ToPtr(int64(200)),
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account2.ID),
		DestinationAccountID: lo.ToPtr(account3.ID),
		Tags:                 []domain.Tag{{Name: "Test tag 4"}},
		Date:                 lo.ToPtr(expectedDate),
		Description:          lo.ToPtr("Test transaction updated to transfer"),
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{t.ID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		ID:                      t.ID,
		Amount:                  200,
		Type:                    domain.TransactionTypeTransfer,
		OperationType:           domain.OperationTypeDebit,
		AccountID:               account2.ID,
		CategoryID:              nil,
		Date:                    expectedDate,
		Description:             "Test transaction updated to transfer",
		Tags:                    []domain.Tag{{Name: "Test tag 4"}},
		UserID:                  user.ID,
		OriginalUserID:          lo.ToPtr(user.ID),
		TransactionRecurrenceID: nil,
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  200,
				Type:                    domain.TransactionTypeTransfer,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               account3.ID,
				CategoryID:              nil,
				Date:                    expectedDate,
				Description:             "Test transaction updated to transfer",
				Tags:                    []domain.Tag{{Name: "Test tag 4"}},
				UserID:                  user.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})

}

func (suite *TransactionUpdateWithDBTestSuite) TestScenario8_OwnTransferToOwnExpense() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	d := now()

	amount := int64(5850 * 100)

	transaction := domain.TransactionCreateRequest{
		AccountID:            account.ID,
		TransactionType:      domain.TransactionTypeTransfer,
		DestinationAccountID: lo.ToPtr(account2.ID),
		Amount:               amount,
		Date:                 d,
		Description:          "Test transaction",
		Tags:                 []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 1 {
		suite.T().Fatalf("Expected 1 transactions, got %d", len(transactions))
	}

	t := transactions[0]

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		Amount:         amount,
		Type:           domain.TransactionTypeTransfer,
		OperationType:  domain.OperationTypeDebit,
		AccountID:      account.ID,
		Date:           d,
		Description:    "Test transaction",
		Tags:           []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
		UserID:         user.ID,
		OriginalUserID: lo.ToPtr(user.ID),
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  amount,
				Type:                    domain.TransactionTypeTransfer,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               account2.ID,
				CategoryID:              nil,
				Date:                    d,
				Description:             "Test transaction",
				Tags:                    []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
				UserID:                  user.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})

	expectedDate := d.AddDate(0, 0, 1)

	err = suite.Services.Transaction.Update(ctx, t.ID, user.ID, &domain.TransactionUpdateRequest{
		Amount:          lo.ToPtr(int64(200)),
		TransactionType: lo.ToPtr(domain.TransactionTypeExpense),
		AccountID:       lo.ToPtr(account2.ID),
		Tags:            []domain.Tag{{Name: "Test tag 4"}},
		Date:            lo.ToPtr(expectedDate),
		Description:     lo.ToPtr("Test transaction updated to expense"),
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{t.ID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		ID:                      t.ID,
		Amount:                  200,
		Type:                    domain.TransactionTypeExpense,
		OperationType:           domain.OperationTypeDebit,
		AccountID:               account2.ID,
		CategoryID:              nil,
		Date:                    expectedDate,
		Description:             "Test transaction updated to expense",
		Tags:                    []domain.Tag{{Name: "Test tag 4"}},
		UserID:                  user.ID,
		OriginalUserID:          lo.ToPtr(user.ID),
		TransactionRecurrenceID: nil,
		LinkedTransactions:      []domain.Transaction{},
	})

}

func (suite *TransactionUpdateWithDBTestSuite) TestScenario8_OwnTransferToOwnIncome() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	d := now()

	amount := int64(5850 * 100)

	transaction := domain.TransactionCreateRequest{
		AccountID:            account.ID,
		TransactionType:      domain.TransactionTypeTransfer,
		DestinationAccountID: lo.ToPtr(account2.ID),
		Amount:               amount,
		Date:                 d,
		Description:          "Test transaction",
		Tags:                 []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 1 {
		suite.T().Fatalf("Expected 1 transactions, got %d", len(transactions))
	}

	t := transactions[0]

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		Amount:         amount,
		Type:           domain.TransactionTypeTransfer,
		OperationType:  domain.OperationTypeDebit,
		AccountID:      account.ID,
		Date:           d,
		Description:    "Test transaction",
		Tags:           []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
		UserID:         user.ID,
		OriginalUserID: lo.ToPtr(user.ID),
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  amount,
				Type:                    domain.TransactionTypeTransfer,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               account2.ID,
				CategoryID:              nil,
				Date:                    d,
				Description:             "Test transaction",
				Tags:                    []domain.Tag{{Name: "Test tag"}, {Name: "Test tag 1"}, {Name: "Test tag 2"}},
				UserID:                  user.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
			},
		},
	})

	expectedDate := d.AddDate(0, 0, 1)

	err = suite.Services.Transaction.Update(ctx, t.ID, user.ID, &domain.TransactionUpdateRequest{
		Amount:          lo.ToPtr(int64(200)),
		TransactionType: lo.ToPtr(domain.TransactionTypeIncome),
		AccountID:       lo.ToPtr(account2.ID),
		Tags:            []domain.Tag{{Name: "Test tag 4"}},
		Date:            lo.ToPtr(expectedDate),
		Description:     lo.ToPtr("Test transaction updated to income"),
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	t, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{t.ID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	assertTransaction(&suite.ServiceTestWithDBSuite, t, &domain.Transaction{
		ID:                      t.ID,
		Amount:                  200,
		Type:                    domain.TransactionTypeIncome,
		OperationType:           domain.OperationTypeCredit,
		AccountID:               account2.ID,
		CategoryID:              nil,
		Date:                    expectedDate,
		Description:             "Test transaction updated to income",
		Tags:                    []domain.Tag{{Name: "Test tag 4"}},
		UserID:                  user.ID,
		OriginalUserID:          lo.ToPtr(user.ID),
		TransactionRecurrenceID: nil,
		LinkedTransactions:      []domain.Transaction{},
	})

}

func assertTransaction(suite *ServiceTestWithDBSuite, actual, expected *domain.Transaction) {
	suite.Assert().NotNil(actual, "transaction should not be nil")

	if expected.ID != 0 {
		suite.Assert().Equal(expected.ID, actual.ID, "expected.ID")
	}

	suite.Assert().Equal(expected.Amount, actual.Amount, "expected.Amount")
	suite.Assert().Equal(expected.Type, actual.Type, "expected.Type")
	suite.Assert().Equal(expected.OperationType, actual.OperationType, "expected.OperationType")
	suite.Assert().Equal(expected.AccountID, actual.AccountID, "expected.AccountID")
	if expected.CategoryID != nil {
		suite.Assert().Equal(*expected.CategoryID, lo.FromPtr(actual.CategoryID), "expected.CategoryID")
	} else {
		suite.Assert().Nil(actual.CategoryID, "expected.CategoryID")
	}
	suite.Assert().Equal(expected.Date, actual.Date, "expected.Date")
	suite.Assert().Equal(expected.Description, actual.Description, "expected.Description")
	suite.Assert().Equal(expected.UserID, actual.UserID, "expected.UserID")
	suite.Assert().Equal(lo.FromPtr(expected.OriginalUserID), lo.FromPtr(actual.OriginalUserID), "expected.OriginalUserID")

	if len(expected.Tags) != len(actual.Tags) {
		suite.T().Fatalf("len(expected.Tags) != len(actual.Tags): %d != %d", len(expected.Tags), len(actual.Tags))
	}
	for i := range expected.Tags {
		if expected.Tags[i].ID != 0 {
			suite.Assert().Equalf(expected.Tags[i].ID, actual.Tags[i].ID, "expected.Tags[%d].ID", i)
		}
		suite.Assert().Equalf(expected.Tags[i].Name, actual.Tags[i].Name, "expected.Tags[%d].Name", i)
	}

	if len(expected.LinkedTransactions) != len(actual.LinkedTransactions) {
		suite.T().Fatalf("len(expected.LinkedTransactions) != len(actual.LinkedTransactions): %d != %d", len(expected.LinkedTransactions), len(actual.LinkedTransactions))
	}
	for i := range expected.LinkedTransactions {
		if expected.LinkedTransactions[i].ID != 0 {
			suite.Assert().Equalf(expected.LinkedTransactions[i].ID, actual.LinkedTransactions[i].ID, "expected.LinkedTransactions[%d].ID", i)
		}
		suite.Assert().Equalf(expected.LinkedTransactions[i].Amount, actual.LinkedTransactions[i].Amount, "expected.LinkedTransactions[%d].Amount", i)
		suite.Assert().Equalf(expected.LinkedTransactions[i].Date, actual.LinkedTransactions[i].Date, "expected.LinkedTransactions[%d].Date", i)
		suite.Assert().Equalf(expected.LinkedTransactions[i].Description, actual.LinkedTransactions[i].Description, "expected.LinkedTransactions[%d].Description", i)
		suite.Assert().Equalf(expected.LinkedTransactions[i].Type, actual.LinkedTransactions[i].Type, "expected.LinkedTransactions[%d].Type", i)
		suite.Assert().Equalf(expected.LinkedTransactions[i].OperationType, actual.LinkedTransactions[i].OperationType, "expected.LinkedTransactions[%d].OperationType", i)
		suite.Assert().Equalf(lo.FromPtr(expected.LinkedTransactions[i].CategoryID), lo.FromPtr(actual.LinkedTransactions[i].CategoryID), "expected.LinkedTransactions[%d].CategoryID", i)
		suite.Assert().Equalf(expected.LinkedTransactions[i].UserID, actual.LinkedTransactions[i].UserID, "expected.LinkedTransactions[%d].UserID", i)
		suite.Assert().Equalf(lo.FromPtr(expected.LinkedTransactions[i].OriginalUserID), lo.FromPtr(actual.LinkedTransactions[i].OriginalUserID), "expected.LinkedTransactions[%d].OriginalUserID", i)
		suite.Assert().Equalf(len(expected.LinkedTransactions[i].Tags), len(actual.LinkedTransactions[i].Tags), "len(expected.LinkedTransactions[%d].Tags)", i)
		for j := range expected.LinkedTransactions[i].Tags {
			if expected.LinkedTransactions[i].Tags[j].ID != 0 {
				suite.Assert().Equalf(expected.LinkedTransactions[i].Tags[j].ID, actual.LinkedTransactions[i].Tags[j].ID, "expected.LinkedTransactions[%d].Tags[%d].ID", i, j)
			}
			suite.Assert().Equalf(expected.LinkedTransactions[i].Tags[j].Name, actual.LinkedTransactions[i].Tags[j].Name, "expected.LinkedTransactions[%d].Tags[%d].Name", i, j)
		}
	}
}

func TestTransactionUpdateWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	suite.Run(t, new(TransactionUpdateWithDBTestSuite))
}
