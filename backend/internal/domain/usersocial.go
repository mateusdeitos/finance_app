package domain

import (
	"time"
)

type UserSocial struct {
	UserID     int          `json:"user_id"`
	Provider   ProviderType `json:"provider"`
	ProviderID string       `json:"provider_id"`
	CreatedAt  time.Time    `json:"created_at"`
	UpdatedAt  time.Time    `json:"updated_at"`
}

type ProviderType string

const (
	ProviderGoogle    ProviderType = "google"
	ProviderMicrosoft ProviderType = "microsoft"
)
