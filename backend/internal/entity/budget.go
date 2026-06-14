package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

type Budget struct {
	ID          int
	OwnerUserID int
	CategoryID  int
	AmountCents int64
	Active      bool
	CreatedAt   *time.Time
	UpdatedAt   *time.Time
}

func (Budget) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (b *Budget) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}

func (b *Budget) ToDomain() *domain.Budget {
	return &domain.Budget{
		ID:          b.ID,
		OwnerUserID: b.OwnerUserID,
		CategoryID:  b.CategoryID,
		AmountCents: b.AmountCents,
		Active:      b.Active,
		CreatedAt:   b.CreatedAt,
		UpdatedAt:   b.UpdatedAt,
	}
}

func BudgetFromDomain(d *domain.Budget) *Budget {
	return &Budget{
		ID:          d.ID,
		OwnerUserID: d.OwnerUserID,
		CategoryID:  d.CategoryID,
		AmountCents: d.AmountCents,
		Active:      d.Active,
		CreatedAt:   d.CreatedAt,
		UpdatedAt:   d.UpdatedAt,
	}
}

type BudgetAlertThreshold struct {
	ID              int
	BudgetID        int
	ThresholdPct    int
	Enabled         bool
	LastFiredPeriod *string
}

func (t *BudgetAlertThreshold) ToDomain() *domain.BudgetAlertThreshold {
	return &domain.BudgetAlertThreshold{
		ID:              t.ID,
		BudgetID:        t.BudgetID,
		ThresholdPct:    t.ThresholdPct,
		Enabled:         t.Enabled,
		LastFiredPeriod: t.LastFiredPeriod,
	}
}

func BudgetAlertThresholdFromDomain(d *domain.BudgetAlertThreshold) *BudgetAlertThreshold {
	return &BudgetAlertThreshold{
		ID:              d.ID,
		BudgetID:        d.BudgetID,
		ThresholdPct:    d.ThresholdPct,
		Enabled:         d.Enabled,
		LastFiredPeriod: d.LastFiredPeriod,
	}
}
