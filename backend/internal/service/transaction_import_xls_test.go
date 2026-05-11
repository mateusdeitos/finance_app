package service

import (
	"bytes"
	"context"
	_ "embed"
	"strings"
	"testing"

	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
)

//go:embed testdata/import_sample.xls
var xlsSampleFixture []byte

//go:embed testdata/import_empty.xls
var xlsEmptyFixture []byte

//go:embed testdata/import_dates.xls
var xlsDatesFixture []byte

// ---------------------------------------------------------------------------
// Pure unit tests
// ---------------------------------------------------------------------------

func TestIsXLS(t *testing.T) {
	oleMagic := []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0x00, 0x00}
	zipMagic := []byte{0x50, 0x4B, 0x03, 0x04, 0x14, 0x00}
	cases := []struct {
		name     string
		filename string
		data     []byte
		want     bool
	}{
		{"xls extension + ole magic", "transactions.xls", oleMagic, true},
		{"uppercase extension + ole magic", "Transactions.XLS", oleMagic, true},
		{"xls extension but not ole", "transactions.xls", []byte("Data;Descrição;Valor\n"), false},
		{"xlsx extension even with ole magic", "transactions.xlsx", oleMagic, false},
		{"csv extension even with ole magic", "transactions.csv", oleMagic, false},
		{"xls extension with zip magic", "transactions.xls", zipMagic, false},
		{"no extension", "transactions", oleMagic, false},
		{"empty data", "transactions.xls", []byte{}, false},
		{"too short to check magic", "transactions.xls", oleMagic[:4], false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, IsXLS(tc.filename, tc.data))
		})
	}
}

func TestConvertXLSToCSV_HappyPath(t *testing.T) {
	data := xlsSampleFixture

	out, err := ConvertXLSToCSV(data)
	require.NoError(t, err)

	got := string(out)
	expectedLines := []string{
		"Data,Descricao,Valor",
		"01/01/2026,Aluguel,\"-1500,00\"",
		"02/01/2026,Salario,\"5000,00\"",
		"03/01/2026,Mercado,\"-200,00\"",
	}
	for _, line := range expectedLines {
		assert.Contains(t, got, line, "csv output should contain %q\nfull output:\n%s", line, got)
	}
}

func TestConvertXLSToCSV_SkipsBlankRows(t *testing.T) {
	data := xlsSampleFixture

	out, err := ConvertXLSToCSV(data)
	require.NoError(t, err)

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	// header + 3 non-blank data rows (1 blank row dropped)
	assert.Len(t, lines, 4)
}

func TestConvertXLSToCSV_EmptyBytes(t *testing.T) {
	_, err := ConvertXLSToCSV(nil)
	assert.ErrorIs(t, err, pkgErrors.ErrImportEmptyFile)

	_, err = ConvertXLSToCSV([]byte("   "))
	assert.ErrorIs(t, err, pkgErrors.ErrImportEmptyFile)
}

func TestConvertXLSToCSV_InvalidBytes(t *testing.T) {
	// Looks like an OLE2 compound file but is not a valid xls workbook.
	garbage := append([]byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1}, bytes.Repeat([]byte{0x00}, 32)...)
	_, err := ConvertXLSToCSV(garbage)
	assert.ErrorIs(t, err, pkgErrors.ErrImportInvalidFile)
}

func TestConvertXLSToCSV_EmptySheet(t *testing.T) {
	_, err := ConvertXLSToCSV(xlsEmptyFixture)
	assert.ErrorIs(t, err, pkgErrors.ErrImportEmptyFile)
}

// Cells stored as raw NUMBER records with a date number-format should be
// rendered as a dd/mm/yyyy string, not the underlying Excel serial.
func TestConvertXLSToCSV_RendersDateFormattedCellsAsDates(t *testing.T) {
	out, err := ConvertXLSToCSV(xlsDatesFixture)
	require.NoError(t, err)

	got := string(out)
	expectedLines := []string{
		"25/03/2026,Supermercado,-250",
		"20/03/2026,Salario,5000",
		"26/03/2026 12:00:00,Aluguel,-1500",
	}
	for _, line := range expectedLines {
		assert.Contains(t, got, line, "csv output should contain %q\nfull output:\n%s", line, got)
	}
	// And it must NOT contain a bare Excel serial like 46106 / 46101 / 46107.5.
	for _, serial := range []string{"46106", "46101", "46107.5"} {
		assert.NotContains(t, got, serial, "csv output should not leak excel serial %q", serial)
	}
}

// Sanity check that the magic-bytes constant matches the fixture so IsXLS
// won't silently skip real uploads.
func TestXLSMagicBytesMatchFixture(t *testing.T) {
	data := xlsSampleFixture
	require.True(t, len(data) >= 8)
	assert.True(t, bytes.Equal(data[:8], xlsMagicBytes))
	assert.True(t, IsXLS("file.xls", data))
}

// ---------------------------------------------------------------------------
// Integration test — xls flows through the full ParseImportCSV pipeline
// ---------------------------------------------------------------------------

type TransactionImportXLSWithDBTestSuite struct {
	ServiceTestWithDBSuite
}

func (suite *TransactionImportXLSWithDBTestSuite) TestParseImportCSV_FromXLS() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	csv, err := ConvertXLSToCSV(xlsSampleFixture)
	suite.Require().NoError(err)

	resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
	suite.Require().NoError(err)
	suite.Require().Equal(3, resp.TotalRows)

	rent := resp.Rows[0]
	suite.Equal("Aluguel", rent.Description)
	suite.Equal(int64(150000), rent.Amount)
	suite.NotNil(rent.Date)

	income := resp.Rows[1]
	suite.Equal("Salario", income.Description)
	suite.Equal(int64(500000), income.Amount)
}

func TestTransactionImportXLSWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}
	suite.Run(t, new(TransactionImportXLSWithDBTestSuite))
}
