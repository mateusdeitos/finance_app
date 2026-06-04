package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
)

type Notification struct {
	ID          int        `gorm:"primaryKey;autoIncrement"`
	UserID      int        `gorm:"not null;index"`
	Type        string     `gorm:"not null"`
	EntityType  string     `gorm:"not null"`
	EntityID    int        `gorm:"not null"`
	Read        bool       `gorm:"not null;default:false"`
	Description *string    `gorm:"column:description"`
	CreatedAt   *time.Time
}

func (e *Notification) ToDomain() *domain.Notification {
	return &domain.Notification{
		ID:          e.ID,
		UserID:      e.UserID,
		Type:        e.Type,
		EntityType:  e.EntityType,
		EntityID:    e.EntityID,
		Read:        e.Read,
		Description: e.Description,
		CreatedAt:   e.CreatedAt,
	}
}

func NotificationFromDomain(d *domain.Notification) *Notification {
	return &Notification{
		ID:          d.ID,
		UserID:      d.UserID,
		Type:        d.Type,
		EntityType:  d.EntityType,
		EntityID:    d.EntityID,
		Read:        d.Read,
		Description: d.Description,
	}
}
