package service

import (
	"context"
	"time"

	"github.com/finance_app/backend/internal/domain"
)

// CheckDuplicateTransaction returns existing transactions that are possible
// duplicates of the given date, amount and description.
func (s *transactionService) CheckDuplicateTransaction(ctx context.Context, userID int, date time.Time, amount int64, description string, accountID *int) ([]domain.Transaction, error) {
	return findDuplicateMatches(ctx, s, userID, date, amount, description, accountID)
}

// CheckDuplicatesBulk runs the duplicate check for many rows at once. Rows are
// grouped by calendar month so each (account, month) window is fetched once.
func (s *transactionService) CheckDuplicatesBulk(ctx context.Context, userID int, accountID *int, rows []domain.CheckDuplicateRowInput) ([]domain.CheckDuplicateRowResult, error) {
	type monthKey struct {
		year  int
		month time.Month
	}
	windows := make(map[monthKey][]*domain.Transaction)

	results := make([]domain.CheckDuplicateRowResult, 0, len(rows))
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
		results = append(results, domain.CheckDuplicateRowResult{
			RowIndex: row.RowIndex,
			Matches:  filterDuplicateMatches(txs, row.Amount, row.Description),
		})
	}
	return results, nil
}
