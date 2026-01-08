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

func (r *transactionRecurrenceRepository) Create(ctx context.Context, recurrence *domain.TransactionRecurrence) error {
	ent := entity.TransactionRecurrenceFromDomain(recurrence)
	return r.db.WithContext(ctx).Create(ent).Error
}

func (r *transactionRecurrenceRepository) GetByTransactionID(ctx context.Context, transactionID int) ([]*domain.TransactionRecurrence, error) {
	var ents []entity.TransactionRecurrence
	if err := r.db.WithContext(ctx).Where("transaction_id = ?", transactionID).Order("index ASC").Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.TransactionRecurrence, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}

func (r *transactionRecurrenceRepository) DeleteByTransactionID(ctx context.Context, transactionID int) error {
	return r.db.WithContext(ctx).Where("transaction_id = ?", transactionID).Delete(&entity.TransactionRecurrence{}).Error
}

