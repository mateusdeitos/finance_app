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
// Pure unit tests (no DB, always run)
// ---------------------------------------------------------------------------

func TestParseBRAmount(t *testing.T) {
	cases := []struct {
		input   string
		want    int64
		wantErr bool
	}{
		{"150,00", 15000, false},
		{"1.234,56", 123456, false},
		{"100", 10000, false},
		{"-50,00", 5000, false}, // negative → absolute value
		{"abc", 0, true},
		{"", 0, true},
	}

	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			got, err := parseBRAmount(tc.input)
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
			name:    "valid full header",
			header:  []string{"Data", "Descrição", "Tipo", "Valor", "Categoria", "Conta Destino", "Tipo de Parcelamento", "Quantidade de Parcelas"},
			wantErr: false,
			checks: func(t *testing.T, idx csvColumnIndex) {
				assert.Equal(t, 0, idx.date)
				assert.Equal(t, 1, idx.description)
				assert.Equal(t, 2, idx.txType)
				assert.Equal(t, 3, idx.amount)
				assert.Equal(t, 4, idx.category)
				assert.Equal(t, 5, idx.destinationAcct)
				assert.Equal(t, 6, idx.recurrenceType)
				assert.Equal(t, 7, idx.recurrenceCount)
			},
		},
		{
			name:    "missing Valor column",
			header:  []string{"Data", "Descrição", "Tipo"},
			wantErr: true,
		},
		{
			name:    "uppercase header",
			header:  []string{"DATA", "DESCRIÇÃO", "TIPO", "VALOR"},
			wantErr: false,
			checks: func(t *testing.T, idx csvColumnIndex) {
				assert.Equal(t, 0, idx.date)
				assert.Equal(t, 1, idx.description)
				assert.Equal(t, 2, idx.txType)
				assert.Equal(t, 3, idx.amount)
			},
		},
		{
			name:    "header with extra columns",
			header:  []string{"Data", "Descrição", "Tipo", "Valor", "Extra1", "Extra2"},
			wantErr: false,
			checks: func(t *testing.T, idx csvColumnIndex) {
				assert.Equal(t, 0, idx.date)
				assert.Equal(t, 3, idx.amount)
			},
		},
		{
			name:    "description without accent (descricao)",
			header:  []string{"Data", "Descricao", "Tipo", "Valor"},
			wantErr: false,
			checks: func(t *testing.T, idx csvColumnIndex) {
				assert.Equal(t, 1, idx.description)
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

func TestParseTransactionType(t *testing.T) {
	cases := []struct {
		input   string
		want    domain.TransactionType
		wantErr bool
	}{
		{"despesa", domain.TransactionTypeExpense, false},
		{"Despesa", domain.TransactionTypeExpense, false},
		{"DESPESA", domain.TransactionTypeExpense, false},
		{"receita", domain.TransactionTypeIncome, false},
		{"transferência", domain.TransactionTypeTransfer, false},
		{"Transferencia", domain.TransactionTypeTransfer, false},
		{"invalido", "", true},
		{"", "", true},
	}

	for _, tc := range cases {
		t.Run(fmt.Sprintf("%q", tc.input), func(t *testing.T) {
			got, err := parseTransactionType(tc.input)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.want, got)
			}
		})
	}
}

