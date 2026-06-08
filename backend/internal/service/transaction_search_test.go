package service

import (
	"context"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	"github.com/samber/lo"
	"github.com/stretchr/testify/suite"
)

type TransactionSearchWithDBTestSuite struct {
	ServiceTestWithDBSuite
}

// seedSearchTransactions creates one expense per (description, amount) pair for a
// fresh user/account/category and returns the user and period to search within.
func (suite *TransactionSearchWithDBTestSuite) seedSearchTransactions(ctx context.Context, rows []struct {
	description string
	amount      int64
}) (*domain.User, domain.Period) {
	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	date := now()
	for _, r := range rows {
		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
			TransactionType: domain.TransactionTypeExpense,
			AccountID:       account.ID,
			CategoryID:      category.ID,
			Amount:          r.amount,
			Date:            domain.Date{Time: date},
			Description:     r.description,
		})
		suite.Require().NoError(err)
	}

	return user, domain.Period{Month: int(date.Month()), Year: date.Year()}
}

func (suite *TransactionSearchWithDBTestSuite) searchDescriptions(ctx context.Context, user *domain.User, period domain.Period, query string) []string {
	txs, err := suite.Services.Transaction.Search(ctx, user.ID, period, domain.TransactionFilter{
		UserID:      &user.ID,
		Description: &domain.TextSearch{Query: query},
	})
	suite.Require().NoError(err)
	return lo.Map(txs, func(t *domain.Transaction, _ int) string { return t.Description })
}

// Searching "uniao" must match transactions whose description contains the
// accented "união" as well as the unaccented "uniao".
func (suite *TransactionSearchWithDBTestSuite) TestSearch_IgnoresAccents() {
	ctx := context.Background()
	user, period := suite.seedSearchTransactions(ctx, []struct {
		description string
		amount      int64
	}{
		{"Conta de união", 1000},
		{"Conta de uniao", 1000},
		{"Aluguel", 1000},
	})

	got := suite.searchDescriptions(ctx, user, period, "uniao")
	suite.Assert().ElementsMatch([]string{"Conta de união", "Conta de uniao"}, got)

	// And the accented query also matches the unaccented row.
	got = suite.searchDescriptions(ctx, user, period, "união")
	suite.Assert().ElementsMatch([]string{"Conta de união", "Conta de uniao"}, got)
}

// Searching "50" must partially match the amount formatted as "reais,centavos":
// 50,10 / 50,00 / 1,50 all contain "50".
func (suite *TransactionSearchWithDBTestSuite) TestSearch_PartialAmountMatch_Integer() {
	ctx := context.Background()
	user, period := suite.seedSearchTransactions(ctx, []struct {
		description string
		amount      int64
	}{
		{"fifty ten", 5010}, // 50,10
		{"fifty", 5000},     // 50,00
		{"one fifty", 150},  // 1,50
		{"thirty", 3000},    // 30,00 (no "50")
	})

	got := suite.searchDescriptions(ctx, user, period, "50")
	suite.Assert().ElementsMatch([]string{"fifty ten", "fifty", "one fifty"}, got)
}

// Searching "1,5" must partially match 1,50 / 21,56 / 1,59.
func (suite *TransactionSearchWithDBTestSuite) TestSearch_PartialAmountMatch_Decimal() {
	ctx := context.Background()
	user, period := suite.seedSearchTransactions(ctx, []struct {
		description string
		amount      int64
	}{
		{"one fifty", 150},             // 1,50
		{"twenty one fifty six", 2156}, // 21,56
		{"one fifty nine", 159},        // 1,59
		{"two", 200},                   // 2,00 (no "1,5")
	})

	got := suite.searchDescriptions(ctx, user, period, "1,5")
	suite.Assert().ElementsMatch([]string{"one fifty", "twenty one fifty six", "one fifty nine"}, got)

	// A dot typed by the user is treated like the comma separator.
	got = suite.searchDescriptions(ctx, user, period, "1.5")
	suite.Assert().ElementsMatch([]string{"one fifty", "twenty one fifty six", "one fifty nine"}, got)
}

func TestTransactionSearchWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}
	suite.Run(t, new(TransactionSearchWithDBTestSuite))
}
