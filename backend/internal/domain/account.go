package domain

import "time"

type Account struct {
	ID          int        `json:"id"`
	UserID      int        `json:"user_id"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	CreatedAt   *time.Time `json:"created_at"`
	UpdatedAt   *time.Time `json:"updated_at"`
}

type AccountSearchOptions struct {
	IDs     []int `json:"ids"`
	UserIDs []int `json:"user_ids"`
}
