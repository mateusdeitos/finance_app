package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
	"github.com/stretchr/testify/suite"
)

type TransactionCreateWithDBTestSuite struct {
	ServiceTestWithDBSuite
}

func (suite *TransactionCreateWithDBTestSuite) TestCreateExpense() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	tag, err := suite.createTestTag(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test tag: %v", err)
	}

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		TransactionType: domain.TransactionTypeExpense,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            now(),
		Description:     "Test transaction",
		Tags:            []domain.Tag{*tag},
	}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactions, 1)

	suite.Assert().NoError(err)

	suite.Assert().Greater(transactions[0].ID, 0)
	suite.Assert().Equal(transaction.AccountID, transactions[0].AccountID)
	suite.Assert().Equal(transaction.CategoryID, lo.FromPtr(transactions[0].CategoryID))
	suite.Assert().Equal(transaction.Amount, transactions[0].Amount)
	suite.Assert().Equal(domain.OperationTypeDebit, transactions[0].OperationType)
	suite.Assert().Equal(transaction.Date, transactions[0].Date)
	suite.Assert().Equal(transaction.Description, transactions[0].Description)

	suite.Assert().Equal(user.ID, transactions[0].UserID)
	suite.Assert().Equal(user.ID, lo.FromPtr(transactions[0].OriginalUserID))

	suite.Assert().Len(transactions[0].Tags, 1)
	suite.Assert().Equal(transaction.Tags[0].ID, transactions[0].Tags[0].ID)

	suite.Assert().Nil(transactions[0].TransactionRecurrenceID)
	suite.Assert().Nil(transactions[0].InstallmentNumber)

	transactionsWithSettlements, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:          &user.ID,
		WithSettlements: true,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transactions with settlements: %v", err)
	}
	suite.Assert().Len(transactionsWithSettlements[0].SettlementsFromSource, 0)
}

func (suite *TransactionCreateWithDBTestSuite) TestCreateIncome() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	tag, err := suite.createTestTag(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test tag: %v", err)
	}

	transaction := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		TransactionType: domain.TransactionTypeIncome,
		CategoryID:      category.ID,
		Amount:          100,
		Date:            now(),
		Description:     "Test transaction",
		Tags:            []domain.Tag{*tag},
	}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactions, 1)

	suite.Assert().NoError(err)

	suite.Assert().Greater(transactions[0].ID, 0)
	suite.Assert().Equal(transaction.AccountID, transactions[0].AccountID)
	suite.Assert().Equal(transaction.CategoryID, lo.FromPtr(transactions[0].CategoryID))
	suite.Assert().Equal(transaction.Amount, transactions[0].Amount)
	suite.Assert().Equal(domain.OperationTypeCredit, transactions[0].OperationType)
	suite.Assert().Equal(transaction.Date, transactions[0].Date)
	suite.Assert().Equal(transaction.Description, transactions[0].Description)

	suite.Assert().Equal(user.ID, transactions[0].UserID)
	suite.Assert().Equal(user.ID, lo.FromPtr(transactions[0].OriginalUserID))

	suite.Assert().Len(transactions[0].Tags, 1)
	suite.Assert().Equal(transaction.Tags[0].ID, transactions[0].Tags[0].ID)

	suite.Assert().Nil(transactions[0].TransactionRecurrenceID)
	suite.Assert().Nil(transactions[0].InstallmentNumber)

	transactionsWithSettlements, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:          &user.ID,
		WithSettlements: true,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transactions with settlements: %v", err)
	}
	suite.Assert().Len(transactionsWithSettlements[0].SettlementsFromSource, 0)
}

func (suite *TransactionCreateWithDBTestSuite) TestCreateTransfer() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account1, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	transaction := domain.TransactionCreateRequest{
		AccountID:            account1.ID,
		DestinationAccountID: lo.ToPtr(account2.ID),
		TransactionType:      domain.TransactionTypeTransfer,
		Amount:               100,
		Date:                 now(),
		Description:          "Test transaction",
		Tags:                 []domain.Tag{{Name: "Test tag"}},
	}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{Field: "id", Order: domain.SortOrderAsc},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactions, 2)

	suite.Assert().NoError(err)

	// transactions[0] é o débito (conta origem), transactions[1] é o crédito (conta destino)
	suite.Assert().Greater(transactions[0].ID, 0, "transactions[0].ID should be greater than 0")
	suite.Assert().Equal(transaction.AccountID, transactions[0].AccountID, "transactions[0].AccountID should be equal to transaction.AccountID")
	suite.Assert().Equal(transaction.Amount, transactions[0].Amount, "transactions[0].Amount should be equal to transaction.Amount")
	suite.Assert().Equal(transaction.Date, transactions[0].Date, "transactions[0].Date should be equal to transaction.Date")
	suite.Assert().Equal(transaction.Description, transactions[0].Description, "transactions[0].Description should be equal to transaction.Description")
	suite.Assert().Equal(domain.TransactionTypeTransfer, transactions[0].Type, "transactions[0].Type should be equal to domain.TransactionTypeTransfer")
	suite.Assert().Equal(domain.OperationTypeDebit, transactions[0].OperationType, "transactions[0].OperationType should be equal to domain.OperationTypeDebit")
	suite.Assert().Len(transactions[0].Tags, 1, "transactions[0].Tags should have 1 tag")
	suite.Assert().Greater(transactions[0].Tags[0].ID, 0, "transactions[0].Tags[0].ID should be greater than 0")

	suite.Assert().Len(transactions[0].LinkedTransactions, 1, "transactions[0].LinkedTransactions should have 1 transaction")
	suite.Assert().Greater(transactions[0].LinkedTransactions[0].ID, 0, "transactions[0].LinkedTransactions[0].ID should be greater than 0")
	suite.Assert().Equal(account2.ID, transactions[0].LinkedTransactions[0].AccountID, "transactions[0].LinkedTransactions[0].AccountID should be equal to account2.ID")
	suite.Assert().Equal(transaction.Amount, transactions[0].LinkedTransactions[0].Amount, "transactions[0].LinkedTransactions[0].Amount should be equal to transaction.Amount")
	suite.Assert().Equal(transaction.Date, transactions[0].LinkedTransactions[0].Date, "transactions[0].LinkedTransactions[0].Date should be equal to transaction.Date")
	suite.Assert().Equal(transaction.Description, transactions[0].LinkedTransactions[0].Description, "transactions[0].LinkedTransactions[0].Description should be equal to transaction.Description")
	suite.Assert().Equal(domain.TransactionTypeTransfer, transactions[0].LinkedTransactions[0].Type, "transactions[0].LinkedTransactions[0].Type should be equal to domain.TransactionTypeTransfer")
	suite.Assert().Equal(domain.OperationTypeCredit, transactions[0].LinkedTransactions[0].OperationType, "transactions[0].LinkedTransactions[0].OperationType should be equal to domain.OperationTypeCredit")
	suite.Assert().Len(transactions[0].LinkedTransactions[0].Tags, 1, "transactions[0].LinkedTransactions[0].Tags should have 1 tag")
	suite.Assert().Equal(transaction.Tags[0].ID, transactions[0].LinkedTransactions[0].Tags[0].ID, "transactions[0].LinkedTransactions[0].Tags[0].ID should be equal to transaction.Tags[0].ID")

	suite.Assert().Equal(user.ID, transactions[0].LinkedTransactions[0].UserID, "transactions[0].LinkedTransactions[0].UserID should be equal to user.ID")
	suite.Assert().Equal(user.ID, lo.FromPtr(transactions[0].LinkedTransactions[0].OriginalUserID), "transactions[0].LinkedTransactions[0].OriginalUserID should be equal to user.ID")

	transactionsWithSettlements, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:          &user.ID,
		WithSettlements: true,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transactions with settlements: %v", err)
	}
	for _, t := range transactionsWithSettlements {
		suite.Assert().Len(t.SettlementsFromSource, 0, "transfer should have no settlements")
	}
}

