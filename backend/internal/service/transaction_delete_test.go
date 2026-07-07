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
	suite.MockTransactionRepository.EXPECT().SearchOne(context.Background(), domain.TransactionFilter{
		IDs: []int{1},
	}).Return(nil, pkgErrors.NotFound("transaction"))

	ctx := context.Background()
	err := suite.Services.Transaction.Delete(ctx, 1, 1, domain.TransactionPropagationSettingsCurrent)
	suite.Error(err)
	suite.Equal(pkgErrors.NotFound("transaction"), err)
}

func (suite *TransactionDeleteTestSuite) TestTransactionParentBelongsToAnotherUser() {
	// A transação não foi criada pelo usuário (OriginalUserID=2) e também não
	// pertence a ele (UserID=3, deletante=1) — deve ser rejeitada.
	suite.MockTransactionRepository.EXPECT().SearchOne(context.Background(), domain.TransactionFilter{
		IDs: []int{1},
	}).Return(&domain.Transaction{
		ID:             1,
		UserID:         3,
		OriginalUserID: lo.ToPtr(2),
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
		Date:            domain.Date{Time: time.Now().UTC()},
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
	assert.Len(suite.T(), parent.LinkedTransactions, 1, "split creates 1 linked transaction (to)")

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
		Date:            domain.Date{Time: time.Now().UTC()},
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
		Date:            domain.Date{Time: time.Now().UTC()},
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
		Date:            domain.Date{Time: time.Now().UTC()},
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
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})

	// User1 has only the main expense (no fromTransaction for shared expenses)
	transactionsUser1, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, 1, "should create main expense for user1")

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
		Date:            domain.Date{Time: time.Now().UTC()},
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
	assert.Len(suite.T(), transactionsUser1, 1, "should create main expense for user1")

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
		Date:            domain.Date{Time: time.Now().UTC()},
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
		Date:            domain.Date{Time: time.Now().UTC()},
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

// ---------------------------------------------------------------------------
// Exclusão pelo usuário da "ponta" (o parceiro que recebe o outro lado de uma
// transação compartilhada).
// ---------------------------------------------------------------------------

// Cenário A (split em conta privada): a ponta apaga a sua tx — desfaz o split.
// A tx privada do author sobrevive; a tx da ponta e o settlement são removidos.
func (suite *TransactionDeleteTestWithDBSuite) TestPontaDeleteSplitCurrent() {
	ctx := context.Background()

	author, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	ponta, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, author.ID, ponta.ID, 50)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, author)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, author)
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, author.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "Split expense",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	pontaTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Require().Len(pontaTxs, 1)
	pontaTx := pontaTxs[0]
	suite.Assert().Equal(int64(50), pontaTx.Amount)

	settlementsBefore, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}})
	suite.Require().NoError(err)
	suite.Require().Len(settlementsBefore, 1)

	// A ponta apaga a sua transação.
	err = suite.Services.Transaction.Delete(ctx, ponta.ID, pontaTx.ID, domain.TransactionPropagationSettingsCurrent)
	suite.Require().NoError(err)

	pontaTxs, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaTxs, 0, "lado da ponta apagado")

	authorTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &author.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(authorTxs, 1, "a despesa privada do author sobrevive")
	suite.Assert().Equal(int64(100), authorTxs[0].Amount)

	settlementsAfter, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(settlementsAfter, 0, "settlement removido para manter o saldo compartilhado consistente")

	// O author é notificado (dispatch assíncrono).
	time.Sleep(200 * time.Millisecond)
	notifs, err := suite.Services.Notification.List(ctx, author.ID, domain.NotificationFilter{Limit: 100})
	suite.Require().NoError(err)
	var found *domain.Notification
	for _, n := range notifs.Items {
		if n.Type == domain.NotificationTypeSharedTransactionDeleted {
			found = n
			break
		}
	}
	suite.Require().NotNil(found, "author recebe notificação shared_transaction_deleted")
	suite.Assert().Equal(int64(50), lo.FromPtr(found.Amount))
	suite.Assert().Equal("Split expense", lo.FromPtr(found.Description))
}

// Cenário A recorrente, propagação 'all': a ponta apaga uma parcela e todas as
// suas parcelas + settlements somem; todas as parcelas do author sobrevivem.
func (suite *TransactionDeleteTestWithDBSuite) TestPontaDeleteSplitAll() {
	ctx := context.Background()

	author, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	ponta, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, author.ID, ponta.ID, 50)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, author)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, author)
	suite.Require().NoError(err)

	installments := 12
	_, err = suite.Services.Transaction.Create(ctx, author.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "Recurring split",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	pontaTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &ponta.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(pontaTxs, installments)

	err = suite.Services.Transaction.Delete(ctx, ponta.ID, pontaTxs[0].ID, domain.TransactionPropagationSettingsAll)
	suite.Require().NoError(err)

	pontaTxs, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaTxs, 0, "todas as parcelas da ponta apagadas")

	authorTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &author.ID, AccountIDs: []int{account.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(authorTxs, installments, "todas as parcelas do author sobrevivem")

	settlements, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(settlements, 0, "todos os settlements removidos")
}

