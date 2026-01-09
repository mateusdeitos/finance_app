package domain

import "time"

type Tag struct {
	ID        int        `json:"id"`
	UserID    int        `json:"user_id"`
	Name      string     `json:"name"`
	CreatedAt *time.Time `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at"`
}

type TagSearchOptions struct {
	IDs     []int  `json:"ids"`
	IDsNot  []int  `json:"ids_not"`
	UserIDs []int  `json:"user_ids"`
	Name    string `json:"name,omitempty"`
}
