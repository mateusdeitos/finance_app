package service

import (
	"context"
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

func TestTransactionDelete(t *testing.T) {
	suite.Run(t, new(TransactionDeleteTestSuite))

	suite.Run(t, new(TransactionDeleteTestWithDBSuite))
}