func (suite *TransactionCreateWithDBTestSuite) TestRecurringCreateTransfer() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account1, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	account2, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	tag, err := suite.createTestTag(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test tag: %v", err)
	}

	transaction := domain.TransactionCreateRequest{
		AccountID:            account1.ID,
		DestinationAccountID: lo.ToPtr(account2.ID),
		TransactionType:      domain.TransactionTypeTransfer,
		Amount:               100,
		Date:                 now(),
		Description:          "Test transaction",
		Tags:                 []domain.Tag{*tag},
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{
			Field: "installment_number",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactions, 6)

	suite.Assert().NoError(err)

	debitTransactions := lo.Filter(transactions, func(t *domain.Transaction, _ int) bool {
		return t.OperationType == domain.OperationTypeDebit
	})
	suite.Assert().Len(debitTransactions, 3)

	expectedInstallmentNumber := 1

	for i := range debitTransactions {
		suite.Assert().NotNil(debitTransactions[i].TransactionRecurrenceID, fmt.Sprintf("debitTransactions[%d].TransactionRecurrenceID should not be nil", i))
		suite.Assert().NotNil(debitTransactions[i].InstallmentNumber, fmt.Sprintf("debitTransactions[%d].InstallmentNumber should not be nil", i))
		suite.Assert().Nil(debitTransactions[i].CategoryID, fmt.Sprintf("debitTransactions[%d].CategoryID should be nil", i))
		suite.Assert().Equal(user.ID, debitTransactions[i].UserID, fmt.Sprintf("debitTransactions[%d].UserID should be %d", i, user.ID))
		suite.Assert().Equal(user.ID, lo.FromPtr(debitTransactions[i].OriginalUserID), fmt.Sprintf("debitTransactions[%d].OriginalUserID should be %d", i, user.ID))
		suite.Assert().Equal(int64(100), int64(debitTransactions[i].Amount), fmt.Sprintf("debitTransactions[%d].Amount should be %d", i, 100))
		suite.Assert().Equal(transaction.Date.AddDate(0, i, 0), debitTransactions[i].Date, fmt.Sprintf("debitTransactions[%d].Date should be %s", i, transaction.Date.AddDate(0, i, 0)))
		suite.Assert().Equal(domain.TransactionTypeTransfer, debitTransactions[i].Type, fmt.Sprintf("debitTransactions[%d].Type should be %s", i, domain.TransactionTypeTransfer))
		suite.Assert().Equal(expectedInstallmentNumber, lo.FromPtr(debitTransactions[i].InstallmentNumber), fmt.Sprintf("debitTransactions[%d].InstallmentNumber should be %d", i, expectedInstallmentNumber))
		suite.Assert().Equal(account1.ID, debitTransactions[i].AccountID, fmt.Sprintf("debitTransactions[%d].AccountID should be %d", i, account1.ID))
		suite.Assert().Len(debitTransactions[i].LinkedTransactions, 1, fmt.Sprintf("debitTransactions[%d].LinkedTransactions should have 1", i))
		suite.Assert().Equal(domain.OperationTypeDebit, debitTransactions[i].OperationType, fmt.Sprintf("debitTransactions[%d].OperationType should be %s", i, domain.OperationTypeDebit))

		suite.Assert().Equal(account2.ID, debitTransactions[i].LinkedTransactions[0].AccountID, fmt.Sprintf("debitTransactions[%d].LinkedTransactions[0].AccountID should be %d", i, account2.ID))
		suite.Assert().Equal(int64(100), int64(debitTransactions[i].LinkedTransactions[0].Amount), fmt.Sprintf("debitTransactions[%d].LinkedTransactions[0].Amount should be %d", i, 100))
		suite.Assert().Equal(transaction.Date.AddDate(0, i, 0), debitTransactions[i].LinkedTransactions[0].Date, fmt.Sprintf("debitTransactions[%d].LinkedTransactions[0].Date should be %s", i, transaction.Date.AddDate(0, i, 0)))
		suite.Assert().Equal(transaction.Description, debitTransactions[i].LinkedTransactions[0].Description, fmt.Sprintf("debitTransactions[%d].LinkedTransactions[0].Description should be %s", i, transaction.Description))
		suite.Assert().Equal(domain.TransactionTypeTransfer, debitTransactions[i].LinkedTransactions[0].Type, fmt.Sprintf("debitTransactions[%d].LinkedTransactions[0].Type should be %s", i, domain.TransactionTypeTransfer))
		suite.Assert().Equal(user.ID, debitTransactions[i].LinkedTransactions[0].UserID, fmt.Sprintf("debitTransactions[%d].LinkedTransactions[0].UserID should be %d", i, user.ID))
		suite.Assert().Equal(user.ID, lo.FromPtr(debitTransactions[i].LinkedTransactions[0].OriginalUserID), fmt.Sprintf("debitTransactions[%d].LinkedTransactions[0].OriginalUserID should be %d", i, user.ID))
		suite.Assert().Len(debitTransactions[i].LinkedTransactions[0].Tags, 1, fmt.Sprintf("debitTransactions[%d].LinkedTransactions[0].Tags should have 1 tag", i))
		suite.Assert().Equal(tag.ID, debitTransactions[i].LinkedTransactions[0].Tags[0].ID, fmt.Sprintf("debitTransactions[%d].LinkedTransactions[0].Tags[0].ID should be %d", i, tag.ID))

		expectedInstallmentNumber++
	}
}

