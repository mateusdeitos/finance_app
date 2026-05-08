package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

// hasTag is a helper to assert that a ServiceErrors contains a specific ErrorTag.
func hasTag(err error, tag pkgErrors.ErrorTag) bool {
	return pkgErrors.Is(err, pkgErrors.ServiceError{Tags: []string{string(tag)}})
}

// ==================== Group 1a: Create Validation Errors ====================

func (suite *TransactionCreateWithDBTestSuite) TestCreate_ValidationErrors() {
	ctx := context.Background()
	d := now()

	assertTag := func(err error, tag pkgErrors.ErrorTag) {
		suite.T().Helper()
		suite.Require().Error(err)
		suite.Assert().True(hasTag(err, tag), "expected error tag %s in: %v", tag, err)
	}

	suite.Run("invalid_transaction_type", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType: "invalid",
			AccountID:       1,
			CategoryID:      1,
			Amount:          100,
			Date:            domain.Date{Time: d},
			Description:     "test",
		})
		assertTag(err, pkgErrors.ErrorTagInvalidTransactionType)
	})

	suite.Run("account_id_zero", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeExpense,
			AccountID:       0,
			CategoryID:      1,
			Amount:          100,
			Date:            domain.Date{Time: d},
			Description:     "test",
		})
		assertTag(err, pkgErrors.ErrorTagInvalidAccountID)
	})

	suite.Run("category_id_zero_for_expense", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeExpense,
			AccountID:       1,
			CategoryID:      0,
			Amount:          100,
			Date:            domain.Date{Time: d},
			Description:     "test",
		})
		assertTag(err, pkgErrors.ErrorTagInvalidCategoryID)
	})

	suite.Run("category_id_zero_for_income", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeIncome,
			AccountID:       1,
			CategoryID:      0,
			Amount:          100,
			Date:            domain.Date{Time: d},
			Description:     "test",
		})
		assertTag(err, pkgErrors.ErrorTagInvalidCategoryID)
	})

	suite.Run("amount_zero", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeExpense,
			AccountID:       1,
			CategoryID:      1,
			Amount:          0,
			Date:            domain.Date{Time: d},
			Description:     "test",
		})
		assertTag(err, pkgErrors.ErrorTagAmountMustBeGreaterThanZero)
	})

	suite.Run("amount_negative", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeExpense,
			AccountID:       1,
			CategoryID:      1,
			Amount:          -100,
			Date:            domain.Date{Time: d},
			Description:     "test",
		})
		assertTag(err, pkgErrors.ErrorTagAmountMustBeGreaterThanZero)
	})

	suite.Run("date_zero", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeExpense,
			AccountID:       1,
			CategoryID:      1,
			Amount:          100,
			Date:            domain.Date{},
			Description:     "test",
		})
		assertTag(err, pkgErrors.ErrorTagDateIsRequired)
	})

	suite.Run("description_empty", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeExpense,
			AccountID:       1,
			CategoryID:      1,
			Amount:          100,
			Date:            domain.Date{Time: d},
			Description:     "",
		})
		assertTag(err, pkgErrors.ErrorTagDescriptionIsRequired)
	})

	suite.Run("description_whitespace_only", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeExpense,
			AccountID:       1,
			CategoryID:      1,
			Amount:          100,
			Date:            domain.Date{Time: d},
			Description:     "   ",
		})
		assertTag(err, pkgErrors.ErrorTagDescriptionIsRequired)
	})

	suite.Run("tag_with_empty_name", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeExpense,
			AccountID:       1,
			CategoryID:      1,
			Amount:          100,
			Date:            domain.Date{Time: d},
			Description:     "test",
			Tags:            []domain.Tag{{Name: ""}},
		})
		assertTag(err, pkgErrors.ErrorTagTagNameCannotBeEmpty)
	})

	suite.Run("transfer_without_destination_account", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType:      domain.TransactionTypeTransfer,
			AccountID:            1,
			Amount:               100,
			Date:                 domain.Date{Time: d},
			Description:          "test",
			DestinationAccountID: nil,
		})
		assertTag(err, pkgErrors.ErrorTagMissingDestinationAccount)
	})

	suite.Run("transfer_with_split_settings", func() {
		destID := 2
		_, err := suite.Services.Transaction.Create(ctx, 1, &domain.TransactionCreateRequest{
			TransactionType:      domain.TransactionTypeTransfer,
			AccountID:            1,
			Amount:               100,
			Date:                 domain.Date{Time: d},
			Description:          "test",
			DestinationAccountID: &destID,
			SplitSettings:        []domain.SplitSettings{{ConnectionID: 1, Percentage: lo.ToPtr(50)}},
		})
		assertTag(err, pkgErrors.ErrorTagSplitSettingsNotAllowedForTransfer)
	})

	suite.Run("income_with_split_settings_is_allowed", func() {
		// Build a fully-valid setup so the only thing under test is whether the
		// type validator rejects income+split (it must not). Using hardcoded ids
		// here previously made this case dependent on which prior test happened
		// to populate id=1 in the shared testcontainer DB.
		author, err := suite.createTestUser(ctx)
		suite.Require().NoError(err)
		partner, err := suite.createTestUser(ctx)
		suite.Require().NoError(err)
		account, err := suite.createTestAccount(ctx, author)
		suite.Require().NoError(err)
		category, err := suite.createTestCategory(ctx, author)
		suite.Require().NoError(err)
		connection, err := suite.createAcceptedTestUserConnection(ctx, author.ID, partner.ID, 50)
		suite.Require().NoError(err)

		_, err = suite.Services.Transaction.Create(ctx, author.ID, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeIncome,
			AccountID:       account.ID,
			CategoryID:      category.ID,
			Amount:          100,
			Date:            domain.Date{Time: d},
			Description:     "test",
			SplitSettings:   []domain.SplitSettings{{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)}},
		})
		suite.Assert().NoError(err, "income with split settings should be accepted")
	})
}

