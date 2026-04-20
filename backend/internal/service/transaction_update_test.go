package service

import (
	"context"
	"errors"
	"testing"
	"time"

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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 2 {
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 2 {
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 2 {
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

func (suite *TransactionUpdateWithDBTestSuite) TestScenario9_OwnTransferToSplitExpense() {
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

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	if len(transactions) != 2 {
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

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	err = suite.Services.Transaction.Update(ctx, t.ID, user.ID, &domain.TransactionUpdateRequest{
		Amount:          lo.ToPtr(int64(200)),
		TransactionType: lo.ToPtr(domain.TransactionTypeExpense),
		AccountID:       lo.ToPtr(account2.ID),
		Tags:            []domain.Tag{{Name: "Test tag 4"}},
		Date:            lo.ToPtr(expectedDate),
		Description:     lo.ToPtr("Test transaction updated to expense"),
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(10),
			},
		},
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
		LinkedTransactions: []domain.Transaction{
			{
				Amount:                  20,
				Type:                    domain.TransactionTypeExpense,
				OperationType:           domain.OperationTypeDebit,
				AccountID:               account2.ID,
				CategoryID:              nil,
				Date:                    expectedDate,
				Description:             "Test transaction updated to expense",
				UserID:                  user2.ID,
				OriginalUserID:          lo.ToPtr(user.ID),
				TransactionRecurrenceID: nil,
				InstallmentNumber:       nil,
				LinkedTransactions:      []domain.Transaction{},
				Tags:                    []domain.Tag{},
			},
		},
	})

}

// TestInstallmentScenario1: transação sem recorrência e sem compartilhamento -> transação com recorrência sem compartilhamento
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario1_NoRecurrenceNoSplitToWithRecurrenceNoSplit() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
	})
	suite.Require().NoError(err)

	t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	suite.Require().NoError(err)
	suite.Require().Nil(t.TransactionRecurrenceID)

	transactionID := t.ID

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	updatedT, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{transactionID},
	})
	suite.Require().NoError(err)
	suite.Require().NotNil(updatedT.TransactionRecurrenceID, "original transaction should now have a recurrence ID")
	suite.Require().NotNil(updatedT.InstallmentNumber, "original transaction should now have an installment number")
	suite.Assert().Equal(1, lo.FromPtr(updatedT.InstallmentNumber))

	installments, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{*updatedT.TransactionRecurrenceID},
		SortBy:        &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installments, 3, "should have 3 installments after adding recurrence")

	for i, inst := range installments {
		suite.Assert().Equal(i+1, lo.FromPtr(inst.InstallmentNumber), "installment_number[%d]", i)
		suite.Assert().Equal(int64(100), inst.Amount, "amount[%d]", i)
		suite.Assert().Equal(domain.TransactionTypeExpense, inst.Type, "type[%d]", i)
		suite.Assert().Equal(account.ID, inst.AccountID, "account_id[%d]", i)
		suite.Assert().Equal(user.ID, inst.UserID, "user_id[%d]", i)
		suite.Assert().Len(inst.LinkedTransactions, 0, "should have no linked transactions[%d]", i)
	}

	suite.Assert().Equal(d, installments[0].Date, "installment 1 date should be original date")
}

// TestInstallmentScenario2: transação com recorrência e sem compartilhamento -> transação sem recorrência sem compartilhamento
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario2_WithRecurrenceNoSplitToNoRecurrenceNoSplit() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3, "should have 3 installments before update")

	firstInstallment := installmentsBefore[0]
	recurrenceID := lo.FromPtr(firstInstallment.TransactionRecurrenceID)

	// Update first installment removing recurrence, propagation=all
	err = suite.Services.Transaction.Update(ctx, firstInstallment.ID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings:  nil,
	})
	suite.Require().NoError(err)

	// After removing recurrence, no transactions should be linked to old recurrence
	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{recurrenceID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 0, "no transactions should remain linked to the deleted recurrence")

	// The original transaction should still exist without recurrence
	updatedT, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{firstInstallment.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Nil(updatedT.TransactionRecurrenceID, "original transaction should have no recurrence ID")
}

// TestInstallmentScenario3: transação com recorrência e sem split -> a parcela atual vira standalone; demais permanecem com recorrência (propagation=current)
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario3_WithRecurrenceNoSplitToNoRecurrencePropagationCurrent() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3, "should have 3 installments before update")

	installment2 := installmentsBefore[1]
	recurrenceID := lo.FromPtr(installment2.TransactionRecurrenceID)

	// Update installment 2 removing recurrence, propagation=current
	err = suite.Services.Transaction.Update(ctx, installment2.ID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		RecurrenceSettings:  nil,
	})
	suite.Require().NoError(err)

	// installments 1 and 3 must remain in the original recurrence
	remaining, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{recurrenceID},
		SortBy:        &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(remaining, 2, "installments 1 and 3 should remain in the recurrence")
	suite.Assert().Equal(installmentsBefore[0].ID, remaining[0].ID, "installment 1 should remain")
	suite.Assert().Equal(installmentsBefore[2].ID, remaining[1].ID, "installment 3 should remain")

	// installment 2 must be standalone
	updatedT, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{installment2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Nil(updatedT.TransactionRecurrenceID, "installment 2 should have no recurrence ID")

	// total 3 transactions in DB
	all, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &user.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(all, 3, "all 3 transactions should still exist")
}

// TestInstallmentScenario4: com recorrência (3x) sem split -> remove recorrência (propagation=current_and_future, target=installment 2)
// installment 2 vira standalone, installment 3 é deletado, installment 1 permanece na recorrência original
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario4_WithRecurrenceNoSplitToNoRecurrencePropagationCurrentAndFuture() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3)

	installment1 := installmentsBefore[0]
	installment2 := installmentsBefore[1]
	installment3 := installmentsBefore[2]
	recurrenceID := lo.FromPtr(installment2.TransactionRecurrenceID)

	// Update installment 2 removing recurrence, propagation=current_and_future
	err = suite.Services.Transaction.Update(ctx, installment2.ID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrentAndFuture,
		RecurrenceSettings:  nil,
	})
	suite.Require().NoError(err)

	// installment 1 must still be in the original recurrence
	remaining, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{recurrenceID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(remaining, 1, "only installment 1 should remain in the recurrence")
	suite.Assert().Equal(installment1.ID, remaining[0].ID)

	// installment 2 must be standalone
	updatedT2, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{installment2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Nil(updatedT2.TransactionRecurrenceID, "installment 2 should have no recurrence ID")

	// installment 3 must be deleted
	deletedResults, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		IDs: []int{installment3.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(deletedResults, 0, "installment 3 should be deleted")

	// total 2 transactions in DB
	all, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &user.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(all, 2)
}

// TestInstallmentScenario5: recorrência 3x mensal sem split -> aumenta para 5x (propagation=all)
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario5_IncreaseInstallmentCountPropagationAll() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3)

	firstInstallment := installmentsBefore[0]
	recurrenceID := lo.FromPtr(firstInstallment.TransactionRecurrenceID)

	// Update to 5 installments, propagation=all
	err = suite.Services.Transaction.Update(ctx, firstInstallment.ID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  5,
		},
	})
	suite.Require().NoError(err)

	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 5, "should have 5 installments after update")

	// all must share the same recurrenceID
	for i, t := range installmentsAfter {
		suite.Assert().Equal(recurrenceID, lo.FromPtr(t.TransactionRecurrenceID), "installment %d should have recurrenceID", i+1)
		suite.Assert().Equal(i+1, lo.FromPtr(t.InstallmentNumber), "installment number should match index")
	}

	// check dates: installment N should be d + (N-1) months
	for i, t := range installmentsAfter {
		expected := clampToEndOfMonth(d, d.Year(), d.Month()+time.Month(i))
		suite.Assert().Equal(expected, t.Date, "installment %d date should be d + %d months", i+1, i)
	}

	// recurrence record should reflect 5 installments
	suite.Assert().Equal(5, installmentsAfter[0].TransactionRecurrence.Installments)
}

