package service

import (
	"context"
	"fmt"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
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

func (suite *TransactionUpdateWithDBTestSuite) TestBlockUpdatesOnOtherUsersTransactions() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user 1: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user 2: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	d := now()

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		TransactionType: domain.TransactionTypeExpense,
		Amount:          100,
		Date:            d,
		Description:     "Test transaction",
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

	err = suite.Services.Transaction.Update(ctx, transactionID, user2.ID, &domain.TransactionUpdateRequest{
		Description: lo.ToPtr("Test transaction updated"),
	})
	suite.Assert().Error(err)
	suite.Assert().True(pkgErrors.IsNotFound(err))
}

func (suite *TransactionUpdateWithDBTestSuite) TestUpdateParentTransactionWithoutPropagation() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user 2: %v", err)
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

	connection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create test connection: %v", err)
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
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: connection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	t, found := lo.Find(transactions, func(t *domain.Transaction) bool {
		return t.ParentID == nil
	})

	if len(transactions) != 2 {
		suite.T().Fatalf("Expected 2 transactions, got %d", len(transactions))
	}

	if !found {
		suite.T().Fatalf("Failed to find parent transaction")
	}

	suite.Assert().NotNil(transaction)

	suite.Assert().Equal(int64(100), t.Amount)
	suite.Assert().Equal(domain.TransactionTypeExpense, t.Type)
	suite.Assert().Equal(domain.OperationTypeDebit, t.OperationType)
	suite.Assert().Equal(account.ID, t.AccountID)
	suite.Assert().Equal(category.ID, lo.FromPtr(t.CategoryID))

	suite.Assert().Len(t.Tags, 1)
	suite.Assert().Equal(tag.ID, t.Tags[0].ID)

	suite.Assert().Equal(d, t.Date)
	suite.Assert().Equal("Test transaction", t.Description)
	suite.Assert().Equal(user.ID, t.UserID)
	suite.Assert().Equal(user.ID, lo.FromPtr(t.OriginalUserID))

	transactionID := t.ID

	children, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		ParentIDs: []int{transactionID},
		SortBy: &domain.SortBy{
			Field: "user_id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get children: %v", err)
	}

	if len(children) != 2 {
		suite.T().Fatalf("Expected 2 children, got %d", len(children))
	}

	for i, child := range children {
		if i == 0 {
			suite.Assert().Equal(user.ID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, user.ID))
			suite.Assert().Equal(lo.FromPtr(child.OriginalUserID), user.ID, fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
			suite.Assert().Equal(domain.TransactionTypeIncome, child.Type, fmt.Sprintf("child[%d].Type should be %s", i, domain.TransactionTypeIncome))
			suite.Assert().Equal(domain.OperationTypeCredit, child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, domain.OperationTypeCredit))
			suite.Assert().Equal(connection.FromAccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.FromAccountID))
			suite.Assert().Equal(category.ID, lo.FromPtr(child.CategoryID), fmt.Sprintf("child[%d].CategoryID should be %d", i, category.ID))
			suite.Assert().Len(child.Tags, 1, fmt.Sprintf("child[%d].Tags should have 1 tag", i))
			suite.Assert().Equal(tag.ID, child.Tags[0].ID, fmt.Sprintf("child[%d].Tags[0].ID should be %d", i, tag.ID))
		} else {
			suite.Assert().Equal(user2.ID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, user2.ID))
			suite.Assert().Equal(lo.FromPtr(child.OriginalUserID), user.ID, fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
			suite.Assert().Equal(domain.TransactionTypeExpense, child.Type, "não deve inverter o tipo da transação para o usuário compartilhado")
			suite.Assert().Equal(domain.OperationTypeDebit, child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, domain.OperationTypeDebit))
			suite.Assert().Equal(connection.ToAccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.ToAccountID))
			suite.Assert().Nil(child.CategoryID, fmt.Sprintf("child[%d].CategoryID should be nil", i))
			suite.Assert().Len(child.Tags, 0, fmt.Sprintf("child[%d].Tags should have 0 tags", i))
		}

		suite.Assert().Equal(int64(50), child.Amount, fmt.Sprintf("child[%d].Amount should be %d", i, 50))
		suite.Assert().Equal(d, child.Date, fmt.Sprintf("child[%d].Date should be %s", i, d))
		suite.Assert().Equal("Test transaction", child.Description, fmt.Sprintf("child[%d].Description should be %s", i, "Test transaction"))
	}

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		Amount:             lo.ToPtr(int64(200)),
		TransactionType:    lo.ToPtr(domain.TransactionTypeIncome),
		AccountID:          lo.ToPtr(account2.ID),
		CategoryID:         lo.ToPtr(category2.ID),
		Tags:               []domain.Tag{*tag2},
		Date:               lo.ToPtr(d.AddDate(0, 0, 1)),
		Description:        lo.ToPtr("Test transaction updated"),
		PropagateToRelated: false,
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

	children, err = suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		ParentIDs: []int{transactionID},
		SortBy: &domain.SortBy{
			Field: "user_id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get children: %v", err)
	}

	if len(children) != 2 {
		suite.T().Fatalf("Expected 1 child, got %d", len(children))
	}

	for i, child := range children {
		if i == 0 {
			suite.Assert().Equal(user.ID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, user.ID))
			suite.Assert().Equal(lo.FromPtr(child.OriginalUserID), user.ID, fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
			suite.Assert().Equal(domain.TransactionTypeIncome, child.Type, fmt.Sprintf("child[%d].Type should be %s", i, domain.TransactionTypeIncome))
			suite.Assert().Equal(domain.OperationTypeCredit, child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, domain.OperationTypeCredit))
			suite.Assert().Equal(connection.FromAccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.FromAccountID))
			suite.Assert().Equal(category.ID, lo.FromPtr(child.CategoryID), fmt.Sprintf("child[%d].CategoryID should be %d", i, category.ID))
			suite.Assert().Len(child.Tags, 1, fmt.Sprintf("child[%d].Tags should have 1 tag", i))
			suite.Assert().Equal(tag.ID, child.Tags[0].ID, fmt.Sprintf("child[%d].Tags[0].ID should be %d", i, tag.ID))
		} else {
			suite.Assert().Equal(user2.ID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, user2.ID))
			suite.Assert().Equal(lo.FromPtr(child.OriginalUserID), user.ID, fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
			suite.Assert().Equal(domain.TransactionTypeExpense, child.Type, fmt.Sprintf("child[%d].Type should be %s", i, domain.TransactionTypeExpense))
			suite.Assert().Equal(domain.OperationTypeDebit, child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, domain.OperationTypeDebit))
			suite.Assert().Equal(connection.ToAccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.ToAccountID))
			suite.Assert().Nil(child.CategoryID, fmt.Sprintf("child[%d].CategoryID should be nil", i))
			suite.Assert().Len(child.Tags, 0, fmt.Sprintf("child[%d].Tags should have 0 tags", i))
		}

		suite.Assert().Equal(int64(50), child.Amount, fmt.Sprintf("child[%d].Amount should be %d", i, 50))
		suite.Assert().Equal(d, child.Date, fmt.Sprintf("child[%d].Date should be %s", i, d))
		suite.Assert().Equal("Test transaction", child.Description, fmt.Sprintf("child[%d].Description should be %s", i, "Test transaction"))
	}

}

