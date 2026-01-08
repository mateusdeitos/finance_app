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
	if err := r.db.WithContext(ctx).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *tagRepository) GetByID(ctx context.Context, id int) (*domain.Tag, error) {
	var ent entity.Tag
	if err := r.db.WithContext(ctx).First(&ent, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *tagRepository) GetByUserID(ctx context.Context, userID int) ([]*domain.Tag, error) {
	var ents []entity.Tag
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Tag, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}

func (r *tagRepository) GetByIDs(ctx context.Context, ids []int) ([]*domain.Tag, error) {
	if len(ids) == 0 {
		return []*domain.Tag{}, nil
	}

	var ents []entity.Tag
	if err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Tag, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}

func (r *tagRepository) GetByName(ctx context.Context, userID int, name string) (*domain.Tag, error) {
	var ent entity.Tag
	if err := r.db.WithContext(ctx).Where("user_id = ? AND name = ?", userID, name).First(&ent).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *tagRepository) Update(ctx context.Context, tag *domain.Tag) error {
	ent := entity.TagFromDomain(tag)
	return r.db.WithContext(ctx).Save(ent).Error
}

func (r *tagRepository) Delete(ctx context.Context, id int) error {
	return r.db.WithContext(ctx).Delete(&entity.Tag{}, id).Error
}
