package service

import (
	"context"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/samber/lo"
	"github.com/stretchr/testify/suite"
)

type TransactionBalanceWithDBTestSuite struct {
	ServiceTestWithDBSuite
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_NoTransactions() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	period := domain.Period{Month: int(time.Now().Month()), Year: time.Now().Year()}

	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), result.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_CreditsAndDebits() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	// income: +10000
	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          10000,
		Date:            date,
		Description:     "income",
	})
	suite.Require().NoError(err)

	// expense: -6000
	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          6000,
		Date:            date,
		Description:     "expense",
	})
	suite.Require().NoError(err)

	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(4000), result.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_IncludesSettlements() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user1)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	// User1 creates a 1000-cent expense split 50% with user2 → settlement credit of 500 for user1
	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       conn.FromAccountID,
		CategoryID:      category.ID,
		Amount:          1000,
		Date:            date,
		Description:     "split expense",
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	result, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	// expense: -1000, fromTx: -500, settlement_fromTx: +500, settlement_toTx: +500 → net = -500
	// (fromTx and its settlement cancel out; the extra settlement_toTx offsets half the expense)
	suite.Assert().Equal(int64(-500), result.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_AccountIDFilter() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	account2, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account1.ID,
		CategoryID:      category.ID,
		Amount:          5000,
		Date:            date,
		Description:     "income account1",
	})
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account2.ID,
		CategoryID:      category.ID,
		Amount:          3000,
		Date:            date,
		Description:     "income account2",
	})
	suite.Require().NoError(err)

	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account1.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(5000), result.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_CategoryIDFilter() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	category1, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)
	category2, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       account.ID,
		CategoryID:      category1.ID,
		Amount:          2000,
		Date:            date,
		Description:     "category1",
	})
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       account.ID,
		CategoryID:      category2.ID,
		Amount:          8000,
		Date:            date,
		Description:     "category2",
	})
	suite.Require().NoError(err)

	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		CategoryIDs: []int{category1.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-2000), result.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_TagIDFilter() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)
	tag, err := suite.createTestTag(ctx, user)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          4000,
		Date:            date,
		Description:     "tagged",
		Tags:            []domain.Tag{*tag},
	})
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          1000,
		Date:            date,
		Description:     "no tag",
	})
	suite.Require().NoError(err)

	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		TagIDs: []int{tag.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(4000), result.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_InvalidPeriod() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.GetBalance(ctx, user.ID, domain.Period{Month: 0, Year: 2026}, domain.BalanceFilter{})
	suite.Assert().Error(err)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_ExcludesOtherMonths() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	thisMonth := now()
	lastMonth := clampToEndOfMonth(thisMonth, thisMonth.Year(), thisMonth.Month()-1)

	period := domain.Period{Month: int(thisMonth.Month()), Year: thisMonth.Year()}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          5000,
		Date:            thisMonth,
		Description:     "this month",
	})
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          9999,
		Date:            lastMonth,
		Description:     "last month",
	})
	suite.Require().NoError(err)

	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(5000), result.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_SplitBothDirections() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	personal1, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)
	personal2, err := suite.createTestAccount(ctx, user2)
	suite.Require().NoError(err)

	category1, err := suite.createTestCategory(ctx, user1)
	suite.Require().NoError(err)
	category2, err := suite.createTestCategory(ctx, user2)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	// user1 pays 1000 from personal account, splits 50% with user2
	// → user1: expense -1000 (personal1), settlement credit +500 (conn.FromAccountID)
	// → user2: linked expense -500 (conn.ToAccountID)
	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       personal1.ID,
		CategoryID:      category1.ID,
		Amount:          1000,
		Date:            date,
		Description:     "user1 split",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	// user2 pays 800 from personal account, splits 50% with user1
	// → user2: expense -800 (personal2), settlement credit +400 (conn.ToAccountID)
	// → user1: linked expense -400 (conn.FromAccountID)
	_, err = suite.Services.Transaction.Create(ctx, user2.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       personal2.ID,
		CategoryID:      category2.ID,
		Amount:          800,
		Date:            date,
		Description:     "user2 split",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	// user1 balance: -1000 (own expense) - 500 (fromTx) + 500 (settlement_fromTx) + 500 (settlement_toTx) - 400 (toTx from user2's split) = -900
	result1, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-900), result1.Balance)

	// user2 balance: -500 (toTx from user1's split) - 800 (own expense) - 400 (fromTx) + 400 (settlement_fromTx) + 400 (settlement_toTx) = -900
	result2, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-900), result2.Balance)

	// user1 balance in connection account: -500 (fromTx, user1's split) + 500 (settlement credit) - 400 (toTx from user2's split) = -400
	resultUser1BalanceConnectionAccount, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.FromAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-400), resultUser1BalanceConnectionAccount.Balance)

	// user2 balance in connection account: -500 (toTx from user1's split) - 400 (fromTx, user2's split) + 400 (settlement credit) = -500
	resultUser2BalanceConnectionAccount, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.ToAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-500), resultUser2BalanceConnectionAccount.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_UpdateSplitExpense() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	personal1, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user1)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	// user1 pays 1000 from personal account, splits 50% with user2
	// → expense -1000 on personal1, settlement credit +500 on conn.FromAccountID
	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       personal1.ID,
		CategoryID:      category.ID,
		Amount:          1000,
		Date:            date,
		Description:     "split expense",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	// initial connection account balance: -500 (fromTx) + 500 (settlement credit) = 0
	resultConn, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.FromAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), resultConn.Balance)

	resultConn2, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.ToAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-500), resultConn2.Balance)

	// find transaction ID — filter by personal account to get the main tx only
	txs, err := suite.Services.Transaction.Search(ctx, user1.ID, period, domain.TransactionFilter{UserID: &user1.ID, AccountIDs: []int{personal1.ID}})
	suite.Require().NoError(err)
	suite.Require().Len(txs, 1)
	txID := txs[0].ID

	// update description only, keeping same split
	newDesc := "updated split expense"
	err = suite.Services.Transaction.Update(ctx, txID, user1.ID, &domain.TransactionUpdateRequest{
		Description:         &newDesc,
		Amount:              lo.ToPtr(int64(6000)),
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		SplitSettings:       []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	// personal1 filter: expense -6000 + settlement credit +3000 (source tx on personal1) = -3000
	resultAccount1, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{personal1.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-3000), resultAccount1.Balance)

	// after update, conn account: fromTx removed by update (splitHasChanged=true) + 3000 (settlement credit) = 3000
	resultConn, err = suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.FromAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(3000), resultConn.Balance)

	resultConn2, err = suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.ToAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-3000), resultConn2.Balance)
}

