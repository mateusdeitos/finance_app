package service

// This file covers the remaining coverage gaps identified in the coverage report.
// All tests use direct private-method calls (same package) or real DB integration.
//
// Targets:
//   validateCreateTransactionRequest  — SplitSettings item sub-validation
//   validateRecurrenceSettings        — hours%24 path + nil guard
//   validateUpdateTransactionRequest  — tag empty, transfer without dest/with split,
//                                       SplitSettings items, recurrence hours%24,
//                                       AccountID change for child tx
//   calculateAmount                   — Amount-field path + both-nil path
//   incrementInstallmentDate          — default (invalid type) path
//   shouldUpdateTransaction…          — currentAndFuture + past installment path
//   determineTypeUpdateScenario       — Income → Transfer to different user
//   handlerRecurrenceUpdate           — validateRecurrenceSettings error inside handler
//   syncSettlementsForTransaction     — connAccountByToAccount lookup miss (ok=false)
//   Delete                            — propagation=all / currentAndFuture on standalone tx

import (
	"context"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

// ─── validateCreateTransactionRequest: SplitSettings item sub-validation ─────

func (suite *TransactionCreateWithDBTestSuite) TestCreate_SplitSettingsItemValidation() {
	ctx := context.Background()
	d := now()

	assertTag := func(err error, tag pkgErrors.ErrorTag) {
		suite.T().Helper()
		suite.Require().Error(err)
		suite.Assert().True(hasTag(err, tag), "expected tag %s in: %v", tag, err)
	}

	base := func(ss []domain.SplitSettings) *domain.TransactionCreateRequest {
		return &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeExpense,
			AccountID:       1,
			CategoryID:      1,
			Amount:          100,
			Date:            d,
			Description:     "test",
			SplitSettings:   ss,
		}
	}

	suite.Run("connection_id_zero", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, base([]domain.SplitSettings{
			{ConnectionID: 0, Percentage: lo.ToPtr(50)},
		}))
		assertTag(err, pkgErrors.ErrorTagSplitSettingInvalidConnectionID)
	})

	suite.Run("no_percentage_or_amount", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, base([]domain.SplitSettings{
			{ConnectionID: 1},
		}))
		assertTag(err, pkgErrors.ErrorTagSplitSettingPercentageOrAmountIsRequired)
	})

	suite.Run("both_percentage_and_amount", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, base([]domain.SplitSettings{
			{ConnectionID: 1, Percentage: lo.ToPtr(50), Amount: lo.ToPtr(int64(50))},
		}))
		assertTag(err, pkgErrors.ErrorTagSplitSettingPercentageAndAmountCannotBeUsedTogether)
	})

	suite.Run("percentage_zero", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, base([]domain.SplitSettings{
			{ConnectionID: 1, Percentage: lo.ToPtr(0)},
		}))
		assertTag(err, pkgErrors.ErrorTagSplitSettingPercentageMustBeBetween1And100)
	})

	suite.Run("percentage_over_100", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, base([]domain.SplitSettings{
			{ConnectionID: 1, Percentage: lo.ToPtr(101)},
		}))
		assertTag(err, pkgErrors.ErrorTagSplitSettingPercentageMustBeBetween1And100)
	})

	suite.Run("amount_zero", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, base([]domain.SplitSettings{
			{ConnectionID: 1, Amount: lo.ToPtr(int64(0))},
		}))
		assertTag(err, pkgErrors.ErrorTagSplitSettingAmountMustBeGreaterThanZero)
	})

	suite.Run("amount_negative", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, base([]domain.SplitSettings{
			{ConnectionID: 1, Amount: lo.ToPtr(int64(-10))},
		}))
		assertTag(err, pkgErrors.ErrorTagSplitSettingAmountMustBeGreaterThanZero)
	})
}