func (suite *TransactionCreateWithDBTestSuite) TestTransferBetweenDifferentUsers() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account1, err := suite.createTestAccount(ctx, user1)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account2, err := suite.createTestAccount(ctx, user2)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	connection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 100)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	transferUser1ToUser2 := domain.TransactionCreateRequest{
		AccountID:            account1.ID,
		DestinationAccountID: lo.ToPtr(connection.ToAccountID),
		TransactionType:      domain.TransactionTypeTransfer,
		Amount:               100,
		Date:                 now(),
		Description:          "Test transfer from user1 to user2",
		Tags:                 []domain.Tag{{Name: "Test tag"}},
	}

	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &transferUser1ToUser2)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transferUser2ToUser1 := domain.TransactionCreateRequest{
		AccountID:            account2.ID,
		DestinationAccountID: lo.ToPtr(connection.FromAccountID),
		TransactionType:      domain.TransactionTypeTransfer,
		Amount:               500,
		Date:                 now(),
		Description:          "Test transfer from user2 to user1",
		Tags:                 []domain.Tag{{Name: "Test tag"}},
	}

	_, err = suite.Services.Transaction.Create(ctx, user2.ID, &transferUser2ToUser1)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactionsUser1, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user1.ID,
		SortBy: &domain.SortBy{
			Field: "original_user_id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsUser1, 2)

	suite.Assert().NoError(err)

	for i := range transactionsUser1 {
		suite.Assert().Nil(transactionsUser1[i].TransactionRecurrenceID, fmt.Sprintf("transactionsUser1[%d].TransactionRecurrenceID should be nil", i))
		suite.Assert().Nil(transactionsUser1[i].InstallmentNumber, fmt.Sprintf("transactionsUser1[%d].InstallmentNumber should be nil", i))
		suite.Assert().Nil(transactionsUser1[i].CategoryID, fmt.Sprintf("transactionsUser1[%d].CategoryID should be nil", i))
		suite.Assert().Equal(user1.ID, transactionsUser1[i].UserID, fmt.Sprintf("transactionsUser1[%d].UserID should be %d", i, user1.ID))
		suite.Assert().Equal(domain.TransactionTypeTransfer, transactionsUser1[i].Type, fmt.Sprintf("transactionsUser1[%d].Type should be %s", i, domain.TransactionTypeTransfer))

		if i == 0 {
			suite.Assert().Equal(user1.ID, lo.FromPtr(transactionsUser1[i].OriginalUserID), fmt.Sprintf("transactionsUser1[%d].OriginalUserID should be %d", i, user1.ID))
			suite.Assert().Equal(int64(100), int64(transactionsUser1[i].Amount), fmt.Sprintf("transactionsUser1[%d].Amount should be %d", i, 100))
			suite.Assert().Equal(account1.ID, transactionsUser1[i].AccountID, fmt.Sprintf("transactionsUser1[%d].AccountID should be %d", i, account1.ID))
			suite.Assert().Len(transactionsUser1[i].LinkedTransactions, 1, fmt.Sprintf("transactionsUser1[%d].LinkedTransactions should have 1 (to_account_id)", i))
			suite.Assert().Equal(domain.OperationTypeDebit, transactionsUser1[i].OperationType, fmt.Sprintf("transactionsUser1[%d].OperationType should be %s", i, domain.OperationTypeDebit))
		} else {
			suite.Assert().Equal(user2.ID, lo.FromPtr(transactionsUser1[i].OriginalUserID), fmt.Sprintf("transactionsUser1[%d].OriginalUserID should be %d", i, user2.ID))
			suite.Assert().Equal(int64(500), int64(transactionsUser1[i].Amount), fmt.Sprintf("transactionsUser1[%d].Amount should be %d", i, 500))
			suite.Assert().Equal(connection.FromAccountID, transactionsUser1[i].AccountID, fmt.Sprintf("transactionsUser1[%d].AccountID should be %d", i, connection.FromAccountID))
			suite.Assert().Len(transactionsUser1[i].LinkedTransactions, 1, fmt.Sprintf("transactionsUser1[%d].LinkedTransactions should have 1 (source tx)", i))
			suite.Assert().Equal(domain.OperationTypeCredit, transactionsUser1[i].OperationType, fmt.Sprintf("transactionsUser1[%d].OperationType should be %s", i, domain.OperationTypeCredit))
		}
	}

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
		SortBy: &domain.SortBy{
			Field: "original_user_id",
			Order: domain.SortOrderDesc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsUser2, 2)

	suite.Assert().NoError(err)

	for i := range transactionsUser2 {
		suite.Assert().Nil(transactionsUser2[i].TransactionRecurrenceID, fmt.Sprintf("transactionsUser2[%d].TransactionRecurrenceID should be nil", i))
		suite.Assert().Nil(transactionsUser2[i].InstallmentNumber, fmt.Sprintf("transactionsUser2[%d].InstallmentNumber should be nil", i))
		suite.Assert().Nil(transactionsUser2[i].CategoryID, fmt.Sprintf("transactionsUser2[%d].CategoryID should be nil", i))
		suite.Assert().Equal(user2.ID, transactionsUser2[i].UserID, fmt.Sprintf("transactionsUser2[%d].UserID should be %d", i, user2.ID))
		suite.Assert().Equal(domain.TransactionTypeTransfer, transactionsUser2[i].Type, fmt.Sprintf("transactionsUser2[%d].Type should be %s", i, domain.TransactionTypeTransfer))

		if i == 0 {
			suite.Assert().Equal(user2.ID, lo.FromPtr(transactionsUser2[i].OriginalUserID), fmt.Sprintf("transactionsUser2[%d].OriginalUserID should be %d", i, user2.ID))
			suite.Assert().Equal(int64(500), int64(transactionsUser2[i].Amount), fmt.Sprintf("transactionsUser2[%d].Amount should be %d", i, 100))
			suite.Assert().Equal(account2.ID, transactionsUser2[i].AccountID, fmt.Sprintf("transactionsUser2[%d].AccountID should be %d", i, account2.ID))
			suite.Assert().Len(transactionsUser2[i].LinkedTransactions, 1, fmt.Sprintf("transactionsUser2[%d].LinkedTransactions should have 1 (to_account_id)", i))
			suite.Assert().Equal(domain.OperationTypeDebit, transactionsUser2[i].OperationType, fmt.Sprintf("transactionsUser2[%d].OperationType should be %s", i, domain.OperationTypeDebit))
		} else {
			suite.Assert().Equal(user1.ID, lo.FromPtr(transactionsUser2[i].OriginalUserID), fmt.Sprintf("transactionsUser2[%d].OriginalUserID should be %d", i, user1.ID))
			suite.Assert().Equal(int64(100), int64(transactionsUser2[i].Amount), fmt.Sprintf("transactionsUser2[%d].Amount should be %d", i, 500))
			suite.Assert().Equal(connection.ToAccountID, transactionsUser2[i].AccountID, fmt.Sprintf("transactionsUser2[%d].AccountID should be %d", i, connection.ToAccountID))
			suite.Assert().Len(transactionsUser2[i].LinkedTransactions, 1, fmt.Sprintf("transactionsUser2[%d].LinkedTransactions should have 1 (source tx)", i))
			suite.Assert().Equal(domain.OperationTypeCredit, transactionsUser2[i].OperationType, fmt.Sprintf("transactionsUser2[%d].OperationType should be %s", i, domain.OperationTypeCredit))
		}
	}

	allTransactionsWithSettlements, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		WithSettlements: true,
		IDs: append(
			lo.Map(transactionsUser1, func(t *domain.Transaction, _ int) int { return t.ID }),
			lo.Map(transactionsUser2, func(t *domain.Transaction, _ int) int { return t.ID })...,
		),
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transactions with settlements: %v", err)
	}
	for _, t := range allTransactionsWithSettlements {
		suite.Assert().Len(t.SettlementsFromSource, 0, "cross-user transfer should have no settlements")
	}
}

