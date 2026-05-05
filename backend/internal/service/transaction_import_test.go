package service

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
)

// ---------------------------------------------------------------------------
// Pure unit tests
// ---------------------------------------------------------------------------

func TestParseAmountSigned(t *testing.T) {
	cases := []struct {
		input     string
		separator ImportDecimalSeparatorValue
		want      int64
		wantErr   bool
	}{
		// Comma (Brazilian)
		{"150,00", DecimalSeparatorComma, 15000, false},
		{"1.234,56", DecimalSeparatorComma, 123456, false},
		{"-50,00", DecimalSeparatorComma, -5000, false},
		// Dot (International)
		{"150.00", DecimalSeparatorDot, 15000, false},
		{"1,234.56", DecimalSeparatorDot, 123456, false},
		{"-50.00", DecimalSeparatorDot, -5000, false},
		// General
		{"100", DecimalSeparatorComma, 10000, false},
		{"abc", DecimalSeparatorComma, 0, true},
		{"", DecimalSeparatorComma, 0, true},
	}

	for _, tc := range cases {
		t.Run(fmt.Sprintf("%s_%s", tc.input, tc.separator), func(t *testing.T) {
			got, err := parseAmountSigned(tc.input, tc.separator)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.want, got)
			}
		})
	}
}

func TestParseCSVHeader(t *testing.T) {
	cases := []struct {
		name    string
		header  []string
		wantErr bool
		checks  func(t *testing.T, idx csvColumnIndex)
	}{
		{
			name:    "valid simplified header",
			header:  []string{"Data", "Descrição", "Valor"},
			wantErr: false,
			checks: func(t *testing.T, idx csvColumnIndex) {
				t.Helper()
				assert.Equal(t, 0, idx.date)
				assert.Equal(t, 1, idx.description)
				assert.Equal(t, 2, idx.amount)
			},
		},
		{
			name:    "missing Valor column",
			header:  []string{"Data", "Descrição"},
			wantErr: true,
		},
		{
			name:    "uppercase header",
			header:  []string{"DATA", "DESCRIÇÃO", "VALOR"},
			wantErr: false,
			checks: func(t *testing.T, idx csvColumnIndex) {
				t.Helper()
				assert.Equal(t, 0, idx.date)
				assert.Equal(t, 1, idx.description)
				assert.Equal(t, 2, idx.amount)
			},
		},
		{
			name:    "description without accent (descricao)",
			header:  []string{"Data", "Descricao", "Valor"},
			wantErr: false,
			checks: func(t *testing.T, idx csvColumnIndex) {
				t.Helper()
				assert.Equal(t, 1, idx.description)
			},
		},
		{
			name:    "with optional category column",
			header:  []string{"Data", "Descrição", "Valor", "Categoria"},
			wantErr: false,
			checks: func(t *testing.T, idx csvColumnIndex) {
				t.Helper()
				assert.Equal(t, 0, idx.date)
				assert.Equal(t, 1, idx.description)
				assert.Equal(t, 2, idx.amount)
				assert.Equal(t, 3, idx.category)
			},
		},
		{
			name:    "category column english",
			header:  []string{"Data", "Descrição", "Valor", "Category"},
			wantErr: false,
			checks: func(t *testing.T, idx csvColumnIndex) {
				t.Helper()
				assert.Equal(t, 3, idx.category)
			},
		},
		{
			name:    "without category column keeps -1",
			header:  []string{"Data", "Descrição", "Valor"},
			wantErr: false,
			checks: func(t *testing.T, idx csvColumnIndex) {
				t.Helper()
				assert.Equal(t, -1, idx.category)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			idx, err := parseCSVHeader(tc.header)
			if tc.wantErr {
				require.Error(t, err)
				assert.ErrorIs(t, err, pkgErrors.ErrImportInvalidLayout)
			} else {
				require.NoError(t, err)
				if tc.checks != nil {
					tc.checks(t, idx)
				}
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

const csvSimpleHeader = "Data;Descrição;Valor"
const csvHeaderWithCategory = "Data;Descrição;Valor;Categoria"

func buildCSV(rows [][]string) []byte {
	return buildCSVWithHeader(csvSimpleHeader, rows)
}

func buildCSVWithHeader(header string, rows [][]string) []byte {
	lines := make([]string, 0, len(rows)+1)
	lines = append(lines, header)
	for _, row := range rows {
		lines = append(lines, strings.Join(row, ";"))
	}
	return []byte(strings.Join(lines, "\n"))
}

type TransactionImportWithDBTestSuite struct {
	ServiceTestWithDBSuite
}

func (suite *TransactionImportWithDBTestSuite) TestParseImportCSV() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	suite.Run("empty file", func() {
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, []byte{})
		suite.ErrorIs(err, pkgErrors.ErrImportEmptyFile)
	})

	suite.Run("only header no data rows", func() {
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, []byte(csvSimpleHeader))
		suite.ErrorIs(err, pkgErrors.ErrImportNoRows)
	})

	suite.Run("invalid layout missing Valor", func() {
		csv := []byte("Data;Descrição\n01/01/2026;Test")
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.ErrorIs(err, pkgErrors.ErrImportInvalidLayout)
	})

	suite.Run("more than 100 rows", func() {
		rows := make([][]string, 101)
		for i := range rows {
			rows[i] = []string{"01/01/2026", "Test", "100,00"}
		}
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, buildCSV(rows))
		suite.ErrorIs(err, pkgErrors.ErrImportMaxRowsExceeded)
	})

	suite.Run("UTF-8 BOM stripped", func() {
		csv := append([]byte{0xEF, 0xBB, 0xBF}, buildCSV([][]string{
			{"01/01/2026", "Aluguel", "-150,00"},
		})...)
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Equal(1, resp.TotalRows)
	})

	suite.Run("infer type as expense (negative value)", func() {
		csv := buildCSV([][]string{
			{"15/03/2026", "Supermercado", "-250,00"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Equal(1, resp.TotalRows)
		row := resp.Rows[0]
		suite.Equal("Supermercado", row.Description)
		suite.Equal(domain.TransactionTypeExpense, row.Type)
		suite.EqualValues(25000, row.Amount) // Absolute value in cents
		suite.Require().NotNil(row.Date)
		suite.Equal(15, row.Date.Day())
	})

	suite.Run("infer type as income (positive value)", func() {
		csv := buildCSV([][]string{
			{"15/03/2026", "Salário", "5000,00"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		row := resp.Rows[0]
		suite.Equal(domain.TransactionTypeIncome, row.Type)
		suite.EqualValues(500000, row.Amount)
	})

	suite.Run("duplicate detection", func() {
		// Criar categoria obrigatória
		category, err := suite.createTestCategory(ctx, user)
		suite.Require().NoError(err)

		txDate := time.Date(2026, 2, 10, 0, 0, 0, 0, time.UTC)
		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
			AccountID:       account.ID,
			TransactionType: domain.TransactionTypeExpense,
			CategoryID:      category.ID,
			Amount:          5000,
			Date:            domain.Date{Time: txDate},
			Description:     "Netflix",
		})
		suite.Require().NoError(err)

		csv := buildCSV([][]string{
			{"10/02/2026", "Netflix", "-50,00"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Equal(domain.ImportRowStatusDuplicate, resp.Rows[0].Status)
		suite.Equal(1, resp.DuplicateCount)
	})

	suite.Run("capture line error as description", func() {
		// CSV corrompido (aspas não fechadas, por exemplo)
		corruptedLine := "01/01/2026;\"Texto mal fechado;100,00"
		csv := []byte(csvSimpleHeader + "\n" + corruptedLine)

		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Equal(1, resp.TotalRows)
		suite.Contains(resp.Rows[0].Description, "Conteúdo ilegível")
		suite.NotEmpty(resp.Rows[0].ParseErrors)
		suite.Equal(1, resp.ErrorCount)
	})
}

func (suite *TransactionImportWithDBTestSuite) TestCheckDuplicateTransaction() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	// Criar categoria obrigatória
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	txDate := time.Date(2026, 3, 20, 0, 0, 0, 0, time.UTC)

	suite.Run("existing transaction is duplicate", func() {
		_, err := suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
			AccountID:       account.ID,
			TransactionType: domain.TransactionTypeExpense,
			CategoryID:      category.ID,
			Amount:          7500,
			Date:            domain.Date{Time: txDate},
			Description:     "Spotify Check",
		})
		suite.Require().NoError(err)

		isDup, err := suite.Services.Transaction.CheckDuplicateTransaction(ctx, user.ID, "2026-03-20", 7500, &account.ID)
		suite.Require().NoError(err)
		suite.True(isDup)
	})

	suite.Run("duplicate detected regardless of description", func() {
		_, err := suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
			AccountID:       account.ID,
			TransactionType: domain.TransactionTypeExpense,
			CategoryID:      category.ID,
			Amount:          8800,
			Date:            domain.Date{Time: txDate},
			Description:     "Original Description",
		})
		suite.Require().NoError(err)

		isDup, err := suite.Services.Transaction.CheckDuplicateTransaction(ctx, user.ID, "2026-03-20", 8800, &account.ID)
		suite.Require().NoError(err)
		suite.True(isDup)
	})

	suite.Run("no matching amount returns false", func() {
		isDup, err := suite.Services.Transaction.CheckDuplicateTransaction(ctx, user.ID, "2026-03-20", 9999, &account.ID)
		suite.Require().NoError(err)
		suite.False(isDup)
	})

	suite.Run("different date returns false", func() {
		isDup, err := suite.Services.Transaction.CheckDuplicateTransaction(ctx, user.ID, "2026-04-01", 7500, &account.ID)
		suite.Require().NoError(err)
		suite.False(isDup)
	})
}

func TestInferInstallment(t *testing.T) {
	cases := []struct {
		name        string
		input       string
		wantDesc    string
		wantCurrent int
		wantTotal   int
		wantFound   bool
	}{
		{
			name:        "Parcela X de Y",
			input:       "Compra - Parcela 1 de 2",
			wantDesc:    "Compra",
			wantCurrent: 1,
			wantTotal:   2,
			wantFound:   true,
		},
		{
			name:        "Parcela X de Y case insensitive",
			input:       "Compra - parcela 3 de 12",
			wantDesc:    "Compra",
			wantCurrent: 3,
			wantTotal:   12,
			wantFound:   true,
		},
		{
			name:        "(X/Y) no spaces",
			input:       "Compra (1/12)",
			wantDesc:    "Compra",
			wantCurrent: 1,
			wantTotal:   12,
			wantFound:   true,
		},
		{
			name:        "(X / Y) with spaces",
			input:       "Compra (1 / 2)",
			wantDesc:    "Compra",
			wantCurrent: 1,
			wantTotal:   2,
			wantFound:   true,
		},
		{
			name:        "multiple matches uses last",
			input:       "Compra (1 / 12) (3 / 12)",
			wantDesc:    "Compra",
			wantCurrent: 3,
			wantTotal:   12,
			wantFound:   true,
		},
		{
			name:        "no match",
			input:       "Aluguel Janeiro",
			wantDesc:    "Aluguel Janeiro",
			wantCurrent: 0,
			wantTotal:   0,
			wantFound:   false,
		},
		{
			name:        "parcela with em-dash separator",
			input:       "Compra — Parcela 2 de 6",
			wantDesc:    "Compra",
			wantCurrent: 2,
			wantTotal:   6,
			wantFound:   true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			desc, current, total, found := inferInstallment(tc.input)
			assert.Equal(t, tc.wantFound, found)
			assert.Equal(t, tc.wantDesc, desc)
			assert.Equal(t, tc.wantCurrent, current)
			assert.Equal(t, tc.wantTotal, total)
		})
	}
}

func (suite *TransactionImportWithDBTestSuite) TestCategoryInference() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	suite.Run("category column with valid name", func() {
		csv := buildCSVWithHeader(csvHeaderWithCategory, [][]string{
			{"01/01/2026", "Compra", "-50,00", category.Name},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Require().NotNil(resp.Rows[0].CategoryID)
		suite.Equal(category.ID, *resp.Rows[0].CategoryID)
		suite.True(resp.Rows[0].CategoryInferred)
	})

	suite.Run("category column case insensitive match", func() {
		csv := buildCSVWithHeader(csvHeaderWithCategory, [][]string{
			{"01/01/2026", "Compra", "-50,00", strings.ToUpper(category.Name)},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Require().NotNil(resp.Rows[0].CategoryID)
		suite.Equal(category.ID, *resp.Rows[0].CategoryID)
	})

	suite.Run("category column with invalid name", func() {
		csv := buildCSVWithHeader(csvHeaderWithCategory, [][]string{
			{"01/01/2026", "Compra", "-50,00", "NonExistent Category 12345"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Nil(resp.Rows[0].CategoryID)
		suite.False(resp.Rows[0].CategoryInferred)
	})

	suite.Run("category column empty", func() {
		csv := buildCSVWithHeader(csvHeaderWithCategory, [][]string{
			{"01/01/2026", "Compra", "-50,00", ""},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Nil(resp.Rows[0].CategoryID)
		suite.False(resp.Rows[0].CategoryInferred)
	})

	suite.Run("no category column same as before", func() {
		csv := buildCSV([][]string{
			{"01/01/2026", "Compra", "-50,00"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Nil(resp.Rows[0].CategoryID)
		suite.False(resp.Rows[0].CategoryInferred)
	})
}

func (suite *TransactionImportWithDBTestSuite) TestInstallmentInference() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	suite.Run("parcela pattern", func() {
		csv := buildCSV([][]string{
			{"01/01/2026", "Compra - Parcela 1 de 3", "-150,00"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		row := resp.Rows[0]
		suite.Equal("Compra", row.Description)
		suite.Require().NotNil(row.RecurrenceType)
		suite.Equal(domain.RecurrenceTypeMonthly, *row.RecurrenceType)
		suite.Require().NotNil(row.RecurrenceCount)
		suite.Equal(3, *row.RecurrenceCount)
		suite.Require().NotNil(row.RecurrenceCurrentInstallment)
		suite.Equal(1, *row.RecurrenceCurrentInstallment)
	})

	suite.Run("slash pattern", func() {
		csv := buildCSV([][]string{
			{"01/01/2026", "Compra (2/12)", "-100,00"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		row := resp.Rows[0]
		suite.Equal("Compra", row.Description)
		suite.Require().NotNil(row.RecurrenceCurrentInstallment)
		suite.Equal(2, *row.RecurrenceCurrentInstallment)
		suite.Require().NotNil(row.RecurrenceCount)
		suite.Equal(12, *row.RecurrenceCount)
	})

	suite.Run("no installment pattern", func() {
		csv := buildCSV([][]string{
			{"01/01/2026", "Aluguel", "-1500,00"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, DecimalSeparatorComma, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		row := resp.Rows[0]
		suite.Equal("Aluguel", row.Description)
		suite.Nil(row.RecurrenceType)
		suite.Nil(row.RecurrenceCount)
		suite.Nil(row.RecurrenceCurrentInstallment)
	})
}

func TestTransactionImportWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}
	suite.Run(t, new(TransactionImportWithDBTestSuite))
}
