package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
)

type PushSubscription struct {
	ID        int        `gorm:"primaryKey;autoIncrement"`
	UserID    int        `gorm:"not null;index"`
	Endpoint  string     `gorm:"not null;uniqueIndex"`
	P256dh    string     `gorm:"not null"`
	Auth      string     `gorm:"not null"`
	CreatedAt *time.Time
}

func (e *PushSubscription) ToDomain() *domain.PushSubscription {
	return &domain.PushSubscription{
		ID:        e.ID,
		UserID:    e.UserID,
		Endpoint:  e.Endpoint,
		P256dh:    e.P256dh,
		Auth:      e.Auth,
		CreatedAt: e.CreatedAt,
	}
}

func PushSubscriptionFromDomain(d *domain.PushSubscription) *PushSubscription {
	return &PushSubscription{
		ID:       d.ID,
		UserID:   d.UserID,
		Endpoint: d.Endpoint,
		P256dh:   d.P256dh,
		Auth:     d.Auth,
	}
}