func (suite *TransactionCreateWithDBTestSuite) TestRecurringTransferBetweenDifferentUsers() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account1, err := suite.createTestAccount(ctx, user1)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account2, err := suite.createTestAccount(ctx, user2)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	connection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 100)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	transferUser1ToUser2 := domain.TransactionCreateRequest{
		AccountID:            account1.ID,
		DestinationAccountID: lo.ToPtr(connection.ToAccountID),
		TransactionType:      domain.TransactionTypeTransfer,
		Amount:               100,
		Date:                 now(),
		Description:          "Test transfer from user1 to user2",
		Tags:                 []domain.Tag{{Name: "Test tag"}},
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	}

	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &transferUser1ToUser2)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transferUser2ToUser1 := domain.TransactionCreateRequest{
		AccountID:            account2.ID,
		DestinationAccountID: lo.ToPtr(connection.FromAccountID),
		TransactionType:      domain.TransactionTypeTransfer,
		Amount:               500,
		Date:                 now(),
		Description:          "Test transfer from user2 to user1",
		Tags:                 []domain.Tag{{Name: "Test tag"}},
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  3,
		},
	}

	_, err = suite.Services.Transaction.Create(ctx, user2.ID, &transferUser2ToUser1)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactionsUser1, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user1.ID,
		SortBy: &domain.SortBy{
			Field: "original_user_id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsUser1, 6)

	suite.Assert().NoError(err)

	for i := range transactionsUser1 {
		suite.Assert().NotNil(transactionsUser1[i].TransactionRecurrenceID, fmt.Sprintf("transactionsUser1[%d].TransactionRecurrenceID should not be nil", i))
		suite.Assert().NotNil(transactionsUser1[i].InstallmentNumber, fmt.Sprintf("transactionsUser1[%d].InstallmentNumber should not be nil", i))
		suite.Assert().Nil(transactionsUser1[i].CategoryID, fmt.Sprintf("transactionsUser1[%d].CategoryID should be nil", i))
		suite.Assert().Equal(user1.ID, transactionsUser1[i].UserID, fmt.Sprintf("transactionsUser1[%d].UserID should be %d", i, user1.ID))
		suite.Assert().Equal(domain.TransactionTypeTransfer, transactionsUser1[i].Type, fmt.Sprintf("transactionsUser1[%d].Type should be %s", i, domain.TransactionTypeTransfer))

		if i < 3 {
			suite.Assert().Equal(user1.ID, lo.FromPtr(transactionsUser1[i].OriginalUserID), fmt.Sprintf("transactionsUser1[%d].OriginalUserID should be %d", i, user1.ID))
			suite.Assert().Equal(int64(100), int64(transactionsUser1[i].Amount), fmt.Sprintf("transactionsUser1[%d].Amount should be %d", i, 100))
			suite.Assert().Equal(account1.ID, transactionsUser1[i].AccountID, fmt.Sprintf("transactionsUser1[%d].AccountID should be %d", i, account1.ID))
			suite.Assert().Len(transactionsUser1[i].LinkedTransactions, 1, fmt.Sprintf("transactionsUser1[%d].LinkedTransactions should have 1 (to_account_id)", i))
			suite.Assert().Equal(domain.OperationTypeDebit, transactionsUser1[i].OperationType, fmt.Sprintf("transactionsUser1[%d].OperationType should be %s", i, domain.OperationTypeDebit))
		} else {
			suite.Assert().Equal(user2.ID, lo.FromPtr(transactionsUser1[i].OriginalUserID), fmt.Sprintf("transactionsUser1[%d].OriginalUserID should be %d", i, user2.ID))
			suite.Assert().Equal(int64(500), int64(transactionsUser1[i].Amount), fmt.Sprintf("transactionsUser1[%d].Amount should be %d", i, 500))
			suite.Assert().Equal(connection.FromAccountID, transactionsUser1[i].AccountID, fmt.Sprintf("transactionsUser1[%d].AccountID should be %d", i, connection.FromAccountID))
			suite.Assert().Len(transactionsUser1[i].LinkedTransactions, 1, fmt.Sprintf("transactionsUser1[%d].LinkedTransactions should have 1 (source tx)", i))
			suite.Assert().Equal(domain.OperationTypeCredit, transactionsUser1[i].OperationType, fmt.Sprintf("transactionsUser1[%d].OperationType should be %s", i, domain.OperationTypeCredit))
		}
	}

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
		SortBy: &domain.SortBy{
			Field: "original_user_id",
			Order: domain.SortOrderDesc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsUser2, 6)

	suite.Assert().NoError(err)

	for i := range transactionsUser2 {
		suite.Assert().NotNil(transactionsUser2[i].TransactionRecurrenceID, fmt.Sprintf("transactionsUser2[%d].TransactionRecurrenceID should not be nil", i))
		suite.Assert().NotNil(transactionsUser2[i].InstallmentNumber, fmt.Sprintf("transactionsUser2[%d].InstallmentNumber should not be nil", i))
		suite.Assert().Nil(transactionsUser2[i].CategoryID, fmt.Sprintf("transactionsUser2[%d].CategoryID should be nil", i))
		suite.Assert().Equal(user2.ID, transactionsUser2[i].UserID, fmt.Sprintf("transactionsUser2[%d].UserID should be %d", i, user2.ID))
		suite.Assert().Equal(domain.TransactionTypeTransfer, transactionsUser2[i].Type, fmt.Sprintf("transactionsUser2[%d].Type should be %s", i, domain.TransactionTypeTransfer))

		if i < 3 {
			suite.Assert().Equal(user2.ID, lo.FromPtr(transactionsUser2[i].OriginalUserID), fmt.Sprintf("transactionsUser2[%d].OriginalUserID should be %d", i, user2.ID))
			suite.Assert().Equal(int64(500), int64(transactionsUser2[i].Amount), fmt.Sprintf("transactionsUser2[%d].Amount should be %d", i, 100))
			suite.Assert().Equal(account2.ID, transactionsUser2[i].AccountID, fmt.Sprintf("transactionsUser2[%d].AccountID should be %d", i, account2.ID))
			suite.Assert().Len(transactionsUser2[i].LinkedTransactions, 1, fmt.Sprintf("transactionsUser2[%d].LinkedTransactions should have 1 (to_account_id)", i))
			suite.Assert().Equal(domain.OperationTypeDebit, transactionsUser2[i].OperationType, fmt.Sprintf("transactionsUser2[%d].OperationType should be %s", i, domain.OperationTypeDebit))
		} else {
			suite.Assert().Equal(user1.ID, lo.FromPtr(transactionsUser2[i].OriginalUserID), fmt.Sprintf("transactionsUser2[%d].OriginalUserID should be %d", i, user1.ID))
			suite.Assert().Equal(int64(100), int64(transactionsUser2[i].Amount), fmt.Sprintf("transactionsUser2[%d].Amount should be %d", i, 500))
			suite.Assert().Equal(connection.ToAccountID, transactionsUser2[i].AccountID, fmt.Sprintf("transactionsUser2[%d].AccountID should be %d", i, connection.ToAccountID))
			suite.Assert().Len(transactionsUser2[i].LinkedTransactions, 1, fmt.Sprintf("transactionsUser2[%d].LinkedTransactions should have 1 (source tx)", i))
			suite.Assert().Equal(domain.OperationTypeCredit, transactionsUser2[i].OperationType, fmt.Sprintf("transactionsUser2[%d].OperationType should be %s", i, domain.OperationTypeCredit))
		}
	}
}

