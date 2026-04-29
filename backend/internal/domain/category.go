package domain

import "time"

type Category struct {
	ID        int        `json:"id"`
	UserID    int        `json:"user_id"`
	Name      string     `json:"name"`
	Emoji     *string    `json:"emoji,omitempty"`
	ParentID  *int       `json:"parent_id"`
	Parent    *Category  `json:"parent,omitempty"`
	Children  []Category `json:"children,omitempty"`
	CreatedAt *time.Time `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at"`
}

type CategorySearchOptions struct {
	IDs           []int   `json:"ids"`
	UserIDs       []int   `json:"user_ids"`
	ParentID      *int    `json:"parent_id,omitempty"`
	Name          *string `json:"name,omitempty"`           // case-insensitive exact match
	OnlyRootLevel bool    `json:"only_root_level,omitempty"` // when true, filters parent_id IS NULL
}

type DeleteCategoryRequest struct {
	ReplaceWithID *int `json:"replace_with_id"`
}
