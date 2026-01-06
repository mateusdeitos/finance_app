package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

type Category struct {
	ID        int
	UserID    int
	Name      string
	ParentID  *int
	CreatedAt *time.Time
	UpdatedAt *time.Time
	User      User
	Parent    *Category
	Children  []Category
}

func (c *Category) ToDomain() *domain.Category {
	cat := &domain.Category{
		ID:        c.ID,
		UserID:    c.UserID,
		Name:      c.Name,
		ParentID:  c.ParentID,
		CreatedAt: c.CreatedAt,
		UpdatedAt: c.UpdatedAt,
	}

	if c.Parent != nil {
		cat.Parent = c.Parent.ToDomain()
	}

	if len(c.Children) > 0 {
		cat.Children = make([]domain.Category, len(c.Children))
		for i, child := range c.Children {
			cat.Children[i] = *child.ToDomain()
		}
	}

	return cat
}

func CategoryFromDomain(d *domain.Category) *Category {
	return &Category{
		ID:        d.ID,
		UserID:    d.UserID,
		Name:      d.Name,
		ParentID:  d.ParentID,
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
	}
}

func (Category) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (c *Category) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}
