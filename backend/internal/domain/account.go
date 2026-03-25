package domain

import "time"

type Account struct {
	ID             int             `json:"id"`
	UserID         int             `json:"user_id"`
	Name           string          `json:"name"`
	Description    *string         `json:"description,omitempty"`
	InitialBalance int64           `json:"initial_balance"`
	IsActive       bool            `json:"is_active"`
	CreatedAt      *time.Time      `json:"created_at"`
	UpdatedAt      *time.Time      `json:"updated_at"`
	UserConnection *UserConnection `json:"user_connection,omitempty"`
}

type AccountSearchOptions struct {
	Limit        int   `json:"limit"`
	Offset       int   `json:"offset"`
	IDs          []int `json:"ids"`
	UserIDs      []int `json:"user_ids"`
	ActiveOnly   *bool `json:"active_only,omitempty"`
}
