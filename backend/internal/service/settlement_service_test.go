package service

import (
	"context"
	"slices"
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
	category, err := suite.createTestCategory(ctx, user1)
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
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
	// settlement date. The caller resends the existing split so the flow does
	// not interpret the absent split as a removal.
	newSourceDate := time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC)
	err = suite.Services.Transaction.Update(ctx, source.ID, user1.ID, &domain.TransactionUpdateRequest{
		Date:                lo.ToPtr(domain.Date{Time: newSourceDate}),
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	// In-place update: the original settlement.ID must survive a source
	// transaction update so concurrent callers (e.g. a bulk action targeting
	// settlement.ID alongside the source tx update) do not get a not-found.
	updated, err := suite.Services.Settlement.SearchOne(ctx, domain.SettlementFilter{
		IDs: []int{settlement.ID},
	})
	suite.Require().NoError(err, "settlement should be updated in place; original ID survives")
	suite.Assert().Equal(customDate, updated.Date,
		"settlement date should be preserved after source transaction update")

	settlements, err := suite.Services.Settlement.Search(ctx, domain.SettlementFilter{
		SourceTransactionIDs: []int{source.ID},
	})
	suite.Require().NoError(err)
	suite.Require().Len(settlements, 1)
	suite.Assert().Equal(settlement.ID, settlements[0].ID, "settlement ID must be stable")
	suite.Assert().Equal(customDate, settlements[0].Date)
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

// TestUpdateDateNonCustomizedSettlementKeepsOriginalDateAfterSourceUpdate
// asserts the stickiness invariant from the snapshot map in
// syncSettlementsForTransaction: the existing settlement date is always
// reused on recreate, even when the user never explicitly customized it.
// This guarantees that any user-visible settlement date — once written —
// is the only authoritative source for that settlement.
func (suite *SettlementServiceWithDBTestSuite) TestUpdateDateNonCustomizedSettlementKeepsOriginalDateAfterSourceUpdate() {
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

	// Source updates to a different date; the user never touched the
	// settlement date.
	newSourceDate := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	err = suite.Services.Transaction.Update(ctx, source.ID, user1.ID, &domain.TransactionUpdateRequest{
		Date:                lo.ToPtr(domain.Date{Time: newSourceDate}),
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	settlements, err := suite.Services.Settlement.Search(ctx, domain.SettlementFilter{
		SourceTransactionIDs: []int{source.ID},
	})
	suite.Require().NoError(err)
	suite.Require().Len(settlements, 1)
	suite.Assert().Equal(originalDate, settlements[0].Date,
		"settlement date should be sticky: snapshot in sync must reuse the existing date")
}

// TestUpdateDateAmountChangeDoesNotClobberSettlementDate covers the snapshot
// path for an update that does not touch the source date at all (amount-only
// edit). The sync still tears down and recreates settlements, so the snapshot
// is the only mechanism that keeps the previously customized date.
func (suite *SettlementServiceWithDBTestSuite) TestUpdateDateAmountChangeDoesNotClobberSettlementDate() {
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

	customDate := time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC)
	err = suite.Services.Settlement.UpdateDate(ctx, user1.ID, settlement.ID, customDate)
	suite.Require().NoError(err)

	// Update only the amount — source date stays the same. Sync must still
	// preserve the customized settlement date.
	newAmount := int64(20000)
	err = suite.Services.Transaction.Update(ctx, source.ID, user1.ID, &domain.TransactionUpdateRequest{
		Amount:              &newAmount,
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	settlements, err := suite.Services.Settlement.Search(ctx, domain.SettlementFilter{
		SourceTransactionIDs: []int{source.ID},
	})
	suite.Require().NoError(err)
	suite.Require().Len(settlements, 1)
	suite.Assert().Equal(customDate, settlements[0].Date)
	suite.Assert().Equal(newAmount/2, settlements[0].Amount, "settlement amount tracks split")
}

// TestDeleteSettlementCurrentRemovesPartnerTxKeepsSource: deleting a settlement
// removes the partner's linked tx and the settlement, keeps the author's source,
// and notifies the partner.
func (suite *SettlementServiceWithDBTestSuite) TestDeleteSettlementCurrentRemovesPartnerTxKeepsSource() {
	ctx := context.Background()
	author, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	ponta, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, author)
	suite.Require().NoError(err)
	connection, err := suite.createAcceptedTestUserConnection(ctx, author.ID, ponta.ID, 50)
	suite.Require().NoError(err)

	d := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	source := suite.createSharedExpense(ctx, author, ponta, account, connection, 10000, d)
	settlement := source.SettlementsFromSource[0]

	pontaTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Require().Len(pontaTxs, 1)

	// Empty propagation (the client omits the query param for a non-recurring
	// settlement) must be treated as "current", not rejected as invalid.
	err = suite.Services.Transaction.DeleteSettlement(ctx, author.ID, settlement.ID, "")
	suite.Require().NoError(err)

	remaining, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{IDs: []int{settlement.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(remaining, 0, "settlement removed")

	pontaTxs, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaTxs, 0, "partner linked tx removed")

	authorTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &author.ID, AccountIDs: []int{account.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(authorTxs, 1, "author source transaction survives")

	time.Sleep(200 * time.Millisecond)
	notifs, err := suite.Services.Notification.List(ctx, ponta.ID, domain.NotificationFilter{Limit: 100})
	suite.Require().NoError(err)
	var found *domain.Notification
	for _, n := range notifs.Items {
		if n.Type == domain.NotificationTypeSharedTransactionDeleted {
			found = n
			break
		}
	}
	suite.Require().NotNil(found, "partner receives shared_transaction_deleted")
	suite.Assert().Equal(settlement.Amount, lo.FromPtr(found.Amount))
	suite.Assert().Equal("shared expense", lo.FromPtr(found.Description))
}

// TestDeleteSettlementForbiddenForNonOwner: only the settlement owner (author) may delete it.
func (suite *SettlementServiceWithDBTestSuite) TestDeleteSettlementForbiddenForNonOwner() {
	ctx := context.Background()
	author, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	ponta, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, author)
	suite.Require().NoError(err)
	connection, err := suite.createAcceptedTestUserConnection(ctx, author.ID, ponta.ID, 50)
	suite.Require().NoError(err)

	source := suite.createSharedExpense(ctx, author, ponta, account, connection, 10000, time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC))
	settlement := source.SettlementsFromSource[0]

	err = suite.Services.Transaction.DeleteSettlement(ctx, ponta.ID, settlement.ID, domain.TransactionPropagationSettingsCurrent)
	suite.Require().Error(err)
	svcErr, ok := pkgErrors.AsServiceError(err)
	suite.Require().True(ok, "expected *ServiceError, got %T", err)
	suite.Assert().Equal(pkgErrors.ErrCodeForbidden, svcErr.Code)
	suite.Assert().Contains(svcErr.Tags, string(pkgErrors.ErrorTagSettlementForbidden))
}

// TestDeleteSettlementAllRecurring: with propagation=all, every installment's
// settlement + partner tx is removed; the author's installments survive.
func (suite *SettlementServiceWithDBTestSuite) TestDeleteSettlementAllRecurring() {
	ctx := context.Background()
	author, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	ponta, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, author)
	suite.Require().NoError(err)
	connection, err := suite.createAcceptedTestUserConnection(ctx, author.ID, ponta.ID, 50)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, author)
	suite.Require().NoError(err)

	installments := 12
	_, err = suite.Services.Transaction.Create(ctx, author.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          10000,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "recurring shared",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
		SplitSettings: []domain.SplitSettings{{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	settlements, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}})
	suite.Require().NoError(err)
	suite.Require().Len(settlements, installments)

	err = suite.Services.Transaction.DeleteSettlement(ctx, author.ID, settlements[0].ID, domain.TransactionPropagationSettingsAll)
	suite.Require().NoError(err)

	settlements, err = suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(settlements, 0, "all settlements removed")

	pontaTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaTxs, 0, "all partner txs removed")

	authorTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &author.ID, AccountIDs: []int{account.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(authorTxs, installments, "author installments survive")
}

// TestDeleteSettlementCurrentAndFutureRecurring: with current_and_future from
// installment 7, settlements/partner txs for 7..12 are removed, 1..6 remain, and
// the author keeps all installments.
func (suite *SettlementServiceWithDBTestSuite) TestDeleteSettlementCurrentAndFutureRecurring() {
	ctx := context.Background()
	author, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	ponta, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, author)
	suite.Require().NoError(err)
	connection, err := suite.createAcceptedTestUserConnection(ctx, author.ID, ponta.ID, 50)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, author)
	suite.Require().NoError(err)

	installments := 12
	keep := 6
	_, err = suite.Services.Transaction.Create(ctx, author.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          10000,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "recurring shared",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
		SplitSettings: []domain.SplitSettings{{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	settlements, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}})
	suite.Require().NoError(err)
	suite.Require().Len(settlements, installments)
	slices.SortFunc(settlements, func(a, b *domain.Settlement) int { return a.Date.Compare(b.Date) })

	target := settlements[keep] // installment 7 (index 6)
	err = suite.Services.Transaction.DeleteSettlement(ctx, author.ID, target.ID, domain.TransactionPropagationSettingsCurrentAndFuture)
	suite.Require().NoError(err)

	settlements, err = suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(settlements, keep, "settlements 1..6 remain")

	pontaTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &ponta.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaTxs, keep, "partner txs 1..6 remain")

	authorTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &author.ID, AccountIDs: []int{account.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(authorTxs, installments, "author keeps all installments")
}

