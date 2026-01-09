package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

type UserConnection struct {
	ID                         int
	FromUserID                 int
	FromAccountID              int
	FromDefaultSplitPercentage int
	ToUserID                   int
	ToAccountID                int
	ToDefaultSplitPercentage   int
	ConnectionStatus           domain.UserConnectionStatusEnum
	CreatedAt                  *time.Time
	UpdatedAt                  *time.Time
}

func (a *UserConnection) ToDomain() *domain.UserConnection {
	return &domain.UserConnection{
		ID:                         a.ID,
		FromUserID:                 a.FromUserID,
		FromAccountID:              a.FromAccountID,
		FromDefaultSplitPercentage: a.FromDefaultSplitPercentage,
		ToUserID:                   a.ToUserID,
		ToAccountID:                a.ToAccountID,
		ToDefaultSplitPercentage:   a.ToDefaultSplitPercentage,
		ConnectionStatus:           a.ConnectionStatus,
		CreatedAt:                  a.CreatedAt,
		UpdatedAt:                  a.UpdatedAt,
	}
}

func UserConnectionFromDomain(d *domain.UserConnection) *UserConnection {
	return &UserConnection{
		ID:                         d.ID,
		FromUserID:                 d.FromUserID,
		FromAccountID:              d.FromAccountID,
		FromDefaultSplitPercentage: d.FromDefaultSplitPercentage,
		ToUserID:                   d.ToUserID,
		ToAccountID:                d.ToAccountID,
		ToDefaultSplitPercentage:   d.ToDefaultSplitPercentage,
		ConnectionStatus:           d.ConnectionStatus,
		CreatedAt:                  d.CreatedAt,
		UpdatedAt:                  d.UpdatedAt,
	}
}

func (UserConnection) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (a *UserConnection) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}
