package repository

import (
	"context"
	"errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"github.com/samber/lo"
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

func (r *transactionRecurrenceRepository) Update(ctx context.Context, recurrence *domain.TransactionRecurrence) error {
	ent := entity.TransactionRecurrenceFromDomain(recurrence)
	if err := GetTxFromContext(ctx, r.db).Updates(ent).Error; err != nil {
		return err
	}
	return nil
}

func (r *transactionRecurrenceRepository) Delete(ctx context.Context, ids []int) error {
	if len(ids) == 0 {
		return nil
	}

	err := GetTxFromContext(ctx, r.db).Where("id IN ?", ids).Delete(&entity.TransactionRecurrence{}).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return nil
}

func (r *transactionRecurrenceRepository) Search(ctx context.Context, filter domain.TransactionRecurrenceFilter) ([]*domain.TransactionRecurrence, error) {
	var ents []entity.TransactionRecurrence
	query := GetTxFromContext(ctx, r.db)

	if filter.UserID != 0 {
		query = query.Where("user_id = ?", filter.UserID)
	}

	if len(filter.IDs) > 0 {
		query = query.Where("id IN ?", filter.IDs)
	}

	if len(filter.TransactionIDs) > 0 {
		query = query.Joins("JOIN transactions ON transactions.transaction_recurrence_id = transaction_recurrences.id")
		query = query.Where("transactions.deleted_at IS NULL")
		query = query.Where("transactions.id IN ?", filter.TransactionIDs)
	}

	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := lo.Map(ents, func(ent entity.TransactionRecurrence, _ int) *domain.TransactionRecurrence {
		return ent.ToDomain()
	})
	return result, nil
}
