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
	"github.com/samber/lo"
)

const IMPORT_MAX_ROWS = 200

// csvColumnIndex guarda a posição de cada coluna esperada no cabeçalho simplificado.
type csvColumnIndex struct {
	date        int
	description int
	amount      int
	category    int // optional column; -1 when absent
}

func (s *transactionService) ParseImportCSV(ctx context.Context, userID, accountID int, typeDefinitionRule domain.ImportTypeDefinitionRule, csvData []byte) (*domain.ImportCSVResponse, error) {
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
	errorCount := 0
	dataRowIndex := 0

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}

		dataRowIndex++

		if dataRowIndex > IMPORT_MAX_ROWS {
			return nil, pkgErrors.ErrImportMaxRowsExceeded(IMPORT_MAX_ROWS)
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
			row = parseCSVRow(ctx, s, userID, dataRowIndex, record, colIdx, typeDefinitionRule)
		}

		if len(row.ParseErrors) > 0 {
			errorCount++
		}
		rows = append(rows, row)
	}

	if len(rows) == 0 {
		return nil, pkgErrors.ErrImportNoRows
	}

	duplicateCount := detectDuplicateRows(ctx, s, userID, accountID, rows)

	return &domain.ImportCSVResponse{
		Rows:              rows,
		TotalRows:         len(rows),
		DuplicateCount:    duplicateCount,
		ErrorCount:        errorCount,
		DuplicateCriteria: duplicateCriteria(),
	}, nil
}

// duplicateCriteria returns the current duplicate-detection thresholds so
// clients can display them instead of hard-coding the values.
func duplicateCriteria() domain.DuplicateCriteria {
	return domain.DuplicateCriteria{
		DescriptionSimilarityThreshold: descriptionSimilarityThreshold,
		AmountToleranceCents:           duplicateAmountThreshold,
	}
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
		normalized := normalize(col)
		switch normalized {
		case "data", "date", "data ocorrencia", "data ocorrência", "data lançamento":
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
	rowIndex int,
	record []string,
	colIdx csvColumnIndex,
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
		formats := []string{"02/01/2006", "02/01/2006 15:04:05", time.DateOnly, time.DateTime, time.RFC3339}
		for _, format := range formats {
			t, err := time.Parse(format, dateStr)
			if err == nil {
				row.Date = &domain.Date{Time: t}
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
		signedCents, err := parseAmountSigned(amountStr)
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
			Name:    &categoryName,
		})
		if err == nil && len(categories) > 0 {
			catID := categories[0].ID
			row.CategoryID = &catID
			row.CategoryInferred = true
		}
	}

	if row.CategoryID == nil && row.Description != "" {
		txs, err := s.services.Transaction.Suggestions(ctx, userID, domain.TransactionFilter{Description: &domain.TextSearch{Query: row.Description, Exact: true}})
		if err == nil {
			t, found := lo.Find(txs, func(t *domain.Transaction) bool {
				return t.CategoryID != nil
			})
			if found {
				row.CategoryID = t.CategoryID
				row.CategoryInferred = true
			}
		}
	}

	// Duplicate detection runs in bulk after all rows are parsed (see
	// ParseImportCSV) so the database is queried once per month, not per row.

	return row
}

// parseAmountSigned converte uma string numérica para centavos (int64) mantendo o sinal,
// inferindo o formato linha a linha. Aceita inteiros ("150"), floats com ponto ("150.00",
// "1,234.56") ou strings no formato pt-BR ("150,00", "1.234,56"). Quando há ambos os
// separadores, o último ocorrente é tratado como decimal; quando há apenas um e ele
// aparece exatamente uma vez seguido por 3 dígitos, é tratado como separador de milhar.
func parseAmountSigned(s string) (int64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, errors.New("empty amount")
	}

	lastDot := strings.LastIndex(s, ".")
	lastComma := strings.LastIndex(s, ",")
	countDot := strings.Count(s, ".")
	countComma := strings.Count(s, ",")

	var normalized string
	switch {
	case countDot == 0 && countComma == 0:
		normalized = s
	case countDot > 0 && countComma > 0:
		// Ambos: o último ocorrente é o decimal, o outro é separador de milhar.
		if lastComma > lastDot {
			// pt-BR: "." milhar, "," decimal
			normalized = strings.ReplaceAll(s, ".", "")
			normalized = strings.Replace(normalized, ",", ".", 1)
		} else {
			// US: "," milhar, "." decimal
			normalized = strings.ReplaceAll(s, ",", "")
		}
	case countDot > 0:
		if countDot > 1 {
			// Múltiplos pontos só fazem sentido como separadores de milhar (pt-BR).
			normalized = strings.ReplaceAll(s, ".", "")
		} else if len(s)-lastDot-1 == 3 {
			// Caso ambíguo "1.234": tratar como milhar.
			normalized = strings.ReplaceAll(s, ".", "")
		} else {
			normalized = s
		}
	default:
		if countComma > 1 {
			// Múltiplas vírgulas só fazem sentido como separadores de milhar (US).
			normalized = strings.ReplaceAll(s, ",", "")
		} else if len(s)-lastComma-1 == 3 {
			// Caso ambíguo "1,234": tratar como milhar.
			normalized = strings.ReplaceAll(s, ",", "")
		} else {
			normalized = strings.Replace(s, ",", ".", 1)
		}
	}

	f, err := strconv.ParseFloat(normalized, 64)
	if err != nil {
		return 0, err
	}
	return int64(math.Round(f * 100)), nil
}

