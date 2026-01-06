package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

type User struct {
	ID        int
	Name      string
	Email     string
	Password  string
	CreatedAt *time.Time
	UpdatedAt *time.Time
}

func (u *User) ToDomain() *domain.User {
	return &domain.User{
		ID:        u.ID,
		Name:      u.Name,
		Email:     u.Email,
		Password:  u.Password,
		CreatedAt: *u.CreatedAt,
		UpdatedAt: *u.UpdatedAt,
	}
}

func UserFromDomain(d *domain.User) *User {
	return &User{
		ID:        d.ID,
		Name:      d.Name,
		Email:     d.Email,
		Password:  d.Password,
		CreatedAt: &d.CreatedAt,
		UpdatedAt: &d.UpdatedAt,
	}
}

func (User) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (u *User) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}
