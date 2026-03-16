package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

func (s *transactionService) GetBalance(ctx context.Context, userID int, period domain.Period, filter domain.BalanceFilter) (*domain.BalanceResult, error) {
	if !period.IsValid() {
		return nil, pkgErrors.ErrInvalidPeriod(period)
	}

	filter.UserID = userID
	filter.Period = period

	result, err := s.transactionRepo.GetBalance(ctx, filter)
	if err != nil {
		return nil, err
	}

	return result, nil
}
