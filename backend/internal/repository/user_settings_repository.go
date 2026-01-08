package repository

import (
	"context"
	"errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type userSettingsRepository struct {
	db *gorm.DB
}

func NewUserSettingsRepository(db *gorm.DB) UserSettingsRepository {
	return &userSettingsRepository{db: db}
}

func (r *userSettingsRepository) GetByUserID(ctx context.Context, userID int) (*domain.UserSettings, error) {
	var ent entity.UserSettings
	if err := GetTxFromContext(ctx, r.db).First(&ent, "user_id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Return default settings if not found
			return &domain.UserSettings{
				UserID:   userID,
				Settings: make(map[string]interface{}),
			}, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *userSettingsRepository) CreateOrUpdate(ctx context.Context, settings *domain.UserSettings) error {
	ent := entity.UserSettingsFromDomain(settings)
	return GetTxFromContext(ctx, r.db).Save(ent).Error
}
