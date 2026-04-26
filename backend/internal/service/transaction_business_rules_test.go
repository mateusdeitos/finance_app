package service

// ==================== Groups 2 & 3: Business Rule and Edge Case Tests ====================
// Items #4, #5, #6 from the gap doc are already covered by existing tests:
//   - TestPropagationSettingsAll / TestPropagationSettingsCurrentAndFuture
//   - TestInstallmentScenario2/3/4 (remove recurrence, 3 propagation modes)
//   - TestInstallmentScenario5/6/7 (change recurrence count)
//
// This file covers the remaining gaps:
//   7. TestCreate_MultiSplit      — expense with 2+ user connections
//   8. TestUpdate_Transfer_*      — Transfer→Transfer (same→diff, diff→same, diff→diff)
//      + Income→Transfer (missing scenario)

import (
	"context"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/samber/lo"
)

// ── 7. Multi-split create ─────────────────────────────────────────────────────

// TestCreate_MultiSplit verifies that an expense can be split across multiple
// user connections and that each connection generates a correct linked transaction.
func (suite *TransactionCreateWithDBTestSuite) TestCreate_MultiSplit() {
	ctx := context.Background()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	accountA, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	// Create 3 partner connections for userA
	connections, err := suite.createManyConnections(ctx, userA.ID, 3)
	suite.Require().NoError(err)
	suite.Require().Len(connections, 3)

	d := now()
	amount := int64(1000)
	splitPct := 25 // each partner gets 25% of the total amount

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       accountA.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          amount,
		Date:            d,
		Description:     "multi-split expense",
		SplitSettings: lo.Map(connections, func(conn *domain.UserConnection, _ int) domain.SplitSettings {
			return domain.SplitSettings{
				ConnectionID: conn.ID,
				Percentage:   lo.ToPtr(splitPct),
			}
		}),
	})
	suite.Require().NoError(err)

	// userA should have 1 main transaction on personal account
	userATxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:     &userA.ID,
		AccountIDs: []int{accountA.ID},
	})
	suite.Require().NoError(err)
	suite.Require().Len(userATxs, 1)

	ownerTx := userATxs[0]
	suite.Assert().Equal(amount, ownerTx.Amount)
	suite.Assert().Equal(domain.TransactionTypeExpense, ownerTx.Type)
	suite.Assert().Len(ownerTx.LinkedTransactions, 3, "should have 1 linked tx per connection (to only, no fromTx for shared expenses)")

	expectedLinkedAmount := int64(float64(amount) * float64(splitPct) / 100)

	// Each connection produces only a toTransaction (partner, ToAccountID) for shared expenses
	// Find each toTransaction by matching UserID to conn.ToUserID
	for i, conn := range connections {
		var toTx *domain.Transaction
		for j := range ownerTx.LinkedTransactions {
			lt := &ownerTx.LinkedTransactions[j]
			if lt.UserID == conn.ToUserID && lt.AccountID == conn.ToAccountID {
				toTx = lt
				break
			}
		}
		suite.Require().NotNilf(toTx, "should find toTransaction for connection[%d]", i)
		suite.Assert().Equalf(expectedLinkedAmount, toTx.Amount, "linked[%d].Amount", i)
		suite.Assert().Equalf(domain.TransactionTypeExpense, toTx.Type, "linked[%d].Type", i)
		suite.Assert().Equalf(domain.OperationTypeDebit, toTx.OperationType, "linked[%d].OperationType", i)
		suite.Assert().Equalf(userA.ID, lo.FromPtr(toTx.OriginalUserID), "linked[%d].OriginalUserID", i)
	}

	// Each partner should also have 1 transaction in their own view
	for i, conn := range connections {
		partnerID := conn.ToUserID
		partnerTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
			UserID: &partnerID,
		})
		suite.Require().NoError(err)
		suite.Assert().Lenf(partnerTxs, 1, "partner[%d] should have 1 transaction", i)
		suite.Assert().Equalf(expectedLinkedAmount, partnerTxs[0].Amount, "partner[%d].Amount", i)
	}
}

// ── 8a. Income → Transfer ─────────────────────────────────────────────────────

