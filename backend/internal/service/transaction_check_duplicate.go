package service

import (
	"context"
	"time"

	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

// CheckDuplicateTransaction checks whether a transaction with the given date
// and amount already exists for the user. date must be in "YYYY-MM-DD" format.
func (s *transactionService) CheckDuplicateTransaction(ctx context.Context, userID int, date string, amount int64, accountID *int) (bool, error) {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return false, pkgErrors.New(pkgErrors.ErrCodeBadRequest, "invalid date format, expected YYYY-MM-DD")
	}
	return isDuplicate(ctx, s, userID, t, amount, accountID), nil
}