func (suite *TransactionCreateWithDBTestSuite) TestCreateRecurringExpenseWithRepetitions() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	tag, err := suite.createTestTag(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test tag: %v", err)
	}

	d := now()

	transactions := []domain.TransactionCreateRequest{
		{
			AccountID:       account.ID,
			CategoryID:      category.ID,
			TransactionType: domain.TransactionTypeExpense,
			Amount:          100,
			Date:            d,
			Description:     "Test daily expense",
			Tags:            []domain.Tag{*tag},
			RecurrenceSettings: &domain.RecurrenceSettings{
				Type:               domain.RecurrenceTypeDaily,
				CurrentInstallment: 1,
				TotalInstallments:  30,
			},
		},
		{
			AccountID:       account.ID,
			CategoryID:      category.ID,
			TransactionType: domain.TransactionTypeExpense,
			Amount:          100,
			Date:            d,
			Description:     "Test weekly expense",
			Tags:            []domain.Tag{*tag},
			RecurrenceSettings: &domain.RecurrenceSettings{
				Type:               domain.RecurrenceTypeWeekly,
				CurrentInstallment: 1,
				TotalInstallments:  4,
			},
		},
		{
			AccountID:       account.ID,
			CategoryID:      category.ID,
			TransactionType: domain.TransactionTypeExpense,
			Amount:          100,
			Date:            d,
			Description:     "Test monthly expense",
			Tags:            []domain.Tag{*tag},
			RecurrenceSettings: &domain.RecurrenceSettings{
				Type:               domain.RecurrenceTypeMonthly,
				CurrentInstallment: 1,
				TotalInstallments:  3,
			},
		},
		{
			AccountID:       account.ID,
			CategoryID:      category.ID,
			TransactionType: domain.TransactionTypeExpense,
			Amount:          100,
			Date:            d,
			Description:     "Test yearly expense",
			Tags:            []domain.Tag{*tag},
			RecurrenceSettings: &domain.RecurrenceSettings{
				Type:               domain.RecurrenceTypeYearly,
				CurrentInstallment: 1,
				TotalInstallments:  3,
			},
		},
	}

	for _, transaction := range transactions {
		_, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
		if err != nil {
			suite.T().Fatalf("Failed to create transaction: %v", err)
		}
	}

	transactionsDB, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{
			Field: "installment_number",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsDB, lo.SumBy(transactions, func(transaction domain.TransactionCreateRequest) int {
		return transaction.RecurrenceSettings.TotalInstallments
	}))

	dailyDate := d
	dailyInstallment := 1

	weeklyDate := d
	weeklyInstallment := 1

	monthlyDate := d
	monthlyInstallment := 1

	yearlyDate := d
	yearlyInstallment := 1

	for _, t := range transactionsDB {
		suite.Assert().NotNil(t.TransactionRecurrenceID)
		suite.Assert().NotNil(t.InstallmentNumber)
		suite.Assert().Equal(t.UserID, user.ID)
		suite.Assert().Equal(lo.FromPtr(t.OriginalUserID), user.ID)
		suite.Assert().Equal(t.AccountID, account.ID)
		suite.Assert().Equal(int64(t.Amount), int64(100))
		suite.Assert().Equal(t.Type, domain.TransactionTypeExpense)
		suite.Assert().Len(t.Tags, 1)
		suite.Assert().Equal(t.Tags[0].ID, tag.ID)

		if t.Description == "Test daily expense" {
			suite.Assert().Equal(t.Date, dailyDate, "daily date")
			suite.Assert().Equal(lo.FromPtr(t.InstallmentNumber), dailyInstallment, "daily installment")
			dailyDate = dailyDate.AddDate(0, 0, 1)
			dailyInstallment++
			continue
		}

		if t.Description == "Test weekly expense" {
			suite.Assert().Equal(t.Date, weeklyDate, "weekly date")
			suite.Assert().Equal(lo.FromPtr(t.InstallmentNumber), weeklyInstallment, "weekly installment")
			weeklyDate = weeklyDate.AddDate(0, 0, 7)
			weeklyInstallment++
			continue
		}

		if t.Description == "Test monthly expense" {
			suite.Assert().Equal(t.Date, monthlyDate, "monthly date")
			suite.Assert().Equal(lo.FromPtr(t.InstallmentNumber), monthlyInstallment, "monthly installment")
			monthlyDate = monthlyDate.AddDate(0, 1, 0)
			monthlyInstallment++
			continue
		}

		if t.Description == "Test yearly expense" {
			suite.Assert().Equal(t.Date, yearlyDate, "yearly date")
			suite.Assert().Equal(lo.FromPtr(t.InstallmentNumber), yearlyInstallment, "yearly installment")
			yearlyDate = yearlyDate.AddDate(1, 0, 0)
			yearlyInstallment++
			continue
		}

		suite.T().Fatalf("Unknown transaction description: %s", t.Description)
	}

	suite.Assert().Equal(dailyInstallment-1, 30)
	suite.Assert().Equal(weeklyInstallment-1, 4)
	suite.Assert().Equal(monthlyInstallment-1, 3)
	suite.Assert().Equal(yearlyInstallment-1, 3)
}

func (suite *TransactionCreateWithDBTestSuite) TestCreateSharedExpense() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user1)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user1)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	amount := int64(100)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          amount,
		Date:            d,
		Description:     "Test transaction",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactionsUser1, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:          &user1.ID,
		WithSettlements: true,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsUser1, 1)

	suite.Assert().NoError(err)

	suite.Assert().Greater(transactionsUser1[0].ID, 0)
	suite.Assert().Equal(account.ID, transactionsUser1[0].AccountID)
	suite.Assert().Equal(category.ID, lo.FromPtr(transactionsUser1[0].CategoryID))
	suite.Assert().Equal(amount, int64(transactionsUser1[0].Amount))
	suite.Assert().Equal(d, transactionsUser1[0].Date)
	suite.Assert().Equal("Test transaction", transactionsUser1[0].Description)
	suite.Assert().Equal(domain.TransactionTypeExpense, transactionsUser1[0].Type)
	suite.Assert().Equal(user1.ID, transactionsUser1[0].UserID)
	suite.Assert().Equal(user1.ID, lo.FromPtr(transactionsUser1[0].OriginalUserID))

	suite.Assert().Len(transactionsUser1[0].LinkedTransactions, 1)

	suite.Assert().Equal(userConnection.ToAccountID, transactionsUser1[0].LinkedTransactions[0].AccountID)
	suite.Assert().Nil(transactionsUser1[0].LinkedTransactions[0].CategoryID)
	suite.Assert().Equal(int64(amount/2), int64(transactionsUser1[0].LinkedTransactions[0].Amount))
	suite.Assert().Equal(d, transactionsUser1[0].LinkedTransactions[0].Date)
	suite.Assert().Equal("Test transaction", transactionsUser1[0].LinkedTransactions[0].Description)
	suite.Assert().Equal(domain.TransactionTypeExpense, transactionsUser1[0].LinkedTransactions[0].Type)
	suite.Assert().Equal(user2.ID, transactionsUser1[0].LinkedTransactions[0].UserID)
	suite.Assert().Equal(user1.ID, lo.FromPtr(transactionsUser1[0].LinkedTransactions[0].OriginalUserID))

	suite.Assert().Len(transactionsUser1[0].SettlementsFromSource, 1)
	settlement := transactionsUser1[0].SettlementsFromSource[0]
	suite.Assert().Equal(user1.ID, settlement.UserID)
	suite.Assert().Equal(domain.SettlementTypeCredit, settlement.Type)
	suite.Assert().Equal(int64(amount/2), settlement.Amount)
	suite.Assert().Equal(userConnection.FromAccountID, settlement.AccountID)
	suite.Assert().Equal(transactionsUser1[0].ID, settlement.SourceTransactionID)
	suite.Assert().Equal(transactionsUser1[0].LinkedTransactions[0].ID, settlement.ParentTransactionID)

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
		SortBy: &domain.SortBy{
			Field: "type",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsUser2, 1)
	suite.Assert().NoError(err)

	suite.Assert().Greater(transactionsUser2[0].ID, 0)
	suite.Assert().Equal(userConnection.ToAccountID, transactionsUser2[0].AccountID)
	suite.Assert().Nil(transactionsUser2[0].CategoryID)
	suite.Assert().Equal(int64(amount/2), int64(transactionsUser2[0].Amount))
	suite.Assert().Equal(d, transactionsUser2[0].Date)
	suite.Assert().Equal("Test transaction", transactionsUser2[0].Description)
	suite.Assert().Equal(domain.TransactionTypeExpense, transactionsUser2[0].Type)
	suite.Assert().Equal(user2.ID, transactionsUser2[0].UserID)
	suite.Assert().Equal(user1.ID, lo.FromPtr(transactionsUser2[0].OriginalUserID))
}

