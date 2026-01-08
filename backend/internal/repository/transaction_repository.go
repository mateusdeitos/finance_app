package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
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

	// Handle tags separately
	tagIDs := make([]int, len(transaction.Tags))
	for i, tag := range transaction.Tags {
		tagIDs[i] = tag.ID
	}
	ent.Tags = nil

	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}

	// Associate tags
	if len(tagIDs) > 0 {
		var tags []entity.Tag
		if err := GetTxFromContext(ctx, r.db).Where("id IN ?", tagIDs).Find(&tags).Error; err != nil {
			return nil, err
		}
		if err := GetTxFromContext(ctx, r.db).Model(ent).Association("Tags").Replace(tags); err != nil {
			return nil, err
		}
	}

	// Reload with tags
	var reloaded entity.Transaction
	if err := GetTxFromContext(ctx, r.db).Preload("Tags").First(&reloaded, ent.ID).Error; err != nil {
		return nil, err
	}

	return reloaded.ToDomain(), nil
}

func (r *transactionRepository) GetByID(ctx context.Context, id int) (*domain.Transaction, error) {
	var ent entity.Transaction
	if err := GetTxFromContext(ctx, r.db).Preload("Tags").First(&ent, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *transactionRepository) GetByFilter(ctx context.Context, filter domain.TransactionFilter, orderBy domain.TransactionOrderBy, limit, offset int) ([]*domain.Transaction, int64, error) {
	query := GetTxFromContext(ctx, r.db).Model(&entity.Transaction{}).Preload("Tags")

	// Apply filters
	if len(filter.AccountIDs) > 0 {
		query = query.Where("account_id IN ?", filter.AccountIDs)
	}
	if len(filter.CategoryIDs) > 0 {
		query = query.Where("category_id IN ?", filter.CategoryIDs)
	}
	if len(filter.TagIDs) > 0 {
		query = query.Joins("JOIN transaction_tags ON transactions.id = transaction_tags.transaction_id").
			Where("transaction_tags.tag_id IN ?", filter.TagIDs)
	}
	if filter.StartDate != nil {
		query = query.Where("date >= ?", *filter.StartDate)
	}
	if filter.EndDate != nil {
		query = query.Where("date <= ?", *filter.EndDate)
	}
	if filter.StartGroupingDate != nil {
		query = query.Where("grouping_date >= ?", *filter.StartGroupingDate)
	}
	if filter.EndGroupingDate != nil {
		query = query.Where("grouping_date <= ?", *filter.EndGroupingDate)
	}
	if filter.MinAmount != nil {
		query = query.Where("amount >= ?", *filter.MinAmount)
	}
	if filter.MaxAmount != nil {
		query = query.Where("amount <= ?", *filter.MaxAmount)
	}
	if filter.Description != nil && *filter.Description != "" {
		query = query.Where("description ILIKE ?", fmt.Sprintf("%%%s%%", *filter.Description))
	}
	if filter.UserID != nil {
		query = query.Where("user_id = ?", *filter.UserID)
	}
	if len(filter.Types) > 0 {
		query = query.Where("type IN ?", filter.Types)
	}

	// Count total
	var total int64
	if err := GetTxFromContext(ctx, r.db).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Apply ordering
	orderClause := getOrderClause(orderBy)
	query = query.Order(orderClause)

	// Apply pagination
	if limit > 0 {
		query = query.Limit(limit)
	}
	if offset > 0 {
		query = query.Offset(offset)
	}

	var ents []entity.Transaction
	if err := query.Find(&ents).Error; err != nil {
		return nil, 0, err
	}

	result := make([]*domain.Transaction, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}

	return result, total, nil
}

func (r *transactionRepository) GetGrouped(ctx context.Context, filter domain.TransactionFilter, groupBy domain.TransactionGroupBy) (map[string][]*domain.Transaction, error) {
	// This is a simplified version - full implementation would need complex grouping logic
	transactions, _, err := r.GetByFilter(ctx, filter, domain.OrderByDate, 0, 0)
	if err != nil {
		return nil, err
	}

	grouped := make(map[string][]*domain.Transaction)
	for _, t := range transactions {
		key := getGroupKey(t, groupBy)
		grouped[key] = append(grouped[key], t)
	}

	return grouped, nil
}

func getGroupKey(t *domain.Transaction, groupBy domain.TransactionGroupBy) string {
	switch groupBy {
	case domain.GroupByDate:
		return t.Date.Format("2006-01-02")
	case domain.GroupByGroupingDate:
		if t.GroupingDate != nil {
			return t.GroupingDate.Format("2006-01-02")
		}
		return t.Date.Format("2006-01-02")
	case domain.GroupByCategory:
		if t.CategoryID != nil {
			return fmt.Sprintf("category_%d", *t.CategoryID)
		}
		return "no_category"
	case domain.GroupByAccount:
		return fmt.Sprintf("account_%d", t.AccountID)
	default:
		return "default"
	}
}

func getOrderClause(orderBy domain.TransactionOrderBy) string {
	switch orderBy {
	case domain.OrderByDate:
		return "date DESC"
	case domain.OrderByGroupingDate:
		return "grouping_date DESC, date DESC"
	case domain.OrderByCategory:
		return "category_id ASC, date DESC"
	case domain.OrderByAccount:
		return "account_id ASC, date DESC"
	case domain.OrderByValue:
		return "amount DESC"
	case domain.OrderByDescription:
		return "description ASC"
	default:
		return "date DESC"
	}
}

func (r *transactionRepository) Update(ctx context.Context, transaction *domain.Transaction) error {
	ent := entity.TransactionFromDomain(transaction)

	// Handle tags separately
	tagIDs := make([]int, len(transaction.Tags))
	for i, tag := range transaction.Tags {
		tagIDs[i] = tag.ID
	}
	ent.Tags = nil

	if err := GetTxFromContext(ctx, r.db).Save(ent).Error; err != nil {
		return err
	}

	// Update tags association
	if len(tagIDs) > 0 {
		var tags []entity.Tag
		if err := GetTxFromContext(ctx, r.db).Where("id IN ?", tagIDs).Find(&tags).Error; err != nil {
			return err
		}
		if err := GetTxFromContext(ctx, r.db).Model(ent).Association("Tags").Replace(tags); err != nil {
			return err
		}
	} else {
		if err := GetTxFromContext(ctx, r.db).Model(ent).Association("Tags").Clear(); err != nil {
			return err
		}
	}

	return nil
}

func (r *transactionRepository) BulkUpdate(ctx context.Context, updates domain.BulkUpdateTransaction) error {
	query := GetTxFromContext(ctx, r.db).Model(&entity.Transaction{}).Where("id IN ?", updates.IDs)

	updatesMap := make(map[string]interface{})
	if updates.Date != nil {
		updatesMap["date"] = *updates.Date
	}
	if updates.CategoryID != nil {
		updatesMap["category_id"] = *updates.CategoryID
	}
	if updates.AccountID != nil {
		updatesMap["account_id"] = *updates.AccountID
	}

	if len(updatesMap) > 0 {
		updatesMap["updated_at"] = time.Now()
		if err := query.Updates(updatesMap).Error; err != nil {
			return err
		}
	}

	// Handle tags
	if len(updates.TagIDs) > 0 {
		var transactions []entity.Transaction
		if err := GetTxFromContext(ctx, r.db).Where("id IN ?", updates.IDs).Find(&transactions).Error; err != nil {
			return err
		}

		var tags []entity.Tag
		if err := GetTxFromContext(ctx, r.db).Where("id IN ?", updates.TagIDs).Find(&tags).Error; err != nil {
			return err
		}

		for _, t := range transactions {
			if err := GetTxFromContext(ctx, r.db).Model(&t).Association("Tags").Replace(tags); err != nil {
				return err
			}
		}
	}

	return nil
}

func (r *transactionRepository) Delete(ctx context.Context, id int) error {
	return GetTxFromContext(ctx, r.db).Delete(&entity.Transaction{}, id).Error
}

func (r *transactionRepository) GetByDescription(ctx context.Context, userID int, description string, limit int) ([]*domain.Transaction, error) {
	var ents []entity.Transaction
	query := GetTxFromContext(ctx, r.db).Where("user_id = ? AND description ILIKE ?", userID, fmt.Sprintf("%%%s%%", description))

	if limit > 0 {
		query = query.Limit(limit)
	}

	if err := query.Order("date DESC").Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Transaction, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}
