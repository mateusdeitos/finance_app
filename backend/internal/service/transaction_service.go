package service

import (
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
