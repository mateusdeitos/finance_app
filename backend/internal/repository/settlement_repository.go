package repository

import (
	"context"
	"time"

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

// UpdateReviewedByIDs sets (or clears) the reviewed_at timestamp on the given
// settlements owned by userID. When reviewed is true the column is set to the
// current time; when false it is cleared to NULL. IDs the user does not own are
// left untouched (the user_id guard scopes the update).
func (r *settlementRepository) UpdateReviewedByIDs(ctx context.Context, userID int, ids []int, reviewed bool) error {
	if len(ids) == 0 {
		return nil
	}
	var reviewedAt interface{}
	if reviewed {
		reviewedAt = time.Now()
	} else {
		reviewedAt = nil
	}
	return GetTxFromContext(ctx, r.db).
		Model(&entity.Settlement{}).
		Where("id IN ?", ids).
		Where("user_id = ?", userID).
		Update("reviewed_at", reviewedAt).Error
}

func (r *settlementRepository) Search(ctx context.Context, filter domain.SettlementFilter) ([]*domain.Settlement, error) {
	var ents []entity.Settlement
	query := GetTxFromContext(ctx, r.db)

	if filter.WithSourceTransaction {
		query = query.Preload("SourceTransaction")
	}

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
	if len(filter.Types) > 0 {
		query = query.Where("type IN ?", filter.Types)
	}
	if filter.StartDate != nil && filter.StartDate.IsValid() {
		query = query.Where(filter.StartDate.ToSQL("date"))
	}
	if filter.EndDate != nil && filter.EndDate.IsValid() {
		query = query.Where(filter.EndDate.ToSQL("date"))
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
