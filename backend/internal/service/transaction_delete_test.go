package service

import (
	"context"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
	"github.com/stretchr/testify/suite"
)

type TransactionDeleteTestSuite struct {
	ServiceTestSuite
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

func (suite *TransactionDeleteTestSuite) TestPropagationSettingsCurrent() {
	ctx := context.Background()
	// getByID
	suite.MockTransactionRepository.EXPECT().Search(ctx, domain.TransactionFilter{
		IDs:    []int{1},
		UserID: &suite.UserID,
	}).Return([]*domain.Transaction{
		{
			ID:                      1,
			UserID:                  suite.UserID,
			TransactionRecurrenceID: lo.ToPtr(1),
		},
	}, nil)

	linkedTransactions := []*domain.Transaction{
		{
			ID:                      2,
			UserID:                  suite.UserID,
			TransactionRecurrenceID: lo.ToPtr(1),
			ParentID:                lo.ToPtr(1),
		},
		{
			ID:                      3,
			UserID:                  2,
			TransactionRecurrenceID: lo.ToPtr(2),
			ParentID:                lo.ToPtr(1),
		},
	}

	// deleteCurrentAndAllTransactionsLinked
	suite.MockTransactionRepository.EXPECT().Search(ctx, domain.TransactionFilter{
		ParentIDs: []int{1},
	}).Return(linkedTransactions, nil)

	suite.MockTransactionRepository.EXPECT().Delete(ctx, 1).Return(nil)
	for _, transaction := range linkedTransactions {
		suite.MockTransactionRepository.EXPECT().Delete(ctx, transaction.ID).Return(nil)
	}

	// deleteRecurrencesWithoutTransactions
	suite.MockTransactionRecurrenceRepository.EXPECT().Search(ctx, domain.TransactionRecurrenceFilter{
		TransactionIDs: []int{2, 3, 1},
	}).Return([]*domain.TransactionRecurrence{
		{
			ID: 1,
		},
	}, nil)

	suite.MockTransactionRecurrenceRepository.EXPECT().Delete(ctx, 2).Return(nil)

	err := suite.Services.Transaction.Delete(ctx, suite.UserID, 1, domain.TransactionPropagationSettingsCurrent)
	suite.NoError(err)
}

func TestTransactionDelete(t *testing.T) {
	suite.Run(t, new(TransactionDeleteTestSuite))
}
