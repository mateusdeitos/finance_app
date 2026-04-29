package repository

import (
	"context"
	"errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type categoryRepository struct {
	db *gorm.DB
}

func NewCategoryRepository(db *gorm.DB) CategoryRepository {
	return &categoryRepository{db: db}
}

func (r *categoryRepository) Create(ctx context.Context, category *domain.Category) (*domain.Category, error) {
	ent := entity.CategoryFromDomain(category)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *categoryRepository) Search(ctx context.Context, options domain.CategorySearchOptions) ([]*domain.Category, error) {
	var ents []entity.Category
	query := GetTxFromContext(ctx, r.db)

	if len(options.UserIDs) == 0 {
		return nil, errors.New("user IDs are required")
	}

	query = query.Where("user_id IN ?", options.UserIDs)

	if len(options.IDs) > 0 {
		query = query.Where("id IN ?", options.IDs)
	} else {
		if options.ParentID != nil {
			query = query.Where("parent_id = ?", options.ParentID)
		}
	}

	if options.OnlyRootLevel {
		query = query.Where("parent_id IS NULL")
	}

	if options.Name != nil {
		query = query.Where("LOWER(name) = LOWER(?)", *options.Name)
	}

	query = query.Order("parent_id desc, name ASC")

	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Category, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}

func (r *categoryRepository) Update(ctx context.Context, category *domain.Category) error {
	ent := entity.CategoryFromDomain(category)
	return GetTxFromContext(ctx, r.db).Save(ent).Error
}

func (r *categoryRepository) Delete(ctx context.Context, id int) error {
	return GetTxFromContext(ctx, r.db).Delete(&entity.Category{}, id).Error
}