// TestUpdate_IncomeToTransfer_SameUser verifies updating an income transaction
// to a same-user transfer (INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER scenario).
func (suite *TransactionUpdateWithDBTestSuite) TestUpdate_IncomeToTransfer_SameUser() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	account2, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	d := now()
	amount := int64(500)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account1.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeIncome,
		Amount:          amount,
		Date:            d,
		Description:     "income transaction",
	})
	suite.Require().NoError(err)

	t, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{UserID: &user.ID})
	suite.Require().NoError(err)
	suite.Require().Equal(domain.TransactionTypeIncome, t.Type)

	// Update income → transfer (same user, different account)
	err = suite.Services.Transaction.Update(ctx, t.ID, user.ID, &domain.TransactionUpdateRequest{
		PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account1.ID),
		DestinationAccountID: lo.ToPtr(account2.ID),
	})
	suite.Require().NoError(err)

	updated, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{IDs: []int{t.ID}})
	suite.Require().NoError(err)

	suite.Assert().Equal(domain.TransactionTypeTransfer, updated.Type)
	suite.Assert().Equal(domain.OperationTypeDebit, updated.OperationType)
	suite.Assert().Equal(account1.ID, updated.AccountID)
	suite.Assert().Len(updated.LinkedTransactions, 1)
	suite.Assert().Equal(account2.ID, updated.LinkedTransactions[0].AccountID)
	suite.Assert().Equal(domain.OperationTypeCredit, updated.LinkedTransactions[0].OperationType)
	suite.Assert().Equal(user.ID, updated.LinkedTransactions[0].UserID)
}

// ── 8b. Transfer→Transfer (same user → different user) ────────────────────────

// TestUpdate_Transfer_SameUserToDifferentUser verifies updating a same-user
// transfer to a cross-user transfer (TRANSFER_SAME_USER_TO_DIFFERENT_USER).
func (suite *TransactionUpdateWithDBTestSuite) TestUpdate_Transfer_SameUserToDifferentUser() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	account2, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	d := now()
	amount := int64(300)

	// Create a same-user transfer
	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:            account1.ID,
		TransactionType:      domain.TransactionTypeTransfer,
		DestinationAccountID: lo.ToPtr(account2.ID),
		Amount:               amount,
		Date:                 d,
		Description:          "same-user transfer",
	})
	suite.Require().NoError(err)

	txs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(txs, 2, "same-user transfer creates 2 transactions")
	debitTx := txs[0]

	// Create a connection to userB
	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, func() int {
		userB, err := suite.createTestUser(ctx)
		suite.Require().NoError(err)
		return userB.ID
	}(), 50)
	suite.Require().NoError(err)

	// Update: same-user transfer → cross-user transfer
	err = suite.Services.Transaction.Update(ctx, debitTx.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account1.ID),
		DestinationAccountID: lo.ToPtr(conn.ToAccountID),
	})
	suite.Require().NoError(err)

	updated, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{IDs: []int{debitTx.ID}})
	suite.Require().NoError(err)

	suite.Assert().Equal(domain.TransactionTypeTransfer, updated.Type)
	suite.Assert().Len(updated.LinkedTransactions, 1)

	lt := updated.LinkedTransactions[0]
	suite.Assert().Equal(conn.ToAccountID, lt.AccountID)
	suite.Assert().Equal(conn.ToUserID, lt.UserID)
	suite.Assert().Equal(domain.OperationTypeCredit, lt.OperationType)

	// Old same-user credit transaction should be deleted
	userATxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(userATxs, 1, "only the debit side should remain for userA")
}

// ── 8c. Transfer→Transfer (different user → same user) ────────────────────────

// TestUpdate_Transfer_DifferentUserToSameUser verifies updating a cross-user
// transfer to a same-user transfer (TRANSFER_DIFFERENT_USER_TO_SAME_USER).
func (suite *TransactionUpdateWithDBTestSuite) TestUpdate_Transfer_DifferentUserToSameUser() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	account2, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	d := now()
	amount := int64(400)

	// Create a cross-user transfer
	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:            account1.ID,
		TransactionType:      domain.TransactionTypeTransfer,
		DestinationAccountID: lo.ToPtr(conn.ToAccountID),
		Amount:               amount,
		Date:                 d,
		Description:          "cross-user transfer",
	})
	suite.Require().NoError(err)

	userATxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(userATxs, 2, "cross-user transfer: 2 txs for userA (main debit + fromTx credit)")
	debitTx := userATxs[0]

	// Update: cross-user transfer → same-user transfer
	err = suite.Services.Transaction.Update(ctx, debitTx.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account1.ID),
		DestinationAccountID: lo.ToPtr(account2.ID),
	})
	suite.Require().NoError(err)

	updated, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{IDs: []int{debitTx.ID}})
	suite.Require().NoError(err)

	suite.Assert().Equal(domain.TransactionTypeTransfer, updated.Type)
	suite.Assert().Len(updated.LinkedTransactions, 1)

	lt := updated.LinkedTransactions[0]
	suite.Assert().Equal(account2.ID, lt.AccountID)
	suite.Assert().Equal(userA.ID, lt.UserID, "credit side should now belong to userA")
	suite.Assert().Equal(domain.OperationTypeCredit, lt.OperationType)

	// userB should have no transactions anymore
	userBTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(userBTxs, 0, "userB's linked transaction should be deleted")
}

// ── 8d. Transfer→Transfer (different user → different user) ───────────────────

