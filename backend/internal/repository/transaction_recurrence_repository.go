package repository

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type transactionRecurrenceRepository struct {
	db *gorm.DB
}

func NewTransactionRecurrenceRepository(db *gorm.DB) TransactionRecurrenceRepository {
	return &transactionRecurrenceRepository{db: db}
}

func (r *transactionRecurrenceRepository) Create(ctx context.Context, recurrence *domain.TransactionRecurrence) (*domain.TransactionRecurrence, error) {
	ent := entity.TransactionRecurrenceFromDomain(recurrence)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}