// TestInstallmentScenario6: recorrência 5x mensal sem split -> diminui para 3x (propagation=all)
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario6_DecreaseInstallmentCountPropagationAll() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  5,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 5)

	firstInstallment := installmentsBefore[0]
	installment4 := installmentsBefore[3]
	installment5 := installmentsBefore[4]
	recurrenceID := lo.FromPtr(firstInstallment.TransactionRecurrenceID)

	// Update to 3 installments, propagation=all
	err = suite.Services.Transaction.Update(ctx, firstInstallment.ID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{recurrenceID},
		SortBy:        &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 3, "should have 3 installments after update")

	// installments 4 and 5 must be deleted
	deleted, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		IDs: []int{installment4.ID, installment5.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(deleted, 0, "installments 4 and 5 should be deleted")

	// recurrence record should reflect 3 installments
	suite.Assert().Equal(3, installmentsAfter[0].TransactionRecurrence.Installments)
}

// TestInstallmentScenario7: recorrência 5x mensal sem split -> diminui para 2x (propagation=current_and_future, target=installment 2)
// installment 1 permanece na recorrência original (shrinkada para 1x)
// installments 2 e 3 ficam numa nova recorrência de 2x
// installments 4 e 5 são deletados
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario7_DecreaseInstallmentCountPropagationCurrentAndFuture() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  5,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 5)

	installment1 := installmentsBefore[0]
	installment2 := installmentsBefore[1]
	installment4 := installmentsBefore[3]
	installment5 := installmentsBefore[4]
	oldRecurrenceID := lo.FromPtr(installment1.TransactionRecurrenceID)

	// Update installment 2 to 2 installments, propagation=current_and_future
	err = suite.Services.Transaction.Update(ctx, installment2.ID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrentAndFuture,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  2,
		},
	})
	suite.Require().NoError(err)

	// installment 1 must remain in the original recurrence, shrunk to 1 installment
	oldRecurrenceInstallments, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{oldRecurrenceID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(oldRecurrenceInstallments, 1, "only installment 1 should remain in the old recurrence")
	suite.Assert().Equal(installment1.ID, oldRecurrenceInstallments[0].ID)
	suite.Assert().Equal(1, oldRecurrenceInstallments[0].TransactionRecurrence.Installments, "old recurrence should be shrunk to 1")

	// installments 2 and 3 must be in a new recurrence with 2 installments
	updatedInstallment2, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{installment2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().NotNil(updatedInstallment2.TransactionRecurrenceID)
	suite.Assert().NotEqual(oldRecurrenceID, lo.FromPtr(updatedInstallment2.TransactionRecurrenceID), "installment 2 should be in a new recurrence")

	newRecurrenceID := lo.FromPtr(updatedInstallment2.TransactionRecurrenceID)
	newBatch, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{newRecurrenceID},
		SortBy:        &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(newBatch, 2, "new recurrence should have 2 installments")
	suite.Assert().Equal(2, newBatch[0].TransactionRecurrence.Installments)

	// installments 4 and 5 must be deleted
	deleted, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		IDs: []int{installment4.ID, installment5.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(deleted, 0, "installments 4 and 5 should be deleted")

	// total 3 transactions in DB
	all, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &user.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(all, 3)
}

// TestInstallmentScenario8: recorrência 3x mensal sem split -> adiciona split (propagation=all)
// todos os 3 installments de userA ganham linked transactions de userB
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario8_AddSplitPropagationAll() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3)

	recurrenceID := lo.FromPtr(installmentsBefore[0].TransactionRecurrenceID)

	// Update installment 1 adding split, propagation=all
	err = suite.Services.Transaction.Update(ctx, installmentsBefore[0].ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	// all 3 installments of userA must have a linked transaction for userB
	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:        &userA.ID,
		RecurrenceIDs: []int{recurrenceID},
		SortBy:        &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 3)

	for i, t := range installmentsAfter {
		suite.Assert().Len(t.LinkedTransactions, 1, "installment %d should have 1 linked transaction", i+1)
		suite.Assert().Equal(userB.ID, t.LinkedTransactions[0].UserID, "linked transaction should belong to userB")
	}

	// userB must have 3 linked transactions, each with their own recurrenceID (separate from userA's)
	userBTransactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userB.ID,
	})
	suite.Require().NoError(err)
	suite.Assert().Len(userBTransactions, 3)

	userBRecurrenceID := lo.FromPtr(userBTransactions[0].TransactionRecurrenceID)
	suite.Assert().NotZero(userBRecurrenceID, "userB transactions should have a recurrenceID")
	suite.Assert().NotEqual(recurrenceID, userBRecurrenceID, "userB should have a separate recurrence from userA")

	for _, t := range userBTransactions {
		suite.Assert().Equal(userBRecurrenceID, lo.FromPtr(t.TransactionRecurrenceID), "all userB linked transactions should share the same recurrenceID")
	}
}

// TestInstallmentScenario9: recorrência 3x mensal com split -> remove split (propagation=all)
// todos os 3 linked de userB são deletados; installments de userA continuam com recorrência
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario9_RemoveSplitPropagationAll() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3)

	userBBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Require().Len(userBBefore, 3, "userB should have 3 linked transactions before update")

	recurrenceID := lo.FromPtr(installmentsBefore[0].TransactionRecurrenceID)

	// Update removing split, propagation=all
	err = suite.Services.Transaction.Update(ctx, installmentsBefore[0].ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{},
	})
	suite.Require().NoError(err)

	// userA's 3 installments must remain in the recurrence without linked transactions
	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{recurrenceID},
		SortBy:        &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 3, "userA should still have 3 installments")

	for i, t := range installmentsAfter {
		suite.Assert().Len(t.LinkedTransactions, 0, "installment %d should have no linked transactions", i+1)
	}

	// all userB linked transactions must be deleted
	userBAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(userBAfter, 0, "userB transactions should all be deleted")
}

// TestInstallmentScenario10: recorrência 3x mensal sem split -> adiciona split (propagation=current, target=installment 2)
// só installment 2 de userA ganha linked transaction de userB; installments 1 e 3 permanecem sem split
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario10_AddSplitPropagationCurrent() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3)

	installment1 := installmentsBefore[0]
	installment2 := installmentsBefore[1]
	installment3 := installmentsBefore[2]

	// Update installment 2 adding split, propagation=current
	err = suite.Services.Transaction.Update(ctx, installment2.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	// installment 2 must have 1 linked transaction for userB
	updatedInstallment2, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{installment2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(updatedInstallment2.LinkedTransactions, 1, "installment 2 should have 1 linked transaction")
	suite.Assert().Equal(userB.ID, updatedInstallment2.LinkedTransactions[0].UserID)

	// installments 1 and 3 must have no linked transactions
	for _, id := range []int{installment1.ID, installment3.ID} {
		t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{IDs: []int{id}})
		suite.Require().NoError(err)
		suite.Assert().Len(t.LinkedTransactions, 0, "installment %d should have no linked transactions", id)
	}

	// total: 4 transactions (3 userA + 1 userB)
	allUserA, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserA, 3)

	allUserB, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserB, 1)
}