func (suite *TransactionCreateWithDBTestSuite) TestCreateSharedIncome() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user1)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user1)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	amount := int64(100)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          amount,
		Date:            d,
		Description:     "Shared income",
		TransactionType: domain.TransactionTypeIncome,
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactionsUser1, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:          &user1.ID,
		WithSettlements: true,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsUser1, 1)

	suite.Assert().Greater(transactionsUser1[0].ID, 0)
	suite.Assert().Equal(account.ID, transactionsUser1[0].AccountID)
	suite.Assert().Equal(category.ID, lo.FromPtr(transactionsUser1[0].CategoryID))
	suite.Assert().Equal(amount, int64(transactionsUser1[0].Amount))
	suite.Assert().Equal(d, transactionsUser1[0].Date)
	suite.Assert().Equal("Shared income", transactionsUser1[0].Description)
	suite.Assert().Equal(domain.TransactionTypeIncome, transactionsUser1[0].Type)
	suite.Assert().Equal(user1.ID, transactionsUser1[0].UserID)
	suite.Assert().Equal(user1.ID, lo.FromPtr(transactionsUser1[0].OriginalUserID))

	suite.Assert().Len(transactionsUser1[0].LinkedTransactions, 1)

	suite.Assert().Equal(userConnection.ToAccountID, transactionsUser1[0].LinkedTransactions[0].AccountID)
	suite.Assert().Nil(transactionsUser1[0].LinkedTransactions[0].CategoryID)
	suite.Assert().Equal(int64(amount/2), int64(transactionsUser1[0].LinkedTransactions[0].Amount))
	suite.Assert().Equal(d, transactionsUser1[0].LinkedTransactions[0].Date)
	suite.Assert().Equal("Shared income", transactionsUser1[0].LinkedTransactions[0].Description)
	suite.Assert().Equal(domain.TransactionTypeIncome, transactionsUser1[0].LinkedTransactions[0].Type)
	suite.Assert().Equal(user2.ID, transactionsUser1[0].LinkedTransactions[0].UserID)
	suite.Assert().Equal(user1.ID, lo.FromPtr(transactionsUser1[0].LinkedTransactions[0].OriginalUserID))

	// Settlement should be debit for income (author owes partner)
	suite.Assert().Len(transactionsUser1[0].SettlementsFromSource, 1)
	settlement := transactionsUser1[0].SettlementsFromSource[0]
	suite.Assert().Equal(user1.ID, settlement.UserID)
	suite.Assert().Equal(domain.SettlementTypeDebit, settlement.Type)
	suite.Assert().Equal(int64(amount/2), settlement.Amount)
	suite.Assert().Equal(userConnection.FromAccountID, settlement.AccountID)
	suite.Assert().Equal(transactionsUser1[0].ID, settlement.SourceTransactionID)
	suite.Assert().Equal(transactionsUser1[0].LinkedTransactions[0].ID, settlement.ParentTransactionID)

	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user2.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsUser2, 1)

	suite.Assert().Greater(transactionsUser2[0].ID, 0)
	suite.Assert().Equal(userConnection.ToAccountID, transactionsUser2[0].AccountID)
	suite.Assert().Nil(transactionsUser2[0].CategoryID)
	suite.Assert().Equal(int64(amount/2), int64(transactionsUser2[0].Amount))
	suite.Assert().Equal(d, transactionsUser2[0].Date)
	suite.Assert().Equal("Shared income", transactionsUser2[0].Description)
	suite.Assert().Equal(domain.TransactionTypeIncome, transactionsUser2[0].Type)
	suite.Assert().Equal(user2.ID, transactionsUser2[0].UserID)
	suite.Assert().Equal(user1.ID, lo.FromPtr(transactionsUser2[0].OriginalUserID))
}

