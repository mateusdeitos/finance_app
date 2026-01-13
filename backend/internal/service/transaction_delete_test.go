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

func (suite *TransactionDeleteTestSuite) TestTransactionParentNotFound() {
	suite.MockTransactionRepository.EXPECT().Search(context.Background(), domain.TransactionFilter{
		IDs:    []int{1},
		UserID: &suite.UserID,
	}).Return([]*domain.Transaction{
		{
			ID:       1,
			ParentID: lo.ToPtr(2),
			UserID:   suite.UserID,
		},
	}, nil)

	suite.MockTransactionRepository.EXPECT().Search(context.Background(), domain.TransactionFilter{
		IDs: []int{2},
	}).Return([]*domain.Transaction{}, nil)

	ctx := context.Background()
	err := suite.Services.Transaction.Delete(ctx, 1, 1, domain.TransactionPropagationSettingsCurrent)
	suite.Error(err)
	suite.Equal(pkgErrors.NotFound("parent transaction"), err)
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

	err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:        domain.RecurrenceTypeMonthly,
			Repetitions: lo.ToPtr(installments),
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

	err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:        domain.RecurrenceTypeMonthly,
			Repetitions: lo.ToPtr(installments),
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

	err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:        domain.RecurrenceTypeMonthly,
			Repetitions: lo.ToPtr(installments),
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

func (suite *TransactionDeleteTestWithDBSuite) TestPropagationSettingsCurrentWithLinkedTransactionsUsingOwnedChildTransaction() {
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

	err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
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
	assert.Len(suite.T(), transactionsUser1, 2, "should create one expense and one income transaction")

	var originalTransaction *domain.Transaction
	var incomeTransaction *domain.Transaction

	for _, transaction := range transactionsUser1 {
		switch transaction.Type {
		case domain.TransactionTypeExpense:
			originalTransaction = transaction
		case domain.TransactionTypeIncome:
			incomeTransaction = transaction
		}
	}

	assert.NotNil(suite.T(), originalTransaction)
	assert.NotNil(suite.T(), incomeTransaction)

	assert.Equal(suite.T(), int64(100), originalTransaction.Amount)
	assert.Nil(suite.T(), originalTransaction.ParentID)
	assert.Equal(suite.T(), account.ID, originalTransaction.AccountID)
	assert.Equal(suite.T(), category.ID, lo.FromPtr(originalTransaction.CategoryID))
	assert.Nil(suite.T(), originalTransaction.TransactionRecurrenceID, "originalTransaction.TransactionRecurrenceID should be nil")
	assert.Equal(suite.T(), user.ID, originalTransaction.UserID, "originalTransaction.UserID should be user.ID")

	assert.Equal(suite.T(), int64(50), incomeTransaction.Amount)
	assert.NotNil(suite.T(), incomeTransaction.ParentID)
	assert.Equal(suite.T(), userConnection.FromAccountID, incomeTransaction.AccountID)
	assert.Equal(suite.T(), category.ID, lo.FromPtr(incomeTransaction.CategoryID))
	assert.Nil(suite.T(), incomeTransaction.TransactionRecurrenceID, "incomeTransaction.TransactionRecurrenceID should be nil")
	assert.Equal(suite.T(), user.ID, incomeTransaction.UserID, "incomeTransaction.UserID should be user.ID")

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}

	assert.Len(suite.T(), transactionsUser2, 1, "should create one income transaction")
	assert.Equal(suite.T(), transactionsUser2[0].Amount, int64(50), "transactionsUser2[0].Amount should be 50")
	assert.NotNil(suite.T(), transactionsUser2[0].ParentID)
	assert.Equal(suite.T(), *transactionsUser2[0].ParentID, originalTransaction.ID, "transactionsUser2[0].ParentID should be originalTransaction.ID")
	assert.Equal(suite.T(), transactionsUser2[0].Type, domain.TransactionTypeExpense, "transactionsUser2[0].Type should be domain.TransactionTypeExpense")
	assert.Equal(suite.T(), userConnection.ToAccountID, transactionsUser2[0].AccountID)
	assert.Nil(suite.T(), transactionsUser2[0].CategoryID)
	assert.Equal(suite.T(), userConnection.ToUserID, transactionsUser2[0].UserID)

	err = suite.Services.Transaction.Delete(ctx, user.ID, incomeTransaction.ID, domain.TransactionPropagationSettingsCurrent)
	suite.NoError(err)

	transactionsUser1, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, 0, "should delete the original transaction and the income transaction")

	transactionsUser2, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser2, 0, "should delete the income transaction")
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

	err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
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
	assert.Len(suite.T(), transactionsUser1, 2, "should create one expense and one income transaction")

	var originalTransaction *domain.Transaction
	var incomeTransaction *domain.Transaction

	for _, transaction := range transactionsUser1 {
		switch transaction.Type {
		case domain.TransactionTypeExpense:
			originalTransaction = transaction
		case domain.TransactionTypeIncome:
			incomeTransaction = transaction
		}
	}

	assert.NotNil(suite.T(), originalTransaction)
	assert.NotNil(suite.T(), incomeTransaction)

	assert.Equal(suite.T(), int64(100), originalTransaction.Amount)
	assert.Nil(suite.T(), originalTransaction.ParentID)
	assert.Equal(suite.T(), account.ID, originalTransaction.AccountID)
	assert.Equal(suite.T(), category.ID, lo.FromPtr(originalTransaction.CategoryID))
	assert.Nil(suite.T(), originalTransaction.TransactionRecurrenceID, "originalTransaction.TransactionRecurrenceID should be nil")
	assert.Equal(suite.T(), user.ID, originalTransaction.UserID, "originalTransaction.UserID should be user.ID")

	assert.Equal(suite.T(), int64(50), incomeTransaction.Amount)
	assert.NotNil(suite.T(), incomeTransaction.ParentID)
	assert.Equal(suite.T(), userConnection.FromAccountID, incomeTransaction.AccountID)
	assert.Equal(suite.T(), category.ID, lo.FromPtr(incomeTransaction.CategoryID))
	assert.Nil(suite.T(), incomeTransaction.TransactionRecurrenceID, "incomeTransaction.TransactionRecurrenceID should be nil")
	assert.Equal(suite.T(), user.ID, incomeTransaction.UserID, "incomeTransaction.UserID should be user.ID")

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}

	assert.Len(suite.T(), transactionsUser2, 1, "should create one income transaction")
	assert.Equal(suite.T(), transactionsUser2[0].Amount, int64(50), "transactionsUser2[0].Amount should be 50")
	assert.NotNil(suite.T(), transactionsUser2[0].ParentID)
	assert.Equal(suite.T(), *transactionsUser2[0].ParentID, originalTransaction.ID, "transactionsUser2[0].ParentID should be originalTransaction.ID")
	assert.Equal(suite.T(), transactionsUser2[0].Type, domain.TransactionTypeExpense, "transactionsUser2[0].Type should be domain.TransactionTypeExpense")
	assert.Equal(suite.T(), userConnection.ToAccountID, transactionsUser2[0].AccountID)
	assert.Nil(suite.T(), transactionsUser2[0].CategoryID)
	assert.Equal(suite.T(), userConnection.ToUserID, transactionsUser2[0].UserID)

	err = suite.Services.Transaction.Delete(ctx, user.ID, originalTransaction.ID, domain.TransactionPropagationSettingsCurrent)
	suite.NoError(err)

	transactionsUser1, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, 0, "should delete the original transaction and the income transaction")

	transactionsUser2, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser2, 0, "should delete the income transaction")
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

	err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:        domain.RecurrenceTypeMonthly,
			Repetitions: lo.ToPtr(installments),
		},
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
	assert.Len(suite.T(), transactionsUser1, installments*2, fmt.Sprintf("should create %d expense and %d income transactions", installments, installments))

	var originalTransactions []*domain.Transaction
	var incomeTransactions []*domain.Transaction

	for _, transaction := range transactionsUser1 {
		switch transaction.Type {
		case domain.TransactionTypeExpense:
			originalTransactions = append(originalTransactions, transaction)
		case domain.TransactionTypeIncome:
			incomeTransactions = append(incomeTransactions, transaction)
		}
	}

	assert.Len(suite.T(), originalTransactions, installments)
	assert.Len(suite.T(), incomeTransactions, installments)

	for i, originalTransaction := range originalTransactions {
		assert.Equal(suite.T(), int64(100), originalTransaction.Amount, fmt.Sprintf("originalTransactions[%d].Amount should be 100", i))
		assert.Nil(suite.T(), originalTransaction.ParentID, fmt.Sprintf("originalTransactions[%d].ParentID should be nil", i))
		assert.Equal(suite.T(), account.ID, originalTransaction.AccountID, fmt.Sprintf("originalTransactions[%d].AccountID should be account.ID", i))
		assert.Equal(suite.T(), category.ID, lo.FromPtr(originalTransaction.CategoryID), fmt.Sprintf("originalTransactions[%d].CategoryID should be category.ID", i))
		assert.NotNil(suite.T(), originalTransaction.TransactionRecurrenceID, fmt.Sprintf("originalTransactions[%d].TransactionRecurrenceID should not be nil", i))
		assert.Equal(suite.T(), user.ID, originalTransaction.UserID, fmt.Sprintf("originalTransactions[%d].UserID should be user.ID", i))
	}

	for i, incomeTransaction := range incomeTransactions {
		assert.Equal(suite.T(), int64(50), incomeTransaction.Amount, fmt.Sprintf("incomeTransactions[%d].Amount should be 50", i))
		assert.NotNil(suite.T(), incomeTransaction.ParentID, fmt.Sprintf("incomeTransactions[%d].ParentID should not be nil", i))
		assert.Equal(suite.T(), userConnection.FromAccountID, incomeTransaction.AccountID, fmt.Sprintf("incomeTransactions[%d].AccountID should be userConnection.FromAccountID", i))
		assert.Equal(suite.T(), category.ID, lo.FromPtr(incomeTransaction.CategoryID), fmt.Sprintf("incomeTransactions[%d].CategoryID should be category.ID", i))
		assert.NotNil(suite.T(), incomeTransaction.TransactionRecurrenceID, fmt.Sprintf("incomeTransactions[%d].TransactionRecurrenceID should not be nil", i))
		assert.Equal(suite.T(), user.ID, incomeTransaction.UserID, fmt.Sprintf("incomeTransactions[%d].UserID should be user.ID", i))
	}

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}

	assert.Len(suite.T(), transactionsUser2, installments, fmt.Sprintf("should create %d income transactions", installments))

	for i, transaction := range transactionsUser2 {
		assert.Equal(suite.T(), int64(50), transaction.Amount, fmt.Sprintf("transactionsUser2[%d].Amount should be 50", i))
		assert.NotNil(suite.T(), transaction.ParentID, fmt.Sprintf("transactionsUser2[%d].ParentID should not be nil", i))
		assert.Equal(suite.T(), *transaction.ParentID, originalTransactions[i].ID, fmt.Sprintf("transactionsUser2[%d].ParentID should be originalTransaction.ID", i))
		assert.Equal(suite.T(), transaction.Type, domain.TransactionTypeExpense, fmt.Sprintf("transactionsUser2[%d].Type should be domain.TransactionTypeExpense", i))
		assert.Equal(suite.T(), userConnection.ToAccountID, transaction.AccountID, fmt.Sprintf("transactionsUser2[%d].AccountID should be userConnection.ToAccountID", i))
		assert.Nil(suite.T(), transaction.CategoryID, fmt.Sprintf("transactionsUser2[%d].CategoryID should be nil", i))
		assert.NotNil(suite.T(), transaction.TransactionRecurrenceID, fmt.Sprintf("transactionsUser2[%d].TransactionRecurrenceID should not be nil", i))
		assert.Equal(suite.T(), userConnection.ToUserID, transaction.UserID, fmt.Sprintf("transactionsUser2[%d].UserID should be userConnection.ToUserID", i))
	}

	err = suite.Services.Transaction.Delete(ctx, user.ID, originalTransactions[0].ID, domain.TransactionPropagationSettingsAll)
	suite.NoError(err)

	transactionsUser1, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, 0, "should delete the original transaction and the income transaction")

	transactionsUser2, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser2, 0, "should delete the income transaction")
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

	err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "Test Transaction",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:        domain.RecurrenceTypeMonthly,
			Repetitions: lo.ToPtr(installments),
		},
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
	assert.Len(suite.T(), transactionsUser1, installments*2, fmt.Sprintf("should create %d expense and %d income transactions", installments, installments))

	var originalTransactions []*domain.Transaction
	var incomeTransactions []*domain.Transaction

	for _, transaction := range transactionsUser1 {
		switch transaction.Type {
		case domain.TransactionTypeExpense:
			originalTransactions = append(originalTransactions, transaction)
		case domain.TransactionTypeIncome:
			incomeTransactions = append(incomeTransactions, transaction)
		}
	}

	assert.Len(suite.T(), originalTransactions, installments)
	assert.Len(suite.T(), incomeTransactions, installments)

	for i, originalTransaction := range originalTransactions {
		assert.Equal(suite.T(), int64(100), originalTransaction.Amount, fmt.Sprintf("originalTransactions[%d].Amount should be 100", i))
		assert.Nil(suite.T(), originalTransaction.ParentID, fmt.Sprintf("originalTransactions[%d].ParentID should be nil", i))
		assert.Equal(suite.T(), account.ID, originalTransaction.AccountID, fmt.Sprintf("originalTransactions[%d].AccountID should be account.ID", i))
		assert.Equal(suite.T(), category.ID, lo.FromPtr(originalTransaction.CategoryID), fmt.Sprintf("originalTransactions[%d].CategoryID should be category.ID", i))
		assert.Equal(suite.T(), user.ID, originalTransaction.UserID, fmt.Sprintf("originalTransactions[%d].UserID should be user.ID", i))

		assert.NotNil(suite.T(), originalTransaction.TransactionRecurrenceID, fmt.Sprintf("originalTransactions[%d].TransactionRecurrenceID should not be nil", i))
		assert.NotNil(suite.T(), originalTransaction.InstallmentNumber, fmt.Sprintf("originalTransactions[%d].InstallmentNumber should not be nil", i))
		assert.GreaterOrEqual(suite.T(), lo.FromPtr(originalTransaction.InstallmentNumber), 1, fmt.Sprintf("originalTransactions[%d].InstallmentNumber should be greater than or equal to 1", i))
		assert.LessOrEqual(suite.T(), lo.FromPtr(originalTransaction.InstallmentNumber), installments, fmt.Sprintf("originalTransactions[%d].InstallmentNumber should be less than or equal to %d", i, installments))
	}

	for i, incomeTransaction := range incomeTransactions {
		assert.Equal(suite.T(), int64(50), incomeTransaction.Amount, fmt.Sprintf("incomeTransactions[%d].Amount should be 50", i))
		assert.NotNil(suite.T(), incomeTransaction.ParentID, fmt.Sprintf("incomeTransactions[%d].ParentID should not be nil", i))
		assert.Equal(suite.T(), userConnection.FromAccountID, incomeTransaction.AccountID, fmt.Sprintf("incomeTransactions[%d].AccountID should be userConnection.FromAccountID", i))
		assert.Equal(suite.T(), category.ID, lo.FromPtr(incomeTransaction.CategoryID), fmt.Sprintf("incomeTransactions[%d].CategoryID should be category.ID", i))
		assert.Equal(suite.T(), user.ID, incomeTransaction.UserID, fmt.Sprintf("incomeTransactions[%d].UserID should be user.ID", i))

		assert.NotNil(suite.T(), incomeTransaction.TransactionRecurrenceID, fmt.Sprintf("incomeTransactions[%d].TransactionRecurrenceID should not be nil", i))
		assert.NotNil(suite.T(), incomeTransaction.InstallmentNumber, fmt.Sprintf("incomeTransactions[%d].InstallmentNumber should not be nil", i))
		assert.GreaterOrEqual(suite.T(), lo.FromPtr(incomeTransaction.InstallmentNumber), 1, fmt.Sprintf("incomeTransactions[%d].InstallmentNumber should be greater than or equal to 1", i))
		assert.LessOrEqual(suite.T(), lo.FromPtr(incomeTransaction.InstallmentNumber), installments, fmt.Sprintf("incomeTransactions[%d].InstallmentNumber should be less than or equal to %d", i, installments))
	}

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}

	assert.Len(suite.T(), transactionsUser2, installments, fmt.Sprintf("should create %d income transactions", installments))

	for i, transaction := range transactionsUser2 {
		assert.Equal(suite.T(), int64(50), transaction.Amount, fmt.Sprintf("transactionsUser2[%d].Amount should be 50", i))
		assert.NotNil(suite.T(), transaction.ParentID, fmt.Sprintf("transactionsUser2[%d].ParentID should not be nil", i))
		assert.Equal(suite.T(), *transaction.ParentID, originalTransactions[i].ID, fmt.Sprintf("transactionsUser2[%d].ParentID should be originalTransaction.ID", i))
		assert.Equal(suite.T(), transaction.Type, domain.TransactionTypeExpense, fmt.Sprintf("transactionsUser2[%d].Type should be domain.TransactionTypeExpense", i))
		assert.Equal(suite.T(), userConnection.ToAccountID, transaction.AccountID, fmt.Sprintf("transactionsUser2[%d].AccountID should be userConnection.ToAccountID", i))
		assert.Nil(suite.T(), transaction.CategoryID, fmt.Sprintf("transactionsUser2[%d].CategoryID should be nil", i))
		assert.Equal(suite.T(), userConnection.ToUserID, transaction.UserID, fmt.Sprintf("transactionsUser2[%d].UserID should be userConnection.ToUserID", i))

		assert.NotNil(suite.T(), transaction.TransactionRecurrenceID, fmt.Sprintf("transactionsUser2[%d].TransactionRecurrenceID should not be nil", i))
		assert.NotNil(suite.T(), transaction.InstallmentNumber, fmt.Sprintf("transactionsUser2[%d].InstallmentNumber should not be nil", i))
		assert.GreaterOrEqual(suite.T(), lo.FromPtr(transaction.InstallmentNumber), 1, fmt.Sprintf("transactionsUser2[%d].InstallmentNumber should be greater than or equal to 1", i))
		assert.LessOrEqual(suite.T(), lo.FromPtr(transaction.InstallmentNumber), installments, fmt.Sprintf("transactionsUser2[%d].InstallmentNumber should be less than or equal to %d", i, installments))
	}

	toDelete, found := lo.Find(originalTransactions, func(transaction *domain.Transaction) bool {
		return lo.FromPtr(transaction.InstallmentNumber) == installmentsToDelete+1
	})

	assert.True(suite.T(), found, "should find the transaction to delete")

	err = suite.Services.Transaction.Delete(ctx, user.ID, toDelete.ID, domain.TransactionPropagationSettingsCurrentAndFuture)
	suite.NoError(err)

	transactionsUser1, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser1, installments*2-installmentsToDelete*2, "should delete the original transaction and the income transaction")

	for i, transaction := range transactionsUser1 {
		assert.NotNil(suite.T(), transaction.InstallmentNumber, fmt.Sprintf("transactionsUser1[%d].InstallmentNumber should not be nil", i))
		assert.Less(suite.T(), lo.FromPtr(transaction.InstallmentNumber), installmentsToDelete+1, fmt.Sprintf("transactionsUser1[%d].InstallmentNumber = %d should be less than %d", i, lo.FromPtr(transaction.InstallmentNumber), installmentsToDelete+1))
		assert.NotNil(suite.T(), transaction.TransactionRecurrenceID, fmt.Sprintf("transactionsUser1[%d].TransactionRecurrenceID should not be nil", i))
	}

	transactionsUser2, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}
	assert.Len(suite.T(), transactionsUser2, installments-installmentsToDelete, "should delete the income transaction")

	for i, transaction := range transactionsUser2 {
		assert.NotNil(suite.T(), transaction.InstallmentNumber, fmt.Sprintf("transactionsUser2[%d].InstallmentNumber should not be nil", i))
		assert.Less(suite.T(), lo.FromPtr(transaction.InstallmentNumber), installmentsToDelete+1, fmt.Sprintf("transactionsUser2[%d].InstallmentNumber = %d should be less than %d", i, lo.FromPtr(transaction.InstallmentNumber), installmentsToDelete+1))
		assert.NotNil(suite.T(), transaction.TransactionRecurrenceID, fmt.Sprintf("transactionsUser2[%d].TransactionRecurrenceID should not be nil", i))
	}
}

func TestTransactionDelete(t *testing.T) {
	suite.Run(t, new(TransactionDeleteTestSuite))

	suite.Run(t, new(TransactionDeleteTestWithDBSuite))
}