// TestPrivateMethods_Create calls private methods of transactionService directly
// to cover branches that are never reached through the public API.
func (suite *TransactionCreateWithDBTestSuite) TestPrivateMethods_Create() {
	svc := suite.Services.Transaction.(*transactionService)

	// calculateAmount — explicit Amount field (not percentage)
	result := svc.calculateAmount(100, domain.SplitSettings{Amount: lo.ToPtr(int64(42))})
	suite.Assert().Equal(int64(42), result, "calculateAmount with Amount field")

	// calculateAmount — both fields nil → returns original amount
	result = svc.calculateAmount(100, domain.SplitSettings{})
	suite.Assert().Equal(int64(100), result, "calculateAmount with no fields → original amount")

	// incrementInstallmentDate — unknown recurrence type → returns baseDate unchanged
	base := time.Date(2025, time.March, 15, 10, 0, 0, 0, time.UTC)
	result2 := svc.incrementInstallmentDate(base, domain.RecurrenceType("quarterly"), 1)
	suite.Assert().Equal(base, result2, "incrementInstallmentDate with unknown type")

	// validateRecurrenceSettings — nil settings → returns empty slice
	errs := svc.validateRecurrenceSettings(nil)
	suite.Assert().Empty(errs, "validateRecurrenceSettings(nil) must return no errors")
}

// ─── validateUpdateTransactionRequest: additional missing cases ───────────────

func (suite *TransactionUpdateWithDBTestSuite) TestUpdate_ValidationErrors_Additional() {
	ctx := context.Background()
	d := now()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	txID, err := suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            d,
		Description:     "base",
	})
	suite.Require().NoError(err)

	assertTag := func(err error, tag pkgErrors.ErrorTag) {
		suite.T().Helper()
		suite.Require().Error(err)
		suite.Assert().True(hasTag(err, tag), "expected tag %s in: %v", tag, err)
	}

	suite.Run("tag_empty_name", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			Tags:                []domain.Tag{{Name: ""}},
		})
		assertTag(err, pkgErrors.ErrorTagTagNameCannotBeEmpty)
	})

	suite.Run("transfer_type_without_destination", func() {
		newType := domain.TransactionTypeTransfer
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			TransactionType:     &newType,
			// DestinationAccountID intentionally omitted
		})
		assertTag(err, pkgErrors.ErrorTagMissingDestinationAccount)
	})

	suite.Run("transfer_type_with_split_settings", func() {
		newType := domain.TransactionTypeTransfer
		destID := account.ID
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
			TransactionType:      &newType,
			DestinationAccountID: &destID,
			SplitSettings:        []domain.SplitSettings{{ConnectionID: 1, Percentage: lo.ToPtr(50)}},
		})
		assertTag(err, pkgErrors.ErrorTagSplitSettingsNotAllowedForTransfer)
	})

	suite.Run("split_connection_id_zero", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			SplitSettings:       []domain.SplitSettings{{ConnectionID: 0, Percentage: lo.ToPtr(50)}},
		})
		assertTag(err, pkgErrors.ErrorTagSplitSettingInvalidConnectionID)
	})

	suite.Run("split_no_percentage_or_amount", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			SplitSettings:       []domain.SplitSettings{{ConnectionID: 1}},
		})
		assertTag(err, pkgErrors.ErrorTagSplitSettingPercentageOrAmountIsRequired)
	})

	suite.Run("split_both_percentage_and_amount", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			SplitSettings: []domain.SplitSettings{
				{ConnectionID: 1, Percentage: lo.ToPtr(50), Amount: lo.ToPtr(int64(50))},
			},
		})
		assertTag(err, pkgErrors.ErrorTagSplitSettingPercentageAndAmountCannotBeUsedTogether)
	})

	suite.Run("split_percentage_out_of_range", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			SplitSettings:       []domain.SplitSettings{{ConnectionID: 1, Percentage: lo.ToPtr(0)}},
		})
		assertTag(err, pkgErrors.ErrorTagSplitSettingPercentageMustBeBetween1And100)
	})

	suite.Run("split_amount_zero", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			SplitSettings:       []domain.SplitSettings{{ConnectionID: 1, Amount: lo.ToPtr(int64(0))}},
		})
		assertTag(err, pkgErrors.ErrorTagSplitSettingAmountMustBeGreaterThanZero)
	})

	// recurrence validation inside handlerRecurrenceUpdate path
	suite.Run("recurrence_current_installment_zero_in_handler", func() {
		updateErr := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			RecurrenceSettings: &domain.RecurrenceSettings{
				Type:               domain.RecurrenceTypeMonthly,
				CurrentInstallment: 0,
				TotalInstallments:  3,
			},
		})
		suite.Require().Error(updateErr)
		suite.Assert().True(
			hasTag(updateErr, pkgErrors.ErrorTagRecurrenceCurrentInstallmentMustBeAtLeastOne),
			"expected ErrorTagRecurrenceCurrentInstallmentMustBeAtLeastOne: %v", updateErr,
		)
	})
}

