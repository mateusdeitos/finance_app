package repository

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type settlementRepository struct {
	db *gorm.DB
}

func NewSettlementRepository(db *gorm.DB) SettlementRepository {
	return &settlementRepository{db: db}
}

func (r *settlementRepository) Create(ctx context.Context, settlement *domain.Settlement) (*domain.Settlement, error) {
	ent := entity.SettlementFromDomain(settlement)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *settlementRepository) Update(ctx context.Context, settlement *domain.Settlement) error {
	ent := entity.SettlementFromDomain(settlement)
	return GetTxFromContext(ctx, r.db).Save(ent).Error
}

func (r *settlementRepository) Delete(ctx context.Context, ids []int) error {
	return GetTxFromContext(ctx, r.db).Delete(&entity.Settlement{}, ids).Error
}

func (r *settlementRepository) Search(ctx context.Context, filter domain.SettlementFilter) ([]*domain.Settlement, error) {
	var ents []entity.Settlement
	query := GetTxFromContext(ctx, r.db)

	if len(filter.IDs) > 0 {
		query = query.Where("id IN ?", filter.IDs)
	}
	if len(filter.UserIDs) > 0 {
		query = query.Where("user_id IN ?", filter.UserIDs)
	}
	if len(filter.AccountIDs) > 0 {
		query = query.Where("account_id IN ?", filter.AccountIDs)
	}
	if len(filter.SourceTransactionIDs) > 0 {
		query = query.Where("source_transaction_id IN ?", filter.SourceTransactionIDs)
	}
	if len(filter.ParentTransactionIDs) > 0 {
		query = query.Where("parent_transaction_id IN ?", filter.ParentTransactionIDs)
	}
	if filter.Limit != nil {
		query = query.Limit(*filter.Limit)
	}
	if filter.Offset != nil {
		query = query.Offset(*filter.Offset)
	}

	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Settlement, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}
