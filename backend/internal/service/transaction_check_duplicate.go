package service

import (
	"context"
	"time"
)

// CheckDuplicateTransaction checks whether a transaction with the given date
// and amount already exists for the user.
func (s *transactionService) CheckDuplicateTransaction(ctx context.Context, userID int, date time.Time, amount int64, accountID *int) (bool, error) {
	return isDuplicate(ctx, s, userID, date, amount, accountID), nil
}