// ── tests where the transaction author is the to_user_id of the connection ────

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_SplitExpense_ByToUser() {
	ctx := context.Background()
	// conn: user1=from_user_id, user2=to_user_id
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	personal2, err := suite.createTestAccount(ctx, user2)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user2)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	// user2 (to_user_id) creates 1000-cent expense split 50% with user1
	// after SwapIfNeeded(user2): FromAccountID=conn.ToAccountID, ToAccountID=conn.FromAccountID
	// → user2: expense -1000 (personal2), settlement credit +500 (conn.ToAccountID)
	// → user1: linked expense -500 (conn.FromAccountID)
	_, err = suite.Services.Transaction.Create(ctx, user2.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       personal2.ID,
		CategoryID:      category.ID,
		Amount:          1000,
		Date:            date,
		Description:     "split by to_user",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	// user2 total: -1000 (expense) - 500 (fromTx) + 500 (settlement_fromTx) + 500 (settlement_toTx) = -500
	result2, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-500), result2.Balance)

	// user1 total: -500 (toTx from user2's split)
	result1, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-500), result1.Balance)

	// user2 personal account: expense -1000 + settlement_fromTx +500 (s.account_id=personal2) + settlement_toTx +500 (t.account_id=personal2 matches) = 0
	result2Personal, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{
		AccountIDs: []int{personal2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), result2Personal.Balance)

	// user2 connection account (ToAccountID): -500 (fromTx) + 500 (settlement_toTx, s.account_id=conn.ToAccountID) = 0
	result2Conn, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.ToAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), result2Conn.Balance)

	// user1 connection account (FromAccountID): -500 (toTx from user2's split)
	result1Conn, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.FromAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-500), result1Conn.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_SplitExpense_ByToUser_SplitRemoved() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	personal2, err := suite.createTestAccount(ctx, user2)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user2)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	_, err = suite.Services.Transaction.Create(ctx, user2.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       personal2.ID,
		CategoryID:      category.ID,
		Amount:          1000,
		Date:            date,
		Description:     "split by to_user",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	txs, err := suite.Services.Transaction.Search(ctx, user2.ID, period, domain.TransactionFilter{UserID: &user2.ID, AccountIDs: []int{personal2.ID}})
	suite.Require().NoError(err)
	suite.Require().Len(txs, 1)

	// remove split: no SplitSettings, no Amount change
	err = suite.Services.Transaction.Update(ctx, txs[0].ID, user2.ID, &domain.TransactionUpdateRequest{
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
	})
	suite.Require().NoError(err)

	// user2 total: -1000 (full expense, settlement and fromTx gone)
	result2, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-1000), result2.Balance)

	// user1 total: 0 (linked tx deleted)
	result1, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), result1.Balance)

	// user2 connection account: 0 (settlement deleted)
	result2Conn, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.ToAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), result2Conn.Balance)

	// user1 connection account: 0 (linked tx deleted)
	result1Conn, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.FromAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), result1Conn.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_SplitExpense_ByToUser_AmountUpdated() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	personal2, err := suite.createTestAccount(ctx, user2)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user2)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	_, err = suite.Services.Transaction.Create(ctx, user2.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       personal2.ID,
		CategoryID:      category.ID,
		Amount:          1000,
		Date:            date,
		Description:     "split by to_user",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	txs, err := suite.Services.Transaction.Search(ctx, user2.ID, period, domain.TransactionFilter{UserID: &user2.ID, AccountIDs: []int{personal2.ID}})
	suite.Require().NoError(err)
	suite.Require().Len(txs, 1)

	// update to amount=4000, same 50% split
	err = suite.Services.Transaction.Update(ctx, txs[0].ID, user2.ID, &domain.TransactionUpdateRequest{
		Amount:              lo.ToPtr(int64(4000)),
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		SplitSettings:       []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	// user2 total: -4000 (expense) + 2000 (settlement, fromTx removed by update) = -2000
	result2, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-2000), result2.Balance)

	// user1 total: -2000 (toTx from user2's split)
	result1, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-2000), result1.Balance)

	// user2 personal: expense -4000 + settlement credit +2000 (source tx on personal2) = -2000
	result2Personal, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{
		AccountIDs: []int{personal2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-2000), result2Personal.Balance)

	// user2 connection account: fromTx removed by update + 2000 (settlement credit) = 2000
	result2Conn, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.ToAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(2000), result2Conn.Balance)

	// user1 connection account: -2000 (toTx from user2's split)
	result1Conn, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.FromAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-2000), result1Conn.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_SplitExpense_ByToUser_PercentageAndAmountChanged() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	personal2, err := suite.createTestAccount(ctx, user2)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user2)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	// create: 2000, split 50% → linked=1000, settlement credit=1000
	_, err = suite.Services.Transaction.Create(ctx, user2.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       personal2.ID,
		CategoryID:      category.ID,
		Amount:          2000,
		Date:            date,
		Description:     "split by to_user",
		SplitSettings:   []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)}},
	})
	suite.Require().NoError(err)

	txs, err := suite.Services.Transaction.Search(ctx, user2.ID, period, domain.TransactionFilter{UserID: &user2.ID, AccountIDs: []int{personal2.ID}})
	suite.Require().NoError(err)
	suite.Require().Len(txs, 1)

	// update: amount=4000, percentage changes to 75% → linked=3000, settlement credit=3000
	err = suite.Services.Transaction.Update(ctx, txs[0].ID, user2.ID, &domain.TransactionUpdateRequest{
		Amount:              lo.ToPtr(int64(4000)),
		PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		SplitSettings:       []domain.SplitSettings{{ConnectionID: conn.ID, Percentage: lo.ToPtr(75)}},
	})
	suite.Require().NoError(err)

	// user2 total: -4000 + 3000 (settlement) = -1000 (fromTx deleted by SplitHasChanged)
	result2, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-1000), result2.Balance)

	// user1 total: -3000 (toTx, 75% of 4000)
	result1, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-3000), result1.Balance)

	// user2 connection account (ToAccountID): +3000 (settlement credit, fromTx deleted)
	result2Conn, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.ToAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(3000), result2Conn.Balance)

	// user1 connection account (FromAccountID): -3000 (toTx)
	result1Conn, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.FromAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-3000), result1Conn.Balance)
}

