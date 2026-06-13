package domain

import "time"

type Account struct {
	ID                    int             `json:"id"`
	UserID                int             `json:"user_id"`
	Name                  string          `json:"name"`
	Description           *string         `json:"description,omitempty"`
	InitialBalance        int64           `json:"initial_balance"`
	IsActive              bool            `json:"is_active"`
	AvatarBackgroundColor *string         `json:"avatar_background_color,omitempty"`
	Position              int             `json:"position"`
	CreatedAt             *time.Time      `json:"created_at"`
	UpdatedAt             *time.Time      `json:"updated_at"`
	UserConnection        *UserConnection `json:"user_connection,omitempty"`
}

type AccountSearchOptions struct {
	Limit      int   `json:"limit"`
	Offset     int   `json:"offset"`
	IDs        []int `json:"ids"`
	UserIDs    []int `json:"user_ids"`
	ActiveOnly *bool `json:"active_only,omitempty"`
}

// AccountDeletionStrategy controls what happens to an account's transactions
// when the account is hard-deleted.
type AccountDeletionStrategy string

const (
	// AccountDeletionStrategyDeleteTransactions deletes the account's
	// transactions (and their shared/linked counterparts) along with the account.
	AccountDeletionStrategyDeleteTransactions AccountDeletionStrategy = "delete_transactions"
	// AccountDeletionStrategyMigrate moves the account's transactions to another
	// account before deleting the account.
	AccountDeletionStrategyMigrate AccountDeletionStrategy = "migrate"
)

func (s AccountDeletionStrategy) IsValid() bool {
	return s == AccountDeletionStrategyDeleteTransactions || s == AccountDeletionStrategyMigrate
}

// AccountDeletionInfo describes the impact of deleting an account so the client
// can prompt the user before a destructive delete.
type AccountDeletionInfo struct {
	TransactionCount int64 `json:"transaction_count"`
}
