package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

type Account struct {
	ID                     int
	UserID                 int
	Name                   string
	Description            *string
	SharedWithUserID       *int
	DefaultSplitPercentage *int
	DefaultGroupingDay     *int
	CreatedAt              *time.Time
	UpdatedAt              *time.Time
	User                   User
	SharedWithUser         *User
}

func (a *Account) ToDomain() *domain.Account {
	return &domain.Account{
		ID:                     a.ID,
		UserID:                 a.UserID,
		Name:                   a.Name,
		Description:            a.Description,
		SharedWithUserID:       a.SharedWithUserID,
		DefaultSplitPercentage: a.DefaultSplitPercentage,
		DefaultGroupingDay:     a.DefaultGroupingDay,
		CreatedAt:              a.CreatedAt,
		UpdatedAt:              a.UpdatedAt,
	}
}

func AccountFromDomain(d *domain.Account) *Account {
	return &Account{
		ID:                     d.ID,
		UserID:                 d.UserID,
		Name:                   d.Name,
		Description:            d.Description,
		SharedWithUserID:       d.SharedWithUserID,
		DefaultSplitPercentage: d.DefaultSplitPercentage,
		DefaultGroupingDay:     d.DefaultGroupingDay,
		CreatedAt:              d.CreatedAt,
		UpdatedAt:              d.UpdatedAt,
	}
}

func (Account) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (a *Account) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}