// ==================== Group 1b: Create Recurrence Validation ====================

func (suite *TransactionCreateWithDBTestSuite) TestCreate_RecurrenceValidation() {
	ctx := context.Background()
	d := now()

	assertTag := func(err error, tag pkgErrors.ErrorTag) {
		suite.T().Helper()
		suite.Require().Error(err)
		suite.Assert().True(hasTag(err, tag), "expected error tag %s in: %v", tag, err)
	}

	baseReq := func(r *domain.RecurrenceSettings) *domain.TransactionCreateRequest {
		return &domain.TransactionCreateRequest{
			TransactionType:    domain.TransactionTypeExpense,
			AccountID:          1,
			CategoryID:         1,
			Amount:             100,
			Date:               domain.Date{Time: d},
			Description:        "test",
			RecurrenceSettings: r,
		}
	}

	suite.Run("invalid_recurrence_type", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, baseReq(&domain.RecurrenceSettings{
			Type:               "invalid",
			CurrentInstallment: 1,
			TotalInstallments:  3,
		}))
		assertTag(err, pkgErrors.ErrorTagInvalidRecurrenceType)
	})

	suite.Run("current_installment_zero", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, baseReq(&domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 0,
			TotalInstallments:  3,
		}))
		assertTag(err, pkgErrors.ErrorTagRecurrenceCurrentInstallmentMustBeAtLeastOne)
	})

	suite.Run("current_installment_negative", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, baseReq(&domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: -1,
			TotalInstallments:  3,
		}))
		assertTag(err, pkgErrors.ErrorTagRecurrenceCurrentInstallmentMustBeAtLeastOne)
	})

	suite.Run("current_greater_than_total", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, baseReq(&domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 5,
			TotalInstallments:  3,
		}))
		assertTag(err, pkgErrors.ErrorTagRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent)
	})

	suite.Run("total_installments_exceeds_1000", func() {
		_, err := suite.Services.Transaction.Create(ctx, 1, baseReq(&domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  1001,
		}))
		assertTag(err, pkgErrors.ErrorTagRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo)
	})
}

// ==================== Group 1c: Update Validation Errors ====================