func (suite *TransactionCreateWithDBTestSuite) TestSearchSharedExpenseByFromAccountID() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user1)
	suite.Require().NoError(err)

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	amount := int64(100)
	d := now()
	period := domain.Period{Month: int(d.Month()), Year: d.Year()}

	sourceTxID, err := suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          amount,
		Date:            d,
		Description:     "Shared expense",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})
	suite.Require().NoError(err)

	// Case 1: user1 filters ONLY by the shared account (userConnection.FromAccountID).
	// The source transaction lives on the personal account so it must NOT be
	// returned; including it would make the shared-account balance double-count
	// (source tx amount + settlement amount). Instead, the service surfaces the
	// settlement as a synthetic Transaction entry: amount = settlement amount,
	// operation_type = credit, origin_settlement_id set, empty SettlementsFromSource.
	sharedOnly, err := suite.Services.Transaction.Search(ctx, user1.ID, period, domain.TransactionFilter{
		UserID:          &user1.ID,
		AccountIDs:      []int{userConnection.FromAccountID},
		WithSettlements: true,
	})
	suite.Require().NoError(err)

	suite.Require().Len(sharedOnly, 1, "shared-account view should surface the settlement as a synthetic entry")
	synthetic := sharedOnly[0]
	suite.Require().NotNil(synthetic.OriginSettlementID, "synthetic entry must carry origin_settlement_id")
	suite.Assert().Less(synthetic.ID, 0, "synthetic entry must have a negative sentinel id")
	suite.Assert().Equal(userConnection.FromAccountID, synthetic.AccountID, "synthetic entry lives on the shared account")
	suite.Assert().Equal(int64(amount/2), synthetic.Amount, "synthetic entry amount equals the settlement amount")
	suite.Assert().Equal(domain.OperationTypeCredit, synthetic.OperationType, "credit settlement maps to credit operation")
	suite.Assert().Equal(domain.TransactionTypeIncome, synthetic.Type, "credit settlement maps to income type")
	suite.Assert().Equal("Shared expense", synthetic.Description, "description is inherited from the source transaction")
	suite.Assert().Equal(d, synthetic.Date, "date is inherited from the source transaction")
	suite.Assert().Equal(user1.ID, synthetic.UserID)
	suite.Assert().Empty(synthetic.SettlementsFromSource, "synthetic entry must not preload nested settlements (would double-count)")
	suite.Require().NotNil(synthetic.SourceTransactionID, "synthetic entry must expose source_transaction_id so the frontend can open the source tx for editing")
	suite.Assert().Equal(sourceTxID, *synthetic.SourceTransactionID, "source_transaction_id must point at the real source transaction backing the settlement")

	// Case 2: user1 filters ONLY by the personal account — the real source
	// transaction is returned, and its settlement MUST be preloaded inline
	// so the UI can display it as context beneath the source row (the user
	// sees "I spent 100, of which 50 is coming back to me"). The settlement's
	// own account is the shared account, NOT the personal one, so the
	// frontend is expected to exclude it from the group net total; this
	// backend test only verifies that the data is there for display and
	// that no synthetic duplicate is appended.
	personalOnly, err := suite.Services.Transaction.Search(ctx, user1.ID, period, domain.TransactionFilter{
		UserID:          &user1.ID,
		AccountIDs:      []int{account.ID},
		WithSettlements: true,
	})
	suite.Require().NoError(err)
	suite.Require().Len(personalOnly, 1, "personal-only filter should return the source transaction exactly once (no synthetic dup)")
	personal := personalOnly[0]
	suite.Assert().Nil(personal.OriginSettlementID, "real source transaction must not be tagged as a synthetic entry")
	suite.Assert().Equal(account.ID, personal.AccountID)
	suite.Assert().Equal(amount, personal.Amount)
	suite.Require().Len(personal.SettlementsFromSource, 1, "settlement must be preloaded inline for display context under the source transaction")
	suite.Assert().Equal(userConnection.FromAccountID, personal.SettlementsFromSource[0].AccountID, "preloaded settlement keeps its own account_id so the frontend can decide to exclude it from the group sum")

	// Case 2b (balance consistency): GetBalance filtered by the personal
	// account must return exactly the source transaction's contribution
	// (-amount) — the settlement is NOT part of this leg because its
	// account_id isn't in the filter. The frontend's group-total must match
	// this value after excluding out-of-scope nested settlements.
	balancePersonal, err := suite.Services.Transaction.GetBalance(ctx, user1.ID, period, domain.BalanceFilter{
		AccountIDs: []int{account.ID},
	})
	suite.Require().NoError(err)
	suite.Assert().Equal(-amount, balancePersonal.Balance, "personal-only balance must equal just the source tx amount; nested settlement stays informational")

	// Case 3: user1 filters by BOTH personal AND shared accounts — the source
	// transaction is in the filter AND the settlement's account is in the
	// filter. The source tx is returned with its settlement preloaded (scoped
	// preload admits it), and NO synthetic entry is appended (would be a
	// duplicate of the attached settlement).
	both, err := suite.Services.Transaction.Search(ctx, user1.ID, period, domain.TransactionFilter{
		UserID:          &user1.ID,
		AccountIDs:      []int{account.ID, userConnection.FromAccountID},
		WithSettlements: true,
	})
	suite.Require().NoError(err)
	suite.Require().Len(both, 1, "combined filter must not duplicate the source transaction")
	suite.Assert().Equal(account.ID, both[0].AccountID)
	suite.Require().Len(both[0].SettlementsFromSource, 1, "scoped preload should attach the settlement since its account matches the filter")
	suite.Assert().Equal(userConnection.FromAccountID, both[0].SettlementsFromSource[0].AccountID)

	// Case 4: user2 filters by user1's FromAccountID — must return nothing,
	// because the settlement's user_id scopes the query to user1.
	crossUser, err := suite.Services.Transaction.Search(ctx, user2.ID, period, domain.TransactionFilter{
		UserID:          &user2.ID,
		AccountIDs:      []int{userConnection.FromAccountID},
		WithSettlements: true,
	})
	suite.Require().NoError(err)
	suite.Assert().Empty(crossUser, "user2 must not see user1's settlement-bound entries")
}

func (suite *TransactionCreateWithDBTestSuite) TestCreateSharedExpenseWithToUserAsOwner() {
	ctx := context.Background()
	user1, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	user2, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user2)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user2)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	userConnection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	if err != nil {
		suite.T().Fatalf("Failed to create accepted test user connection: %v", err)
	}

	amount := int64(100)

	d := now()

	_, err = suite.Services.Transaction.Create(ctx, user2.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		CategoryID:      category.ID,
		Amount:          amount,
		Date:            d,
		Description:     "Test transaction",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{
				ConnectionID: userConnection.ID,
				Percentage:   lo.ToPtr(50),
			},
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	// Despesa compartilhada com to_user como dono: criada apenas na to_account. Conexão é user1->user2; quando user2 cria, to_account é a conta do "outro" (user1).
	transactionsUser1, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user1.ID,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsUser1, 1)
	suite.Assert().NoError(err)

	suite.Assert().Greater(transactionsUser1[0].ID, 0)
	suite.Assert().Equal(userConnection.FromAccountID, transactionsUser1[0].AccountID)
	suite.Assert().Nil(transactionsUser1[0].CategoryID)
	suite.Assert().Equal(int64(amount/2), int64(transactionsUser1[0].Amount))
	suite.Assert().Equal(d, transactionsUser1[0].Date)
	suite.Assert().Equal("Test transaction", transactionsUser1[0].Description)
	suite.Assert().Equal(domain.TransactionTypeExpense, transactionsUser1[0].Type)
	suite.Assert().Equal(user1.ID, transactionsUser1[0].UserID)
	suite.Assert().Equal(user2.ID, lo.FromPtr(transactionsUser1[0].OriginalUserID))

	// User2 (criador) não tem transação na própria conta
	transactionsUser2, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID:          &user2.ID,
		WithSettlements: true,
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactionsUser2, 1)

	suite.Assert().Greater(transactionsUser2[0].ID, 0)
	suite.Assert().Equal(account.ID, transactionsUser2[0].AccountID)
	suite.Assert().NotNil(transactionsUser2[0].CategoryID)
	suite.Assert().Equal(amount, int64(transactionsUser2[0].Amount))
	suite.Assert().Equal(d, transactionsUser2[0].Date)
	suite.Assert().Equal("Test transaction", transactionsUser2[0].Description)
	suite.Assert().Equal(domain.TransactionTypeExpense, transactionsUser2[0].Type)
	suite.Assert().Equal(user2.ID, transactionsUser2[0].UserID)
	suite.Assert().Equal(user2.ID, lo.FromPtr(transactionsUser2[0].OriginalUserID))

	suite.Assert().Len(transactionsUser2[0].SettlementsFromSource, 1)
	settlement := transactionsUser2[0].SettlementsFromSource[0]
	suite.Assert().Equal(user2.ID, settlement.UserID)
	suite.Assert().Equal(domain.SettlementTypeCredit, settlement.Type)
	suite.Assert().Equal(int64(amount/2), settlement.Amount)
	suite.Assert().Equal(userConnection.ToAccountID, settlement.AccountID)
	suite.Assert().Equal(transactionsUser2[0].ID, settlement.SourceTransactionID)
	suite.Assert().Equal(transactionsUser1[0].ID, settlement.ParentTransactionID)
}

