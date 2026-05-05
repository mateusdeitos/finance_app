package service

import (
	"context"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
	"github.com/stretchr/testify/suite"
)

type SettlementServiceWithDBTestSuite struct {
	ServiceTestWithDBSuite
}

// createSharedExpense creates a shared expense between user1 (author) and user2
// via the given connection, and returns the author's transaction (with linked
// transactions and settlements preloaded) and the date used for the source
// transaction.
func (suite *SettlementServiceWithDBTestSuite) createSharedExpense(
	ctx context.Context,
	user1, user2 *domain.User,
	account *domain.Account,
	connection *domain.UserConnection,
	amount int64,
	d time.Time,
) *domain.Transaction {
	_, err := suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		Amount:          amount,
		Date:            domain.Date{Time: d},
		Description:     "shared expense",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:          &user1.ID,
		AccountIDs:      []int{account.ID},
		WithSettlements: true,
	})
	suite.Require().NoError(err)
	suite.Require().Len(transactions, 1)
	suite.Require().Len(transactions[0].SettlementsFromSource, 1)

	return transactions[0]
}

// TestCreatedSettlementInheritsSourceDate verifies that a settlement created
// via the split flow inherits the source transaction's date by default.
func (suite *SettlementServiceWithDBTestSuite) TestCreatedSettlementInheritsSourceDate() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)

	connection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	d := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	source := suite.createSharedExpense(ctx, user1, user2, account, connection, 10000, d)

	settlement := source.SettlementsFromSource[0]
	suite.Assert().Equal(d, settlement.Date, "settlement.Date should inherit source transaction date")
}

// TestUpdateDatePersistsCustomDateAndSurvivesSourceUpdate covers the core
// acceptance criteria: a customized settlement date is preserved when the
// source transaction is later edited.
func (suite *SettlementServiceWithDBTestSuite) TestUpdateDatePersistsCustomDateAndSurvivesSourceUpdate() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)

	connection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	originalDate := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	source := suite.createSharedExpense(ctx, user1, user2, account, connection, 10000, originalDate)
	settlement := source.SettlementsFromSource[0]

	// Customize the settlement date.
	customDate := time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC)
	err = suite.Services.Settlement.UpdateDate(ctx, user1.ID, settlement.ID, customDate)
	suite.Require().NoError(err)

	// Editing the source transaction's date must NOT overwrite the customized
	// settlement date.
	newSourceDate := time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC)
	err = suite.Services.Transaction.Update(ctx, source.ID, user1.ID, &domain.TransactionUpdateRequest{
		Date:                lo.ToPtr(domain.Date{Time: newSourceDate}),
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
	})
	suite.Require().NoError(err)

	updated, err := suite.Services.Settlement.SearchOne(ctx, domain.SettlementFilter{
		IDs: []int{settlement.ID},
	})
	suite.Require().Error(err, "settlement is recreated by sync, original ID is gone")
	_ = updated

	// Re-fetch by source transaction id; the recreated settlement should still
	// carry the customized date.
	settlements, err := suite.Services.Settlement.Search(ctx, domain.SettlementFilter{
		SourceTransactionIDs: []int{source.ID},
	})
	suite.Require().NoError(err)
	suite.Require().Len(settlements, 1)
	suite.Assert().Equal(customDate, settlements[0].Date,
		"settlement date should be preserved after source transaction update")
}

// TestUpdateDateForbiddenForOtherUser verifies the ownership check rejects
// callers that don't own the settlement.
func (suite *SettlementServiceWithDBTestSuite) TestUpdateDateForbiddenForOtherUser() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	otherUser, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)
	connection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	d := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	source := suite.createSharedExpense(ctx, user1, user2, account, connection, 10000, d)
	settlement := source.SettlementsFromSource[0]

	// otherUser is not the settlement owner.
	err = suite.Services.Settlement.UpdateDate(
		ctx,
		otherUser.ID,
		settlement.ID,
		time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC),
	)
	suite.Require().Error(err)

	svcErr, ok := pkgErrors.AsServiceError(err)
	suite.Require().True(ok, "expected *ServiceError, got %T", err)
	suite.Assert().Equal(pkgErrors.ErrCodeForbidden, svcErr.Code)
	suite.Assert().Contains(svcErr.Tags, string(pkgErrors.ErrorTagSettlementForbidden))
}

// TestSyntheticSettlementListingFiltersByCustomDate verifies that the
// orphaned-settlement query (used by the listing of the counterpart user's
// shared account) returns rows based on the settlement's own date, not the
// source transaction's date.
func (suite *SettlementServiceWithDBTestSuite) TestSyntheticSettlementListingFiltersByCustomDate() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)
	connection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	// Source date in March, settlement customized into April.
	sourceDate := time.Date(2026, 3, 28, 0, 0, 0, 0, time.UTC)
	source := suite.createSharedExpense(ctx, user1, user2, account, connection, 10000, sourceDate)
	settlement := source.SettlementsFromSource[0]

	customDate := time.Date(2026, 4, 5, 0, 0, 0, 0, time.UTC)
	err = suite.Services.Settlement.UpdateDate(ctx, user1.ID, settlement.ID, customDate)
	suite.Require().NoError(err)

	aprilStart := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	aprilEnd := time.Date(2026, 4, 30, 23, 59, 59, 0, time.UTC)

	// The synthetic settlement row appears on user1's connection account
	// (FromAccountID), not the private account where the source lives.
	orphans, err := suite.Repos.Transaction.FindOrphanedSettlementTransactions(ctx, domain.TransactionFilter{
		UserID:     &user1.ID,
		AccountIDs: []int{connection.FromAccountID},
		StartDate: &domain.ComparableSearch[time.Time]{
			GreaterThanOrEqual: &aprilStart,
		},
		EndDate: &domain.ComparableSearch[time.Time]{
			LessThanOrEqual: &aprilEnd,
		},
	})
	suite.Require().NoError(err)
	suite.Require().Len(orphans, 1, "April filter should include the customized settlement row")
	suite.Assert().Equal(customDate, orphans[0].Date)

	// The same period filtered against March (source date month) must NOT
	// match anymore — the row's effective date is April.
	marchStart := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	marchEnd := time.Date(2026, 3, 31, 23, 59, 59, 0, time.UTC)
	orphansMarch, err := suite.Repos.Transaction.FindOrphanedSettlementTransactions(ctx, domain.TransactionFilter{
		UserID:     &user1.ID,
		AccountIDs: []int{connection.FromAccountID},
		StartDate:  &domain.ComparableSearch[time.Time]{GreaterThanOrEqual: &marchStart},
		EndDate:    &domain.ComparableSearch[time.Time]{LessThanOrEqual: &marchEnd},
	})
	suite.Require().NoError(err)
	suite.Assert().Len(orphansMarch, 0, "March filter should not include April settlement")
}

func TestSettlementServiceWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}
	suite.Run(t, new(SettlementServiceWithDBTestSuite))
}