// Cenário A recorrente, propagação 'current_and_future': a ponta apaga da
// parcela 7 em diante; parcelas 1–6 da ponta e seus settlements ficam; todas as
// 12 parcelas do author permanecem.
func (suite *TransactionDeleteTestWithDBSuite) TestPontaDeleteSplitCurrentAndFuture() {
	ctx := context.Background()

	author, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	ponta, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, author.ID, ponta.ID, 50)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, author)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, author)
	suite.Require().NoError(err)

	installments := 12
	keep := 6 // parcelas 1..6 permanecem para a ponta
	_, err = suite.Services.Transaction.Create(ctx, author.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "Recurring split",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	pontaTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &ponta.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(pontaTxs, installments)

	target := pontaTxs[keep] // parcela 7 (índice 6)
	suite.Require().Equal(keep+1, lo.FromPtr(target.InstallmentNumber))

	err = suite.Services.Transaction.Delete(ctx, ponta.ID, target.ID, domain.TransactionPropagationSettingsCurrentAndFuture)
	suite.Require().NoError(err)

	pontaTxs, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaTxs, keep, "a ponta mantém as parcelas 1..6")
	for _, t := range pontaTxs {
		suite.Assert().LessOrEqual(lo.FromPtr(t.InstallmentNumber), keep)
	}

	authorTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &author.ID, AccountIDs: []int{account.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(authorTxs, installments, "todas as parcelas do author permanecem")

	settlements, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(settlements, keep, "settlements das parcelas 7..12 removidos")
}

// Cenário B (transação em conta compartilhada): a ponta apaga sua tx e ambos os
// lados são removidos. Sem settlement.
func (suite *TransactionDeleteTestWithDBSuite) TestPontaDeleteSharedAccountCurrent() {
	ctx := context.Background()

	author, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	ponta, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, author)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, author.ID, ponta.ID, 50)
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, author.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       conn.FromAccountID, // conta compartilhada do author
		CategoryID:      category.ID,
		Amount:          100,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "Shared account expense",
	})
	suite.Require().NoError(err)

	pontaTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Require().Len(pontaTxs, 1)
	pontaTx := pontaTxs[0]

	err = suite.Services.Transaction.Delete(ctx, ponta.ID, pontaTx.ID, domain.TransactionPropagationSettingsCurrent)
	suite.Require().NoError(err)

	pontaTxs, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaTxs, 0, "lado da ponta apagado")

	authorTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &author.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(authorTxs, 0, "lado do author também apagado")

	time.Sleep(200 * time.Millisecond)
	notifs, err := suite.Services.Notification.List(ctx, author.ID, domain.NotificationFilter{Limit: 100})
	suite.Require().NoError(err)
	var found *domain.Notification
	for _, n := range notifs.Items {
		if n.Type == domain.NotificationTypeSharedTransactionDeleted {
			found = n
			break
		}
	}
	suite.Require().NotNil(found, "author recebe notificação shared_transaction_deleted")
	suite.Assert().Equal(int64(100), lo.FromPtr(found.Amount))
	suite.Assert().Equal("Shared account expense", lo.FromPtr(found.Description))
	suite.Assert().Equal(0, found.EntityID, "sem alvo de navegação (tx do author apagada)")
}

// Cenário B recorrente, propagação 'all': a ponta apaga uma parcela e ambos os
// lados (e as duas recorrências) são removidos por completo.
func (suite *TransactionDeleteTestWithDBSuite) TestPontaDeleteSharedAccountAll() {
	ctx := context.Background()

	author, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	ponta, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, author)
	suite.Require().NoError(err)
	conn, err := suite.createAcceptedTestUserConnection(ctx, author.ID, ponta.ID, 50)
	suite.Require().NoError(err)

	installments := 12
	_, err = suite.Services.Transaction.Create(ctx, author.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       conn.FromAccountID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "Recurring shared account",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
	})
	suite.Require().NoError(err)

	authorTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &author.ID})
	suite.Require().NoError(err)
	suite.Require().Len(authorTxs, installments)
	authorRecurrenceID := authorTxs[0].TransactionRecurrenceID
	suite.Require().NotNil(authorRecurrenceID)

	pontaTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Require().Len(pontaTxs, installments)
	pontaRecurrenceID := pontaTxs[0].TransactionRecurrenceID
	suite.Require().NotNil(pontaRecurrenceID)

	err = suite.Services.Transaction.Delete(ctx, ponta.ID, pontaTxs[0].ID, domain.TransactionPropagationSettingsAll)
	suite.Require().NoError(err)

	pontaTxs, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaTxs, 0)

	authorTxs, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &author.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(authorTxs, 0)

	authorRecs, err := suite.Repos.TransactionRecurrence.Search(ctx, domain.TransactionRecurrenceFilter{
		IDs:    []int{*authorRecurrenceID},
		UserID: author.ID,
	})
	suite.Require().NoError(err)
	suite.Assert().Len(authorRecs, 0, "recorrência do author limpa")

	pontaRecs, err := suite.Repos.TransactionRecurrence.Search(ctx, domain.TransactionRecurrenceFilter{
		IDs:    []int{*pontaRecurrenceID},
		UserID: ponta.ID,
	})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaRecs, 0, "recorrência da ponta limpa")
}

func TestTransactionDelete(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
		suite.Run(t, new(TransactionDeleteTestSuite))
		return
	}

	suite.Run(t, new(TransactionDeleteTestWithDBSuite))
}