// TestInstallmentScenario11: recorrência 3x mensal sem split -> adiciona split (propagation=current_and_future, target=installment 2)
// installments 2 e 3 de userA ganham linked de userB; installment 1 permanece sem split
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario11_AddSplitPropagationCurrentAndFuture() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3)

	installment1 := installmentsBefore[0]
	installment2 := installmentsBefore[1]
	oldRecurrenceID := lo.FromPtr(installment1.TransactionRecurrenceID)

	// Update installment 2 adding split, propagation=current_and_future
	// repetitions=2: the new batch covers installments 2 and 3
	err = suite.Services.Transaction.Update(ctx, installment2.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrentAndFuture,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  2,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	// installment 1 must remain in the old recurrence without split
	remaining, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{oldRecurrenceID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(remaining, 1)
	suite.Assert().Equal(installment1.ID, remaining[0].ID)
	suite.Assert().Len(remaining[0].LinkedTransactions, 0, "installment 1 should have no linked transactions")

	// installments 2 and 3 must be in the new recurrence with split
	updatedInstallment2, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{installment2.ID},
	})
	suite.Require().NoError(err)
	newRecurrenceID := lo.FromPtr(updatedInstallment2.TransactionRecurrenceID)
	suite.Assert().NotZero(newRecurrenceID)
	suite.Assert().NotEqual(oldRecurrenceID, newRecurrenceID)
	suite.Assert().Len(updatedInstallment2.LinkedTransactions, 1, "installment 2 should have 1 linked transaction")
	suite.Assert().Equal(userB.ID, updatedInstallment2.LinkedTransactions[0].UserID)

	newBatch, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{newRecurrenceID},
		SortBy:        &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(newBatch, 2, "new recurrence should have 2 installments")

	for i, t := range newBatch {
		suite.Assert().Len(t.LinkedTransactions, 1, "installment %d of new batch should have 1 linked transaction", i+1)
	}

	// total: 3 userA + 2 userB = 5 transactions
	allUserA, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserA, 3)

	allUserB, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserB, 2)
}

// TestInstallmentScenario12: recorrência 3x mensal sem split -> remove recorrência e adiciona split (propagation=all)
// installments 2 e 3 são deletados; installment 1 vira standalone com linked de userB
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario12_RemoveRecurrenceAddSplitPropagationAll() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3)

	installment1 := installmentsBefore[0]
	installment2 := installmentsBefore[1]
	installment3 := installmentsBefore[2]
	recurrenceID := lo.FromPtr(installment1.TransactionRecurrenceID)

	// Update installment 1: remove recurrence, add split, propagation=all
	err = suite.Services.Transaction.Update(ctx, installment1.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings:  nil,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	// installments 2 and 3 must be deleted
	deleted, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		IDs: []int{installment2.ID, installment3.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(deleted, 0, "installments 2 and 3 should be deleted")

	// recurrence record must be deleted (no transactions reference it)
	noRecurrence, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{recurrenceID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(noRecurrence, 0)

	// installment 1 must be standalone with linked transaction for userB
	updatedT1, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{installment1.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Nil(updatedT1.TransactionRecurrenceID, "installment 1 should be standalone")
	suite.Assert().Len(updatedT1.LinkedTransactions, 1, "installment 1 should have 1 linked transaction")
	suite.Assert().Equal(userB.ID, updatedT1.LinkedTransactions[0].UserID)

	// total: 2 transactions (1 userA + 1 userB)
	allUserA, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserA, 1)

	allUserB, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserB, 1)
}

// TestInstallmentScenario13: recorrência 3x mensal com split -> remove recorrência e remove split (propagation=all)
// todas as parcelas de userB são deletadas; installments 2 e 3 de userA são deletados; installment 1 vira standalone sem split
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario13_RemoveRecurrenceRemoveSplitPropagationAll() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3)

	installment1 := installmentsBefore[0]
	recurrenceID := lo.FromPtr(installment1.TransactionRecurrenceID)

	userBBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Require().Len(userBBefore, 3)

	// Update installment 1: remove recurrence, remove split, propagation=all
	err = suite.Services.Transaction.Update(ctx, installment1.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings:  nil,
		SplitSettings:       []domain.SplitSettings{},
	})
	suite.Require().NoError(err)

	// recurrence must be fully deleted
	noRecurrence, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{recurrenceID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(noRecurrence, 0)

	// installment 1 must be standalone without split
	updatedT1, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{installment1.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Nil(updatedT1.TransactionRecurrenceID)
	suite.Assert().Len(updatedT1.LinkedTransactions, 0)

	// total: 1 transaction only
	allUserA, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserA, 1)

	allUserB, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserB, 0)
}

// TestInstallmentScenario14: recorrência 3x mensal com split -> remove recorrência e split (propagation=current, target=installment 2)
// installment 2 vira standalone sem split; linked de userB para installment 2 é deletado
// installments 1 e 3 (com linked de userB) permanecem na recorrência original
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario14_RemoveRecurrenceRemoveSplitPropagationCurrent() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3)

	installment1 := installmentsBefore[0]
	installment2 := installmentsBefore[1]
	installment3 := installmentsBefore[2]
	recurrenceID := lo.FromPtr(installment1.TransactionRecurrenceID)

	// Update installment 2: remove recurrence + split, propagation=current
	err = suite.Services.Transaction.Update(ctx, installment2.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		RecurrenceSettings:  nil,
		SplitSettings:       []domain.SplitSettings{},
	})
	suite.Require().NoError(err)

	// installments 1 and 3 must remain in the original recurrence with their linked transactions
	remaining, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{recurrenceID},
		SortBy:        &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(remaining, 2)
	suite.Assert().Equal(installment1.ID, remaining[0].ID)
	suite.Assert().Equal(installment3.ID, remaining[1].ID)

	for i, t := range remaining {
		suite.Assert().Len(t.LinkedTransactions, 1, "installment %d should still have its linked transaction", i+1)
		suite.Assert().Equal(userB.ID, t.LinkedTransactions[0].UserID)
	}

	// installment 2 must be standalone without split
	updatedT2, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{installment2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Nil(updatedT2.TransactionRecurrenceID)
	suite.Assert().Len(updatedT2.LinkedTransactions, 0)

	// total: 5 transactions (2 userA in recurrence + 2 userB linked + 1 userA standalone)
	allUserA, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserA, 3)

	allUserB, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserB, 2)
}

