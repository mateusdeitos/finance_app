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

type AccountServiceTestWithDBSuite struct {
	ServiceTestWithDBSuite
}

func (suite *AccountServiceTestWithDBSuite) accountExists(ctx context.Context, userID, id int) bool {
	accounts, err := suite.Repos.Account.Search(ctx, domain.AccountSearchOptions{
		UserIDs: []int{userID},
		IDs:     []int{id},
	})
	suite.NoError(err)
	return len(accounts) > 0
}

// TestDeleteAccountNoTransactions hard-deletes an account with no transactions
// without requiring a strategy.
func (suite *AccountServiceTestWithDBSuite) TestDeleteAccountNoTransactions() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	err = suite.Services.Account.Delete(ctx, user.ID, account.ID, "", nil)
	suite.NoError(err)
	suite.False(suite.accountExists(ctx, user.ID, account.ID), "account should be gone")
}

// TestDeleteAccountWithTransactionsRequiresStrategy rejects deletion when the
// account has transactions but no strategy is provided.
func (suite *AccountServiceTestWithDBSuite) TestDeleteAccountWithTransactionsRequiresStrategy() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "expense",
		TransactionType: domain.TransactionTypeExpense,
	})
	suite.Require().NoError(err)

	err = suite.Services.Account.Delete(ctx, user.ID, account.ID, "", nil)
	suite.Error(err)
	suite.Equal(pkgErrors.ErrAccountHasLinkedTransactions, err)
	suite.True(suite.accountExists(ctx, user.ID, account.ID), "account should still exist")
}

// TestDeleteAccountDeleteTransactionsStrategy_SharedExpense ensures that deleting
// a private account that holds a shared expense tears down the whole group: the
// author's main transaction is gone and the partner's mirror is removed too, so
// the shared account stays balanced. The connection account itself survives.
func (suite *AccountServiceTestWithDBSuite) TestDeleteAccountDeleteTransactionsStrategy_SharedExpense() {
	ctx := context.Background()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	privateAccount, err := suite.createTestAccount(ctx, userA)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, userA)
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, userA.ID, &domain.TransactionCreateRequest{
		AccountID:       privateAccount.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "shared expense",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: conn.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	// Sanity: partner has a mirror transaction before deletion.
	partnerBefore, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.Require().NoError(err)
	suite.Len(partnerBefore, 1, "partner should have the mirror transaction")

	err = suite.Services.Account.Delete(ctx, userA.ID, privateAccount.ID, domain.AccountDeletionStrategyDeleteTransactions, nil)
	suite.NoError(err)

	suite.False(suite.accountExists(ctx, userA.ID, privateAccount.ID), "private account should be gone")

	authorTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userA.ID})
	suite.NoError(err)
	suite.Len(authorTxs, 0, "author transactions should be gone")

	partnerTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &userB.ID})
	suite.NoError(err)
	suite.Len(partnerTxs, 0, "partner mirror transaction should be removed too")

	settlements, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{UserIDs: []int{userA.ID}})
	suite.NoError(err)
	suite.Len(settlements, 0, "settlement should be removed")

	// The connection account must survive the delete.
	suite.True(suite.accountExists(ctx, userA.ID, conn.FromAccountID), "connection account should survive")
}

// TestDeleteAccountMigrateStrategy moves transactions to another account, then
// deletes the original.
func (suite *AccountServiceTestWithDBSuite) TestDeleteAccountMigrateStrategy() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	source, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	target, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       source.ID,
		CategoryID:      category.ID,
		Amount:          250,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "to migrate",
		TransactionType: domain.TransactionTypeExpense,
	})
	suite.Require().NoError(err)

	err = suite.Services.Account.Delete(ctx, user.ID, source.ID, domain.AccountDeletionStrategyMigrate, &target.ID)
	suite.NoError(err)

	suite.False(suite.accountExists(ctx, user.ID, source.ID), "source account should be gone")

	targetTxs, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:     &user.ID,
		AccountIDs: []int{target.ID},
	})
	suite.NoError(err)
	suite.Len(targetTxs, 1, "transaction should have migrated to the target account")
}

// TestDeleteAccountMigrateInvalidTarget rejects a missing/invalid target.
func (suite *AccountServiceTestWithDBSuite) TestDeleteAccountMigrateInvalidTarget() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	source, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       source.ID,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            domain.Date{Time: time.Now().UTC()},
		Description:     "expense",
		TransactionType: domain.TransactionTypeExpense,
	})
	suite.Require().NoError(err)

	// Migrating to itself is invalid.
	err = suite.Services.Account.Delete(ctx, user.ID, source.ID, domain.AccountDeletionStrategyMigrate, &source.ID)
	suite.Error(err)
	suite.Equal(pkgErrors.ErrAccountInvalidMigrationTarget, err)
	suite.True(suite.accountExists(ctx, user.ID, source.ID))
}

// TestDeleteConnectionAccountBlocked ensures connection accounts cannot be deleted.
func (suite *AccountServiceTestWithDBSuite) TestDeleteConnectionAccountBlocked() {
	ctx := context.Background()

	userA, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	userB, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	conn, err := suite.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	suite.Require().NoError(err)

	err = suite.Services.Account.Delete(ctx, userA.ID, conn.FromAccountID, "", nil)
	suite.Error(err)
	suite.Equal(pkgErrors.ErrAccountCannotDeleteConnectionAccount, err)
	suite.True(suite.accountExists(ctx, userA.ID, conn.FromAccountID), "connection account must remain")
}

// TestGetDeletionInfo reports the number of linked transactions.
func (suite *AccountServiceTestWithDBSuite) TestGetDeletionInfo() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	for i := 0; i < 2; i++ {
		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
			AccountID:       account.ID,
			CategoryID:      category.ID,
			Amount:          100,
			Date:            domain.Date{Time: time.Now().UTC()},
			Description:     "expense",
			TransactionType: domain.TransactionTypeExpense,
		})
		suite.Require().NoError(err)
	}

	info, err := suite.Services.Account.GetDeletionInfo(ctx, user.ID, account.ID)
	suite.NoError(err)
	suite.Equal(int64(2), info.TransactionCount)
}

// TestReorderAccounts persists a new account order.
func (suite *AccountServiceTestWithDBSuite) TestReorderAccounts() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	acc1, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	acc2, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)
	acc3, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	// Reorder to acc3, acc1, acc2.
	desired := []int{acc3.ID, acc1.ID, acc2.ID}
	err = suite.Services.Account.Reorder(ctx, user.ID, desired)
	suite.NoError(err)

	accounts, err := suite.Repos.Account.Search(ctx, domain.AccountSearchOptions{UserIDs: []int{user.ID}})
	suite.NoError(err)
	suite.Require().Len(accounts, 3)
	got := []int{accounts[0].ID, accounts[1].ID, accounts[2].ID}
	suite.Equal(desired, got, "accounts should follow the persisted order")
}

func TestAccountService(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
		return
	}
	suite.Run(t, new(AccountServiceTestWithDBSuite))
}