func (suite *TransactionUpdateWithDBTestSuite) TestUpdateParentTransactionWithPropagation() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user 2: %v", err)
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

	connection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create test connection: %v", err)
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
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: connection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	parent, found := lo.Find(transactions, func(t *domain.Transaction) bool {
		return t.ParentID == nil
	})

	if len(transactions) != 2 {
		suite.T().Fatalf("Expected 2 transactions, got %d", len(transactions))
	}

	if !found {
		suite.T().Fatalf("Failed to find parent transaction")
	}

	suite.Assert().NotNil(transaction)

	suite.Assert().Equal(int64(100), parent.Amount)
	suite.Assert().Equal(domain.TransactionTypeExpense, parent.Type)
	suite.Assert().Equal(domain.OperationTypeDebit, parent.OperationType)
	suite.Assert().Equal(account.ID, parent.AccountID)
	suite.Assert().Equal(category.ID, lo.FromPtr(parent.CategoryID))

	suite.Assert().Len(parent.Tags, 1)
	suite.Assert().Equal(tag.ID, parent.Tags[0].ID)

	suite.Assert().Equal(d, parent.Date)
	suite.Assert().Equal("Test transaction", parent.Description)
	suite.Assert().Equal(user.ID, parent.UserID)
	suite.Assert().Equal(user.ID, lo.FromPtr(parent.OriginalUserID))

	transactionID := parent.ID

	children, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		ParentIDs: []int{transactionID},
		SortBy: &domain.SortBy{
			Field: "user_id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get children: %v", err)
	}

	if len(children) != 2 {
		suite.T().Fatalf("Expected 2 children, got %d", len(children))
	}

	for i, child := range children {
		if i == 0 {
			suite.Assert().Equal(user.ID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, user.ID))
			suite.Assert().Equal(lo.FromPtr(child.OriginalUserID), user.ID, fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
			suite.Assert().Equal(domain.TransactionTypeIncome, child.Type, fmt.Sprintf("child[%d].Type should be %s", i, domain.TransactionTypeIncome))
			suite.Assert().Equal(domain.OperationTypeCredit, child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, domain.OperationTypeCredit))
			suite.Assert().Equal(connection.FromAccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.FromAccountID))
			suite.Assert().Equal(lo.FromPtr(parent.CategoryID), lo.FromPtr(child.CategoryID), fmt.Sprintf("child[%d].CategoryID should be %d", i, lo.FromPtr(parent.CategoryID)))
			suite.Assert().Len(child.Tags, 1, fmt.Sprintf("child[%d].Tags should have 1 tag", i))
			suite.Assert().Equal(tag.ID, child.Tags[0].ID, fmt.Sprintf("child[%d].Tags[0].ID should be %d", i, tag.ID))
		} else {
			suite.Assert().Equal(user2.ID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, user2.ID))
			suite.Assert().Equal(lo.FromPtr(child.OriginalUserID), user.ID, fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
			suite.Assert().Equal(domain.TransactionTypeExpense, child.Type, "não deve inverter o tipo da transação para o usuário compartilhado")
			suite.Assert().Equal(domain.OperationTypeDebit, child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, domain.OperationTypeDebit))
			suite.Assert().Equal(connection.ToAccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.ToAccountID))
			suite.Assert().Nil(child.CategoryID, fmt.Sprintf("child[%d].CategoryID should be nil", i))
			suite.Assert().Len(child.Tags, 0, fmt.Sprintf("child[%d].Tags should have 0 tags", i))
		}

		suite.Assert().Equal(int64(50), child.Amount, fmt.Sprintf("child[%d].Amount should be %d", i, 50))
		suite.Assert().Equal(d, child.Date, fmt.Sprintf("child[%d].Date should be %s", i, d))
		suite.Assert().Equal("Test transaction", child.Description, fmt.Sprintf("child[%d].Description should be %s", i, "Test transaction"))
	}

	updatedDate := d.AddDate(0, 0, 1)

	err = suite.Services.Transaction.Update(ctx, transactionID, user.ID, &domain.TransactionUpdateRequest{
		Amount:             lo.ToPtr(int64(200)),
		TransactionType:    lo.ToPtr(domain.TransactionTypeIncome),
		AccountID:          lo.ToPtr(account2.ID),
		CategoryID:         lo.ToPtr(category2.ID),
		Tags:               []domain.Tag{*tag2},
		Date:               lo.ToPtr(updatedDate),
		Description:        lo.ToPtr("Test transaction updated"),
		PropagateToRelated: true,
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	parent, err = suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{transactionID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().NotNil(parent)
	suite.Assert().NoError(err)
	suite.Assert().Equal(int64(200), parent.Amount)
	suite.Assert().Equal(domain.TransactionTypeIncome, parent.Type)
	suite.Assert().Equal(domain.OperationTypeCredit, parent.OperationType)
	suite.Assert().Equal(account2.ID, parent.AccountID)
	suite.Assert().Equal(category2.ID, lo.FromPtr(parent.CategoryID))

	suite.Assert().Len(parent.Tags, 1)
	suite.Assert().Equal(tag2.ID, parent.Tags[0].ID)

	suite.Assert().Equal(updatedDate, parent.Date)
	suite.Assert().Equal("Test transaction updated", parent.Description)
	suite.Assert().Equal(user.ID, parent.UserID)
	suite.Assert().Equal(user.ID, lo.FromPtr(parent.OriginalUserID))

	updatedChildren, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		ParentIDs: []int{parent.ID},
		SortBy: &domain.SortBy{
			Field: "user_id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get updatedChildren: %v", err)
	}

	if len(updatedChildren) != 2 {
		suite.T().Fatalf("Expected 1 child, got %d", len(updatedChildren))
	}

	for i, child := range updatedChildren {
		if i == 0 {
			suite.Assert().Len(child.Tags, 1, fmt.Sprintf("child[%d].Tags should have 1 tag", i))
			suite.Assert().Equal(tag2.ID, child.Tags[0].ID, fmt.Sprintf("child[%d].Tags[0].ID should be %d", i, tag2.ID))
			suite.Assert().Equal(lo.FromPtr(parent.CategoryID), lo.FromPtr(child.CategoryID), fmt.Sprintf("child[%d].CategoryID should be %d", i, lo.FromPtr(children[i].CategoryID)))
		} else {
			suite.Assert().Len(child.Tags, 0, fmt.Sprintf("child[%d].Tags should have 0 tags", i))
			suite.Assert().Nil(child.CategoryID, fmt.Sprintf("child[%d].CategoryID should be nil", i))
		}

		suite.Assert().Equal(children[i].Type.Invert(), child.Type, fmt.Sprintf("child[%d].Type should be %s", i, children[i].Type.Invert()))
		suite.Assert().Equal(children[i].OperationType.Invert(), child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, children[i].OperationType.Invert()))

		suite.Assert().Equal(children[i].UserID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, children[i].UserID))
		suite.Assert().Equal(lo.FromPtr(children[i].OriginalUserID), lo.FromPtr(child.OriginalUserID), fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
		suite.Assert().Equal(children[i].AccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.FromAccountID))

		suite.Assert().Equal(int64(50), child.Amount, fmt.Sprintf("child[%d].Amount should be %d", i, 50))
		suite.Assert().Equal(updatedDate, child.Date, fmt.Sprintf("child[%d].Date should be %s", i, updatedDate))
		suite.Assert().Equal("Test transaction updated", child.Description, fmt.Sprintf("child[%d].Description should be %s", i, "Test transaction"))
	}

}