// TestInstallmentScenario15: recorrência 3x mensal com split -> aumenta para 5x mantendo split (propagation=all)
// todos os 5 installments de userA têm linked de userB; total 10 transações
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario15_IncreaseInstallmentsKeepSplitPropagationAll() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 3)

	recurrenceID := lo.FromPtr(installmentsBefore[0].TransactionRecurrenceID)

	// Update to 5 installments keeping split, propagation=all
	err = suite.Services.Transaction.Update(ctx, installmentsBefore[0].ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  5,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:        &userA.ID,
		RecurrenceIDs: []int{recurrenceID},
		SortBy:        &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 5, "userA should have 5 installments")

	for i, t := range installmentsAfter {
		suite.Assert().Len(t.LinkedTransactions, 1, "installment %d should have 1 linked transaction", i+1)
		suite.Assert().Equal(userB.ID, t.LinkedTransactions[0].UserID)
	}

	allUserB, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserB, 5, "userB should have 5 linked transactions")
}

// TestInstallmentScenario16: recorrência 5x mensal com split -> diminui para 3x e remove split (propagation=all)
// installments 4 e 5 de userA são deletados; todos os 5 linked de userB são deletados; 3 installments de userA permanecem sem split
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario16_DecreaseInstallmentsRemoveSplitPropagationAll() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  5,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 5)

	installment4 := installmentsBefore[3]
	installment5 := installmentsBefore[4]
	recurrenceID := lo.FromPtr(installmentsBefore[0].TransactionRecurrenceID)

	// Update to 3 installments, remove split, propagation=all
	err = suite.Services.Transaction.Update(ctx, installmentsBefore[0].ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{},
	})
	suite.Require().NoError(err)

	// 3 installments remain in the recurrence without split
	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{recurrenceID},
		SortBy:        &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 3)

	for i, t := range installmentsAfter {
		suite.Assert().Len(t.LinkedTransactions, 0, "installment %d should have no linked transactions", i+1)
	}

	// installments 4 and 5 must be deleted
	deleted, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		IDs: []int{installment4.ID, installment5.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(deleted, 0)

	// all userB transactions must be deleted
	allUserB, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(allUserB, 0)

	suite.Assert().Equal(3, installmentsAfter[0].TransactionRecurrence.Installments)
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

// ─── Settlement sync tests ───────────────────────────────────────────────────

func (suite *TransactionUpdateWithDBTestSuite) settlementsForSource(ctx context.Context, sourceTransactionID int) []*domain.Settlement {
	suite.T().Helper()
	settlements, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{
		SourceTransactionIDs: []int{sourceTransactionID},
	})
	suite.Require().NoError(err)
	return settlements
}

// 2.1 Amount change: adding a split with explicit amount syncs that amount into the settlement
func (suite *TransactionUpdateWithDBTestSuite) TestSettlementSync_AmountChange() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)
	d := now()

	// Create without split
	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          200,
		Date:            d,
		Description:     "test",
	})
	suite.Require().NoError(err)

	t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)
	suite.Assert().Empty(suite.settlementsForSource(ctx, t.ID))

	// Add split with explicit amount=80
	suite.Require().NoError(suite.Services.Transaction.Update(ctx, t.ID, userA.ID, &domain.TransactionUpdateRequest{
		SplitSettings: []domain.SplitSettings{{ConnectionID: conn.ID, Amount: lo.ToPtr(int64(80))}},
	}))

	settlements := suite.settlementsForSource(ctx, t.ID)
	suite.Require().Len(settlements, 1)
	suite.Assert().Equal(int64(80), settlements[0].Amount)
	suite.Assert().Equal(domain.SettlementTypeCredit, settlements[0].Type)
	suite.Assert().Equal(conn.FromAccountID, settlements[0].AccountID)
	suite.Assert().Equal(userA.ID, settlements[0].UserID)
}

// 2.2 Type change expense→income flips credit→debit
func (suite *TransactionUpdateWithDBTestSuite) TestSettlementSync_TypeExpenseToIncome() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)
	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "test",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)

	// verify initial credit settlement
	before := suite.settlementsForSource(ctx, t.ID)
	suite.Require().Len(before, 1)
	suite.Assert().Equal(domain.SettlementTypeCredit, before[0].Type)

	suite.Require().NoError(suite.Services.Transaction.Update(ctx, t.ID, userA.ID, &domain.TransactionUpdateRequest{
		TransactionType: lo.ToPtr(domain.TransactionTypeIncome),
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	}))

	after := suite.settlementsForSource(ctx, t.ID)
	suite.Require().Len(after, 1)
	suite.Assert().Equal(domain.SettlementTypeDebit, after[0].Type)
}

// 2.3 Type change income→expense flips debit→credit (round-trip via expense→income→expense)
func (suite *TransactionUpdateWithDBTestSuite) TestSettlementSync_TypeIncomeToExpense() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)
	d := now()

	// Create expense with split → credit settlement
	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "test",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)

	// Update: expense→income → debit settlement
	suite.Require().NoError(suite.Services.Transaction.Update(ctx, t.ID, userA.ID, &domain.TransactionUpdateRequest{
		TransactionType: lo.ToPtr(domain.TransactionTypeIncome),
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	}))
	mid := suite.settlementsForSource(ctx, t.ID)
	suite.Require().Len(mid, 1)
	suite.Assert().Equal(domain.SettlementTypeDebit, mid[0].Type)

	// Update: income→expense → credit settlement
	suite.Require().NoError(suite.Services.Transaction.Update(ctx, t.ID, userA.ID, &domain.TransactionUpdateRequest{
		TransactionType: lo.ToPtr(domain.TransactionTypeExpense),
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	}))

	after := suite.settlementsForSource(ctx, t.ID)
	suite.Require().Len(after, 1)
	suite.Assert().Equal(domain.SettlementTypeCredit, after[0].Type)
}

// 2.4 Added split (no split → with split) creates settlement
func (suite *TransactionUpdateWithDBTestSuite) TestSettlementSync_AddSplit() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)
	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "test",
	})
	suite.Require().NoError(err)

	t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)
	suite.Assert().Empty(suite.settlementsForSource(ctx, t.ID))

	suite.Require().NoError(suite.Services.Transaction.Update(ctx, t.ID, userA.ID, &domain.TransactionUpdateRequest{
		SplitSettings: []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	}))

	after := suite.settlementsForSource(ctx, t.ID)
	suite.Require().Len(after, 1)
	suite.Assert().Equal(domain.SettlementTypeCredit, after[0].Type)
	suite.Assert().Equal(int64(50), after[0].Amount)
}

// 2.5 Removed split (with split → no split) deletes settlement via cascade
func (suite *TransactionUpdateWithDBTestSuite) TestSettlementSync_RemoveSplit() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)
	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "test",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)
	suite.Require().Len(suite.settlementsForSource(ctx, t.ID), 1)

	suite.Require().NoError(suite.Services.Transaction.Update(ctx, t.ID, userA.ID, &domain.TransactionUpdateRequest{
		// no SplitSettings → removes split
	}))

	suite.Assert().Empty(suite.settlementsForSource(ctx, t.ID))
}

// 2.6 Account change updates settlement account_id
func (suite *TransactionUpdateWithDBTestSuite) TestSettlementSync_AccountChange() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	accountA2, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)
	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "test",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)

	before := suite.settlementsForSource(ctx, t.ID)
	suite.Require().Len(before, 1)
	suite.Assert().Equal(conn.FromAccountID, before[0].AccountID)

	suite.Require().NoError(suite.Services.Transaction.Update(ctx, t.ID, userA.ID, &domain.TransactionUpdateRequest{
		AccountID:     lo.ToPtr(accountA2.ID),
		SplitSettings: []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	}))

	after := suite.settlementsForSource(ctx, t.ID)
	suite.Require().Len(after, 1)
	// settlement account is always conn.FromAccountID regardless of the author's personal account
	suite.Assert().Equal(conn.FromAccountID, after[0].AccountID)
}

