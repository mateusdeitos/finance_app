package domain

import "time"

type User struct {
	ID         int       `json:"id"`
	ExternalID string    `json:"external_id"`
	Name       string    `json:"name"`
	Email      string    `json:"email"`
	Password   string    `json:"-"` // Never serialize password
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