func (suite *TransactionUpdateWithDBTestSuite) TestUpdateChildTransactionWithoutPropagation() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user 2: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
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

	connection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create test connection: %v", err)
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
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: connection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	parent, found := lo.Find(transactions, func(t *domain.Transaction) bool {
		return t.ParentID == nil
	})

	if len(transactions) != 2 {
		suite.T().Fatalf("Expected 2 transactions, got %d", len(transactions))
	}

	if !found {
		suite.T().Fatalf("Failed to find parent transaction")
	}

	suite.Assert().NotNil(transaction)

	suite.Assert().Equal(int64(100), parent.Amount)
	suite.Assert().Equal(domain.TransactionTypeExpense, parent.Type)
	suite.Assert().Equal(domain.OperationTypeDebit, parent.OperationType)
	suite.Assert().Equal(account.ID, parent.AccountID)
	suite.Assert().Equal(category.ID, lo.FromPtr(parent.CategoryID))

	suite.Assert().Len(parent.Tags, 1)
	suite.Assert().Equal(tag.ID, parent.Tags[0].ID)

	suite.Assert().Equal(d, parent.Date)
	suite.Assert().Equal("Test transaction", parent.Description)
	suite.Assert().Equal(user.ID, parent.UserID)
	suite.Assert().Equal(user.ID, lo.FromPtr(parent.OriginalUserID))

	children, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		ParentIDs: []int{parent.ID},
		SortBy: &domain.SortBy{
			Field: "user_id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get children: %v", err)
	}

	if len(children) != 2 {
		suite.T().Fatalf("Expected 2 children, got %d", len(children))
	}

	for i, child := range children {
		if i == 0 {
			suite.Assert().Equal(user.ID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, user.ID))
			suite.Assert().Equal(lo.FromPtr(child.OriginalUserID), user.ID, fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
			suite.Assert().Equal(domain.TransactionTypeIncome, child.Type, fmt.Sprintf("child[%d].Type should be %s", i, domain.TransactionTypeIncome))
			suite.Assert().Equal(domain.OperationTypeCredit, child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, domain.OperationTypeCredit))
			suite.Assert().Equal(connection.FromAccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.FromAccountID))
			suite.Assert().Equal(lo.FromPtr(parent.CategoryID), lo.FromPtr(child.CategoryID), fmt.Sprintf("child[%d].CategoryID should be %d", i, lo.FromPtr(parent.CategoryID)))
			suite.Assert().Len(child.Tags, 1, fmt.Sprintf("child[%d].Tags should have 1 tag", i))
			suite.Assert().Equal(tag.ID, child.Tags[0].ID, fmt.Sprintf("child[%d].Tags[0].ID should be %d", i, tag.ID))
		} else {
			suite.Assert().Equal(user2.ID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, user2.ID))
			suite.Assert().Equal(lo.FromPtr(child.OriginalUserID), user.ID, fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
			suite.Assert().Equal(domain.TransactionTypeExpense, child.Type, "não deve inverter o tipo da transação para o usuário compartilhado")
			suite.Assert().Equal(domain.OperationTypeDebit, child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, domain.OperationTypeDebit))
			suite.Assert().Equal(connection.ToAccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.ToAccountID))
			suite.Assert().Nil(child.CategoryID, fmt.Sprintf("child[%d].CategoryID should be nil", i))
			suite.Assert().Len(child.Tags, 0, fmt.Sprintf("child[%d].Tags should have 0 tags", i))
		}

		suite.Assert().Equal(int64(50), child.Amount, fmt.Sprintf("child[%d].Amount should be %d", i, 50))
		suite.Assert().Equal(d, child.Date, fmt.Sprintf("child[%d].Date should be %s", i, d))
		suite.Assert().Equal("Test transaction", child.Description, fmt.Sprintf("child[%d].Description should be %s", i, "Test transaction"))
	}

	updatedDate := d.AddDate(0, 0, 1)

	err = suite.Services.Transaction.Update(ctx, children[0].ID, user.ID, &domain.TransactionUpdateRequest{
		Amount:             lo.ToPtr(int64(75)),
		TransactionType:    lo.ToPtr(domain.TransactionTypeExpense),
		CategoryID:         lo.ToPtr(category2.ID),
		Tags:               []domain.Tag{*tag2},
		Date:               lo.ToPtr(updatedDate),
		Description:        lo.ToPtr("Test transaction updated"),
		PropagateToRelated: false,
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	updatedParent, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{parent.ID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().NotNil(updatedParent)
	suite.Assert().NoError(err)
	suite.Assert().Equal(parent, updatedParent, "parent should not be updated")

	updatedChildren, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		ParentIDs: []int{updatedParent.ID},
		SortBy: &domain.SortBy{
			Field: "user_id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get updatedChildren: %v", err)
	}

	if len(updatedChildren) != 2 {
		suite.T().Fatalf("Expected 1 child, got %d", len(updatedChildren))
	}

	for i, child := range updatedChildren {
		if i == 0 {
			suite.Assert().Len(child.Tags, 1, fmt.Sprintf("child[%d].Tags should have 1 tag", i))
			suite.Assert().Equal(tag2.ID, child.Tags[0].ID, fmt.Sprintf("child[%d].Tags[0].ID should be %d", i, tag2.ID))
			suite.Assert().Equal(category2.ID, lo.FromPtr(child.CategoryID), fmt.Sprintf("child[%d].CategoryID should be %d", i, lo.FromPtr(children[i].CategoryID)))
		} else {
			suite.Assert().Len(child.Tags, 0, fmt.Sprintf("child[%d].Tags should have 0 tags", i))
			suite.Assert().Nil(child.CategoryID, fmt.Sprintf("child[%d].CategoryID should be nil", i))
		}

		suite.Assert().Equal(children[i].Type.Invert(), child.Type, fmt.Sprintf("child[%d].Type should be %s", i, children[i].Type.Invert()))
		suite.Assert().Equal(children[i].OperationType.Invert(), child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, children[i].OperationType.Invert()))

		suite.Assert().Equal(children[i].UserID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, children[i].UserID))
		suite.Assert().Equal(lo.FromPtr(children[i].OriginalUserID), lo.FromPtr(child.OriginalUserID), fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
		suite.Assert().Equal(children[i].AccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.FromAccountID))

		suite.Assert().Equal(int64(75), child.Amount, fmt.Sprintf("child[%d].Amount should be %d", i, 75))
		suite.Assert().Equal(updatedDate, child.Date, fmt.Sprintf("child[%d].Date should be %s", i, updatedDate))
		suite.Assert().Equal("Test transaction updated", child.Description, fmt.Sprintf("child[%d].Description should be %s", i, "Test transaction"))
	}

}