// 2.7 Propagation=current only updates current installment's settlement
// Uses type change (expense→income flips credit→debit) since type changes apply without SplitHasChanged.
func (suite *TransactionUpdateWithDBTestSuite) TestSettlementSync_PropagationCurrent() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)
	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	installments, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installments, 3)

	// Change only installment 2 type expense→income (propagation=current)
	suite.Require().NoError(suite.Services.Transaction.Update(ctx, installments[1].ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		TransactionType:     lo.ToPtr(domain.TransactionTypeIncome),
		SplitSettings:       []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	}))

	// installment 1: unchanged → credit
	s1 := suite.settlementsForSource(ctx, installments[0].ID)
	suite.Require().Len(s1, 1)
	suite.Assert().Equal(domain.SettlementTypeCredit, s1[0].Type)

	// installment 2: flipped → debit
	s2 := suite.settlementsForSource(ctx, installments[1].ID)
	suite.Require().Len(s2, 1)
	suite.Assert().Equal(domain.SettlementTypeDebit, s2[0].Type)

	// installment 3: unchanged → credit
	s3 := suite.settlementsForSource(ctx, installments[2].ID)
	suite.Require().Len(s3, 1)
	suite.Assert().Equal(domain.SettlementTypeCredit, s3[0].Type)
}

// 2.8 Propagation=current_and_future updates current+future installments' settlements
// Uses type change (expense→income flips credit→debit) since type changes apply without SplitHasChanged.
func (suite *TransactionUpdateWithDBTestSuite) TestSettlementSync_PropagationCurrentAndFuture() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)
	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	installments, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installments, 3)

	// Change installment 2+ type expense→income (propagation=current_and_future)
	suite.Require().NoError(suite.Services.Transaction.Update(ctx, installments[1].ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrentAndFuture,
		TransactionType:     lo.ToPtr(domain.TransactionTypeIncome),
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  2,
		},
		SplitSettings: []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	}))

	// installment 1 (past): unchanged → credit
	s1 := suite.settlementsForSource(ctx, installments[0].ID)
	suite.Require().Len(s1, 1)
	suite.Assert().Equal(domain.SettlementTypeCredit, s1[0].Type)

	// installments 2 and 3 (current+future): flipped → debit
	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	updatedInstallments := make([]*domain.Transaction, 0)
	for _, t := range installmentsAfter {
		if t.ID != installments[0].ID {
			updatedInstallments = append(updatedInstallments, t)
		}
	}
	suite.Require().Len(updatedInstallments, 2)
	for _, t := range updatedInstallments {
		s := suite.settlementsForSource(ctx, t.ID)
		suite.Require().Len(s, 1, "installment %d should have 1 settlement", t.ID)
		suite.Assert().Equal(domain.SettlementTypeDebit, s[0].Type, "installment %d settlement should be debit", t.ID)
	}
}

// 2.9 Propagation=all updates all installments' settlements
// Uses type change (expense→income flips all 3 settlements from credit→debit).
func (suite *TransactionUpdateWithDBTestSuite) TestSettlementSync_PropagationAll() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)
	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	installments, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installments, 3)

	// All 3 should start as credit
	for _, t := range installments {
		s := suite.settlementsForSource(ctx, t.ID)
		suite.Require().Len(s, 1)
		suite.Assert().Equal(domain.SettlementTypeCredit, s[0].Type)
	}

	// Change type to income for all installments (propagation=all)
	suite.Require().NoError(suite.Services.Transaction.Update(ctx, installments[0].ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		TransactionType:     lo.ToPtr(domain.TransactionTypeIncome),
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	}))

	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsAfter, 3)

	for _, t := range installmentsAfter {
		s := suite.settlementsForSource(ctx, t.ID)
		suite.Require().Len(s, 1, "installment %d should have 1 settlement", t.ID)
		suite.Assert().Equal(domain.SettlementTypeDebit, s[0].Type, "installment %d settlement should be debit after type change to income", t.ID)
	}
}

// TestOffsetInstallments_PropagationAll_PreservesNumbers: update a recurrence created with
// current_installment=4, total=12 using propagation=all — installment numbers must stay 4-12.
func (suite *TransactionUpdateWithDBTestSuite) TestOffsetInstallments_PropagationAll_PreservesNumbers() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          150000,
		Date:            d,
		Description:     "Offset installment test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 4,
			TotalInstallments:  12,
		},
	})
	suite.Require().NoError(err)

	before, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(before, 9, "should create 9 installments (4 through 12)")
	suite.Assert().Equal(4, lo.FromPtr(before[0].InstallmentNumber))
	suite.Assert().Equal(12, lo.FromPtr(before[8].InstallmentNumber))

	// Update description with propagation=all — should NOT change installment numbers or count
	err = suite.Services.Transaction.Update(ctx, before[0].ID, user.ID, &domain.TransactionUpdateRequest{
		Description:         lo.ToPtr("Updated description"),
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 4,
			TotalInstallments:  12,
		},
	})
	suite.Require().NoError(err)

	after, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(after, 9, "should still have 9 installments after update")

	for i, t := range after {
		expectedNum := 4 + i
		suite.Assert().Equal(expectedNum, lo.FromPtr(t.InstallmentNumber), "installment[%d] should be %d", i, expectedNum)
		suite.Assert().Equal("Updated description", t.Description, "installment[%d] description", i)
	}

	// Recurrence record should still have Installments=12
	recurrences, err := suite.Repos.TransactionRecurrence.Search(ctx, domain.TransactionRecurrenceFilter{
		IDs: []int{*after[0].TransactionRecurrenceID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(12, recurrences[0].Installments)
}

// TestOffsetInstallments_PropagationAll_IncreaseTotalInstallments: increase total from 12 to 15
// on a recurrence with current_installment=4 — should add 3 new installments (13, 14, 15).
func (suite *TransactionUpdateWithDBTestSuite) TestOffsetInstallments_PropagationAll_IncreaseTotalInstallments() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Increase total test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 4,
			TotalInstallments:  12,
		},
	})
	suite.Require().NoError(err)

	before, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(before, 9)

	err = suite.Services.Transaction.Update(ctx, before[0].ID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 4,
			TotalInstallments:  15,
		},
	})
	suite.Require().NoError(err)

	after, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(after, 12, "should have 12 installments (4 through 15)")
	suite.Assert().Equal(4, lo.FromPtr(after[0].InstallmentNumber))
	suite.Assert().Equal(15, lo.FromPtr(after[11].InstallmentNumber))

	for i, t := range after {
		suite.Assert().Equal(4+i, lo.FromPtr(t.InstallmentNumber), "installment[%d]", i)
	}
}

