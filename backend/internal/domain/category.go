package domain

import "time"

type Category struct {
	ID        int        `json:"id"`
	UserID    int        `json:"user_id"`
	Name      string     `json:"name"`
	ParentID  *int       `json:"parent_id,omitempty"`
	Parent    *Category  `json:"parent,omitempty"`
	Children  []Category `json:"children,omitempty"`
	CreatedAt *time.Time `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at"`
}
