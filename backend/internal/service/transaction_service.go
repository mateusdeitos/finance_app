package service

import (
	"context"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

type transactionService struct {
	dbTransaction        repository.DBTransaction
	transactionRepo      repository.TransactionRepository
	transactionRecurRepo repository.TransactionRecurrenceRepository
	tagRepo              repository.TagRepository
	services             *Services
}

func NewTransactionService(repos *repository.Repositories, services *Services) TransactionService {
	return &transactionService{
		dbTransaction:        repos.DBTransaction,
		transactionRepo:      repos.Transaction,
		transactionRecurRepo: repos.TransactionRecurrence,
		tagRepo:              repos.Tag,
		services:             services,
	}
}

func (s *transactionService) Search(ctx context.Context, userID int, period domain.Period, filter domain.TransactionFilter) ([]*domain.Transaction, error) {

	if !period.IsValid() {
		return nil, pkgErrors.ErrInvalidPeriod(period)
	}

	filter.StartDate = &domain.ComparableSearch[time.Time]{
		GreaterThanOrEqual: lo.ToPtr(period.StartDate()),
	}
	filter.EndDate = &domain.ComparableSearch[time.Time]{
		LessThanOrEqual: lo.ToPtr(period.EndDate()),
	}

	transactions, err := s.transactionRepo.Search(ctx, filter)
	if err != nil {
		return nil, err
	}

	// When filtering by specific accounts, surface settlements bound to those
	// accounts whose source transaction lives elsewhere as synthetic
	// Transaction entries. This keeps the shared-account listing consistent
	// with GetBalance: only movements on the filtered account contribute to
	// the displayed total.
	if len(filter.AccountIDs) > 0 {
		orphans, err := s.transactionRepo.FindOrphanedSettlementTransactions(ctx, filter)
		if err != nil {
			return nil, err
		}
		transactions = append(transactions, orphans...)
	}

	return transactions, nil
}

// Suggestions searches transactions across all time periods for autocomplete purposes.
func (s *transactionService) Suggestions(ctx context.Context, userID int, filter domain.TransactionFilter) ([]*domain.Transaction, error) {
	filter.UserID = &userID
	return s.transactionRepo.Search(ctx, filter)
}
