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
	if err := r.db.WithContext(ctx).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *categoryRepository) GetByID(ctx context.Context, id int) (*domain.Category, error) {
	var ent entity.Category
	if err := r.db.WithContext(ctx).Preload("Parent").Preload("Children").First(&ent, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *categoryRepository) GetByUserID(ctx context.Context, userID int) ([]*domain.Category, error) {
	var ents []entity.Category
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Category, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}

func (r *categoryRepository) GetByUserIDWithChildren(ctx context.Context, userID int) ([]*domain.Category, error) {
	var ents []entity.Category
	if err := r.db.WithContext(ctx).Where("user_id = ? AND parent_id IS NULL", userID).Preload("Children").Find(&ents).Error; err != nil {
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
	return r.db.WithContext(ctx).Save(ent).Error
}

func (r *categoryRepository) Delete(ctx context.Context, id int) error {
	return r.db.WithContext(ctx).Delete(&entity.Category{}, id).Error
}
