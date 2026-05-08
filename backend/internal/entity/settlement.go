package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

type Settlement struct {
	ID                  int                    `gorm:"primaryKey;autoIncrement"`
	UserID              int                    `gorm:"not null"`
	Amount              int64                  `gorm:"not null"`
	Type                domain.SettlementType  `gorm:"not null"`
	AccountID           int                    `gorm:"not null"`
	SourceTransactionID int                    `gorm:"not null"`
	ParentTransactionID int                    `gorm:"not null"`
	Date                time.Time              `gorm:"type:date;not null"`
	CreatedAt           *time.Time
	UpdatedAt           *time.Time
}

func (Settlement) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (s *Settlement) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}

func (s *Settlement) ToDomain() *domain.Settlement {
	return &domain.Settlement{
		ID:                  s.ID,
		UserID:              s.UserID,
		Amount:              s.Amount,
		Type:                s.Type,
		AccountID:           s.AccountID,
		SourceTransactionID: s.SourceTransactionID,
		ParentTransactionID: s.ParentTransactionID,
		Date:                s.Date,
		CreatedAt:           s.CreatedAt,
		UpdatedAt:           s.UpdatedAt,
	}
}

func SettlementFromDomain(d *domain.Settlement) *Settlement {
	return &Settlement{
		ID:                  d.ID,
		UserID:              d.UserID,
		Amount:              d.Amount,
		Type:                d.Type,
		AccountID:           d.AccountID,
		SourceTransactionID: d.SourceTransactionID,
		ParentTransactionID: d.ParentTransactionID,
		Date:                d.Date,
		CreatedAt:           d.CreatedAt,
		UpdatedAt:           d.UpdatedAt,
	}
}
