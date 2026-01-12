package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
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
	return s.transactionRepo.Search(ctx, userID, period, filter)
}