// TestDeleteSettlementAllScopedToSamePartner: on a recurring expense split with
// TWO partners, deleting partner A's settlement with propagation=all removes only
// A's settlements + txs, leaving partner B untouched.
func (suite *SettlementServiceWithDBTestSuite) TestDeleteSettlementAllScopedToSamePartner() {
	ctx := context.Background()
	author, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	pontaA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	pontaB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, author)
	suite.Require().NoError(err)
	connA, err := suite.createAcceptedTestUserConnection(ctx, author.ID, pontaA.ID, 30)
	suite.Require().NoError(err)
	connB, err := suite.createAcceptedTestUserConnection(ctx, author.ID, pontaB.ID, 30)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, author)
	suite.Require().NoError(err)

	installments := 3
	_, err = suite.Services.Transaction.Create(ctx, author.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          10000,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "recurring shared two partners",
		TransactionType: domain.TransactionTypeExpense,
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  installments,
		},
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connA.ID, Percentage: lo.ToPtr(30)},
			{ConnectionID: connB.ID, Percentage: lo.ToPtr(30)},
		},
	})
	suite.Require().NoError(err)

	// Partner A's settlements live on connA.FromAccountID (the author's shared
	// account for that connection).
	settlementsA, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}, AccountIDs: []int{connA.FromAccountID}})
	suite.Require().NoError(err)
	suite.Require().Len(settlementsA, installments)

	err = suite.Services.Transaction.DeleteSettlement(ctx, author.ID, settlementsA[0].ID, domain.TransactionPropagationSettingsAll)
	suite.Require().NoError(err)

	// A's settlements + txs gone.
	settlementsA, err = suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}, AccountIDs: []int{connA.FromAccountID}})
	suite.Require().NoError(err)
	suite.Assert().Len(settlementsA, 0, "partner A settlements removed")
	pontaATxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &pontaA.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaATxs, 0, "partner A txs removed")

	// B's settlements + txs untouched.
	settlementsB, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{author.ID}, AccountIDs: []int{connB.FromAccountID}})
	suite.Require().NoError(err)
	suite.Assert().Len(settlementsB, installments, "partner B settlements untouched")
	pontaBTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &pontaB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(pontaBTxs, installments, "partner B txs untouched")

	// Author keeps all installments.
	authorTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &author.ID, AccountIDs: []int{account.ID}})
	suite.Require().NoError(err)
	suite.Assert().Len(authorTxs, installments, "author installments survive")
}

func TestSettlementServiceWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}
	suite.Run(t, new(SettlementServiceWithDBTestSuite))
}