// duplicateAmountThreshold is the maximum absolute difference in cents for two
// transaction amounts to be considered a possible duplicate.
const duplicateAmountThreshold = int64(2)

// sameCalendarDay reports whether a and b fall on the same year-month-day.
// All times are UTC across the wire (time.Local is set to UTC at startup), so a
// plain calendar-component comparison is unambiguous here.
func sameCalendarDay(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}

// isExactDateAmountMatch reports whether a candidate with candidateDate and
// candidateAmount is an exact duplicate of a row on (date, amount): same
// calendar day and identical amount. This is a description-independent signal —
// re-imported statements frequently carry garbled or missing descriptions but
// keep the date and amount intact, so an exact match on both flags a duplicate
// on its own.
func isExactDateAmountMatch(candidateDate, date time.Time, candidateAmount, amount int64) bool {
	return candidateAmount == amount && sameCalendarDay(candidateDate, date)
}

// searchMonthWindow fetches every transaction for the user in the calendar
// month of date, optionally scoped to a single account.
func searchMonthWindow(ctx context.Context, s *transactionService, userID int, date time.Time, accountID *int) ([]*domain.Transaction, error) {
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}
	start := period.StartDate()
	end := period.EndDate()

	filter := domain.TransactionFilter{
		UserID:    &userID,
		StartDate: &domain.ComparableSearch[time.Time]{GreaterThanOrEqual: &start},
		EndDate:   &domain.ComparableSearch[time.Time]{LessThanOrEqual: &end},
	}
	if accountID != nil {
		filter.AccountIDs = []int{*accountID}
	}
	return s.transactionRepo.Search(ctx, filter)
}

// searchSettlementMonthWindow fetches every settlement for the user in the
// calendar month of date, optionally scoped to a single account, and preloads
// the source transaction on each one. The source transaction supplies the
// description used by trigram similarity — settlements themselves have none.
func searchSettlementMonthWindow(ctx context.Context, s *transactionService, userID int, date time.Time, accountID *int) ([]*domain.Settlement, error) {
	period := domain.Period{Month: int(date.Month()), Year: date.Year()}
	start := period.StartDate()
	end := period.EndDate()

	filter := domain.SettlementFilter{
		UserIDs:               []int{userID},
		StartDate:             &domain.ComparableSearch[time.Time]{GreaterThanOrEqual: &start},
		EndDate:               &domain.ComparableSearch[time.Time]{LessThanOrEqual: &end},
		WithSourceTransaction: true,
	}
	if accountID != nil {
		filter.AccountIDs = []int{*accountID}
	}
	return s.settlementRepo.Search(ctx, filter)
}

// allowedSettlementTypeFor returns which settlement type can duplicate an
// imported row of the given transaction type. Returns ("", false) when
// settlement matching should be skipped (e.g. transfer rows).
func allowedSettlementTypeFor(t domain.TransactionType) (domain.SettlementType, bool) {
	switch t {
	case domain.TransactionTypeIncome:
		return domain.SettlementTypeCredit, true
	case domain.TransactionTypeExpense:
		return domain.SettlementTypeDebit, true
	default:
		return "", false
	}
}

