package service

import (
	"context"
	"testing"

	"github.com/finance_app/backend/internal/domain"
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

func TestTransactionUpdateWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	suite.Run(t, new(TransactionUpdateWithDBTestSuite))
}
