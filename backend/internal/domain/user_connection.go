package domain

import "time"

type UserConnectionStatusEnum string

const (
	UserConnectionStatusPending  UserConnectionStatusEnum = "pending"
	UserConnectionStatusAccepted UserConnectionStatusEnum = "accepted"
	UserConnectionStatusRejected UserConnectionStatusEnum = "rejected"
)

type UserConnection struct {
	ID                         int                      `json:"id"`
	FromUserID                 int                      `json:"from_user_id"`
	FromAccountID              int                      `json:"from_account_id"`
	FromDefaultSplitPercentage int                      `json:"from_default_split_percentage"`
	ToUserID                   int                      `json:"to_user_id"`
	ToAccountID                int                      `json:"to_account_id"`
	ToDefaultSplitPercentage   int                      `json:"to_default_split_percentage"`
	ConnectionStatus           UserConnectionStatusEnum `json:"connection_status"`
	CreatedAt                  *time.Time               `json:"created_at"`
	UpdatedAt                  *time.Time               `json:"updated_at"`
}

type UserConnectionSearchOptions struct {
	FromUserIDs      []int                    `json:"from_user_ids"`
	ToUserIDs        []int                    `json:"to_user_ids"`
	FromAccountIDs   []int                    `json:"from_account_ids"`
	ToAccountIDs     []int                    `json:"to_account_ids"`
	ConnectionStatus UserConnectionStatusEnum `json:"connection_status"`
}