func (suite *TransactionUpdateWithDBTestSuite) TestUpdateChildTransactionWithPropagation() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user 2: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
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

	connection, err := suite.createAcceptedTestUserConnection(ctx, user.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create test connection: %v", err)
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
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: connection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	}

	err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	parent, found := lo.Find(transactions, func(t *domain.Transaction) bool {
		return t.ParentID == nil
	})

	if len(transactions) != 2 {
		suite.T().Fatalf("Expected 2 transactions, got %d", len(transactions))
	}

	if !found {
		suite.T().Fatalf("Failed to find parent transaction")
	}

	suite.Assert().NotNil(transaction)

	suite.Assert().Equal(int64(100), parent.Amount)
	suite.Assert().Equal(domain.TransactionTypeExpense, parent.Type)
	suite.Assert().Equal(domain.OperationTypeDebit, parent.OperationType)
	suite.Assert().Equal(account.ID, parent.AccountID)
	suite.Assert().Equal(category.ID, lo.FromPtr(parent.CategoryID))

	suite.Assert().Len(parent.Tags, 1)
	suite.Assert().Equal(tag.ID, parent.Tags[0].ID)

	suite.Assert().Equal(d, parent.Date)
	suite.Assert().Equal("Test transaction", parent.Description)
	suite.Assert().Equal(user.ID, parent.UserID)
	suite.Assert().Equal(user.ID, lo.FromPtr(parent.OriginalUserID))

	transactionID := parent.ID

	children, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		ParentIDs: []int{transactionID},
		SortBy: &domain.SortBy{
			Field: "user_id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get children: %v", err)
	}

	if len(children) != 2 {
		suite.T().Fatalf("Expected 2 children, got %d", len(children))
	}

	for i, child := range children {
		if i == 0 {
			suite.Assert().Equal(user.ID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, user.ID))
			suite.Assert().Equal(lo.FromPtr(child.OriginalUserID), user.ID, fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
			suite.Assert().Equal(domain.TransactionTypeIncome, child.Type, fmt.Sprintf("child[%d].Type should be %s", i, domain.TransactionTypeIncome))
			suite.Assert().Equal(domain.OperationTypeCredit, child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, domain.OperationTypeCredit))
			suite.Assert().Equal(connection.FromAccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.FromAccountID))
			suite.Assert().Equal(lo.FromPtr(parent.CategoryID), lo.FromPtr(child.CategoryID), fmt.Sprintf("child[%d].CategoryID should be %d", i, lo.FromPtr(parent.CategoryID)))
			suite.Assert().Len(child.Tags, 1, fmt.Sprintf("child[%d].Tags should have 1 tag", i))
			suite.Assert().Equal(tag.ID, child.Tags[0].ID, fmt.Sprintf("child[%d].Tags[0].ID should be %d", i, tag.ID))
		} else {
			suite.Assert().Equal(user2.ID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, user2.ID))
			suite.Assert().Equal(lo.FromPtr(child.OriginalUserID), user.ID, fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
			suite.Assert().Equal(domain.TransactionTypeExpense, child.Type, "não deve inverter o tipo da transação para o usuário compartilhado")
			suite.Assert().Equal(domain.OperationTypeDebit, child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, domain.OperationTypeDebit))
			suite.Assert().Equal(connection.ToAccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.ToAccountID))
			suite.Assert().Nil(child.CategoryID, fmt.Sprintf("child[%d].CategoryID should be nil", i))
			suite.Assert().Len(child.Tags, 0, fmt.Sprintf("child[%d].Tags should have 0 tags", i))
		}

		suite.Assert().Equal(int64(50), child.Amount, fmt.Sprintf("child[%d].Amount should be %d", i, 50))
		suite.Assert().Equal(d, child.Date, fmt.Sprintf("child[%d].Date should be %s", i, d))
		suite.Assert().Equal("Test transaction", child.Description, fmt.Sprintf("child[%d].Description should be %s", i, "Test transaction"))
	}

	updatedDate := d.AddDate(0, 0, 1)

	err = suite.Services.Transaction.Update(ctx, children[0].ID, user.ID, &domain.TransactionUpdateRequest{
		Amount:             lo.ToPtr(int64(200)),
		TransactionType:    lo.ToPtr(domain.TransactionTypeExpense),
		CategoryID:         lo.ToPtr(category2.ID),
		Tags:               []domain.Tag{*tag2},
		Date:               lo.ToPtr(updatedDate),
		Description:        lo.ToPtr("Test transaction updated"),
		PropagateToRelated: true,
	})
	if err != nil {
		suite.T().Fatalf("Failed to update transaction: %v", err)
	}

	updatedParent, err := suite.Repos.Transaction.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{parent.ID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().NotNil(updatedParent)
	suite.Assert().NoError(err)
	suite.Assert().Equal(int64(400), updatedParent.Amount)
	suite.Assert().Equal(domain.TransactionTypeIncome, updatedParent.Type)
	suite.Assert().Equal(domain.OperationTypeCredit, updatedParent.OperationType)
	suite.Assert().Equal(account.ID, updatedParent.AccountID)
	suite.Assert().Equal(category2.ID, lo.FromPtr(updatedParent.CategoryID))

	suite.Assert().Len(updatedParent.Tags, 1)
	suite.Assert().Equal(tag2.ID, updatedParent.Tags[0].ID)

	suite.Assert().Equal(updatedDate, updatedParent.Date)
	suite.Assert().Equal("Test transaction updated", updatedParent.Description)
	suite.Assert().Equal(user.ID, updatedParent.UserID)
	suite.Assert().Equal(user.ID, lo.FromPtr(updatedParent.OriginalUserID))

	updatedChildren, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		ParentIDs: []int{updatedParent.ID},
		SortBy: &domain.SortBy{
			Field: "user_id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get updatedChildren: %v", err)
	}

	if len(updatedChildren) != 2 {
		suite.T().Fatalf("Expected 1 child, got %d", len(updatedChildren))
	}

	for i, child := range updatedChildren {
		if i == 0 {
			suite.Assert().Len(child.Tags, 1, fmt.Sprintf("child[%d].Tags should have 1 tag", i))
			suite.Assert().Equal(tag2.ID, child.Tags[0].ID, fmt.Sprintf("child[%d].Tags[0].ID should be %d", i, tag2.ID))
			suite.Assert().Equal(lo.FromPtr(updatedParent.CategoryID), lo.FromPtr(child.CategoryID), fmt.Sprintf("child[%d].CategoryID should be %d", i, lo.FromPtr(children[i].CategoryID)))
		} else {
			suite.Assert().Len(child.Tags, 0, fmt.Sprintf("child[%d].Tags should have 0 tags", i))
			suite.Assert().Nil(child.CategoryID, fmt.Sprintf("child[%d].CategoryID should be nil", i))
		}

		suite.Assert().Equal(children[i].Type.Invert(), child.Type, fmt.Sprintf("child[%d].Type should be %s", i, children[i].Type.Invert()))
		suite.Assert().Equal(children[i].OperationType.Invert(), child.OperationType, fmt.Sprintf("child[%d].OperationType should be %s", i, children[i].OperationType.Invert()))

		suite.Assert().Equal(children[i].UserID, child.UserID, fmt.Sprintf("child[%d].UserID should be %d", i, children[i].UserID))
		suite.Assert().Equal(lo.FromPtr(children[i].OriginalUserID), lo.FromPtr(child.OriginalUserID), fmt.Sprintf("child[%d].OriginalUserID should be %d", i, user.ID))
		suite.Assert().Equal(children[i].AccountID, child.AccountID, fmt.Sprintf("child[%d].AccountID should be %d", i, connection.FromAccountID))

		suite.Assert().Equal(int64(200), child.Amount, fmt.Sprintf("child[%d].Amount should be %d", i, 50))
		suite.Assert().Equal(updatedDate, child.Date, fmt.Sprintf("child[%d].Date should be %s", i, updatedDate))
		suite.Assert().Equal("Test transaction updated", child.Description, fmt.Sprintf("child[%d].Description should be %s", i, "Test transaction"))
	}

}

func TestTransactionUpdateWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	suite.Run(t, new(TransactionUpdateWithDBTestSuite))
}
