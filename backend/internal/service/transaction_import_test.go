package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
)

// ---------------------------------------------------------------------------
// Pure unit tests
// ---------------------------------------------------------------------------

func TestParseAmountSigned(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		want    int64
		wantErr bool
	}{
		// Integers
		{"integer", "150", 15000, false},
		{"integer negative", "-150", -15000, false},
		// pt-BR (comma decimal)
		{"ptbr decimal only", "150,00", 15000, false},
		{"ptbr thousand and decimal", "1.234,56", 123456, false},
		{"ptbr negative", "-50,00", -5000, false},
		{"ptbr millions", "1.234.567,89", 123456789, false},
		// US / float with dot
		{"float dot", "150.00", 15000, false},
		{"us thousand and decimal", "1,234.56", 123456, false},
		{"float negative", "-50.00", -5000, false},
		{"us millions", "1,234,567.89", 123456789, false},
		// Single separator with 3 digits → thousands
		{"ambiguous dot thousand", "1.234", 123400, false},
		{"ambiguous comma thousand", "1,234", 123400, false},
		// Multiple thousands separators
		{"multi dot thousand", "1.234.567", 123456700, false},
		{"multi comma thousand", "1,234,567", 123456700, false},
		// Errors
		{"non numeric", "abc", 0, true},
		{"empty", "", 0, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseAmountSigned(tc.input)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.want, got)
			}
		})
	}
}

func TestTrigramSimilarity(t *testing.T) {
	t.Run("identical strings are fully similar", func(t *testing.T) {
		assert.Equal(t, 1.0, trigramSimilarity("Petz", "Petz"))
	})

	t.Run("case insensitive", func(t *testing.T) {
		assert.Equal(t, 1.0, trigramSimilarity("PETZ", "petz"))
	})

	t.Run("partial description match is above the threshold", func(t *testing.T) {
		// Issue #150 example: importing "PETZ 22" against an existing "Petz".
		assert.GreaterOrEqual(t, trigramSimilarity("PETZ 22", "Petz"), descriptionSimilarityThreshold)
	})

	t.Run("unrelated description is below the threshold", func(t *testing.T) {
		// Issue #150 example: "Imec" must not match "PETZ 22".
		assert.Less(t, trigramSimilarity("Imec", "PETZ 22"), descriptionSimilarityThreshold)
	})

	t.Run("empty string has zero similarity", func(t *testing.T) {
		assert.Equal(t, 0.0, trigramSimilarity("", "Petz"))
	})

	t.Run("accents are folded before trigram comparison", func(t *testing.T) {
		// Issue #160 example: "Farmácia São João" must match "Farmacia Sao Joao".
		assert.Equal(t, 1.0, trigramSimilarity("São João", "Sao Joao"))
	})
}

func TestFoldAccents(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"São João", "Sao Joao"},
		{"Farmácia", "Farmacia"},
		{"Promoção", "Promocao"},
		{"açaí", "acai"},
		{"Crédito", "Credito"},
		{"plain ascii", "plain ascii"},
	}

	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			assert.Equal(t, tc.want, foldAccents(tc.in))
		})
	}
}

func TestDescriptionsAreSimilar(t *testing.T) {
	cases := []struct {
		name string
		a    string
		b    string
		want bool
	}{
		// Issue #160 examples that must now be flagged as possible duplicates.
		{"accent vs no accent", "Farmácia São João", "Farmacia Sao Joao", true},
		{"cedilla folded", "Promoção", "Promocao", true},
		{"shared word shopee", "Shopee (fraldas Luca)", "Shopee*Drogaria Coquei", true},
		{"shared word sunrize", "Sunrize (whey Amanda)", "Zp *Sunrize", true},
		// Trigram similarity still works for partial descriptions.
		{"trigram partial match", "PETZ 22", "Petz", true},
		// Guards against false positives.
		{"unrelated descriptions", "Imec", "PETZ 22", false},
		{"bare single-word description does not match on word overlap", "Amazon (fraldas Luca)", "Amazon", false},
		{"generic word only does not match", "Compra cartao", "Compra debito", false},
		{"short shared token does not match", "Zp Padaria", "Zp Acougue", false},
		{"numeric shared token does not match", "Boleto 1234", "Pagamento 1234", false},
		{"empty description is not similar", "", "Amazon", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, descriptionsAreSimilar(tc.a, tc.b))
		})
	}
}