// ─────────────────────────────────────────────────────────────────────────────

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Transfer_SameUser() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	account2, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType:      domain.TransactionTypeTransfer,
		AccountID:            account1.ID,
		DestinationAccountID: lo.ToPtr(account2.ID),
		Amount:               5000,
		Date:                 date,
		Description:          "same-user transfer",
	})
	suite.Require().NoError(err)

	// total balance is zero: debit and credit cancel
	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), result.Balance)

	// source account: -5000
	resultSrc, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account1.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-5000), resultSrc.Balance)

	// destination account: +5000
	resultDst, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(5000), resultDst.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Transfer_DiffUser() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 100)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	// user1 transfers 3000 to user2's connection account
	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		TransactionType:      domain.TransactionTypeTransfer,
		AccountID:            account1.ID,
		DestinationAccountID: lo.ToPtr(conn.ToAccountID),
		Amount:               3000,
		Date:                 date,
		Description:          "diff-user transfer",
	})
	suite.Require().NoError(err)

	// user1 balance: -3000 (debit)
	result1, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-3000), result1.Balance)

	// user2 balance: +3000 (credit on connection account)
	result2, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(3000), result2.Balance)

	// user1 source account: -3000
	resultSrc, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account1.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-3000), resultSrc.Balance)

	// user2 connection account: +3000
	resultDst, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{
		AccountIDs: []int{conn.ToAccountID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(3000), resultDst.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Transfer_SameUser_AmountUpdated() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	account2, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType:      domain.TransactionTypeTransfer,
		AccountID:            account1.ID,
		DestinationAccountID: lo.ToPtr(account2.ID),
		Amount:               1000,
		Date:                 date,
		Description:          "transfer to update",
	})
	suite.Require().NoError(err)

	txs, err := suite.Services.Transaction.Search(ctx, user.ID, period, domain.TransactionFilter{UserID: &user.ID})
	suite.Require().NoError(err)
	suite.Require().Len(txs, 2)

	err = suite.Services.Transaction.Update(ctx, txs[0].ID, user.ID, &domain.TransactionUpdateRequest{
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account1.ID),
		DestinationAccountID: lo.ToPtr(account2.ID),
		Amount:               lo.ToPtr(int64(2500)),
		PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
	})
	suite.Require().NoError(err)

	// total is still zero
	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), result.Balance)

	resultSrc, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account1.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-2500), resultSrc.Balance)

	resultDst, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(2500), resultDst.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Transfer_DiffUser_AmountUpdated() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 100)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		TransactionType:      domain.TransactionTypeTransfer,
		AccountID:            account1.ID,
		DestinationAccountID: lo.ToPtr(conn.ToAccountID),
		Amount:               1000,
		Date:                 date,
		Description:          "diff-user transfer to update",
	})
	suite.Require().NoError(err)

	txs, err := suite.Services.Transaction.Search(ctx, user1.ID, period, domain.TransactionFilter{UserID: &user1.ID})
	suite.Require().NoError(err)
	suite.Require().Len(txs, 1)

	err = suite.Services.Transaction.Update(ctx, txs[0].ID, user1.ID, &domain.TransactionUpdateRequest{
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account1.ID),
		DestinationAccountID: lo.ToPtr(conn.ToAccountID),
		Amount:               lo.ToPtr(int64(4000)),
		PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
	})
	suite.Require().NoError(err)

	// user1: -4000
	result1, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-4000), result1.Balance)

	// user2: +4000
	result2, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(4000), result2.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Transfer_SameUser_DestinationChanged() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	account2, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	account3, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType:      domain.TransactionTypeTransfer,
		AccountID:            account1.ID,
		DestinationAccountID: lo.ToPtr(account2.ID),
		Amount:               2000,
		Date:                 date,
		Description:          "transfer before destination change",
	})
	suite.Require().NoError(err)

	txs, err := suite.Services.Transaction.Search(ctx, user.ID, period, domain.TransactionFilter{UserID: &user.ID})
	suite.Require().NoError(err)
	suite.Require().Len(txs, 2)

	err = suite.Services.Transaction.Update(ctx, txs[0].ID, user.ID, &domain.TransactionUpdateRequest{
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account1.ID),
		DestinationAccountID: lo.ToPtr(account3.ID),
		Amount:               lo.ToPtr(int64(2000)),
		PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
	})
	suite.Require().NoError(err)

	// account2 no longer receives: balance = 0
	resultOld, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), resultOld.Balance)

	// account3 now receives: +2000
	resultNew, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account3.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(2000), resultNew.Balance)

	// source account unchanged: -2000
	resultSrc, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account1.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-2000), resultSrc.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Transfer_SameUserToDiffUser() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 100)
	suite.Require().NoError(err)

	account1, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)
	account2, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

	// initially same-user transfer: account1 → account2
	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		TransactionType:      domain.TransactionTypeTransfer,
		AccountID:            account1.ID,
		DestinationAccountID: lo.ToPtr(account2.ID),
		Amount:               1500,
		Date:                 date,
		Description:          "transfer to redirect to diff user",
	})
	suite.Require().NoError(err)

	// user1 total = 0 before update
	resultBefore, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), resultBefore.Balance)

	txs, err := suite.Services.Transaction.Search(ctx, user1.ID, period, domain.TransactionFilter{UserID: &user1.ID})
	suite.Require().NoError(err)
	suite.Require().Len(txs, 2)

	// redirect destination to user2's connection account
	err = suite.Services.Transaction.Update(ctx, txs[0].ID, user1.ID, &domain.TransactionUpdateRequest{
		TransactionType:      lo.ToPtr(domain.TransactionTypeTransfer),
		AccountID:            lo.ToPtr(account1.ID),
		DestinationAccountID: lo.ToPtr(conn.ToAccountID),
		Amount:               lo.ToPtr(int64(1500)),
		PropagationSettings:  domain.TransactionPropagationSettingsCurrent,
	})
	suite.Require().NoError(err)

	// user1: -1500 (debit only, credit moved to user2)
	result1, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-1500), result1.Balance)

	// user2: +1500 (credit on connection account)
	result2, err := suite.Services.Transaction.GetBalance(ctx, user2.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(1500), result2.Balance)

	// user1 old destination account2: now 0
	resultOldDst, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account2.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(0), resultOldDst.Balance)
}

