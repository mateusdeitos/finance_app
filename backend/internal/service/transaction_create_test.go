package service

import (
	"context"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
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

	suite.Assert().Len(transactions, 1)

	suite.Assert().NoError(err)

	suite.Assert().Greater(transactions[0].ID, 0)
	suite.Assert().Equal(transaction.AccountID, transactions[0].AccountID)
	suite.Assert().Equal(transaction.CategoryID, lo.FromPtr(transactions[0].CategoryID))
	suite.Assert().Equal(transaction.Amount, transactions[0].Amount)
	suite.Assert().Equal(transaction.Date, transactions[0].Date)
	suite.Assert().Equal(transaction.Description, transactions[0].Description)

	suite.Assert().Len(transactions[0].Tags, 1)
	suite.Assert().Equal(transaction.Tags[0].ID, transactions[0].Tags[0].ID)

	suite.Assert().Nil(transactions[0].ParentID)
	suite.Assert().Nil(transactions[0].TransactionRecurrenceID)
	suite.Assert().Nil(transactions[0].InstallmentNumber)
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

	suite.Assert().Len(transactions, 1)

	suite.Assert().NoError(err)

	suite.Assert().Greater(transactions[0].ID, 0)
	suite.Assert().Equal(transaction.AccountID, transactions[0].AccountID)
	suite.Assert().Equal(transaction.CategoryID, lo.FromPtr(transactions[0].CategoryID))
	suite.Assert().Equal(transaction.Amount, transactions[0].Amount)
	suite.Assert().Equal(transaction.Date, transactions[0].Date)
	suite.Assert().Equal(transaction.Description, transactions[0].Description)

	suite.Assert().Len(transactions[0].Tags, 1)
	suite.Assert().Equal(transaction.Tags[0].ID, transactions[0].Tags[0].ID)

	suite.Assert().Nil(transactions[0].ParentID)
	suite.Assert().Nil(transactions[0].TransactionRecurrenceID)
	suite.Assert().Nil(transactions[0].InstallmentNumber)
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

	suite.Assert().Len(transactions, 1)

	suite.Assert().NoError(err)

	suite.Assert().Greater(transactions[0].ID, 0)
	suite.Assert().Equal(transaction.AccountID, transactions[0].AccountID)
	suite.Assert().Equal(transaction.DestinationAccountID, transactions[0].DestinationAccountID)
	suite.Assert().Equal(transaction.Amount, transactions[0].Amount)
	suite.Assert().Equal(transaction.Date, transactions[0].Date)
	suite.Assert().Equal(transaction.Description, transactions[0].Description)
	suite.Assert().Len(transactions[0].Tags, 1)
	suite.Assert().Equal(transaction.Tags[0].ID, transactions[0].Tags[0].ID)

	suite.Assert().Nil(transactions[0].ParentID)
	suite.Assert().Nil(transactions[0].TransactionRecurrenceID)
	suite.Assert().Nil(transactions[0].InstallmentNumber)
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
				Type:        domain.RecurrenceTypeDaily,
				Repetitions: lo.ToPtr(30),
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
				Type:        domain.RecurrenceTypeWeekly,
				Repetitions: lo.ToPtr(4),
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
				Type:        domain.RecurrenceTypeMonthly,
				Repetitions: lo.ToPtr(3),
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
				Type:        domain.RecurrenceTypeYearly,
				Repetitions: lo.ToPtr(3),
			},
		},
	}

	for _, transaction := range transactions {
		err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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
		return lo.FromPtr(transaction.RecurrenceSettings.Repetitions)
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

func (suite *TransactionCreateWithDBTestSuite) TestCreateRecurringExpenseWithEndDate() {
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
				Type:    domain.RecurrenceTypeDaily,
				EndDate: lo.ToPtr(d.AddDate(0, 0, 30)),
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
				Type:    domain.RecurrenceTypeWeekly,
				EndDate: lo.ToPtr(d.AddDate(0, 0, 28)),
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
				Type:    domain.RecurrenceTypeMonthly,
				EndDate: lo.ToPtr(d.AddDate(0, 3, 0)),
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
				Type:    domain.RecurrenceTypeYearly,
				EndDate: lo.ToPtr(d.AddDate(3, 0, 0)),
			},
		},
	}

	for _, transaction := range transactions {
		err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
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

	suite.Assert().Len(transactionsDB, 40)

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

	err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
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

	transactions, err := suite.Repos.Transaction.Search(ctx, domain.TransactionFilter{
		UserID: &user1.ID,
		SortBy: &domain.SortBy{
			Field: "type",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		suite.T().Fatalf("Failed to get transaction: %v", err)
	}

	suite.Assert().Len(transactions, 2)

	suite.Assert().NoError(err)

	suite.Assert().Greater(transactions[0].ID, 0)
	suite.Assert().Nil(transactions[0].ParentID)
	suite.Assert().Equal(transactions[0].AccountID, account.ID)
	suite.Assert().Equal(lo.FromPtr(transactions[0].CategoryID), category.ID)
	suite.Assert().Equal(int64(transactions[0].Amount), amount)
	suite.Assert().Equal(transactions[0].Date, d)
	suite.Assert().Equal(transactions[0].Description, "Test transaction")
	suite.Assert().Equal(transactions[0].Type, domain.TransactionTypeExpense)

	suite.Assert().Greater(transactions[1].ID, 0)
	suite.Assert().NotNil(transactions[1].ParentID)
	suite.Assert().Equal(lo.FromPtr(transactions[1].ParentID), transactions[0].ID)
	suite.Assert().Equal(transactions[1].AccountID, userConnection.FromAccountID)
	suite.Assert().Equal(lo.FromPtr(transactions[1].CategoryID), category.ID)
	suite.Assert().Equal(int64(transactions[1].Amount), int64(amount/2))
	suite.Assert().Equal(transactions[1].Date, d)
	suite.Assert().Equal(transactions[1].Description, "Test transaction")
	suite.Assert().Equal(transactions[1].Type, domain.TransactionTypeIncome)

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
	suite.Assert().Equal(transactionsUser2[0].UserID, user2.ID)
	suite.Assert().NotNil(transactionsUser2[0].ParentID)
	suite.Assert().Equal(lo.FromPtr(transactionsUser2[0].ParentID), transactions[0].ID)
	suite.Assert().Equal(transactionsUser2[0].AccountID, userConnection.ToAccountID)
	suite.Assert().Nil(transactionsUser2[0].CategoryID)
	suite.Assert().Equal(int64(transactionsUser2[0].Amount), int64(amount/2))
	suite.Assert().Equal(transactionsUser2[0].Date, d)
	suite.Assert().Equal(transactionsUser2[0].Description, "Test transaction")
	suite.Assert().Equal(transactionsUser2[0].Type, domain.TransactionTypeExpense)
}

func now() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

func TestTransactionCreateWithDB(t *testing.T) {
	suite.Run(t, new(TransactionCreateWithDBTestSuite))
}