// TestUpdate_Transfer_DifferentUserToDifferentUser verifies updating a cross-user
// transfer to another cross-user transfer (TRANSFER_DIFFERENT_USER_TO_DIFFERENT_USER).
func (suite *TransactionUpdateWithDBTestSuite) TestUpdate_Transfer_DifferentUserToDifferentUser() {
	ctx := context.Background()
	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)

	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	connAB, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	userC, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	connAC, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userC.ID, 50)
	suite.Require().NoError(err)

	d := now()
	amount := int64(600)

	// Create a cross-user transfer to userB
	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:            account1.ID,
		TransactionType:      domain.TransactionTypeTransfer,
		DestinationAccountID: lo.ToPtr(connAB.ToAccountID),
		Amount:               amount,
		Date:                 d,
		Description:          "transfer to userB",
	})
	suite.Require().NoError(err)

	userATxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &userA.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(userATxs, 2, "cross-user transfer: 2 txs for userA (main debit + fromTx credit)")
	debitTx := userATxs[0]

	// Update: cross-user transfer to userB → cross-user transfer to userC
	err = suite.Services.Transaction.Update(ctx, debitTx.ID, userA.ID, &domain.TransactionUpdateRequest{
		PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account1.ID),
		DestinationAccountID: lo.ToPtr(connAC.ToAccountID),
	})
	suite.Require().NoError(err)

	updated, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{IDs: []int{debitTx.ID}})
	suite.Require().NoError(err)

	suite.Assert().Equal(domain.TransactionTypeTransfer, updated.Type)
	suite.Assert().Len(updated.LinkedTransactions, 1)

	lt := updated.LinkedTransactions[0]
	suite.Assert().Equal(connAC.ToAccountID, lt.AccountID, "linked tx should now target userC's account")
	suite.Assert().Equal(userC.ID, lt.UserID, "linked tx should now belong to userC")
	suite.Assert().Equal(domain.OperationTypeCredit, lt.OperationType)

	// userB should have no transactions
	userBTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(userBTxs, 0, "userB's old linked transaction should be deleted")

	// userC should have 1 transaction
	userCTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userC.ID})
	suite.Require().NoError(err)
	suite.Assert().Len(userCTxs, 1, "userC should now have the credit transaction")
}

// ── Group 3 Edge cases ────────────────────────────────────────────────────────

// TestCreate_MonthlyRecurrence_DayClamping verifies that monthly recurrence
// starting on the 31st clamps to the last day of shorter months (e.g. Feb 28).
func (suite *TransactionCreateWithDBTestSuite) TestCreate_MonthlyRecurrence_DayClamping() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	// Jan 31 of a non-leap year so we can verify Feb clamping to Feb 28.
	// 2025 is not a leap year.
	jan31 := time.Date(2025, time.January, 31, 0, 0, 0, 0, time.UTC)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            jan31,
		Description:     "monthly clamp test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  4,
		},
	})
	suite.Require().NoError(err)

	installments, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installments, 4)

	expectedDates := []time.Time{
		time.Date(2025, time.January, 31, 0, 0, 0, 0, time.UTC),
		time.Date(2025, time.February, 28, 0, 0, 0, 0, time.UTC), // clamped from 31 → 28
		time.Date(2025, time.March, 31, 0, 0, 0, 0, time.UTC),
		time.Date(2025, time.April, 30, 0, 0, 0, 0, time.UTC), // April has 30 days
	}

	for i, inst := range installments {
		suite.Assert().Equalf(expectedDates[i], inst.Date, "installment[%d] date", i+1)
	}
}

// TestCreate_YearlyRecurrence_LeapYearClamping verifies that yearly recurrence
// starting on Feb 29 (leap year) clamps to Feb 28 in non-leap years.
func (suite *TransactionCreateWithDBTestSuite) TestCreate_YearlyRecurrence_LeapYearClamping() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	// Feb 29, 2024 is a valid leap year date.
	feb29 := time.Date(2024, time.February, 29, 0, 0, 0, 0, time.UTC)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            feb29,
		Description:     "yearly leap clamp test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeYearly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	})
	suite.Require().NoError(err)

	installments, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "installment_number", Order: domain.SortOrderAsc},
	})
	suite.Require().NoError(err)
	suite.Require().Len(installments, 3)

	expectedDates := []time.Time{
		time.Date(2024, time.February, 29, 0, 0, 0, 0, time.UTC), // original leap day
		time.Date(2025, time.February, 28, 0, 0, 0, 0, time.UTC), // 2025 not a leap year → clamped
		time.Date(2026, time.February, 28, 0, 0, 0, 0, time.UTC), // 2026 not a leap year → clamped
	}

	for i, inst := range installments {
		suite.Assert().Equalf(expectedDates[i], inst.Date, "installment[%d] date", i+1)
	}
}
