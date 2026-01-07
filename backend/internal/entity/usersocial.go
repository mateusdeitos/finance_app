package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

type UserSocial struct {
	UserID     int
	Provider   domain.ProviderType
	ProviderID string
	CreatedAt  time.Time
	UpdatedAt  time.Time
	User       User
}

func (us *UserSocial) TableName() string {
	return "users_social"
}

func (us *UserSocial) ToDomain() *domain.UserSocial {
	return &domain.UserSocial{
		UserID:     us.UserID,
		Provider:   us.Provider,
		ProviderID: us.ProviderID,
		CreatedAt:  us.CreatedAt,
		UpdatedAt:  us.UpdatedAt,
	}
}

func UserSocialFromDomain(d *domain.UserSocial) *UserSocial {
	return &UserSocial{
		UserID:     d.UserID,
		Provider:   d.Provider,
		ProviderID: d.ProviderID,
		CreatedAt:  d.CreatedAt,
		UpdatedAt:  d.UpdatedAt,
	}
}

func (UserSocial) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (us *UserSocial) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}