// filterSettlementDuplicateMatches mirrors filterDuplicateMatches but for
// settlements: amount within ±duplicateAmountThreshold, a similar description
// (against the preloaded source transaction description), and the settlement
// type aligned with the row type. As with transactions, an exact match on both
// calendar day and amount flags a duplicate regardless of description.
// Settlements without a preloaded SourceTransaction contribute an empty
// description — they only match when the row description is also empty (or the
// exact date+amount signal fires).
func filterSettlementDuplicateMatches(candidates []*domain.Settlement, date time.Time, amount int64, description string, rowType domain.TransactionType) []domain.SettlementMatch {
	allowedType, ok := allowedSettlementTypeFor(rowType)
	if !ok {
		return nil
	}
	matches := make([]domain.SettlementMatch, 0)
	for _, st := range candidates {
		if st == nil {
			continue
		}
		if st.Type != allowedType {
			continue
		}
		if diff := st.Amount - amount; diff < -duplicateAmountThreshold || diff > duplicateAmountThreshold {
			continue
		}
		var sourceDesc string
		if st.SourceTransaction != nil {
			sourceDesc = st.SourceTransaction.Description
		}
		if !isExactDateAmountMatch(st.Date, date, st.Amount, amount) &&
			description != "" && !descriptionsAreSimilar(sourceDesc, description) {
			continue
		}
		matches = append(matches, domain.SettlementMatch{
			ID:                  st.ID,
			AccountID:           st.AccountID,
			Amount:              st.Amount,
			Type:                st.Type,
			Date:                st.Date,
			SourceTransactionID: st.SourceTransactionID,
			Description:         sourceDesc,
		})
	}
	return matches
}

// filterDuplicateMatches keeps only the candidates that are possible
// duplicates of (date, amount, description): amount within ±2 cents and either
// an exact match on calendar day and amount (description ignored) or, when a
// description is supplied, a similar description (accent-folded trigram
// similarity or a shared significant word).
func filterDuplicateMatches(candidates []*domain.Transaction, date time.Time, amount int64, description string) []domain.Transaction {
	matches := make([]domain.Transaction, 0)
	for _, tx := range candidates {
		if tx == nil {
			continue
		}
		if diff := tx.Amount - amount; diff < -duplicateAmountThreshold || diff > duplicateAmountThreshold {
			continue
		}
		if !isExactDateAmountMatch(tx.Date, date, tx.Amount, amount) &&
			description != "" && !descriptionsAreSimilar(tx.Description, description) {
			continue
		}
		matches = append(matches, *tx)
	}
	return matches
}

// detectDuplicateRows fills DuplicateMatches and SettlementMatches on every
// parsed row that has a valid date and amount, querying the database once per
// (account, month) window rather than once per row. It returns the count of
// rows flagged by at least one of the two checks.
func detectDuplicateRows(ctx context.Context, s *transactionService, userID, accountID int, rows []domain.ParsedImportRow) int {
	inputs := make([]domain.CheckDuplicateRowInput, 0, len(rows))
	for i, row := range rows {
		if row.Date != nil && row.Amount > 0 {
			inputs = append(inputs, domain.CheckDuplicateRowInput{
				RowIndex:    i,
				Date:        *row.Date,
				Amount:      row.Amount,
				Description: row.Description,
				Type:        row.Type,
			})
		}
	}
	if len(inputs) == 0 {
		return 0
	}

	txMatches, settlementMatches, err := checkDuplicatesByWindow(ctx, s, userID, &accountID, inputs)
	if err != nil {
		return 0
	}

	count := 0
	for i := range rows {
		flagged := false
		if m := txMatches[i]; len(m) > 0 {
			rows[i].DuplicateMatches = m
			flagged = true
		}
		if m := settlementMatches[i]; len(m) > 0 {
			rows[i].SettlementMatches = m
			flagged = true
		}
		if flagged {
			count++
		}
	}
	return count
}

var (
	// "Parcela 1 de 2", "parcela 3 de 12"
	installmentParcelaRe = regexp.MustCompile(`(?i)[-–—\s]*parcela\s+(\d+)\s+de\s+(\d+)`)
	// "Parcela 1/3", "parcela 1 / 12"
	installmentParcelaSlashRe = regexp.MustCompile(`(?i)[-–—\s]*parcela\s+(\d+)\s*/\s*(\d+)`)
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

	for _, re := range []*regexp.Regexp{installmentParcelaRe, installmentParcelaSlashRe, installmentSlashRe} {
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
