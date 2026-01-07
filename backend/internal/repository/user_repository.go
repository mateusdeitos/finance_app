package repository

import (
	"context"
	"errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type userRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	ent := entity.UserFromDomain(user)
	if err := r.db.WithContext(ctx).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *userRepository) GetByID(ctx context.Context, id int) (*domain.User, error) {
	var ent entity.User
	if err := r.db.WithContext(ctx).First(&ent, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *userRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	var ent entity.User
	if err := r.db.WithContext(ctx).Where("email = ?", email).First(&ent).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *userRepository) Update(ctx context.Context, user *domain.User) error {
	ent := entity.UserFromDomain(user)
	return r.db.WithContext(ctx).Save(ent).Error
}

func (r *userRepository) Delete(ctx context.Context, id int) error {
	return r.db.WithContext(ctx).Delete(&entity.User{}, id).Error
}