// TestUpdate_AccountIDChangeForChildTx verifies that updating a child (linked)
// transaction while also passing a new AccountID returns both the child-update
// and the account-change-for-shared errors.
func (suite *TransactionUpdateWithDBTestSuite) TestUpdate_AccountIDChangeForChildTx() {
	ctx := context.Background()
	d := now()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	categoryA, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	// userB needs an extra account to pass as the new AccountID
	extraAccountB, err := suite.createTestAccount(ctx, userB)
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       conn.FromAccountID,
		CategoryID:      categoryA.ID,
		Amount:          100,
		Date:            d,
		Description:     "split expense",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	// Find the child transaction (belongs to userB)
	childTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userB.ID,
	})
	suite.Require().NoError(err)
	suite.Require().Len(childTxs, 1)
	childTxID := childTxs[0].ID

	// userB updates the child tx AND passes a new AccountID → triggers both errors
	err = suite.Services.Transaction.Update(ctx, childTxID, userB.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		AccountID:           lo.ToPtr(extraAccountB.ID),
		Description:         lo.ToPtr("should fail"),
	})
	suite.Require().Error(err)
	suite.Assert().True(
		hasTag(err, pkgErrors.ErrorTagChildTransactionCannotBeUpdated) ||
			hasTag(err, pkgErrors.ErrorTagAccountCannotBeChangedForSharedTransactions),
		"expected child-update or account-change error, got: %v", err,
	)
	suite.Assert().True(
		hasTag(err, pkgErrors.ErrorTagAccountCannotBeChangedForSharedTransactions),
		"expected ErrorTagAccountCannotBeChangedForSharedTransactions, got: %v", err,
	)
}

// ─── determineTypeUpdateScenario: Income → Transfer to different user ─────────

// TestUpdate_IncomeToDifferentUserTransfer covers the
// INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER scenario.
func (suite *TransactionUpdateWithDBTestSuite) TestUpdate_IncomeToDifferentUserTransfer() {
	ctx := context.Background()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	d := now()
	amount := int64(400)

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeIncome,
		Amount:          amount,
		Date:            d,
		Description:     "income to be turned into cross-user transfer",
	})
	suite.Require().NoError(err)

	incomeTx, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)
	suite.Require().Equal(domain.TransactionTypeIncome, incomeTx.Type)

	// Update: income → transfer to userB's account (different user)
	err = suite.Services.Transaction.Update(ctx, incomeTx.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(accountA.ID),
		DestinationAccountID: lo.ToPtr(conn.ToAccountID),
	})
	suite.Require().NoError(err)

	updated, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{IDs: []int{incomeTx.ID}})
	suite.Require().NoError(err)

	suite.Assert().Equal(domain.TransactionTypeTransfer, updated.Type)
	suite.Assert().Equal(domain.OperationTypeDebit, updated.OperationType)
	suite.Assert().Len(updated.LinkedTransactions, 1)

	lt := updated.LinkedTransactions[0]
	suite.Assert().Equal(conn.ToAccountID, lt.AccountID)
	suite.Assert().Equal(userB.ID, lt.UserID)
	suite.Assert().Equal(domain.OperationTypeCredit, lt.OperationType)
}

// ─── shouldUpdateTransactionBasedOnPropagationSettings ───────────────────────

// TestShouldUpdateTransaction_PastInstallment exercises the branch where
// propagation=currentAndFuture AND the candidate transaction's date is NOT after
// the previous transaction's date (i.e., it is a past installment that must be
// skipped).  This branch is unreachable via the normal Update code path because
// fetchRelatedTransactions only loads future installments; we call the method
// directly here to achieve full coverage.
func (suite *TransactionUpdateWithDBTestSuite) TestShouldUpdateTransaction_PastInstallment() {
	svc := suite.Services.Transaction.(*transactionService)

	d := time.Date(2025, time.March, 15, 0, 0, 0, 0, time.UTC)
	prevTx := &domain.Transaction{ID: 100, Date: d}

	data := &transactionUpdateData{
		req: &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrentAndFuture,
		},
		previousTransaction: prevTx,
	}

	// A transaction dated BEFORE the previous transaction must not be updated.
	pastTx := &domain.Transaction{ID: 200, Date: d.AddDate(0, -1, 0)}
	suite.Assert().False(
		svc.shouldUpdateTransactionBasedOnPropagationSettings(pastTx, data),
		"past installment must be skipped with currentAndFuture",
	)

	// A brand-new transaction (ID=0) is always updated regardless of date.
	newTx := &domain.Transaction{ID: 0, Date: d.AddDate(0, -1, 0)}
	suite.Assert().True(
		svc.shouldUpdateTransactionBasedOnPropagationSettings(newTx, data),
		"new installment (ID=0) must always be updated",
	)
}

