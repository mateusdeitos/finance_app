package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
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
	if err := GetTxFromContext(ctx, r.db).Where("id IN ?", tagIDs).Find(&entTags).Error; err != nil {
		return err
	}
	if err := GetTxFromContext(ctx, r.db).Model(ent).Association("Tags").Replace(entTags); err != nil {
		return err
	}

	return nil
}

func (r *transactionRepository) Search(ctx context.Context, userID int, period domain.Period, filter domain.TransactionFilter) ([]*domain.Transaction, error) {
	if !period.IsValid() {
		return nil, pkgErrors.ErrInvalidPeriod(period)
	}

	var ents []entity.Transaction
	query := GetTxFromContext(ctx, r.db)

	query = query.Preload("TransactionRecurrence").Preload("Tags")

	query = query.Where("user_id = ?", userID)

	startDate := time.Date(period.Year, time.Month(period.Month), 1, 0, 0, 0, 0, time.UTC)
	endDate := startDate.AddDate(0, 1, 0)
	query = query.Where("date >= ? AND date < ?", startDate, endDate)

	if len(filter.AccountIDs) > 0 {
		query = query.Where("account_id IN ?", filter.AccountIDs)
	}

	if len(filter.CategoryIDs) > 0 {
		query = query.Where("category_id IN ?", filter.CategoryIDs)
	}

	if len(filter.TagIDs) > 0 {
		query = query.Joins("JOIN transaction_tags ON transaction_tags.transaction_id = transactions.id")
		query = query.Where("transaction_tags.tag_id IN ?", filter.TagIDs)
	}

	if filter.Description != nil {
		if filter.Description.Exact {
			query = query.Where("description = ?", filter.Description.Query)
		} else {
			query = query.Where("description % ?", filter.Description.Query)
			query = query.Order(fmt.Sprintf("description <-> '%s' DESC", filter.Description.Query))
		}
	}

	types := lo.Filter(filter.Types, func(t domain.TransactionType, _ int) bool {
		return t.IsValid()
	})

	if len(types) > 0 {
		query = query.Where("type IN ?", types)
	}

	query = query.Order("date DESC")

	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := lo.Map(ents, func(ent entity.Transaction, _ int) *domain.Transaction {
		return ent.ToDomain()
	})

	return result, nil
}
