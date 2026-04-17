package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

type UserConnection struct {
	ID                         int                             `json:"id"`
	FromUserID                 int                             `json:"from_user_id"`
	FromAccountID              int                             `json:"from_account_id"`
	FromDefaultSplitPercentage int                             `json:"from_default_split_percentage"`
	ToUserID                   int                             `json:"to_user_id"`
	ToAccountID                int                             `json:"to_account_id"`
	ToDefaultSplitPercentage   int                             `json:"to_default_split_percentage"`
	ConnectionStatus           domain.UserConnectionStatusEnum `json:"connection_status"`
	CreatedAt                  *time.Time                      `json:"created_at"`
	UpdatedAt                  *time.Time                      `json:"updated_at"`
	FromUserAvatarURL          *string                         `json:"from_user_avatar_url" gorm:"-"`
	FromUserName               *string                         `json:"from_user_name" gorm:"-"`
	ToUserAvatarURL            *string                         `json:"to_user_avatar_url" gorm:"-"`
	ToUserName                 *string                         `json:"to_user_name" gorm:"-"`
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
		FromUserAvatarURL:          a.FromUserAvatarURL,
		FromUserName:               a.FromUserName,
		ToUserAvatarURL:            a.ToUserAvatarURL,
		ToUserName:                 a.ToUserName,
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