func (suite *TransactionUpdateWithDBTestSuite) TestUpdate_ValidationErrors() {
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
		Date:            domain.Date{Time: d},
		Description:     "base transaction",
	})
	suite.Require().NoError(err)

	assertTag := func(err error, tag pkgErrors.ErrorTag) {
		suite.T().Helper()
		suite.Require().Error(err)
		suite.Assert().True(hasTag(err, tag), "expected error tag %s in: %v", tag, err)
	}

	suite.Run("invalid_transaction_type", func() {
		invalidType := domain.TransactionType("invalid")
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			TransactionType:     &invalidType,
		})
		assertTag(err, pkgErrors.ErrorTagInvalidTransactionType)
	})

	suite.Run("amount_zero", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			Amount:              lo.ToPtr(int64(0)),
		})
		assertTag(err, pkgErrors.ErrorTagAmountMustBeGreaterThanZero)
	})

	suite.Run("amount_negative", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			Amount:              lo.ToPtr(int64(-50)),
		})
		assertTag(err, pkgErrors.ErrorTagAmountMustBeGreaterThanZero)
	})

	suite.Run("date_zero", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			Date:                &domain.Date{},
		})
		assertTag(err, pkgErrors.ErrorTagDateIsRequired)
	})

	suite.Run("description_empty", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			Description:         lo.ToPtr(""),
		})
		assertTag(err, pkgErrors.ErrorTagDescriptionIsRequired)
	})

	suite.Run("description_whitespace", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			Description:         lo.ToPtr("   "),
		})
		assertTag(err, pkgErrors.ErrorTagDescriptionIsRequired)
	})

	suite.Run("recurrence_invalid_type", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			RecurrenceSettings: &domain.RecurrenceSettings{
				Type:               "invalid",
				CurrentInstallment: 1,
				TotalInstallments:  3,
			},
		})
		assertTag(err, pkgErrors.ErrorTagInvalidRecurrenceType)
	})

	suite.Run("recurrence_current_installment_zero", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			RecurrenceSettings: &domain.RecurrenceSettings{
				Type:               domain.RecurrenceTypeMonthly,
				CurrentInstallment: 0,
				TotalInstallments:  3,
			},
		})
		assertTag(err, pkgErrors.ErrorTagRecurrenceCurrentInstallmentMustBeAtLeastOne)
	})

	suite.Run("recurrence_current_greater_than_total", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			RecurrenceSettings: &domain.RecurrenceSettings{
				Type:               domain.RecurrenceTypeMonthly,
				CurrentInstallment: 5,
				TotalInstallments:  3,
			},
		})
		assertTag(err, pkgErrors.ErrorTagRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent)
	})

	suite.Run("recurrence_total_installments_exceeds_1000", func() {
		err := suite.Services.Transaction.Update(ctx, txID, user.ID, &domain.TransactionUpdateRequest{
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
			RecurrenceSettings: &domain.RecurrenceSettings{
				Type:               domain.RecurrenceTypeMonthly,
				CurrentInstallment: 1,
				TotalInstallments:  1001,
			},
		})
		assertTag(err, pkgErrors.ErrorTagRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo)
	})
}

// TestUpdate_OwnershipValidation verifies that a user cannot update a transaction
// they do not own (getByID returns not-found for a different userID).
func (suite *TransactionUpdateWithDBTestSuite) TestUpdate_OwnershipValidation() {
	ctx := context.Background()
	d := now()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	categoryA, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	txID, err := suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       accountA.ID,
		CategoryID:      categoryA.ID,
		Amount:          100,
		Date:            domain.Date{Time: d},
		Description:     "userA transaction",
	})
	suite.Require().NoError(err)

	// userB tries to update userA's transaction — getByID filters by userID, so not found
	err = suite.Services.Transaction.Update(ctx, txID, userB.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		Description:         lo.ToPtr("updated by userB"),
	})
	suite.Require().Error(err)
	suite.Assert().True(pkgErrors.IsNotFound(err), "expected not-found error, got: %v", err)
}

// TestUpdate_ChildTransactionRejectsDisallowedField verifies that updating a linked
// (child) transaction with a disallowed field (e.g. Amount) is rejected. Allowed
// fields (date, description, category, tags) are covered by the LinkedTransaction
// tests below.
func (suite *TransactionUpdateWithDBTestSuite) TestUpdate_ChildTransactionRejectsDisallowedField() {
	ctx := context.Background()
	d := now()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	categoryA, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	// Create a split expense — this generates a linked (child) transaction for userB
	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       accountA.ID,
		CategoryID:      categoryA.ID,
		Amount:          100,
		Date:            domain.Date{Time: d},
		Description:     "split expense",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	// Fetch the child transaction that belongs to userB
	childTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userB.ID,
	})
	suite.Require().NoError(err)
	suite.Require().Len(childTxs, 1, "expected exactly one child transaction for userB")
	childTxID := childTxs[0].ID

	// userB tries to update a disallowed field on the child transaction — should be rejected
	// Amount is allowed for linked tx edits, but TransactionType is not.
	err = suite.Services.Transaction.Update(ctx, childTxID, userB.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		TransactionType:     lo.ToPtr(domain.TransactionTypeIncome),
	})
	suite.Require().Error(err)
	suite.Assert().True(
		hasTag(err, pkgErrors.ErrorTagLinkedTransactionDisallowedFieldChanged),
		"expected linked-transaction disallowed-field error, got: %v", err,
	)
}
