package entity

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/samber/lo"
	"gorm.io/gorm"
)

type Account struct {
	ID             int
	UserID         int
	Name           string
	Description    *string
	InitialBalance int64
	IsActive              bool
	AvatarBackgroundColor *string
	CreatedAt             *time.Time
	UpdatedAt      *time.Time
	UserConnection *AccountUserConnection `gorm:"<-:false"`
}

func (a *Account) ToDomain() *domain.Account {
	acc := &domain.Account{
		ID:             a.ID,
		UserID:         a.UserID,
		Name:           a.Name,
		Description:    a.Description,
		InitialBalance: a.InitialBalance,
		IsActive:              a.IsActive,
		AvatarBackgroundColor: a.AvatarBackgroundColor,
		CreatedAt:             a.CreatedAt,
		UpdatedAt:      a.UpdatedAt,
	}

	if a.UserConnection != nil {
		acc.UserConnection = a.UserConnection.ToDomain()
	}

	return acc
}

func AccountFromDomain(d *domain.Account) *Account {
	a := &Account{
		ID:             d.ID,
		UserID:         d.UserID,
		Name:           d.Name,
		Description:    d.Description,
		InitialBalance: d.InitialBalance,
		IsActive:              d.IsActive,
		AvatarBackgroundColor: d.AvatarBackgroundColor,
		CreatedAt:             d.CreatedAt,
		UpdatedAt:      d.UpdatedAt,
	}

	if d.UserConnection != nil {
		a.UserConnection = &AccountUserConnection{
			UserConnection: lo.FromPtr(UserConnectionFromDomain(d.UserConnection)),
		}
	}

	return a
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

type AccountUserConnection struct {
	UserConnection
}

func (a *AccountUserConnection) Value() (driver.Value, error) {
	return json.Marshal(a)
}

func (a *AccountUserConnection) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, &a.UserConnection)
}