func TestAllowedSettlementTypeFor(t *testing.T) {
	cases := []struct {
		name     string
		input    domain.TransactionType
		wantType domain.SettlementType
		wantOK   bool
	}{
		{"income → credit", domain.TransactionTypeIncome, domain.SettlementTypeCredit, true},
		{"expense → debit", domain.TransactionTypeExpense, domain.SettlementTypeDebit, true},
		{"transfer → skip", domain.TransactionTypeTransfer, "", false},
		{"empty → skip", domain.TransactionType(""), "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := allowedSettlementTypeFor(tc.input)
			assert.Equal(t, tc.wantOK, ok)
			assert.Equal(t, tc.wantType, got)
		})
	}
}

func TestFilterSettlementDuplicateMatches(t *testing.T) {
	settlement := func(id int, amount int64, t domain.SettlementType, desc string) *domain.Settlement {
		return &domain.Settlement{
			ID:                  id,
			Amount:              amount,
			Type:                t,
			AccountID:           10,
			SourceTransactionID: id + 100,
			Date:                time.Now(),
			SourceTransaction:   &domain.Transaction{ID: id + 100, Description: desc},
		}
	}
	credit := func(id int, amount int64, desc string) *domain.Settlement {
		return settlement(id, amount, domain.SettlementTypeCredit, desc)
	}
	debit := func(id int, amount int64, desc string) *domain.Settlement {
		return settlement(id, amount, domain.SettlementTypeDebit, desc)
	}

	// otherDay never coincides with the helper's time.Now() settlement date, so
	// the exact date+amount bypass stays dormant and these cases exercise the
	// description-based path. The dedicated bypass case below opts in explicitly.
	otherDay := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)

	t.Run("income matches credit settlement only", func(t *testing.T) {
		candidates := []*domain.Settlement{credit(1, 5000, "Petz"), debit(2, 5000, "Petz")}
		got := filterSettlementDuplicateMatches(candidates, otherDay, 5000, "Petz", domain.TransactionTypeIncome)
		require.Len(t, got, 1)
		assert.Equal(t, 1, got[0].ID)
		assert.Equal(t, domain.SettlementTypeCredit, got[0].Type)
		assert.Equal(t, "Petz", got[0].Description)
	})

	t.Run("expense matches debit settlement only", func(t *testing.T) {
		candidates := []*domain.Settlement{credit(1, 5000, "Petz"), debit(2, 5000, "Petz")}
		got := filterSettlementDuplicateMatches(candidates, otherDay, 5000, "Petz", domain.TransactionTypeExpense)
		require.Len(t, got, 1)
		assert.Equal(t, 2, got[0].ID)
		assert.Equal(t, domain.SettlementTypeDebit, got[0].Type)
	})

	t.Run("transfer skips settlement matching entirely", func(t *testing.T) {
		candidates := []*domain.Settlement{credit(1, 5000, "Petz"), debit(2, 5000, "Petz")}
		got := filterSettlementDuplicateMatches(candidates, otherDay, 5000, "Petz", domain.TransactionTypeTransfer)
		assert.Nil(t, got)
	})

	t.Run("amount within tolerance matches, outside does not", func(t *testing.T) {
		candidates := []*domain.Settlement{credit(1, 5002, "Petz"), credit(2, 5003, "Petz")}
		got := filterSettlementDuplicateMatches(candidates, otherDay, 5000, "Petz", domain.TransactionTypeIncome)
		require.Len(t, got, 1)
		assert.Equal(t, 1, got[0].ID)
	})

	t.Run("description mismatch is filtered out", func(t *testing.T) {
		candidates := []*domain.Settlement{credit(1, 5000, "Imec")}
		got := filterSettlementDuplicateMatches(candidates, otherDay, 5000, "Petz", domain.TransactionTypeIncome)
		assert.Empty(t, got)
	})

	t.Run("empty description skips similarity check", func(t *testing.T) {
		candidates := []*domain.Settlement{credit(1, 5000, "Whatever")}
		got := filterSettlementDuplicateMatches(candidates, otherDay, 5000, "", domain.TransactionTypeIncome)
		require.Len(t, got, 1)
	})

	t.Run("settlement missing preloaded source transaction is treated as empty description", func(t *testing.T) {
		bare := &domain.Settlement{
			ID: 1, Amount: 5000, Type: domain.SettlementTypeCredit, AccountID: 10,
			SourceTransactionID: 101, Date: time.Now(),
		}
		candidates := []*domain.Settlement{bare}
		// With a non-empty description, the bare settlement fails the
		// similarity check (empty source description) and is filtered out.
		assert.Empty(t, filterSettlementDuplicateMatches(candidates, otherDay, 5000, "Petz", domain.TransactionTypeIncome))
		// With an empty description, the similarity check is skipped and the
		// settlement matches on amount + type alone.
		require.Len(t, filterSettlementDuplicateMatches(candidates, otherDay, 5000, "", domain.TransactionTypeIncome), 1)
	})

	t.Run("nil settlement is skipped without panic", func(t *testing.T) {
		candidates := []*domain.Settlement{nil, credit(1, 5000, "Petz")}
		got := filterSettlementDuplicateMatches(candidates, otherDay, 5000, "Petz", domain.TransactionTypeIncome)
		require.Len(t, got, 1)
		assert.Equal(t, 1, got[0].ID)
	})

	t.Run("exact same day and amount matches even when description differs", func(t *testing.T) {
		sameDay := time.Date(2026, 5, 14, 0, 0, 0, 0, time.UTC)
		st := credit(1, 5000, "Imec")
		st.Date = sameDay
		candidates := []*domain.Settlement{st}
		// Description does not match, but the exact date+amount signal fires.
		got := filterSettlementDuplicateMatches(candidates, sameDay, 5000, "Petz", domain.TransactionTypeIncome)
		require.Len(t, got, 1)
		assert.Equal(t, 1, got[0].ID)
	})

	t.Run("same day with description mismatch but amount off by a cent still needs description", func(t *testing.T) {
		sameDay := time.Date(2026, 5, 14, 0, 0, 0, 0, time.UTC)
		st := credit(1, 5001, "Imec")
		st.Date = sameDay
		candidates := []*domain.Settlement{st}
		// Amount is within tolerance but not exact, so the bypass does not fire
		// and the mismatching description filters it out.
		got := filterSettlementDuplicateMatches(candidates, sameDay, 5000, "Petz", domain.TransactionTypeIncome)
		assert.Empty(t, got)
	})
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
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, []byte{})
		suite.ErrorIs(err, pkgErrors.ErrImportEmptyFile)
	})

	suite.Run("only header no data rows", func() {
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, []byte(csvSimpleHeader))
		suite.ErrorIs(err, pkgErrors.ErrImportNoRows)
	})

	suite.Run("invalid layout missing Valor", func() {
		csv := []byte("Data;Descrição\n01/01/2026;Test")
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
		suite.ErrorIs(err, pkgErrors.ErrImportInvalidLayout)
	})

	suite.Run("more than max rows", func() {
		rows := make([][]string, IMPORT_MAX_ROWS+1)
		for i := range rows {
			rows[i] = []string{"01/01/2026", "Test", "100,00"}
		}
		_, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, buildCSV(rows))
		svcErr, ok := pkgErrors.AsServiceError(err)
		suite.Require().True(ok, "expected *ServiceError, got %T", err)
		suite.Assert().Contains(svcErr.Tags, string(pkgErrors.ErrorTagImportMaxRowsExceeded))
	})

	suite.Run("UTF-8 BOM stripped", func() {
		csv := append([]byte{0xEF, 0xBB, 0xBF}, buildCSV([][]string{
			{"01/01/2026", "Aluguel", "-150,00"},
		})...)
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Equal(1, resp.TotalRows)
	})

	suite.Run("infer type as expense (negative value)", func() {
		csv := buildCSV([][]string{
			{"15/03/2026", "Supermercado", "-250,00"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
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
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
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
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.NotEmpty(resp.Rows[0].DuplicateMatches)
		suite.Equal(1, resp.DuplicateCount)
	})

	suite.Run("capture line error as description", func() {
		// CSV corrompido (aspas não fechadas, por exemplo)
		corruptedLine := "01/01/2026;\"Texto mal fechado;100,00"
		csv := []byte(csvSimpleHeader + "\n" + corruptedLine)

		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Equal(1, resp.TotalRows)
		suite.Contains(resp.Rows[0].Description, "Conteúdo ilegível")
		suite.NotEmpty(resp.Rows[0].ParseErrors)
		suite.Equal(1, resp.ErrorCount)
	})
}

func (suite *TransactionImportWithDBTestSuite) TestDuplicateMatchCriteria() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	// Criar categoria obrigatória
	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	// checkOne runs the bulk duplicate check for a single row and returns its matches.
	checkOne := func(date time.Time, amount int64, description string) []domain.Transaction {
		results, err := suite.Services.Transaction.CheckDuplicatesBulk(ctx, user.ID, &account.ID, []domain.CheckDuplicateRowInput{
			{RowIndex: 0, Date: domain.Date{Time: date}, Amount: amount, Description: description},
		})
		suite.Require().NoError(err)
		suite.Require().Len(results, 1)
		return results[0].Matches
	}

	createTx := func(amount int64, date time.Time, description string) {
		_, err := suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
			AccountID:       account.ID,
			TransactionType: domain.TransactionTypeExpense,
			CategoryID:      category.ID,
			Amount:          amount,
			Date:            domain.Date{Time: date},
			Description:     description,
		})
		suite.Require().NoError(err)
	}

	txDate := time.Date(2026, 3, 20, 0, 0, 0, 0, time.UTC)

	suite.Run("matching date, amount and description is a duplicate", func() {
		createTx(7500, txDate, "Spotify Check")
		suite.NotEmpty(checkOne(txDate, 7500, "Spotify Check"))
	})

	suite.Run("empty description skips the similarity check", func() {
		createTx(8800, txDate, "Original Description")
		suite.NotEmpty(checkOne(txDate, 8800, ""))
	})

	suite.Run("amount within 2 cents is a duplicate", func() {
		suite.NotEmpty(checkOne(txDate, 7502, "Spotify Check"))
	})

	suite.Run("amount more than 2 cents away is not a duplicate", func() {
		suite.Empty(checkOne(txDate, 7503, "Spotify Check"))
	})

	suite.Run("fuzzy description match within the same month", func() {
		createTx(52132, time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC), "Petz")
		// Different day of the same month, amount within 2 cents, partial description.
		suite.NotEmpty(checkOne(time.Date(2026, 6, 8, 0, 0, 0, 0, time.UTC), 52134, "PETZ 22"))
	})

	suite.Run("description mismatch is not a duplicate", func() {
		mismatchDate := time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC)
		createTx(52132, mismatchDate, "Imec")
		suite.Empty(checkOne(mismatchDate, 52134, "PETZ 22"))
	})

	suite.Run("exact same date and amount is a duplicate even with a different description", func() {
		exactDate := time.Date(2026, 8, 15, 0, 0, 0, 0, time.UTC)
		createTx(33300, exactDate, "Original Store")
		// Description is unrelated, but date and amount match exactly.
		suite.NotEmpty(checkOne(exactDate, 33300, "Totally Different Text"))
	})

	suite.Run("no matching amount returns no matches", func() {
		suite.Empty(checkOne(txDate, 9999, "Spotify Check"))
	})

	suite.Run("different month returns no matches", func() {
		suite.Empty(checkOne(time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC), 7500, "Spotify Check"))
	})
}

