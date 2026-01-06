package domain

import "time"

type UserSettings struct {
	UserID    int                    `json:"user_id"`
	Settings  map[string]interface{} `json:"settings"`
	CreatedAt *time.Time             `json:"created_at"`
	UpdatedAt *time.Time             `json:"updated_at"`
}

type DefaultAccountConfig struct {
	AccountID int  `json:"account_id"`
	StartDay  *int `json:"start_day,omitempty"`
	EndDay    *int `json:"end_day,omitempty"`
}

type AccountTurnoverDate struct {
	AccountID int `json:"account_id"`
	Day       int `json:"day"` // Day of month (1-31)
}
