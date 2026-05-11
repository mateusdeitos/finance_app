package service

import (
	"bytes"
	"context"
	"strings"
	"testing"

	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/xuri/excelize/v2"
)

// ---------------------------------------------------------------------------
// Pure unit tests
// ---------------------------------------------------------------------------

func TestIsXLSX(t *testing.T) {
	zipMagic := []byte{0x50, 0x4B, 0x03, 0x04, 0x14, 0x00}
	cases := []struct {
		name     string
		filename string
		data     []byte
		want     bool
	}{
		{"xlsx extension + magic bytes", "transactions.xlsx", zipMagic, true},
		{"uppercase extension + magic bytes", "Transactions.XLSX", zipMagic, true},
		{"xlsx extension but not zip", "transactions.xlsx", []byte("Data;Descrição;Valor\n"), false},
		{"csv extension even with zip magic", "transactions.csv", zipMagic, false},
		{"no extension", "transactions", zipMagic, false},
		{"empty data", "transactions.xlsx", []byte{}, false},
		{"too short to check magic", "transactions.xlsx", []byte{0x50, 0x4B}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, IsXLSX(tc.filename, tc.data))
		})
	}
}

func buildXLSX(t *testing.T, header []string, rows [][]string) []byte {
	t.Helper()
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	sheet := f.GetSheetName(0)

	for col, value := range header {
		cell, err := excelize.CoordinatesToCellName(col+1, 1)
		require.NoError(t, err)
		require.NoError(t, f.SetCellValue(sheet, cell, value))
	}

	for r, row := range rows {
		for c, value := range row {
			cell, err := excelize.CoordinatesToCellName(c+1, r+2)
			require.NoError(t, err)
			require.NoError(t, f.SetCellValue(sheet, cell, value))
		}
	}

	buf, err := f.WriteToBuffer()
	require.NoError(t, err)
	return buf.Bytes()
}

func TestConvertXLSXToCSV_HappyPath(t *testing.T) {
	data := buildXLSX(t,
		[]string{"Data", "Descrição", "Valor"},
		[][]string{
			{"01/01/2026", "Aluguel", "-1500,00"},
			{"02/01/2026", "Salário", "5000,00"},
		},
	)

	csv, err := ConvertXLSXToCSV(data)
	require.NoError(t, err)

	got := string(csv)
	expectedLines := []string{
		"Data,Descrição,Valor",
		"01/01/2026,Aluguel,\"-1500,00\"",
		"02/01/2026,Salário,\"5000,00\"",
	}
	for _, line := range expectedLines {
		assert.Contains(t, got, line, "csv output should contain %q\nfull output:\n%s", line, got)
	}
}

func TestConvertXLSXToCSV_EmptyBytes(t *testing.T) {
	_, err := ConvertXLSXToCSV(nil)
	assert.ErrorIs(t, err, pkgErrors.ErrImportEmptyFile)

	_, err = ConvertXLSXToCSV([]byte("   "))
	assert.ErrorIs(t, err, pkgErrors.ErrImportEmptyFile)
}

func TestConvertXLSXToCSV_InvalidBytes(t *testing.T) {
	// Looks like a zip (PK\x03\x04) but is not a valid xlsx workbook.
	garbage := append([]byte{0x50, 0x4B, 0x03, 0x04}, []byte("not a real xlsx")...)
	_, err := ConvertXLSXToCSV(garbage)
	assert.ErrorIs(t, err, pkgErrors.ErrImportInvalidFile)
}

func TestConvertXLSXToCSV_SkipsBlankTrailingRows(t *testing.T) {
	data := buildXLSX(t,
		[]string{"Data", "Descrição", "Valor"},
		[][]string{
			{"01/01/2026", "Aluguel", "-1500,00"},
			{"", "", ""},
			{"02/01/2026", "Salário", "5000,00"},
		},
	)

	csv, err := ConvertXLSXToCSV(data)
	require.NoError(t, err)

	lines := strings.Split(strings.TrimSpace(string(csv)), "\n")
	// header + 2 non-blank data rows
	assert.Len(t, lines, 3)
}

// ---------------------------------------------------------------------------
// Integration test — xlsx flows through the full ParseImportCSV pipeline
// ---------------------------------------------------------------------------

type TransactionImportXLSXWithDBTestSuite struct {
	ServiceTestWithDBSuite
}

func (suite *TransactionImportXLSXWithDBTestSuite) TestParseImportCSV_FromXLSX() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	xlsx := buildXLSX(suite.T(),
		[]string{"Data", "Descrição", "Valor"},
		[][]string{
			{"15/03/2026", "Supermercado", "-250,00"},
			{"20/03/2026", "Salário", "5000,00"},
		},
	)

	csv, err := ConvertXLSXToCSV(xlsx)
	suite.Require().NoError(err)

	resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
	suite.Require().NoError(err)
	suite.Require().Equal(2, resp.TotalRows)

	expense := resp.Rows[0]
	suite.Equal("Supermercado", expense.Description)
	suite.Equal(int64(25000), expense.Amount)
	suite.NotNil(expense.Date)

	income := resp.Rows[1]
	suite.Equal("Salário", income.Description)
	suite.Equal(int64(500000), income.Amount)
}

func (suite *TransactionImportXLSXWithDBTestSuite) TestParseImportCSV_FromXLSX_EmptySheet() {
	xlsx := buildXLSX(suite.T(), []string{}, [][]string{})
	_, err := ConvertXLSXToCSV(xlsx)
	suite.ErrorIs(err, pkgErrors.ErrImportEmptyFile)
}

func TestTransactionImportXLSXWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}
	suite.Run(t, new(TransactionImportXLSXWithDBTestSuite))
}

// Sanity check that the magic-bytes constant matches the actual xlsx files
// produced by excelize, so IsXLSX won't silently skip real uploads.
func TestXLSXMagicBytesMatchExcelizeOutput(t *testing.T) {
	data := buildXLSX(t, []string{"Data"}, [][]string{{"01/01/2026"}})
	require.True(t, len(data) >= 4)
	assert.True(t, bytes.Equal(data[:4], xlsxMagicBytes))
	assert.True(t, IsXLSX("file.xlsx", data))
}
