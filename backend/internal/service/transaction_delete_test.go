package service

import (
	"context"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
)

type TransactionDeleteTestSuite struct {
	ServiceTestSuite
}

type TransactionDeleteTestWithDBSuite struct {
	ServiceTestWithDBSuite
}

func (suite *TransactionDeleteTestSuite) TestInvalidPropagationSettings() {
	err := suite.Services.Transaction.Delete(context.Background(), 1, 1, "invalid")
	suite.Error(err)
	suite.Equal(pkgErrors.ErrInvalidPropagationSettings(domain.TransactionPropagationSettings("invalid")), err)
}

func (suite *TransactionDeleteTestSuite) TestTransactionNotFound() {
	suite.MockTransactionRepository.EXPECT().Search(context.Background(), domain.TransactionFilter{
		IDs:    []int{1},
		UserID: &suite.UserID,
	}).Return([]*domain.Transaction{}, nil)

	ctx := context.Background()
	err := suite.Services.Transaction.Delete(ctx, 1, 1, domain.TransactionPropagationSettingsCurrent)
	suite.Error(err)
	suite.Equal(pkgErrors.NotFound("transaction"), err)
}

func (suite *TransactionDeleteTestSuite) TestTransactionParentBelongsToAnotherUser() {
	suite.MockTransactionRepository.EXPECT().Search(context.Background(), domain.TransactionFilter{
		IDs:    []int{1},
		UserID: &suite.UserID,
	}).Return([]*domain.Transaction{
		{
			ID:             1,
			UserID:         suite.UserID,
			OriginalUserID: lo.ToPtr(2),
		},
	}, nil)

	ctx := context.Background()
	err := suite.Services.Transaction.Delete(ctx, 1, 1, domain.TransactionPropagationSettingsCurrent)
	suite.Error(err)
	suite.Equal(pkgErrors.ErrParentTransactionBelongsToAnotherUser, err)
}

func (suite *TransactionDeleteTestWithDBSuite) TestDeleteChildTransaction() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user.ID)

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user2.ID)

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 100)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})

	parent, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		UserID:     &user.ID,
		AccountIDs: []int{account.ID},
		SortBy:     &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.NotNil(suite.T(), parent)
	assert.Len(suite.T(), parent.LinkedTransactions, 2, "split creates 2 linked transactions (from + to)")

	// Find the toTransaction (user2's linked tx)
	var child domain.Transaction
	for _, lt := range parent.LinkedTransactions {
		if lt.UserID == user2.ID {
			child = lt
			break
		}
	}

	assert.Equal(suite.T(), userConnection.ToAccountID, child.AccountID)
	assert.Equal(suite.T(), user2.ID, child.UserID)
	assert.Equal(suite.T(), user.ID, lo.FromPtr(child.OriginalUserID))
	assert.Equal(suite.T(), domain.TransactionTypeExpense, child.Type)
	assert.Equal(suite.T(), int64(50), child.Amount)

	err = suite.Services.Transaction.Delete(ctx, user.ID, parent.ID, domain.TransactionPropagationSettingsCurrent)
	suite.NoError(err)

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactions, 0, "deleting linked transaction should delete both debit and credit")

	transactions, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactions, 0)
}

func (suite *TransactionDeleteTestWithDBSuite) TestPropagationSettingsCurrent() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user.ID)

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	installments := 4

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
	})

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactions, installments)

	firstTransaction := transactions[0]
	recurrenceID := firstTransaction.TransactionRecurrenceID
	assert.NotNil(suite.T(), recurrenceID)

	err = suite.Services.Transaction.Delete(ctx, user.ID, firstTransaction.ID, domain.TransactionPropagationSettingsCurrent)
	suite.NoError(err)

	transactions, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactions, installments-1)

	remainingTransactionsHaveRecurrence := lo.EveryBy(transactions, func(transaction *domain.Transaction) bool {
		return transaction.TransactionRecurrenceID != nil
	})
	assert.True(suite.T(), remainingTransactionsHaveRecurrence)
}

func (suite *TransactionDeleteTestWithDBSuite) TestPropagationSettingsAll() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user.ID)

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	installments := 4

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
	})

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactions, installments)

	firstTransaction := transactions[0]
	recurrenceID := firstTransaction.TransactionRecurrenceID
	assert.NotNil(suite.T(), recurrenceID)

	err = suite.Services.Transaction.Delete(ctx, user.ID, firstTransaction.ID, domain.TransactionPropagationSettingsAll)
	suite.NoError(err)

	transactions, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactions, 0)

	recurrences, err := suite.Repos.TransactionRecurrence.Search(ctx, domain.TransactionRecurrenceFilter{
		IDs:    []int{*recurrenceID},
		UserID: user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search recurrences: %v", err)
	}
	assert.Len(suite.T(), recurrences, 0)
}

