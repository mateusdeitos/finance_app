package service

import (
	"context"
	"time"

	"github.com/finance_app/backend/internal/domain"
)

// CheckDuplicatesBulk runs the duplicate check for many rows at once. Rows are
// grouped by calendar month so each (account, month) window is fetched from
// the database only once. Returns both transaction and settlement matches
// per row.
func (s *transactionService) CheckDuplicatesBulk(ctx context.Context, userID int, accountID *int, rows []domain.CheckDuplicateRowInput) ([]domain.CheckDuplicateRowResult, error) {
	txMatches, settlementMatches, err := checkDuplicatesByWindow(ctx, s, userID, accountID, rows)
	if err != nil {
		return nil, err
	}

	results := make([]domain.CheckDuplicateRowResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, domain.CheckDuplicateRowResult{
			RowIndex:          row.RowIndex,
			Matches:           txMatches[row.RowIndex],
			SettlementMatches: settlementMatches[row.RowIndex],
		})
	}
	return results, nil
}

// checkDuplicatesByWindow resolves possible duplicates for many rows while
// fetching each (account, calendar-month) window from the database only once.
// Returns two maps keyed by RowIndex: matched transactions and matched
// settlements. Settlement lookups are skipped for windows whose rows are all
// transfers (settlement matching only makes sense for income/expense).
func checkDuplicatesByWindow(ctx context.Context, s *transactionService, userID int, accountID *int, rows []domain.CheckDuplicateRowInput) (map[int][]domain.Transaction, map[int][]domain.SettlementMatch, error) {
	type monthKey struct {
		year  int
		month time.Month
	}
	txWindows := make(map[monthKey][]*domain.Transaction)
	settlementWindows := make(map[monthKey][]*domain.Settlement)
	settlementWindowLoaded := make(map[monthKey]bool)
	txResult := make(map[int][]domain.Transaction, len(rows))
	settlementResult := make(map[int][]domain.SettlementMatch, len(rows))

	for _, row := range rows {
		key := monthKey{year: row.Date.Year(), month: row.Date.Month()}

		txs, cached := txWindows[key]
		if !cached {
			var err error
			txs, err = searchMonthWindow(ctx, s, userID, row.Date.Time, accountID)
			if err != nil {
				return nil, nil, err
			}
			txWindows[key] = txs
		}
		txResult[row.RowIndex] = filterDuplicateMatches(txs, row.Amount, row.Description)

		// Settlement lookup only when the row type can plausibly match one.
		if _, ok := allowedSettlementTypeFor(row.Type); !ok {
			continue
		}
		if !settlementWindowLoaded[key] {
			settlements, err := searchSettlementMonthWindow(ctx, s, userID, row.Date.Time, accountID)
			if err != nil {
				return nil, nil, err
			}
			settlementWindows[key] = settlements
			settlementWindowLoaded[key] = true
		}
		if matches := filterSettlementDuplicateMatches(settlementWindows[key], row.Amount, row.Description, row.Type); len(matches) > 0 {
			settlementResult[row.RowIndex] = matches
		}
	}
	return txResult, settlementResult, nil
}
