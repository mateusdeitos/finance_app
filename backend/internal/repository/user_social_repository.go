package repository

import (
	"context"
	"errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type userSocialRepository struct {
	db *gorm.DB
}

func NewUserSocialRepository(db *gorm.DB) UserSocialRepository {
	return &userSocialRepository{db: db}
}

func (r *userSocialRepository) Create(ctx context.Context, userSocial *domain.UserSocial) error {
	ent := entity.UserSocialFromDomain(userSocial)
	return GetTxFromContext(ctx, r.db).Create(ent).Error
}

func (r *userSocialRepository) GetByProviderID(ctx context.Context, provider domain.ProviderType, providerID string) (*domain.UserSocial, error) {
	var ent entity.UserSocial
	if err := GetTxFromContext(ctx, r.db).Where("provider = ? AND provider_id = ?", provider, providerID).First(&ent).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *userSocialRepository) GetByUserID(ctx context.Context, userID int) ([]*domain.UserSocial, error) {
	var ents []entity.UserSocial
	if err := GetTxFromContext(ctx, r.db).Where("user_id = ?", userID).Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.UserSocial, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}

func (r *userSocialRepository) Delete(ctx context.Context, userID int, provider domain.ProviderType) error {
	return GetTxFromContext(ctx, r.db).Where("user_id = ? AND provider = ?", userID, provider).Delete(&entity.UserSocial{}).Error
}