// TestOffsetInstallments_PropagationAll_DecreaseTotalInstallments: decrease total from 12 to 8
// on a recurrence with current_installment=4 — should keep 5 installments (4-8), remove 9-12.
func (suite *TransactionUpdateWithDBTestSuite) TestOffsetInstallments_PropagationAll_DecreaseTotalInstallments() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Decrease total test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 4,
			TotalInstallments:  12,
		},
	})
	suite.Require().NoError(err)

	before, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(before, 9)

	err = suite.Services.Transaction.Update(ctx, before[0].ID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 4,
			TotalInstallments:  8,
		},
	})
	suite.Require().NoError(err)

	after, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(after, 5, "should have 5 installments (4 through 8)")
	suite.Assert().Equal(4, lo.FromPtr(after[0].InstallmentNumber))
	suite.Assert().Equal(8, lo.FromPtr(after[4].InstallmentNumber))
}

// TestOffsetInstallments_StandaloneToRecurrenceWithOffset: standalone transaction converted to
// recurrence with current_installment=4, total=12 — should create 9 installments numbered 4-12.
func (suite *TransactionUpdateWithDBTestSuite) TestOffsetInstallments_StandaloneToRecurrenceWithOffset() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Standalone to recurrence test",
	})
	suite.Require().NoError(err)

	standalone, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	suite.Require().NoError(err)
	suite.Require().Nil(standalone.TransactionRecurrenceID)

	err = suite.Services.Transaction.Update(ctx, standalone.ID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 4,
			TotalInstallments:  12,
		},
	})
	suite.Require().NoError(err)

	after, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(after, 9, "should have 9 installments (4 through 12)")

	for i, t := range after {
		suite.Assert().Equal(4+i, lo.FromPtr(t.InstallmentNumber), "installment[%d] should be %d", i, 4+i)
	}

	suite.Assert().Equal(standalone.ID, after[0].ID, "first installment should be the original transaction")
}

// TestOffsetInstallments_WithSplit_PropagationAll: update a split expense with offset installments
// — both user's and partner's installment numbers should be preserved.
func (suite *TransactionUpdateWithDBTestSuite) TestOffsetInstallments_WithSplit_PropagationAll() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          150000,
		Date:            d,
		Description:     "Split offset test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 4,
			TotalInstallments:  12,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Amount: lo.ToPtr(int64(60000))},
		},
	})
	suite.Require().NoError(err)

	beforeA, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(beforeA, 9, "userA should have 9 installments")

	// Update description with propagation=all
	err = suite.Services.Transaction.Update(ctx, beforeA[0].ID, userA.ID, &domain.TransactionUpdateRequest{
		Description:         lo.ToPtr("Updated split offset"),
		PropagationSettings: domain.TransactionPropagationSettingsAll,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 4,
			TotalInstallments:  12,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Amount: lo.ToPtr(int64(60000))},
		},
	})
	suite.Require().NoError(err)

	afterA, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(afterA, 9, "userA should still have 9 installments")

	for i, t := range afterA {
		suite.Assert().Equal(4+i, lo.FromPtr(t.InstallmentNumber), "userA installment[%d]", i)
		suite.Assert().Len(t.LinkedTransactions, 1, "userA installment[%d] should have 1 linked tx", i)
		suite.Assert().Equal(4+i, lo.FromPtr(t.LinkedTransactions[0].InstallmentNumber), "userB linked installment[%d]", i)
	}
}

// TestLinkedTransactionValidation_RejectsDisallowedFields verifies that updating a linked
// (partner-side) transaction with disallowed fields returns ErrLinkedTransactionDisallowedFieldChanged.
// Covers VAL-01.
func (suite *TransactionUpdateWithDBTestSuite) TestLinkedTransactionValidation_RejectsDisallowedFields() {
	ctx := context.Background()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	categoryA, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	connection, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)
	createReq := &domain.TransactionCreateRequest{
		Date:            time.Now(),
		Description:     "shared expense for disallowed fields test",
		Amount:          10000,
		AccountID:       accountA.ID,
		TransactionType: domain.TransactionTypeExpense,
		CategoryID:      categoryA.ID,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
	}

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, createReq)
	suite.Require().NoError(err)

	// Fetch the created transaction to get the linked transaction ID
	parentTx, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
	})
	suite.Require().NoError(err)
	suite.Require().Len(parentTx.LinkedTransactions, 1, "parent transaction should have one linked transaction")

	linkedTxID := parentTx.LinkedTransactions[0].ID

	assertDisallowedFieldError := func(desc string, updateReq *domain.TransactionUpdateRequest) {
		suite.Run(desc, func() {
			err := suite.Services.Transaction.Update(ctx, linkedTxID, userB.ID, updateReq)
			suite.Require().Error(err)
			var serviceErrs pkgErrors.ServiceErrors
			suite.Require().True(errors.As(err, &serviceErrs), "error should be ServiceErrors type")
			suite.Require().True(lo.SomeBy(serviceErrs, func(e *pkgErrors.ServiceError) bool {
				return lo.Contains(e.Tags, string(pkgErrors.ErrorTagLinkedTransactionDisallowedFieldChanged))
			}), "expected ErrorTagLinkedTransactionDisallowedFieldChanged in error tags")
		})
	}

	newAmount := int64(20000)
	assertDisallowedFieldError("amount", &domain.TransactionUpdateRequest{
		Amount:              &newAmount,
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
	})

	assertDisallowedFieldError("account_id", &domain.TransactionUpdateRequest{
		AccountID:           lo.ToPtr(accountA.ID),
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
	})

	assertDisallowedFieldError("transaction_type", &domain.TransactionUpdateRequest{
		TransactionType:     lo.ToPtr(domain.TransactionTypeIncome),
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
	})

	assertDisallowedFieldError("recurrence_settings", &domain.TransactionUpdateRequest{
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
	})

	assertDisallowedFieldError("split_settings", &domain.TransactionUpdateRequest{
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
	})

	assertDisallowedFieldError("destination_account_id", &domain.TransactionUpdateRequest{
		DestinationAccountID: lo.ToPtr(accountA.ID),
		PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
	})
}

// TestLinkedTransactionValidation_AllowsPermittedFields verifies that updating a linked
// (partner-side) transaction with allowed fields (date, description, category) succeeds.
// Covers VAL-02.
func (suite *TransactionUpdateWithDBTestSuite) TestLinkedTransactionValidation_AllowsPermittedFields() {
	ctx := context.Background()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	connection, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	categoryA, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	createReq := &domain.TransactionCreateRequest{
		Date:            time.Now(),
		Description:     "shared expense for allowed fields test",
		Amount:          10000,
		AccountID:       accountA.ID,
		TransactionType: domain.TransactionTypeExpense,
		CategoryID:      categoryA.ID,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
	}

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, createReq)
	suite.Require().NoError(err)

	parentTx, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
	})
	suite.Require().NoError(err)
	suite.Require().Len(parentTx.LinkedTransactions, 1)

	linkedTxID := parentTx.LinkedTransactions[0].ID

	categoryB, err := suite.createTestCategory(ctx, userB)
	suite.Require().NoError(err)

	newDate := time.Now().AddDate(0, 0, 5)
	newDesc := "updated by userB"

	updateReq := &domain.TransactionUpdateRequest{
		Date:                &newDate,
		Description:         &newDesc,
		CategoryID:          &categoryB.ID,
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
	}

	err = suite.Services.Transaction.Update(ctx, linkedTxID, userB.ID, updateReq)
	suite.Require().NoError(err)

	updatedTx, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{linkedTxID},
	})
	suite.Require().NoError(err)
	suite.Equal(newDesc, updatedTx.Description, "description should have been updated")
	suite.Equal(&categoryB.ID, updatedTx.CategoryID, "category should have been updated")
}

