package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

type Charge struct {
	ID               int                 `gorm:"primaryKey;autoIncrement"`
	ChargerUserID    int                 `gorm:"not null"`
	PayerUserID      int                 `gorm:"not null"`
	ChargerAccountID *int
	PayerAccountID   *int
	ConnectionID     int                 `gorm:"not null"`
	PeriodMonth      int                 `gorm:"not null"`
	PeriodYear       int                 `gorm:"not null"`
	Description      *string
	Status           domain.ChargeStatus `gorm:"not null"`
	CreatedAt        *time.Time
	UpdatedAt        *time.Time
}

func (Charge) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (c *Charge) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}

func (c *Charge) ToDomain() *domain.Charge {
	return &domain.Charge{
		ID:               c.ID,
		ChargerUserID:    c.ChargerUserID,
		PayerUserID:      c.PayerUserID,
		ChargerAccountID: c.ChargerAccountID,
		PayerAccountID:   c.PayerAccountID,
		ConnectionID:     c.ConnectionID,
		PeriodMonth:      c.PeriodMonth,
		PeriodYear:       c.PeriodYear,
		Description:      c.Description,
		Status:           c.Status,
		CreatedAt:        c.CreatedAt,
		UpdatedAt:        c.UpdatedAt,
	}
}

func ChargeFromDomain(d *domain.Charge) *Charge {
	return &Charge{
		ID:               d.ID,
		ChargerUserID:    d.ChargerUserID,
		PayerUserID:      d.PayerUserID,
		ChargerAccountID: d.ChargerAccountID,
		PayerAccountID:   d.PayerAccountID,
		ConnectionID:     d.ConnectionID,
		PeriodMonth:      d.PeriodMonth,
		PeriodYear:       d.PeriodYear,
		Description:      d.Description,
		Status:           d.Status,
		CreatedAt:        d.CreatedAt,
		UpdatedAt:        d.UpdatedAt,
	}
}
