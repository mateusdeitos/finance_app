package domain

import "time"

type PushSubscription struct {
	ID        int        `json:"id"`
	UserID    int        `json:"user_id"`
	Endpoint  string     `json:"endpoint"`
	P256dh    string     `json:"p256dh"`
	Auth      string     `json:"auth"`
	CreatedAt *time.Time `json:"created_at"`
}

type SubscribePushRequest struct {
	Endpoint string   `json:"endpoint"`
	Keys     PushKeys `json:"keys"`
}

type PushKeys struct {
	P256dh string `json:"p256dh"`
	Auth   string `json:"auth"`
}

type PushSubscriptionStatusResponse struct {
	Subscribed bool `json:"subscribed"`
}

type Notification struct {
	ID         int        `json:"id"`
	UserID     int        `json:"user_id"`
	Type       string     `json:"type"`
	EntityType string     `json:"entity_type"`
	EntityID   int        `json:"entity_id"`
	Read       bool       `json:"read"`
	CreatedAt  *time.Time `json:"created_at"`
}