// TestLinkedTransactionValidation_AllowsTagsOnly verifies that updating a linked transaction
// with only tags succeeds. Covers VAL-02.
func (suite *TransactionUpdateWithDBTestSuite) TestLinkedTransactionValidation_AllowsTagsOnly() {
	ctx := context.Background()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	connection, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	categoryA, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	createReq := &domain.TransactionCreateRequest{
		Date:            time.Now(),
		Description:     "shared expense for tags test",
		Amount:          10000,
		AccountID:       accountA.ID,
		TransactionType: domain.TransactionTypeExpense,
		CategoryID:      categoryA.ID,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
	}

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, createReq)
	suite.Require().NoError(err)

	parentTx, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
	})
	suite.Require().NoError(err)
	suite.Require().Len(parentTx.LinkedTransactions, 1)

	linkedTxID := parentTx.LinkedTransactions[0].ID

	updateReq := &domain.TransactionUpdateRequest{
		Tags:                []domain.Tag{{Name: "linked-test-tag"}},
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
	}

	err = suite.Services.Transaction.Update(ctx, linkedTxID, userB.ID, updateReq)
	suite.Require().NoError(err)
}

// TestLinkedTransactionPropagation_DateDoesNotCrossToPartner verifies that when userB edits
// the date of a linked transaction with propagation=all, userA's installments are NOT shifted.
// Covers PROP-01.
func (suite *TransactionUpdateWithDBTestSuite) TestLinkedTransactionPropagation_DateDoesNotCrossToPartner() {
	ctx := context.Background()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	connection, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	categoryA, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	originalDate := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	createReq := &domain.TransactionCreateRequest{
		Date:            originalDate,
		Description:     "recurring shared expense",
		Amount:          10000,
		AccountID:       accountA.ID,
		TransactionType: domain.TransactionTypeExpense,
		CategoryID:      categoryA.ID,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
	}

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, createReq)
	suite.Require().NoError(err)

	// Get userA's first installment (which has the linked transaction for userB)
	userATransactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(userATransactions, 3, "userA should have 3 installments")

	firstInstallment := userATransactions[0]
	suite.Require().Len(firstInstallment.LinkedTransactions, 1, "first installment should have linked tx")

	linkedTxID := firstInstallment.LinkedTransactions[0].ID
	originalUserADate := firstInstallment.Date

	// userB shifts the linked transaction's date forward by 5 days, propagation=all
	newDate := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	updateReq := &domain.TransactionUpdateRequest{
		Date:                &newDate,
		PropagationSettings: domain.TransactionPropagationSettingsAll,
	}

	err = suite.Services.Transaction.Update(ctx, linkedTxID, userB.ID, updateReq)
	suite.Require().NoError(err)

	// Verify userA's installments are UNCHANGED
	userAAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(userAAfter, 3, "userA should still have 3 installments")

	suite.Equal(
		originalUserADate.Day(),
		userAAfter[0].Date.Day(),
		"userA's first installment date should NOT have shifted after userB's edit",
	)
}

// TestLinkedTransactionPropagation_DescriptionDoesNotCrossToPartner verifies that when userB
// edits the description of a linked transaction with propagation=all, userA's transactions
// retain their original description.
// Covers PROP-01.
func (suite *TransactionUpdateWithDBTestSuite) TestLinkedTransactionPropagation_DescriptionDoesNotCrossToPartner() {
	ctx := context.Background()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	connection, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	categoryA, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	originalDate := time.Date(2026, 2, 15, 0, 0, 0, 0, time.UTC)
	originalDescription := "recurring shared expense description test"

	createReq := &domain.TransactionCreateRequest{
		Date:            originalDate,
		Description:     originalDescription,
		Amount:          10000,
		AccountID:       accountA.ID,
		TransactionType: domain.TransactionTypeExpense,
		CategoryID:      categoryA.ID,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
	}

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, createReq)
	suite.Require().NoError(err)

	// Get userA's first installment to find the linked transaction
	userATransactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(userATransactions, 3, "userA should have 3 installments")

	firstInstallment := userATransactions[0]
	suite.Require().Len(firstInstallment.LinkedTransactions, 1)

	linkedTxID := firstInstallment.LinkedTransactions[0].ID

	// userB changes the description with propagation=all
	newDesc := "userB changed this description"
	updateReq := &domain.TransactionUpdateRequest{
		Description:         &newDesc,
		PropagationSettings: domain.TransactionPropagationSettingsAll,
	}

	err = suite.Services.Transaction.Update(ctx, linkedTxID, userB.ID, updateReq)
	suite.Require().NoError(err)

	// Verify userA's transactions retain the original description
	userAAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(userAAfter, 3, "userA should still have 3 installments")

	for i, tx := range userAAfter {
		suite.Equal(
			originalDescription,
			tx.Description,
			"userA installment[%d] description should NOT have changed after userB's edit", i,
		)
	}

	// Verify userB's linked transaction now has the new description
	userBTransactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userB.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().NotEmpty(userBTransactions)
	suite.Equal(newDesc, userBTransactions[0].Description, "userB's linked transaction description should be updated")
}

// TestInstallmentScenario9b: recorrência 4x mensal com split -> remove split da parcela 3
// (propagation=current_and_future, installment > 1, total inalterado).
// Regressão para issue #83: edições de parcela n>1 com current_and_future e total igual
// ao original NÃO devem fragmentar a recorrência nem renumerar as parcelas.
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario9b_RemoveSplitPropagationCurrentAndFutureTotalUnchanged() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  4,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 4)

	originalRecurrenceID := lo.FromPtr(installmentsBefore[0].TransactionRecurrenceID)
	installment3 := installmentsBefore[2]
	suite.Require().Equal(3, lo.FromPtr(installment3.InstallmentNumber))

	err = suite.Services.Transaction.Update(ctx, installment3.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrentAndFuture,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 3,
			TotalInstallments:  4,
		},
		SplitSettings: []domain.SplitSettings{},
	})
	suite.Require().NoError(err)

	// All 4 userA installments must remain in the SAME recurrence with ORIGINAL numbers.
	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 4, "userA should still have 4 installments")

	for i, t := range installmentsAfter {
		suite.Assert().Equal(i+1, lo.FromPtr(t.InstallmentNumber), "installment numbers must be preserved")
		suite.Assert().Equal(originalRecurrenceID, lo.FromPtr(t.TransactionRecurrenceID),
			"all installments must stay in the original recurrence")
	}

	// Installments 1 and 2 keep the split; 3 and 4 have the split removed.
	for i := range 2 {
		suite.Assert().Len(installmentsAfter[i].LinkedTransactions, 1,
			"installment %d should keep split", i+1)
	}
	for i := 2; i < 4; i++ {
		suite.Assert().Len(installmentsAfter[i].LinkedTransactions, 0,
			"installment %d should have split removed", i+1)
	}

	// Recurrence.Installments must remain 4 — no fragmentation.
	recurrences, err := suite.Repos.TransactionRecurrence.Search(ctx, domain.TransactionRecurrenceFilter{
		UserID: userA.ID,
	})
	suite.Require().NoError(err)
	suite.Assert().Len(recurrences, 1, "no new recurrence should be created")
	suite.Assert().Equal(4, recurrences[0].Installments, "original recurrence Installments must stay 4")
	suite.Assert().Equal(originalRecurrenceID, recurrences[0].ID)

	// userB's 3 and 4 linked transactions must be gone; 1 and 2 remain.
	userBAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userB.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(userBAfter, 2, "userB should have only 2 linked transactions left")
	for i, t := range userBAfter {
		suite.Assert().Equal(i+1, lo.FromPtr(t.InstallmentNumber))
	}
}

