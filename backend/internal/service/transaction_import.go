package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

const importMaxRows = 100

// csvColumnIndex holds the position of each expected column in the CSV header.
type csvColumnIndex struct {
	date            int
	description     int
	txType          int
	amount          int
	category        int
	destinationAcct int
	recurrenceType  int
	recurrenceCount int
}

var requiredColumns = []string{"data", "descrição", "tipo", "valor"}

func (s *transactionService) ParseImportCSV(ctx context.Context, userID int, accountID int, csvData []byte) (*domain.ImportCSVResponse, error) {
	// Validate account ownership
	if _, err := s.services.Account.GetByID(ctx, userID, accountID); err != nil {
		return nil, err
	}

	// Strip UTF-8 BOM if present (added by Excel on Windows)
	csvData = bytes.TrimPrefix(csvData, []byte{0xEF, 0xBB, 0xBF})

	if len(bytes.TrimSpace(csvData)) == 0 {
		return nil, pkgErrors.ErrImportEmptyFile
	}

	reader := csv.NewReader(bytes.NewReader(csvData))
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	records, err := reader.ReadAll()
	if err != nil {
		return nil, pkgErrors.ErrImportInvalidLayout
	}

	if len(records) == 0 {
		return nil, pkgErrors.ErrImportEmptyFile
	}

	// Parse header row
	colIdx, err := parseCSVHeader(records[0])
	if err != nil {
		return nil, err
	}

	dataRows := records[1:]
	if len(dataRows) == 0 {
		return nil, pkgErrors.ErrImportNoRows
	}
	if len(dataRows) > importMaxRows {
		return nil, pkgErrors.ErrImportMaxRowsExceeded
	}

	// Pre-load categories and accounts for name lookups
	categories, err := s.services.Category.Search(ctx, domain.CategorySearchOptions{
		UserIDs: []int{userID},
	})
	if err != nil {
		return nil, pkgErrors.Internal("failed to load categories", err)
	}

	accounts, err := s.services.Account.Search(ctx, domain.AccountSearchOptions{
		UserIDs: []int{userID},
	})
	if err != nil {
		return nil, pkgErrors.Internal("failed to load accounts", err)
	}

	rows := make([]domain.ParsedImportRow, 0, len(dataRows))
	duplicateCount := 0
	errorCount := 0

	for i, record := range dataRows {
		row := parseCSVRow(ctx, s, userID, i, record, colIdx, categories, accounts)
		if row.Status == domain.ImportRowStatusDuplicate {
			duplicateCount++
		}
		if len(row.ParseErrors) > 0 {
			errorCount++
		}
		rows = append(rows, row)
	}

	return &domain.ImportCSVResponse{
		Rows:           rows,
		TotalRows:      len(rows),
		DuplicateCount: duplicateCount,
		ErrorCount:     errorCount,
	}, nil
}