func (suite *TransactionDeleteTestWithDBSuite) TestPropagationSettingsCurrentAndFuture() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user.ID)

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	installments := 4

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
	})

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactions, installments)

	slices.SortFunc(transactions, func(a *domain.Transaction, b *domain.Transaction) int {
		return lo.FromPtr(a.InstallmentNumber) - lo.FromPtr(b.InstallmentNumber)
	})

	secondTransaction := transactions[1]

	assert.Equal(suite.T(), 2, lo.FromPtr(secondTransaction.InstallmentNumber))

	recurrenceID := secondTransaction.TransactionRecurrenceID
	assert.NotNil(suite.T(), recurrenceID)

	err = suite.Services.Transaction.Delete(ctx, user.ID, secondTransaction.ID, domain.TransactionPropagationSettingsCurrentAndFuture)
	suite.NoError(err)

	transactions, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactions, 1)
	assert.Equal(suite.T(), 1, lo.FromPtr(transactions[0].InstallmentNumber))

	recurrences, err := suite.Repos.TransactionRecurrence.Search(ctx, domain.TransactionRecurrenceFilter{
		IDs:    []int{*recurrenceID},
		UserID: user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search recurrences: %v", err)
	}
	assert.Len(suite.T(), recurrences, 1)
}

func (suite *TransactionDeleteTestWithDBSuite) TestPropagationSettingsCurrentWithLinkedTransactionsDeletingChildTransaction() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user.ID)

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user2.ID)

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})

	// User1 has the main expense + fromTransaction on conn.FromAccountID
	transactionsUser1, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, 2, "should create main expense + fromTransaction for user1")

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}

	assert.Len(suite.T(), transactionsUser2, 1, "should create one expense transaction in to_account")
	assert.Equal(suite.T(), transactionsUser2[0].Amount, int64(50), "transactionsUser2[0].Amount should be 50")
	assert.Equal(suite.T(), transactionsUser2[0].Type, domain.TransactionTypeExpense, "transactionsUser2[0].Type should be domain.TransactionTypeExpense")
	assert.Equal(suite.T(), userConnection.ToAccountID, transactionsUser2[0].AccountID, "transactionsUser2[0].AccountID should be userConnection.ToAccountID")
	assert.Nil(suite.T(), transactionsUser2[0].CategoryID, "transactionsUser2[0].CategoryID should be nil")
	assert.Equal(suite.T(), userConnection.ToUserID, transactionsUser2[0].UserID, "transactionsUser2[0].UserID should be userConnection.ToUserID")
	assert.Equal(suite.T(), user.ID, lo.FromPtr(transactionsUser2[0].OriginalUserID), "transactionsUser2[0].OriginalUserID should be user.ID")

	// User1 (creator) pode deletar a transação que está na conta do user2
	// Isso deleta a origem e a transação destino
	err = suite.Services.Transaction.Delete(ctx, user.ID, transactionsUser2[0].ID, domain.TransactionPropagationSettingsCurrent)
	suite.NoError(err)

	transactionsUser1, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, 0, "should delete the expense transaction of user1")

	transactionsUser2, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser2, 0, "should delete the expense transaction of user2")
}

func (suite *TransactionDeleteTestWithDBSuite) TestPropagationSettingsCurrentWithLinkedTransactions() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user.ID)

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user2.ID)

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})

	transactionsUser1, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, 2, "should create main expense + fromTransaction for user1")

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}

	assert.Len(suite.T(), transactionsUser2, 1, "should create one expense transaction in to_account")
	assert.Equal(suite.T(), transactionsUser2[0].Amount, int64(50), "transactionsUser2[0].Amount should be 50")
	assert.Equal(suite.T(), transactionsUser2[0].Type, domain.TransactionTypeExpense, "transactionsUser2[0].Type should be domain.TransactionTypeExpense")
	assert.Equal(suite.T(), userConnection.ToAccountID, transactionsUser2[0].AccountID)
	assert.Nil(suite.T(), transactionsUser2[0].CategoryID)
	assert.Equal(suite.T(), userConnection.ToUserID, transactionsUser2[0].UserID)
	assert.Equal(suite.T(), user.ID, lo.FromPtr(transactionsUser2[0].OriginalUserID), "transactionsUser2[0].OriginalUserID should be user.ID")

	err = suite.Services.Transaction.Delete(ctx, user.ID, transactionsUser2[0].ID, domain.TransactionPropagationSettingsCurrent)
	suite.NoError(err)

	transactionsUser2, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser2, 0, "should delete the expense transaction")
}