func (suite *TransactionImportWithDBTestSuite) TestCheckDuplicatesBulk() {
	ctx := context.Background()

	user, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	account, err := suite.createTestAccount(ctx, user)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user)
	suite.Require().NoError(err)

	existingDate := time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)
	_, err = suite.Services.Transaction.Create(ctx, user.ID, &domain.TransactionCreateRequest{
		AccountID:       account.ID,
		TransactionType: domain.TransactionTypeExpense,
		CategoryID:      category.ID,
		Amount:          12345,
		Date:            domain.Date{Time: existingDate},
		Description:     "Mercado Livre",
	})
	suite.Require().NoError(err)

	rows := []domain.CheckDuplicateRowInput{
		// Matches: same month, amount within 2 cents, similar description.
		{RowIndex: 0, Date: domain.Date{Time: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)}, Amount: 12346, Description: "Mercado Livre BR"},
		// No match: different month.
		{RowIndex: 1, Date: domain.Date{Time: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)}, Amount: 12345, Description: "Mercado Livre"},
		// No match: amount too far.
		{RowIndex: 2, Date: domain.Date{Time: time.Date(2026, 9, 5, 0, 0, 0, 0, time.UTC)}, Amount: 99999, Description: "Mercado Livre"},
	}

	results, err := suite.Services.Transaction.CheckDuplicatesBulk(ctx, user.ID, &account.ID, rows)
	suite.Require().NoError(err)
	suite.Require().Len(results, 3)

	byIndex := make(map[int]domain.CheckDuplicateRowResult, len(results))
	for _, r := range results {
		byIndex[r.RowIndex] = r
	}
	suite.NotEmpty(byIndex[0].Matches)
	suite.Empty(byIndex[1].Matches)
	suite.Empty(byIndex[2].Matches)
}

