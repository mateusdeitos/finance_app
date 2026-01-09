package repository

import (
	"context"
	"errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type tagRepository struct {
	db *gorm.DB
}

func NewTagRepository(db *gorm.DB) TagRepository {
	return &tagRepository{db: db}
}

func (r *tagRepository) Create(ctx context.Context, tag *domain.Tag) (*domain.Tag, error) {
	ent := entity.TagFromDomain(tag)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *tagRepository) Update(ctx context.Context, tag *domain.Tag) error {
	ent := entity.TagFromDomain(tag)
	return GetTxFromContext(ctx, r.db).Save(ent).Error
}

func (r *tagRepository) Delete(ctx context.Context, id int) error {
	return GetTxFromContext(ctx, r.db).Delete(&entity.Tag{}, id).Error
}

func (r *tagRepository) Search(ctx context.Context, options domain.TagSearchOptions) ([]*domain.Tag, error) {
	var ents []entity.Tag
	query := GetTxFromContext(ctx, r.db)

	if len(options.UserIDs) == 0 {
		return nil, errors.New("user IDs are required")
	}

	query = query.Where("user_id IN ?", options.UserIDs)

	if len(options.IDs) > 0 {
		query = query.Where("id IN ?", options.IDs)
	}

	if len(options.IDsNot) > 0 {
		query = query.Where("id NOT IN ?", options.IDsNot)
	}

	if options.Name != "" {
		query = query.Where("name = ?", options.Name)
	}

	query = query.Order("name ASC")

	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Tag, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}