func TestParseRecurrenceType(t *testing.T) {
	cases := []struct {
		input   string
		want    domain.RecurrenceType
		wantErr bool
	}{
		{"diário", domain.RecurrenceTypeDaily, false},
		{"diario", domain.RecurrenceTypeDaily, false},
		{"Diário", domain.RecurrenceTypeDaily, false},
		{"semanal", domain.RecurrenceTypeWeekly, false},
		{"mensal", domain.RecurrenceTypeMonthly, false},
		{"anual", domain.RecurrenceTypeYearly, false},
		{"invalido", "", true},
		{"", "", true},
	}

	for _, tc := range cases {
		t.Run(fmt.Sprintf("%q", tc.input), func(t *testing.T) {
			got, err := parseRecurrenceType(tc.input)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.want, got)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Integration tests (require PostgreSQL via testcontainers)
// ---------------------------------------------------------------------------

const csvFullHeader = "Data;Descrição;Tipo;Valor;Categoria;Conta Destino;Tipo de Parcelamento;Quantidade de Parcelas"

func buildCSV(rows [][]string) []byte {
	lines := make([]string, 0, len(rows)+1)
	lines = append(lines, csvFullHeader)
	for _, row := range rows {
		lines = append(lines, strings.Join(row, ";"))
	}
	return []byte(strings.Join(lines, "\n"))
}

// emptyCol is a placeholder for optional CSV columns.
const emptyCol = ""

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
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, []byte{})
		suite.ErrorIs(err, pkgErrors.ErrImportEmptyFile)
	})

	suite.Run("only header no data rows", func() {
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, []byte(csvFullHeader))
		suite.ErrorIs(err, pkgErrors.ErrImportNoRows)
	})

	suite.Run("invalid layout missing Valor", func() {
		csv := []byte("Data;Descrição;Tipo\n01/01/2026;Test;despesa")
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, csv)
		suite.ErrorIs(err, pkgErrors.ErrImportInvalidLayout)
	})

	suite.Run("more than 100 rows", func() {
		rows := make([][]string, 101)
		for i := range rows {
			rows[i] = []string{"01/01/2026", "Test", "despesa", "100,00", emptyCol, emptyCol, emptyCol, emptyCol}
		}
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, buildCSV(rows))
		suite.ErrorIs(err, pkgErrors.ErrImportMaxRowsExceeded)
	})

	suite.Run("UTF-8 BOM stripped", func() {
		csv := append([]byte{0xEF, 0xBB, 0xBF}, buildCSV([][]string{
			{"01/01/2026", "Aluguel", "despesa", "150,00", emptyCol, emptyCol, emptyCol, emptyCol},
		})...)
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, csv)
		suite.Require().NoError(err)
		suite.Equal(1, resp.TotalRows)
	})

	suite.Run("basic valid expense row", func() {
		csv := buildCSV([][]string{
			{"15/03/2026", "Supermercado", "despesa", "250,00", emptyCol, emptyCol, emptyCol, emptyCol},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, csv)
		suite.Require().NoError(err)
		suite.Equal(1, resp.TotalRows)
		row := resp.Rows[0]
		suite.Equal(domain.ImportRowStatusPending, row.Status)
		suite.Equal("Supermercado", row.Description)
		suite.Equal(domain.TransactionTypeExpense, row.Type)
		suite.EqualValues(25000, row.Amount)
		suite.Require().NotNil(row.Date)
		suite.Equal(15, row.Date.Day())
		suite.Equal(time.March, row.Date.Month())
		suite.Equal(2026, row.Date.Year())
		suite.Empty(row.ParseErrors)
	})

	suite.Run("duplicate detection", func() {
		txDate := time.Date(2026, 2, 10, 0, 0, 0, 0, time.UTC)
		_, err := suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
			AccountID:       account.ID,
			TransactionType: domain.TransactionTypeExpense,
			Amount:          5000,
			Date:            txDate,
			Description:     "Netflix",
		})
		suite.Require().NoError(err)

		csv := buildCSV([][]string{
			{"10/02/2026", "Netflix", "despesa", "50,00", emptyCol, emptyCol, emptyCol, emptyCol},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, csv)
		suite.Require().NoError(err)
		suite.Equal(domain.ImportRowStatusDuplicate, resp.Rows[0].Status)
		suite.Equal(1, resp.DuplicateCount)
	})

	suite.Run("category lookup by name", func() {
		category, err := suite.createTestCategory(ctx, user)
		suite.Require().NoError(err)

		csv := buildCSV([][]string{
			{"01/04/2026", "Compra", "despesa", "100,00", category.Name, emptyCol, emptyCol, emptyCol},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, csv)
		suite.Require().NoError(err)
		suite.Require().NotNil(resp.Rows[0].CategoryID)
		suite.Equal(category.ID, *resp.Rows[0].CategoryID)
		suite.False(resp.Rows[0].CategoryInferred)
	})

	suite.Run("category inference from history", func() {
		category, err := suite.createTestCategory(ctx, user)
		suite.Require().NoError(err)

		txDate := time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC)
		_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
			AccountID:       account.ID,
			TransactionType: domain.TransactionTypeExpense,
			CategoryID:      category.ID,
			Amount:          3000,
			Date:            txDate,
			Description:     "Farmácia Recorrente",
		})
		suite.Require().NoError(err)

		csv := buildCSV([][]string{
			{"05/02/2026", "Farmácia Recorrente", "despesa", "30,00", emptyCol, emptyCol, emptyCol, emptyCol},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, csv)
		suite.Require().NoError(err)
		suite.Require().NotNil(resp.Rows[0].CategoryID)
		suite.Equal(category.ID, *resp.Rows[0].CategoryID)
		suite.True(resp.Rows[0].CategoryInferred)
	})

	suite.Run("parse errors accumulate without aborting", func() {
		csv := buildCSV([][]string{
			{"data-invalida", "Desc", "despesa", "100,00", emptyCol, emptyCol, emptyCol, emptyCol},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, csv)
		suite.Require().NoError(err)
		suite.Equal(1, resp.TotalRows)
		suite.NotEmpty(resp.Rows[0].ParseErrors)
		suite.Equal(1, resp.ErrorCount)
	})

	suite.Run("recurrence type and count", func() {
		csv := buildCSV([][]string{
			{"01/05/2026", "Academia", "despesa", "80,00", emptyCol, emptyCol, "mensal", "12"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, csv)
		suite.Require().NoError(err)
		row := resp.Rows[0]
		suite.Empty(row.ParseErrors)
		suite.Require().NotNil(row.RecurrenceType)
		suite.Equal(domain.RecurrenceTypeMonthly, *row.RecurrenceType)
		suite.Require().NotNil(row.RecurrenceCount)
		suite.Equal(12, *row.RecurrenceCount)
	})

	suite.Run("recurrence type without count adds parse error", func() {
		csv := buildCSV([][]string{
			{"01/05/2026", "Academia", "despesa", "80,00", emptyCol, emptyCol, "mensal", emptyCol},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, csv)
		suite.Require().NoError(err)
		suite.NotEmpty(resp.Rows[0].ParseErrors)
	})

	suite.Run("transfer with destination account", func() {
		destAccount, err := suite.createTestAccount(ctx, user)
		suite.Require().NoError(err)

		csv := buildCSV([][]string{
			{"01/06/2026", "TED poupança", "transferência", "500,00", emptyCol, destAccount.Name, emptyCol, emptyCol},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, csv)
		suite.Require().NoError(err)
		row := resp.Rows[0]
		suite.Equal(domain.TransactionTypeTransfer, row.Type)
		suite.Require().NotNil(row.DestinationAccountID)
		suite.Equal(destAccount.ID, *row.DestinationAccountID)
	})

	suite.Run("account from another user returns error", func() {
		otherUser, err := suite.createTestUser(ctx)
		suite.Require().NoError(err)

		otherAccount, err := suite.createTestAccount(ctx, otherUser)
		suite.Require().NoError(err)

		csv := buildCSV([][]string{
			{"01/01/2026", "Test", "despesa", "100,00", emptyCol, emptyCol, emptyCol, emptyCol},
		})
		_, err = suite.Services.Transaction.ParseImportCSV(ctx, user.ID, otherAccount.ID, csv)
		suite.Error(err)
	})
}

func (suite *TransactionImportWithDBTestSuite) TestCheckDuplicateTransaction() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	txDate := time.Date(2026, 3, 20, 0, 0, 0, 0, time.UTC)

	suite.Run("existing transaction is duplicate", func() {
		_, err := suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
			AccountID:       account.ID,
			TransactionType: domain.TransactionTypeExpense,
			Amount:          7500,
			Date:            txDate,
			Description:     "Spotify Check",
		})
		suite.Require().NoError(err)

		isDup, err := suite.Services.Transaction.CheckDuplicateTransaction(ctx, user.ID, "2026-03-20", "Spotify Check", 7500)
		suite.Require().NoError(err)
		suite.True(isDup)
	})

	suite.Run("no matching transaction returns false", func() {
		isDup, err := suite.Services.Transaction.CheckDuplicateTransaction(ctx, user.ID, "2026-03-20", "NonExistentDesc12345", 9999)
		suite.Require().NoError(err)
		suite.False(isDup)
	})

	suite.Run("invalid date format returns error", func() {
		_, err := suite.Services.Transaction.CheckDuplicateTransaction(ctx, user.ID, "20/03/2026", "Test", 100)
		suite.Error(err)
	})

	suite.Run("different amount returns false", func() {
		isDup, err := suite.Services.Transaction.CheckDuplicateTransaction(ctx, user.ID, "2026-03-20", "Spotify Check", 9999)
		suite.Require().NoError(err)
		suite.False(isDup)
	})

	suite.Run("different date returns false", func() {
		isDup, err := suite.Services.Transaction.CheckDuplicateTransaction(ctx, user.ID, "2026-03-21", "Spotify Check", 7500)
		suite.Require().NoError(err)
		suite.False(isDup)
	})
}

func TestTransactionImportWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}
	suite.Run(t, new(TransactionImportWithDBTestSuite))
}
