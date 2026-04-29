package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

const importMaxRows = 100

// csvColumnIndex guarda a posição de cada coluna esperada no cabeçalho simplificado.
type csvColumnIndex struct {
	date        int
	description int
	amount      int
	category    int // optional column; -1 when absent
}

func (s *transactionService) ParseImportCSV(ctx context.Context, userID, accountID int, decimalSeparator domain.ImportDecimalSeparatorValue, typeDefinitionRule domain.ImportTypeDefinitionRule, csvData []byte) (*domain.ImportCSVResponse, error) {
	// Valida propriedade da conta
	if _, err := s.services.Account.GetByID(ctx, userID, accountID); err != nil {
		return nil, err
	}

	// Remove BOM do UTF-8 se presente
	csvData = bytes.TrimPrefix(csvData, []byte{0xEF, 0xBB, 0xBF})

	if len(bytes.TrimSpace(csvData)) == 0 {
		return nil, pkgErrors.ErrImportEmptyFile
	}

	// 1. Infere o separador do CSV a partir da primeira linha
	firstLineEnd := bytes.IndexByte(csvData, '\n')
	var firstLine string
	if firstLineEnd == -1 {
		firstLine = string(csvData)
	} else {
		firstLine = string(csvData[:firstLineEnd])
	}
	comma := detectSeparator(firstLine)

	// 2. Inicializa o leitor de CSV
	reader := csv.NewReader(bytes.NewReader(csvData))
	reader.Comma = comma
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	// Lendo o cabeçalho
	headerRecord, err := reader.Read()
	if err != nil {
		return nil, pkgErrors.ErrImportInvalidLayout
	}

	colIdx, err := parseCSVHeader(headerRecord)
	if err != nil {
		return nil, err
	}

	rows := make([]domain.ParsedImportRow, 0)
	duplicateCount := 0
	errorCount := 0
	dataRowIndex := 0

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}

		dataRowIndex++

		if dataRowIndex > importMaxRows {
			return nil, pkgErrors.ErrImportMaxRowsExceeded
		}

		var row domain.ParsedImportRow

		if err != nil {
			errorMessage := "Erro de formatação na linha"
			var parseErr *csv.ParseError
			if errors.As(err, &parseErr) {
				errorMessage = fmt.Sprintf("Erro na linha %d: %v", parseErr.Line, parseErr.Err)
			}

			row = domain.ParsedImportRow{
				RowIndex:    dataRowIndex,
				Description: fmt.Sprintf("Conteúdo ilegível (Erro: %v)", err),
				Status:      domain.ImportRowStatusPending,
				ParseErrors: []string{errorMessage},
			}
		} else {
			row = parseCSVRow(ctx, s, userID, accountID, dataRowIndex, record, colIdx, decimalSeparator, typeDefinitionRule)
		}

		if row.Status == domain.ImportRowStatusDuplicate {
			duplicateCount++
		}
		if len(row.ParseErrors) > 0 {
			errorCount++
		}
		rows = append(rows, row)
	}

	if len(rows) == 0 {
		return nil, pkgErrors.ErrImportNoRows
	}

	return &domain.ImportCSVResponse{
		Rows:           rows,
		TotalRows:      len(rows),
		DuplicateCount: duplicateCount,
		ErrorCount:     errorCount,
	}, nil
}

// detectSeparator identifica se o CSV usa vírgula ou ponto e vírgula.
func detectSeparator(line string) rune {
	semicolons := strings.Count(line, ";")
	commas := strings.Count(line, ",")

	if semicolons > commas {
		return ';'
	}
	return ','
}

func parseCSVHeader(header []string) (csvColumnIndex, error) {
	idx := csvColumnIndex{
		date: -1, description: -1, amount: -1, category: -1,
	}

	for i, col := range header {
		switch normalize(col) {
		case "data", "date":
			idx.date = i
		case "descrição", "descricao", "título", "titulo", "title", "description":
			idx.description = i
		case "valor", "amount", "total":
			idx.amount = i
		case "categoria", "category":
			idx.category = i
		}
	}

	// Verifica colunas obrigatórias
	missing := make([]string, 0)
	if idx.date < 0 {
		missing = append(missing, "Data")
	}
	if idx.description < 0 {
		missing = append(missing, "Descrição")
	}
	if idx.amount < 0 {
		missing = append(missing, "Valor")
	}

	if len(missing) > 0 {
		return idx, pkgErrors.ErrImportInvalidLayout
	}

	return idx, nil
}