func (suite *TransactionDeleteTestWithDBSuite) TestPropagationSettingsAllWithLinkedTransactions() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user.ID)

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user2.ID)

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	installments := 12

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})

	transactionsUser1, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:     &user.ID,
		AccountIDs: []int{account.ID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, installments, "should create one expense transaction per installment on personal account")

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}

	assert.Len(suite.T(), transactionsUser2, installments, fmt.Sprintf("should create %d expense transactions in to_account", installments))

	for i, transaction := range transactionsUser2 {
		assert.Equal(suite.T(), int64(50), transaction.Amount, fmt.Sprintf("transactionsUser2[%d].Amount should be 50", i))
		assert.Equal(suite.T(), transaction.Type, domain.TransactionTypeExpense, fmt.Sprintf("transactionsUser2[%d].Type should be domain.TransactionTypeExpense", i))
		assert.Equal(suite.T(), userConnection.ToAccountID, transaction.AccountID, fmt.Sprintf("transactionsUser2[%d].AccountID should be userConnection.ToAccountID", i))
		assert.Nil(suite.T(), transaction.CategoryID, fmt.Sprintf("transactionsUser2[%d].CategoryID should be nil", i))
		assert.NotNil(suite.T(), transaction.TransactionRecurrenceID, fmt.Sprintf("transactionsUser2[%d].TransactionRecurrenceID should not be nil", i))
		assert.Equal(suite.T(), userConnection.ToUserID, transaction.UserID, fmt.Sprintf("transactionsUser2[%d].UserID should be userConnection.ToUserID", i))
	}

	err = suite.Services.Transaction.Delete(ctx, user.ID, transactionsUser2[0].ID, domain.TransactionPropagationSettingsAll)
	suite.NoError(err)

	transactionsUser2, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser2, 0, "should delete all expense transactions")
}

func (suite *TransactionDeleteTestWithDBSuite) TestPropagationSettingsCurrentAndFutureWithLinkedTransactions() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user.ID)

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	assert.NotEmpty(suite.T(), user2.ID)

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	installments := 12
	installmentsToDelete := 6

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})

	transactionsUser1, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:     &user.ID,
		AccountIDs: []int{account.ID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, installments, "should create one expense transaction per installment on personal account")

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}

	assert.Len(suite.T(), transactionsUser2, installments, fmt.Sprintf("should create %d expense transactions in to_account", installments))

	toDelete, found := lo.Find(transactionsUser2, func(transaction *domain.Transaction) bool {
		return lo.FromPtr(transaction.InstallmentNumber) == installmentsToDelete+1
	})

	assert.True(suite.T(), found, "should find the transaction to delete")

	err = suite.Services.Transaction.Delete(ctx, user.ID, toDelete.ID, domain.TransactionPropagationSettingsCurrentAndFuture)
	suite.NoError(err)

	transactionsUser1, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:     &user.ID,
		AccountIDs: []int{account.ID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, installments-installmentsToDelete, "should delete current and future installments, leaving first installmentsToDelete")

	for i, transaction := range transactionsUser1 {
		assert.NotNil(suite.T(), transaction.InstallmentNumber, fmt.Sprintf("transactionsUser1[%d].InstallmentNumber should not be nil", i))
		assert.LessOrEqual(suite.T(), lo.FromPtr(transaction.InstallmentNumber), installmentsToDelete, fmt.Sprintf("transactionsUser1[%d].InstallmentNumber = %d should be <= %d", i, lo.FromPtr(transaction.InstallmentNumber), installmentsToDelete))
		assert.NotNil(suite.T(), transaction.TransactionRecurrenceID, fmt.Sprintf("transactionsUser1[%d].TransactionRecurrenceID should not be nil", i))
	}

	transactionsUser2, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser2, installments-installmentsToDelete, "should delete current and future installments, leaving first installmentsToDelete")

	for i, transaction := range transactionsUser2 {
		assert.NotNil(suite.T(), transaction.InstallmentNumber, fmt.Sprintf("transactionsUser2[%d].InstallmentNumber should not be nil", i))
		assert.LessOrEqual(suite.T(), lo.FromPtr(transaction.InstallmentNumber), installmentsToDelete, fmt.Sprintf("transactionsUser2[%d].InstallmentNumber = %d should be <= %d", i, lo.FromPtr(transaction.InstallmentNumber), installmentsToDelete))
		assert.NotNil(suite.T(), transaction.TransactionRecurrenceID, fmt.Sprintf("transactionsUser2[%d].TransactionRecurrenceID should not be nil", i))
	}
}

func TestTransactionDelete(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
		suite.Run(t, new(TransactionDeleteTestSuite))
		return
	}

	suite.Run(t, new(TransactionDeleteTestWithDBSuite))
}
