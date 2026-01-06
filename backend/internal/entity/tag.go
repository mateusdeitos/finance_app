package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
)

type Tag struct {
	ID        int
	UserID    int
	Name      string
	CreatedAt *time.Time
	UpdatedAt *time.Time
	User      User
}

func (t *Tag) ToDomain() *domain.Tag {
	return &domain.Tag{
		ID:        t.ID,
		UserID:    t.UserID,
		Name:      t.Name,
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
}

func TagFromDomain(d *domain.Tag) *Tag {
	return &Tag{
		ID:        d.ID,
		UserID:    d.UserID,
		Name:      d.Name,
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
	}
}