// TestInstallmentScenario10b: recorrência 4x mensal sem split -> adiciona split na parcela 3
// (propagation=current_and_future, installment > 1, total inalterado).
// Gêmeo do 11, mas sem encolher o total: a recorrência deve permanecer íntegra e os
// installment_numbers preservados.
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario10b_AddSplitPropagationCurrentAndFutureTotalUnchanged() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  4,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 4)

	originalRecurrenceID := lo.FromPtr(installmentsBefore[0].TransactionRecurrenceID)
	installment3 := installmentsBefore[2]

	err = suite.Services.Transaction.Update(ctx, installment3.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrentAndFuture,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 3,
			TotalInstallments:  4,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 4, "userA should still have 4 installments")

	for i, t := range installmentsAfter {
		suite.Assert().Equal(i+1, lo.FromPtr(t.InstallmentNumber), "installment numbers must be preserved")
		suite.Assert().Equal(originalRecurrenceID, lo.FromPtr(t.TransactionRecurrenceID),
			"all installments must stay in the original recurrence")
	}

	// Installments 1 and 2 remain without split; 3 and 4 gain split.
	for i := range 2 {
		suite.Assert().Len(installmentsAfter[i].LinkedTransactions, 0,
			"installment %d should have no split", i+1)
	}
	for i := 2; i < 4; i++ {
		suite.Assert().Len(installmentsAfter[i].LinkedTransactions, 1,
			"installment %d should have split", i+1)
	}

	recurrences, err := suite.Repos.TransactionRecurrence.Search(ctx, domain.TransactionRecurrenceFilter{
		UserID: userA.ID,
	})
	suite.Require().NoError(err)
	suite.Assert().Len(recurrences, 1, "no new recurrence should be created for userA")
	suite.Assert().Equal(4, recurrences[0].Installments)
	suite.Assert().Equal(originalRecurrenceID, recurrences[0].ID)

	userBAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userB.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(userBAfter, 2, "userB should have 2 linked transactions")
	for i, t := range userBAfter {
		suite.Assert().Equal(i+3, lo.FromPtr(t.InstallmentNumber),
			"userB linked installment numbers must match userA (3 and 4)")
	}
}

// TestInstallmentScenario17: recorrência 4x mensal, edita APENAS a descrição da parcela 3
// (propagation=current_and_future, installment > 1).
// A recorrência deve permanecer intacta, nenhum número de parcela pode ser alterado e
// apenas as descrições das parcelas 3 e 4 devem mudar.
func (suite *TransactionUpdateWithDBTestSuite) TestInstallmentScenario17_EditDescriptionOnlyPropagationCurrentAndFuture() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	d := now()
	originalDescription := "Original description"
	newDescription := "Updated description"

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     originalDescription,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  4,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 4)

	originalRecurrenceID := lo.FromPtr(installmentsBefore[0].TransactionRecurrenceID)
	installment3 := installmentsBefore[2]

	err = suite.Services.Transaction.Update(ctx, installment3.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrentAndFuture,
		Description:         lo.ToPtr(newDescription),
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 3,
			TotalInstallments:  4,
		},
	})
	suite.Require().NoError(err)

	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 4)

	for i, t := range installmentsAfter {
		suite.Assert().Equal(i+1, lo.FromPtr(t.InstallmentNumber), "installment numbers must be preserved")
		suite.Assert().Equal(originalRecurrenceID, lo.FromPtr(t.TransactionRecurrenceID),
			"recurrence must remain the same")
	}

	suite.Assert().Equal(originalDescription, installmentsAfter[0].Description, "installment 1 description unchanged")
	suite.Assert().Equal(originalDescription, installmentsAfter[1].Description, "installment 2 description unchanged")
	suite.Assert().Equal(newDescription, installmentsAfter[2].Description, "installment 3 description updated")
	suite.Assert().Equal(newDescription, installmentsAfter[3].Description, "installment 4 description updated")

	recurrences, err := suite.Repos.TransactionRecurrence.Search(ctx, domain.TransactionRecurrenceFilter{
		UserID: userA.ID,
	})
	suite.Require().NoError(err)
	suite.Assert().Len(recurrences, 1, "no new recurrence should be created")
	suite.Assert().Equal(4, recurrences[0].Installments)
}

// TestIssue83_EditDescriptionOnInstallment21Of24: regressão literal do reprodutor
// reportado em https://github.com/mateusdeitos/finance_app/issues/83.
// Recorrência 24x mensal com installments começando em 21 (21,22,23,24). O usuário
// abre a parcela 21, edita APENAS a descrição, propagação "Esta e as próximas".
// Esperado: "21 de 24" continua sendo "21 de 24", recorrência inalterada,
// installment_numbers preservados, descrição aplicada apenas em 21..24.
func (suite *TransactionUpdateWithDBTestSuite) TestIssue83_EditDescriptionOnInstallment21Of24() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	d := now()
	originalDescription := "Original description"
	newDescription := "Updated description"

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     originalDescription,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 21,
			TotalInstallments:  24,
		},
	})
	suite.Require().NoError(err)

	installmentsBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installmentsBefore, 4, "should have 4 installments (21..24)")

	originalRecurrenceID := lo.FromPtr(installmentsBefore[0].TransactionRecurrenceID)
	installment21 := installmentsBefore[0]
	suite.Require().Equal(21, lo.FromPtr(installment21.InstallmentNumber),
		"first installment should be number 21")

	err = suite.Services.Transaction.Update(ctx, installment21.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrentAndFuture,
		Description:         lo.ToPtr(newDescription),
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 21,
			TotalInstallments:  24,
		},
	})
	suite.Require().NoError(err)

	installmentsAfter, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(installmentsAfter, 4, "still 4 installments after update")

	for i, t := range installmentsAfter {
		expectedNumber := 21 + i
		suite.Assert().Equal(expectedNumber, lo.FromPtr(t.InstallmentNumber),
			"installment %d must keep its original number (no renumbering from 1)", expectedNumber)
		suite.Assert().Equal(originalRecurrenceID, lo.FromPtr(t.TransactionRecurrenceID),
			"installment %d must remain in the original recurrence", expectedNumber)
		suite.Assert().Equal(newDescription, t.Description,
			"installment %d description should be updated", expectedNumber)
	}

	recurrences, err := suite.Repos.TransactionRecurrence.Search(ctx, domain.TransactionRecurrenceFilter{
		UserID: userA.ID,
	})
	suite.Require().NoError(err)
	suite.Assert().Len(recurrences, 1, "no new recurrence should be created")
	suite.Assert().Equal(originalRecurrenceID, recurrences[0].ID, "original recurrence ID preserved")
	suite.Assert().Equal(24, recurrences[0].Installments,
		"recurrence.Installments must remain 24 (no fragmentation)")
}

func TestTransactionUpdateWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	suite.Run(t, new(TransactionUpdateWithDBTestSuite))
}
