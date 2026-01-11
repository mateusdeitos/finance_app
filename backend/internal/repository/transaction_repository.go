package repository

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"github.com/samber/lo"
	"gorm.io/gorm"
)

type transactionRepository struct {
	db *gorm.DB
}

func NewTransactionRepository(db *gorm.DB) TransactionRepository {
	return &transactionRepository{db: db}
}

func (r *transactionRepository) Create(ctx context.Context, transaction *domain.Transaction) (*domain.Transaction, error) {
	ent := entity.TransactionFromDomain(transaction)

	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}

	if err := r.replaceTags(ctx, transaction.Tags, ent); err != nil {
		return nil, err
	}

	return ent.ToDomain(), nil
}

func (r *transactionRepository) replaceTags(ctx context.Context, tags []domain.Tag, ent *entity.Transaction) error {
	if len(tags) == 0 {
		return nil
	}

	tagIDs := lo.Map(tags, func(tag domain.Tag, _ int) int {
		return tag.ID
	})

	var entTags []entity.Tag
	if err := GetTxFromContext(ctx, r.db).Where("id IN ?", tagIDs).Find(&tags).Error; err != nil {
		return err
	}
	if err := GetTxFromContext(ctx, r.db).Model(ent).Association("Tags").Replace(entTags); err != nil {
		return err
	}

	return nil
}