func (suite *TransactionCreateWithDBTestSuite) TestCreateRecurringExpenseFrom1of5() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	baseDate := now()

	req := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		TransactionType: domain.TransactionTypeExpense,
		CategoryID:      category.ID,
		Amount:          1000,
		Date:            baseDate,
		Description:     "TST-01 recurring expense",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  5,
		},
	}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &req)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{
			Field: "installment_number",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}

	// TST-01: exactly 5 installments created
	suite.Assert().Len(transactions, 5, "expected 5 installments for current=1,total=5")

	for i := range 5 {
		// TST-01: installments numbered 1 through 5
		suite.Assert().Equal(i+1, lo.FromPtr(transactions[i].InstallmentNumber), fmt.Sprintf("transactions[%d].InstallmentNumber should be %d", i, i+1))
		// TST-03: date of installment N = baseDate + (N - current_installment) * 1 month
		expectedDate := baseDate.AddDate(0, i, 0)
		suite.Assert().Equal(expectedDate, transactions[i].Date, fmt.Sprintf("transactions[%d].Date should be %s (baseDate + %d months)", i, expectedDate, i))
		// Each installment must have a recurrence ID
		suite.Assert().NotNil(transactions[i].TransactionRecurrenceID, fmt.Sprintf("transactions[%d].TransactionRecurrenceID should not be nil", i))
	}
}

func (suite *TransactionCreateWithDBTestSuite) TestCreateRecurringExpenseFrom3of10() {
	ctx := context.Background()
	user, err := suite.createTestUser(ctx)
	if err != nil {
		suite.T().Fatalf("Failed to create test user: %v", err)
	}

	account, err := suite.createTestAccount(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test account: %v", err)
	}

	category, err := suite.createTestCategory(ctx, user)
	if err != nil {
		suite.T().Fatalf("Failed to create test category: %v", err)
	}

	baseDate := now()

	req := domain.TransactionCreateRequest{
		AccountID:       account.ID,
		TransactionType: domain.TransactionTypeExpense,
		CategoryID:      category.ID,
		Amount:          1000,
		Date:            baseDate,
		Description:     "TST-02 recurring expense",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 3,
			TotalInstallments:  10,
		},
	}

	_, err = suite.Services.Transaction.Create(ctx, user.ID, &req)
	if err != nil {
		suite.T().Fatalf("Failed to create transaction: %v", err)
	}

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user.ID,
		SortBy: &domain.SortBy{
			Field: "installment_number",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transactions: %v", err)
	}

	// TST-02: exactly 8 installments created (installments 3 through 10)
	suite.Assert().Len(transactions, 8, "expected 8 installments for current=3,total=10")

	// TST-02: first installment is #3, last is #10
	suite.Assert().Equal(3, lo.FromPtr(transactions[0].InstallmentNumber), "transactions[0].InstallmentNumber should be 3")
	suite.Assert().Equal(10, lo.FromPtr(transactions[7].InstallmentNumber), "transactions[7].InstallmentNumber should be 10")

	// TST-03: installment 3 gets baseDate, installment 4 gets baseDate+1mo, ... installment 10 gets baseDate+7mo
	for i := range 8 {
		expectedInstallmentNumber := i + 3
		suite.Assert().Equal(expectedInstallmentNumber, lo.FromPtr(transactions[i].InstallmentNumber), fmt.Sprintf("transactions[%d].InstallmentNumber should be %d", i, expectedInstallmentNumber))
		expectedDate := baseDate.AddDate(0, i, 0)
		suite.Assert().Equal(expectedDate, transactions[i].Date, fmt.Sprintf("transactions[%d].Date should be %s (baseDate + %d months)", i, expectedDate, i))
		suite.Assert().NotNil(transactions[i].TransactionRecurrenceID, fmt.Sprintf("transactions[%d].TransactionRecurrenceID should not be nil", i))
	}

	// TST-02: assert TransactionRecurrence.Installments == 10 (total installments stored on the recurrence record)
	recurrenceID := lo.FromPtr(transactions[0].TransactionRecurrenceID)
	recurrences, err := suite.Repos.TransactionRecurrence.Search(ctx, domain.TransactionRecurrenceFilter{
		IDs: []int{recurrenceID},
	})
	if err != nil {
		suite.T().Fatalf("Failed to search transaction recurrences: %v", err)
	}
	suite.Assert().Len(recurrences, 1, "expected 1 recurrence record")
	suite.Assert().Equal(10, recurrences[0].Installments, "TransactionRecurrence.Installments should be 10 (total_installments)")
}

func now() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

func TestTransactionCreateWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	suite.Run(t, new(TransactionCreateWithDBTestSuite))
}

type TransactionCreateValidationTestSuite struct {
	ServiceTestSuite
}

func (suite *TransactionCreateValidationTestSuite) TestValidationRejectsMissingCurrentInstallment() {
	req := domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       1,
		CategoryID:      1,
		Amount:          100,
		Date:            time.Now(),
		Description:     "test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 0,
			TotalInstallments:  5,
		},
	}

	_, err := suite.Services.Transaction.Create(context.Background(), suite.UserID, &req)
	suite.Assert().Error(err)
	suite.Assert().True(pkgErrors.Is(err, *pkgErrors.ErrRecurrenceCurrentInstallmentMustBeAtLeastOne), "expected ErrRecurrenceCurrentInstallmentMustBeAtLeastOne")
}

func (suite *TransactionCreateValidationTestSuite) TestValidationRejectsCurrentGreaterThanTotal() {
	req := domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       1,
		CategoryID:      1,
		Amount:          100,
		Date:            time.Now(),
		Description:     "test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 5,
			TotalInstallments:  3,
		},
	}

	_, err := suite.Services.Transaction.Create(context.Background(), suite.UserID, &req)
	suite.Assert().Error(err)
	suite.Assert().True(pkgErrors.Is(err, *pkgErrors.ErrRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent), "expected ErrRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent")
}

func (suite *TransactionCreateValidationTestSuite) TestValidationRejectsTotalGreaterThan1000() {
	req := domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense,
		AccountID:       1,
		CategoryID:      1,
		Amount:          100,
		Date:            time.Now(),
		Description:     "test",
		RecurrenceSettings: &domain.RecurrenceSettings{
			Type:               domain.RecurrenceTypeMonthly,
			CurrentInstallment: 1,
			TotalInstallments:  1001,
		},
	}

	_, err := suite.Services.Transaction.Create(context.Background(), suite.UserID, &req)
	suite.Assert().Error(err)
	suite.Assert().True(pkgErrors.Is(err, *pkgErrors.ErrRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo(1000)), "expected ErrRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo(1000)")
}

func TestTransactionCreateValidation(t *testing.T) {
	suite.Run(t, new(TransactionCreateValidationTestSuite))
}