func parseCSVHeader(header []string) (csvColumnIndex, error) {
	idx := csvColumnIndex{
		date: -1, description: -1, txType: -1, amount: -1,
		category: -1, destinationAcct: -1, recurrenceType: -1, recurrenceCount: -1,
	}

	for i, col := range header {
		switch normalize(col) {
		case "data":
			idx.date = i
		case "descrição", "descricao":
			idx.description = i
		case "tipo":
			idx.txType = i
		case "valor":
			idx.amount = i
		case "categoria":
			idx.category = i
		case "conta destino":
			idx.destinationAcct = i
		case "tipo de parcelamento":
			idx.recurrenceType = i
		case "quantidade de parcelas":
			idx.recurrenceCount = i
		}
	}

	// Check required columns
	missing := make([]string, 0, len(requiredColumns))
	for _, req := range requiredColumns {
		switch req {
		case "data":
			if idx.date < 0 {
				missing = append(missing, "Data")
			}
		case "descrição":
			if idx.description < 0 {
				missing = append(missing, "Descrição")
			}
		case "tipo":
			if idx.txType < 0 {
				missing = append(missing, "Tipo")
			}
		case "valor":
			if idx.amount < 0 {
				missing = append(missing, "Valor")
			}
		}
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
	categories []*domain.Category,
	accounts []*domain.Account,
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

	// Date
	dateStr := getField(colIdx.date)
	if dateStr == "" {
		row.ParseErrors = append(row.ParseErrors, "Data é obrigatória")
	} else {
		t, err := time.Parse("02/01/2006", dateStr)
		if err != nil {
			row.ParseErrors = append(row.ParseErrors, fmt.Sprintf("Data inválida: %q (esperado DD/MM/AAAA)", dateStr))
		} else {
			row.Date = &t
		}
	}

	// Description
	row.Description = getField(colIdx.description)
	if row.Description == "" {
		row.ParseErrors = append(row.ParseErrors, "Descrição é obrigatória")
	}

	// Type
	txTypeStr := getField(colIdx.txType)
	txType, typeErr := parseTransactionType(txTypeStr)
	if typeErr != nil {
		row.ParseErrors = append(row.ParseErrors, typeErr.Error())
	} else {
		row.Type = txType
	}

	// Amount
	amountStr := getField(colIdx.amount)
	if amountStr == "" {
		row.ParseErrors = append(row.ParseErrors, "Valor é obrigatório")
	} else {
		amount, err := parseBRAmount(amountStr)
		switch {
		case err != nil:
			row.ParseErrors = append(row.ParseErrors, fmt.Sprintf("Valor inválido: %q", amountStr))
		case amount <= 0:
			row.ParseErrors = append(row.ParseErrors, "Valor deve ser maior que zero")
		default:
			row.Amount = amount
		}
	}

	// Category (lookup by name)
	categoryStr := getField(colIdx.category)
	if categoryStr != "" {
		cat := findCategoryByName(categories, categoryStr)
		if cat == nil {
			row.ParseErrors = append(row.ParseErrors, fmt.Sprintf("Categoria não encontrada: %q", categoryStr))
		} else {
			row.CategoryID = &cat.ID
		}
	} else if typeErr == nil && txType != domain.TransactionTypeTransfer && row.Description != "" {
		// Infer category from transaction history
		inferredCategoryID := inferCategoryFromHistory(ctx, s, userID, row.Description)
		if inferredCategoryID != nil {
			row.CategoryID = inferredCategoryID
			row.CategoryInferred = true
		}
	}

	// Destination account (for transfers)
	destAcctStr := getField(colIdx.destinationAcct)
	if destAcctStr != "" {
		acct := findAccountByName(accounts, destAcctStr)
		if acct == nil {
			row.ParseErrors = append(row.ParseErrors, fmt.Sprintf("Conta destino não encontrada: %q", destAcctStr))
		} else {
			row.DestinationAccountID = &acct.ID
		}
	}

	// Recurrence type
	recurrenceTypeStr := getField(colIdx.recurrenceType)
	if recurrenceTypeStr != "" {
		rt, err := parseRecurrenceType(recurrenceTypeStr)
		if err != nil {
			row.ParseErrors = append(row.ParseErrors, err.Error())
		} else {
			row.RecurrenceType = &rt
		}
	}

	// Recurrence count
	recurrenceCountStr := getField(colIdx.recurrenceCount)
	if recurrenceCountStr != "" {
		count, err := strconv.Atoi(recurrenceCountStr)
		if err != nil || count <= 0 {
			row.ParseErrors = append(row.ParseErrors, fmt.Sprintf("Quantidade de parcelas inválida: %q", recurrenceCountStr))
		} else {
			row.RecurrenceCount = &count
		}
	}

	// Cross-field validation: recurrence count required if type is set
	if row.RecurrenceType != nil && row.RecurrenceCount == nil {
		row.ParseErrors = append(row.ParseErrors, "Quantidade de parcelas é obrigatória quando o tipo de parcelamento é definido")
	}

	// Duplicate detection (only if required fields parsed successfully)
	if row.Date != nil && row.Description != "" && row.Amount > 0 {
		if isDuplicate(ctx, s, userID, row.Description, *row.Date, row.Amount) {
			row.Status = domain.ImportRowStatusDuplicate
		}
	}

	return row
}

// inferCategoryFromHistory searches transaction history for the most common category
// used with an exact description match.
func inferCategoryFromHistory(ctx context.Context, s *transactionService, userID int, description string) *int {
	filter := domain.TransactionFilter{
		UserID:      &userID,
		Description: &domain.TextSearch{Query: description, Exact: true},
	}
	txs, err := s.transactionRepo.Search(ctx, filter)
	if err != nil || len(txs) == 0 {
		return nil
	}

	// Count occurrences per category
	counts := map[int]int{}
	for _, tx := range txs {
		if tx.CategoryID != nil {
			counts[*tx.CategoryID]++
		}
	}
	if len(counts) == 0 {
		return nil
	}

	// Pick most frequent
	bestID, bestCount := 0, 0
	for id, count := range counts {
		if count > bestCount {
			bestID = id
			bestCount = count
		}
	}

	return lo.ToPtr(bestID)
}

// isDuplicate checks whether a transaction with the same description, date and amount
// already exists for the user.
func isDuplicate(ctx context.Context, s *transactionService, userID int, description string, date time.Time, amount int64) bool {
	dayStart := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	dayEnd := dayStart.Add(24*time.Hour - time.Nanosecond)

	filter := domain.TransactionFilter{
		UserID:      &userID,
		Description: &domain.TextSearch{Query: description, Exact: true},
		StartDate: &domain.ComparableSearch[time.Time]{
			GreaterThanOrEqual: &dayStart,
		},
		EndDate: &domain.ComparableSearch[time.Time]{
			LessThanOrEqual: &dayEnd,
		},
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

// parseBRAmount parses a Brazilian-format currency string (e.g. "1.234,56") to cents.
func parseBRAmount(s string) (int64, error) {
	// Remove thousands separator (dot) and replace decimal separator (comma) with dot
	s = strings.ReplaceAll(s, ".", "")
	s = strings.ReplaceAll(s, ",", ".")
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, err
	}
	return int64(math.Round(f * 100)), nil
}

func parseTransactionType(s string) (domain.TransactionType, error) {
	switch normalize(s) {
	case "despesa":
		return domain.TransactionTypeExpense, nil
	case "receita":
		return domain.TransactionTypeIncome, nil
	case "transferencia", "transferência":
		return domain.TransactionTypeTransfer, nil
	default:
		return "", fmt.Errorf("tipo inválido: %q (esperado: despesa, receita ou transferência)", s)
	}
}

func parseRecurrenceType(s string) (domain.RecurrenceType, error) {
	switch normalize(s) {
	case "diario", "diário":
		return domain.RecurrenceTypeDaily, nil
	case "semanal":
		return domain.RecurrenceTypeWeekly, nil
	case "mensal":
		return domain.RecurrenceTypeMonthly, nil
	case "anual":
		return domain.RecurrenceTypeYearly, nil
	default:
		return "", fmt.Errorf("tipo de parcelamento inválido: %q (esperado: diário, semanal, mensal ou anual)", s)
	}
}

func findCategoryByName(categories []*domain.Category, name string) *domain.Category {
	normalized := normalize(name)
	for _, c := range categories {
		if normalize(c.Name) == normalized {
			return c
		}
	}
	return nil
}

func findAccountByName(accounts []*domain.Account, name string) *domain.Account {
	normalized := normalize(name)
	for _, a := range accounts {
		if normalize(a.Name) == normalized {
			return a
		}
	}
	return nil
}

// normalize lowercases and trims a string for case-insensitive comparisons.
func normalize(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}