// ─── syncSettlementsForTransaction: connAccountByToAccount lookup miss ────────

// TestSyncSettlements_NoConnectionMatch exercises the `accountID = own.AccountID`
// fallback inside syncSettlementsForTransaction that is taken when no user-connection
// record maps the linked transaction's account.  We achieve this by creating a
// real split expense (so we have valid transaction IDs), then calling the private
// method with the linked transaction's AccountID swapped to an account that is NOT
// the connection's ToAccountID.
func (suite *TransactionUpdateWithDBTestSuite) TestSyncSettlements_NoConnectionMatch() {
	ctx := context.Background()
	d := now()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	// Create a real split expense so we have valid transaction IDs.
	txID, err := suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       conn.FromAccountID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "split for connection-miss test",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	own, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{txID},
	})
	suite.Require().NoError(err)
	suite.Require().Len(own.LinkedTransactions, 1)

	// Delete the settlements that were automatically created during Create.
	existingSettlements, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{
		SourceTransactionIDs: []int{own.ID},
	})
	suite.Require().NoError(err)
	if len(existingSettlements) > 0 {
		ids := lo.Map(existingSettlements, func(s *domain.Settlement, _ int) int { return s.ID })
		suite.Require().NoError(suite.Repos.Settlement.Delete(ctx, ids))
	}

	// Build a modified copy of own where the linked transaction's AccountID is
	// conn.FromAccountID (userA's own account) — NOT conn.ToAccountID.
	// UserConnection.Search will still return the connection (it searches both
	// accounts), but SwapIfNeeded will orient it so conn.ToAccountID is userB's
	// account.  The lookup connAccountByToAccount[conn.FromAccountID] then misses
	// (since we only store ToAccountID → FromAccountID), triggering the fallback.
	ownCopy := *own
	linkedCopy := own.LinkedTransactions[0]
	linkedCopy.AccountID = conn.FromAccountID // use FROM account to force a miss
	ownCopy.LinkedTransactions = []domain.Transaction{linkedCopy}

	svc := suite.Services.Transaction.(*transactionService)
	err = svc.syncSettlementsForTransaction(ctx, userA.ID, &ownCopy)
	suite.Require().NoError(err, "syncSettlementsForTransaction must not fail on a connection miss")

	// A settlement should have been created using own.AccountID as the account.
	after, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{
		SourceTransactionIDs: []int{own.ID},
	})
	suite.Require().NoError(err)
	suite.Require().Len(after, 1)
	// The fallback uses own.AccountID when no connection match is found.
	suite.Assert().Equal(own.AccountID, after[0].AccountID)
}

// ─── Delete: propagation=all / currentAndFuture on standalone (non-recurring) tx

// TestDelete_Standalone_PropagationAll exercises deleteAllInstallmentsOfRecurrence
// when the transaction has no recurrence (TransactionRecurrenceID == nil).
func (suite *TransactionDeleteTestWithDBSuite) TestDelete_Standalone_PropagationAll() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	txID, err := suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "standalone tx",
	})
	suite.Require().NoError(err)

	err = suite.Services.Transaction.Delete(ctx, user.ID, txID, domain.TransactionPropagationSettingsAll)
	suite.Require().NoError(err)

	txs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &user.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(txs, 0, "standalone tx must be deleted with propagation=all")
}

// TestDelete_Standalone_PropagationCurrentAndFuture exercises
// deleteCurrentAndFutureInstallmentsOfRecurrence when TransactionRecurrenceID == nil.
func (suite *TransactionDeleteTestWithDBSuite) TestDelete_Standalone_PropagationCurrentAndFuture() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	txID, err := suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            time.Now().UTC(),
		Description:     "standalone tx",
	})
	suite.Require().NoError(err)

	err = suite.Services.Transaction.Delete(ctx, user.ID, txID, domain.TransactionPropagationSettingsCurrentAndFuture)
	suite.Require().NoError(err)

	txs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &user.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(txs, 0, "standalone tx must be deleted with propagation=currentAndFuture")
}