func parseCSVRow(
	ctx context.Context,
	s *transactionService,
	userID int,
	accountID int,
	rowIndex int,
	record []string,
	colIdx csvColumnIndex,
	decimalSeparator domain.ImportDecimalSeparatorValue,
	typeDefinitionRule domain.ImportTypeDefinitionRule,
) domain.ParsedImportRow {
	row := domain.ParsedImportRow{
		RowIndex: rowIndex,
		Status:   domain.ImportRowStatusPending,
	}

	getField := func(idx int) string {
		if idx < 0 || idx >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[idx])
	}

	// 1. Data
	dateStr := getField(colIdx.date)
	if dateStr == "" {
		row.ParseErrors = append(row.ParseErrors, "Data é obrigatória")
	} else {
		formats := []string{"02/01/2006", time.DateOnly, time.RFC3339}
		for _, format := range formats {
			t, err := time.Parse(format, dateStr)
			if err == nil {
				row.Date = &t
				break
			}
		}

		if row.Date == nil {
			row.ParseErrors = append(row.ParseErrors, fmt.Sprintf("Data inválida: %q (esperado DD/MM/AAAA)", dateStr))
		}
	}

	// 2. Descrição + inferência de parcelamento
	row.Description = getField(colIdx.description)
	if row.Description == "" {
		row.ParseErrors = append(row.ParseErrors, "Descrição é obrigatória")
	} else {
		cleanDesc, current, total, found := inferInstallment(row.Description)
		if found {
			row.Description = cleanDesc
			recType := domain.RecurrenceTypeMonthly
			row.RecurrenceType = &recType
			row.RecurrenceCount = &total
			row.RecurrenceCurrentInstallment = &current
		}
	}

	// 3. Valor e Inferência de Tipo
	amountStr := getField(colIdx.amount)
	if amountStr == "" {
		row.ParseErrors = append(row.ParseErrors, "Valor é obrigatório")
	} else {
		// parseAmountSigned retorna o valor em centavos mantendo o sinal
		signedCents, err := parseAmountSigned(amountStr, decimalSeparator)
		if err != nil {
			row.ParseErrors = append(row.ParseErrors, fmt.Sprintf("Valor inválido: %q", amountStr))
		} else {
			// Inferência de tipo baseada no sinal
			if signedCents < 0 {
				row.Type = domain.TransactionTypeExpense
			} else {
				row.Type = domain.TransactionTypeIncome
			}

			if typeDefinitionRule == TypeDefinitionPositiveAsExpense {
				row.Type = row.Type.Invert()
			}

			// Armazena sempre o valor absoluto no Amount da transação
			row.Amount = int64(math.Abs(float64(signedCents)))
		}
	}

	// 4. Categoria opcional
	categoryName := getField(colIdx.category)
	if categoryName != "" {
		categories, err := s.services.Category.Search(ctx, domain.CategorySearchOptions{
			UserIDs: []int{userID},
		})
		if err == nil {
			normalizedInput := normalize(categoryName)
			for _, cat := range categories {
				if normalize(cat.Name) == normalizedInput {
					catID := cat.ID
					row.CategoryID = &catID
					row.CategoryInferred = true
					break
				}
			}
		}
	}

	// 5. Detecção de duplicados
	if row.Date != nil && row.Amount > 0 {
		if isDuplicate(ctx, s, userID, *row.Date, row.Amount, &accountID) {
			row.Status = domain.ImportRowStatusDuplicate
		}
	}

	return row
}

// parseAmountSigned converte uma string numérica para centavos (int64) mantendo o sinal.
func parseAmountSigned(s string, decimalSeparator domain.ImportDecimalSeparatorValue) (int64, error) {
	s = strings.TrimSpace(s)
	if decimalSeparator == "dot" {
		// Padrão Internacional: 1,234.56 -> Remove vírgulas de milhar
		s = strings.ReplaceAll(s, ",", "")
	} else {
		// Padrão Brasileiro: 1.234,56 -> Remove pontos de milhar e troca vírgula por ponto
		s = strings.ReplaceAll(s, ".", "")
		s = strings.ReplaceAll(s, ",", ".")
	}

	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, err
	}
	return int64(math.Round(f * 100)), nil
}

// isDuplicate verifica se a transação já existe baseado em data, valor e conta.
func isDuplicate(ctx context.Context, s *transactionService, userID int, date time.Time, amount int64, accountID *int) bool {
	dayStart := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	dayEnd := dayStart.Add(24*time.Hour - time.Nanosecond)

	filter := domain.TransactionFilter{
		UserID:    &userID,
		StartDate: &domain.ComparableSearch[time.Time]{GreaterThanOrEqual: &dayStart},
		EndDate:   &domain.ComparableSearch[time.Time]{LessThanOrEqual: &dayEnd},
	}
	if accountID != nil {
		filter.AccountIDs = []int{*accountID}
	}
	txs, err := s.transactionRepo.Search(ctx, filter)
	if err != nil {
		return false
	}

	for _, tx := range txs {
		if tx.Amount == amount {
			return true
		}
	}
	return false
}

var (
	// "Parcela 1 de 2", "parcela 3 de 12"
	installmentParcelaRe = regexp.MustCompile(`(?i)[-–—\s]*parcela\s+(\d+)\s+de\s+(\d+)`)
	// "(1/2)", "(1 / 12)", "( 3 / 12 )"
	installmentSlashRe = regexp.MustCompile(`\(\s*(\d+)\s*/\s*(\d+)\s*\)`)
)

// inferInstallment detects installment patterns in a transaction description.
// When multiple matches exist, the last one wins.
// Returns the cleaned description, current installment, total installments, and whether a match was found.
func inferInstallment(description string) (string, int, int, bool) {
	type match struct {
		current int
		total   int
		start   int
		end     int
	}

	var matches []match

	for _, re := range []*regexp.Regexp{installmentParcelaRe, installmentSlashRe} {
		for _, loc := range re.FindAllStringSubmatchIndex(description, -1) {
			cur, _ := strconv.Atoi(description[loc[2]:loc[3]])
			tot, _ := strconv.Atoi(description[loc[4]:loc[5]])
			if cur > 0 && tot > 0 {
				matches = append(matches, match{current: cur, total: tot, start: loc[0], end: loc[1]})
			}
		}
	}

	if len(matches) == 0 {
		return description, 0, 0, false
	}

	// Last match wins for values
	last := matches[len(matches)-1]

	// Remove all matches from description (right to left to preserve indices)
	cleaned := description
	for i := len(matches) - 1; i >= 0; i-- {
		m := matches[i]
		cleaned = cleaned[:m.start] + cleaned[m.end:]
	}

	cleaned = strings.TrimRight(cleaned, " -–—")
	cleaned = strings.TrimSpace(cleaned)

	return cleaned, last.current, last.total, true
}

func normalize(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}