// TestCheckDuplicatesBulkAgainstSettlements verifies that an imported income
// row matches a credit settlement on the same connection account when amount,
// description, and month align — and that an unrelated row does not.
func (suite *TransactionImportWithDBTestSuite) TestCheckDuplicatesBulkAgainstSettlements() {
	ctx := context.Background()

	user1, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)
	user2, err := suite.createTestUser(ctx)
	suite.Require().NoError(err)

	privateAccount, err := suite.createTestAccount(ctx, user1)
	suite.Require().NoError(err)

	connection, err := suite.createAcceptedTestUserConnection(ctx, user1.ID, user2.ID, 50)
	suite.Require().NoError(err)

	category, err := suite.createTestCategory(ctx, user1)
	suite.Require().NoError(err)

	sharedDate := time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC)
	_, err = suite.Services.Transaction.Create(ctx, user1.ID, &domain.TransactionCreateRequest{
		AccountID:       privateAccount.ID,
		CategoryID:      category.ID,
		Amount:          10000,
		Date:            domain.Date{Time: sharedDate},
		Description:     "Jantar restaurante",
		TransactionType: domain.TransactionTypeExpense,
		SplitSettings: []domain.SplitSettings{
			{ConnectionID: connection.ID, Percentage: lo.ToPtr(50)},
		},
	})
	suite.Require().NoError(err)

	// Sanity check: a credit settlement of 5000 must exist on user1's side of the connection.
	settlements, err := suite.Repos.Settlement.Search(ctx, domain.SettlementFilter{
		UserIDs:    []int{user1.ID},
		AccountIDs: []int{connection.FromAccountID},
	})
	suite.Require().NoError(err)
	suite.Require().Len(settlements, 1)
	suite.Require().Equal(int64(5000), settlements[0].Amount)
	suite.Require().Equal(domain.SettlementTypeCredit, settlements[0].Type)

	connAccountID := connection.FromAccountID

	rows := []domain.CheckDuplicateRowInput{
		// Match: income on same connection account, same month, amount within tolerance, similar description.
		{RowIndex: 0, Date: domain.Date{Time: time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC)}, Amount: 5001, Description: "Jantar restaurante", Type: domain.TransactionTypeIncome},
		// No match: expense looks at debit settlements, but the existing settlement is credit.
		{RowIndex: 1, Date: domain.Date{Time: sharedDate}, Amount: 5000, Description: "Jantar restaurante", Type: domain.TransactionTypeExpense},
		// No match: transfer skips settlement matching entirely.
		{RowIndex: 2, Date: domain.Date{Time: sharedDate}, Amount: 5000, Description: "Jantar restaurante", Type: domain.TransactionTypeTransfer},
		// No match: different month.
		{RowIndex: 3, Date: domain.Date{Time: time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)}, Amount: 5000, Description: "Jantar restaurante", Type: domain.TransactionTypeIncome},
		// No match: amount too far.
		{RowIndex: 4, Date: domain.Date{Time: sharedDate}, Amount: 9999, Description: "Jantar restaurante", Type: domain.TransactionTypeIncome},
		// No match: description mismatch.
		{RowIndex: 5, Date: domain.Date{Time: sharedDate}, Amount: 5000, Description: "Aluguel mensal apto", Type: domain.TransactionTypeIncome},
	}

	results, err := suite.Services.Transaction.CheckDuplicatesBulk(ctx, user1.ID, &connAccountID, rows)
	suite.Require().NoError(err)
	suite.Require().Len(results, len(rows))

	byIndex := make(map[int]domain.CheckDuplicateRowResult, len(results))
	for _, r := range results {
		byIndex[r.RowIndex] = r
	}
	suite.Require().Len(byIndex[0].SettlementMatches, 1, "income should match the credit settlement")
	suite.Equal(settlements[0].ID, byIndex[0].SettlementMatches[0].ID)
	suite.Equal(int64(5000), byIndex[0].SettlementMatches[0].Amount)
	suite.Equal(domain.SettlementTypeCredit, byIndex[0].SettlementMatches[0].Type)
	suite.Equal("Jantar restaurante", byIndex[0].SettlementMatches[0].Description)

	suite.Empty(byIndex[1].SettlementMatches, "expense should not match a credit settlement")
	suite.Empty(byIndex[2].SettlementMatches, "transfer should skip settlement matching")
	suite.Empty(byIndex[3].SettlementMatches, "different month should not match")
	suite.Empty(byIndex[4].SettlementMatches, "amount outside tolerance should not match")
	suite.Empty(byIndex[5].SettlementMatches, "description mismatch should not match")
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
		{
			name:        "Parcela X/Y without parens",
			input:       "Squid*Squid*Pharmas - Parcela 1/3",
			wantDesc:    "Squid*Squid*Pharmas",
			wantCurrent: 1,
			wantTotal:   3,
			wantFound:   true,
		},
		{
			name:        "Parcela X/Y without parens with spaces",
			input:       "Compra - Parcela 2 / 6",
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
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Require().NotNil(resp.Rows[0].CategoryID)
		suite.Equal(category.ID, *resp.Rows[0].CategoryID)
		suite.True(resp.Rows[0].CategoryInferred)
	})

	suite.Run("category column case insensitive match", func() {
		csv := buildCSVWithHeader(csvHeaderWithCategory, [][]string{
			{"01/01/2026", "Compra", "-50,00", strings.ToUpper(category.Name)},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Require().NotNil(resp.Rows[0].CategoryID)
		suite.Equal(category.ID, *resp.Rows[0].CategoryID)
	})

	suite.Run("category column with invalid name", func() {
		csv := buildCSVWithHeader(csvHeaderWithCategory, [][]string{
			{"01/01/2026", "Compra", "-50,00", "NonExistent Category 12345"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Nil(resp.Rows[0].CategoryID)
		suite.False(resp.Rows[0].CategoryInferred)
	})

	suite.Run("category column empty", func() {
		csv := buildCSVWithHeader(csvHeaderWithCategory, [][]string{
			{"01/01/2026", "Compra", "-50,00", ""},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
		suite.Require().NoError(err)
		suite.Nil(resp.Rows[0].CategoryID)
		suite.False(resp.Rows[0].CategoryInferred)
	})

	suite.Run("no category column same as before", func() {
		csv := buildCSV([][]string{
			{"01/01/2026", "Compra", "-50,00"},
		})
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
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
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
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
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
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
		resp, err := suite.Services.Transaction.ParseImportCSV(ctx, user.ID, account.ID, TypeDefinitionPositiveAsIncome, csv)
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
