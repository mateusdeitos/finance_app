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

type VapidPublicKeyResponse struct {
	Key string `json:"key"`
}

type Notification struct {
	ID          int     `json:"id"`
	UserID      int     `json:"user_id"`
	Type        string  `json:"type"`
	EntityType  string  `json:"entity_type"`
	EntityID    int     `json:"entity_id"`
	Read        bool    `json:"read"`
	Description *string `json:"description,omitempty"`
	// Amount é o valor (em centavos) associado à notificação. Persistido para que
	// o corpo mostre o valor mesmo quando a entidade referenciada foi apagada
	// (ex.: exclusão de transação compartilhada, onde não há mais o que resolver).
	Amount *int64 `json:"amount,omitempty"`
	// TxType is the underlying transaction type ("expense" | "income" | "transfer")
	// persisted so the in-app inbox can render the gendered noun (despesa/receita)
	// matching the push copy, even after the referenced entity is gone.
	TxType    *string    `json:"tx_type,omitempty"`
	CreatedAt *time.Time `json:"created_at"`
}

// NotificationEvent is an in-memory struct populated by event sources and passed to
// NotificationService.Dispatch AFTER DB commit. NOT persisted directly.
type NotificationEvent struct {
	RecipientUserID int
	ActorUserID     int    // display-name lookup; all events in one Dispatch share the same actor
	Type            string // NotificationTypeXxx constant
	EntityType      string // "charge" or "transaction"
	EntityID        int
	Amount          int64  // cents — for BRL copy formatting
	Description     string // e.g. charge description
	// TxKind is the underlying transaction type ("expense" | "income") for split
	// events, so the copy can say "despesa"/"receita". Empty for non-split events.
	TxKind string
}

const (
	NotificationTypeChargeReceived           = "charge_received"
	NotificationTypeChargeAccepted           = "charge_accepted"
	NotificationTypeSplitCreated             = "split_created"
	NotificationTypeSplitUpdated             = "split_updated"
	NotificationTypeTransferReceived         = "transfer_received"
	NotificationTypeSharedTransactionDeleted = "shared_transaction_deleted"
)

// NotificationFilter is passed to NotificationRepository.List. Cursor is the opaque
// base64url token from the HTTP layer (empty = first page); the repository decodes it.
type NotificationFilter struct {
	UserID int
	Cursor string // opaque base64url token; "" = first page
	Limit  int
}

// NotificationListResult is returned by NotificationService.List and serialized to the inbox response.
type NotificationListResult struct {
	Items      []*Notification `json:"notifications"`
	NextCursor string          `json:"next_cursor"`
	HasMore    bool            `json:"has_more"`
}

// NotificationUnreadCountResponse is the HTTP response for GET /api/notifications/unread-count.
type NotificationUnreadCountResponse struct {
	Count int64 `json:"count"`
}
