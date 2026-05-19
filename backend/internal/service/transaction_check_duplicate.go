package service

import (
	"context"
	"time"

	"github.com/finance_app/backend/internal/domain"
)

// CheckDuplicatesBulk runs the duplicate check for many rows at once. Rows are
// grouped by calendar month so each (account, month) window is fetched from
// the database only once.
func (s *transactionService) CheckDuplicatesBulk(ctx context.Context, userID int, accountID *int, rows []domain.CheckDuplicateRowInput) ([]domain.CheckDuplicateRowResult, error) {
	matches, err := checkDuplicatesByWindow(ctx, s, userID, accountID, rows)
	if err != nil {
		return nil, err
	}

	results := make([]domain.CheckDuplicateRowResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, domain.CheckDuplicateRowResult{
			RowIndex: row.RowIndex,
			Matches:  matches[row.RowIndex],
		})
	}
	return results, nil
}

// checkDuplicatesByWindow resolves possible duplicates for many rows while
// fetching each (account, calendar-month) window from the database only once.
// The result maps each row's RowIndex to its matched transactions.
func checkDuplicatesByWindow(ctx context.Context, s *transactionService, userID int, accountID *int, rows []domain.CheckDuplicateRowInput) (map[int][]domain.Transaction, error) {
	type monthKey struct {
		year  int
		month time.Month
	}
	windows := make(map[monthKey][]*domain.Transaction)
	result := make(map[int][]domain.Transaction, len(rows))

	for _, row := range rows {
		key := monthKey{year: row.Date.Year(), month: row.Date.Month()}
		txs, cached := windows[key]
		if !cached {
			var err error
			txs, err = searchMonthWindow(ctx, s, userID, row.Date.Time, accountID)
			if err != nil {
				return nil, err
			}
			windows[key] = txs
		}
		result[row.RowIndex] = filterDuplicateMatches(txs, row.Amount, row.Description)
	}
	return result, nil
}
