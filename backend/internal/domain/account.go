package domain

import "time"

type Account struct {
	ID                     int        `json:"id"`
	UserID                 int        `json:"user_id"`
	Name                   string     `json:"name"`
	Description            *string    `json:"description,omitempty"`
	SharedWithUserID       *int       `json:"shared_with_user_id,omitempty"`
	SharedAllowed          bool       `json:"shared_allowed"`
	DefaultSplitPercentage *int       `json:"default_split_percentage,omitempty"`
	CreatedAt              *time.Time `json:"created_at"`
	UpdatedAt              *time.Time `json:"updated_at"`
}