// ── accumulated balance tests ─────────────────────────────────────────────────

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Accumulated_NoInitialBalance() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	prevMonth := clampToEndOfMonth(now(), now().Year(), now().Month()-1)
	thisMonth := now()
	period := domain.Period{Month: int(thisMonth.Month()), Year: thisMonth.Year()}

	// expense in previous month
		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          3000,
		Date:            prevMonth,
		Description:     "prev month",
	})
	suite.Require().NoError(err)
	// income in current month
		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          2000,
		Date:            thisMonth,
		Description:     "this month",
	})
	suite.Require().NoError(err)

	// non-accumulated: only this month → +2000
	resultPeriod, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(2000), resultPeriod.Balance)

	// accumulated with no initial balance: -3000 + 2000 = -1000
	resultAccum, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{Accumulated: true})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(-1000), resultAccum.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Accumulated_WithInitialBalance() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	// create account with initial balance of 5000
	account, err := suite.Repos.Account.Create(ctx, &domain.Account{
		UserID:         user.ID,
		Name:           "account with initial balance",
		InitialBalance: 5000,
	})
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          1500,
		Date:            date,
		Description:     "expense",
	})
	suite.Require().NoError(err)

	// accumulated: 5000 (initial) - 1500 (expense) = 3500
	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{Accumulated: true})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(3500), result.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Accumulated_AccountFilter() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	account1, err := suite.Repos.Account.Create(ctx, &domain.Account{
		UserID:         user.ID,
		Name:           "account1",
		InitialBalance: 2000,
	})
	suite.Require().NoError(err)
	account2, err := suite.Repos.Account.Create(ctx, &domain.Account{
		UserID:         user.ID,
		Name:           "account2",
		InitialBalance: 8000,
	})
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account1.ID,
		CategoryID:      category.ID,
		Amount:          500,
		Date:            date,
		Description:     "income account1",
	})
	suite.Require().NoError(err)

	// accumulated for account1 only: 2000 + 500 = 2500
	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{
		Accumulated: true,
		AccountIDs:  []int{account1.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(2500), result.Balance)

	// account2 not included: 8000 initial does NOT appear
	_ = account2
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Accumulated_FalseIgnoresInitialBalance() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	account, err := suite.Repos.Account.Create(ctx, &domain.Account{
		UserID:         user.ID,
		Name:           "account with initial balance",
		InitialBalance: 99999,
	})
	suite.Require().NoError(err)

	date := now()
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}

		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          1000,
		Date:            date,
		Description:     "income",
	})
	suite.Require().NoError(err)

	// accumulated=false: initial balance is NOT included
	result, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{Accumulated: false})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(1000), result.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Accumulated_SpansMultiplePeriods() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	account, err := suite.Repos.Account.Create(ctx, &domain.Account{
		UserID:         user.ID,
		Name:           "account",
		InitialBalance: 10000,
	})
	suite.Require().NoError(err)

	twoMonthsAgo := clampToEndOfMonth(now(), now().Year(), now().Month()-2)
	lastMonth := clampToEndOfMonth(now(), now().Year(), now().Month()-1)
	thisMonth := now()
	period := domain.Period{Month: int(thisMonth.Month()), Year: thisMonth.Year()}

		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          2000,
		Date:            twoMonthsAgo,
		Description:     "two months ago",
	})
	suite.Require().NoError(err)
		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          3000,
		Date:            lastMonth,
		Description:     "last month",
	})
	suite.Require().NoError(err)
		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeIncome,
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          1000,
		Date:            thisMonth,
		Description:     "this month",
	})
	suite.Require().NoError(err)

	// single period: only +1000
	resultPeriod, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(1000), resultPeriod.Balance)

	// accumulated: 10000 - 2000 - 3000 + 1000 = 6000
	resultAccum, err := suite.Services.Transaction.GetBalance(ctx, user.ID, period, domain.BalanceFilter{Accumulated: true})
	suite.Require().NoError(err)
	suite.Assert().Equal(int64(6000), resultAccum.Balance)
}

func (suite *TransactionBalanceWithDBTestSuite) TestGetBalance_Accumulated_ConnectionAccountRejectsInitialBalance() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	// attempt to set initial_balance on a connection account via service
	err = suite.Services.Account.Update(ctx, user1.ID, &domain.Account{
		ID:             conn.FromAccountID,
		Name:           "conn account",
		InitialBalance: 5000,
	})
	suite.Require().Error(err)
	suite.Assert().Contains(err.Error(), "initial balance cannot be set on connection accounts")
}

// ─────────────────────────────────────────────────────────────────────────────

func TestTransactionBalanceWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}
	suite.Run(t, new(TransactionBalanceWithDBTestSuite))
}
