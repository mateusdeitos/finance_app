package domain

import "time"

type SettlementType string

const (
	SettlementTypeCredit SettlementType = "credit"
	SettlementTypeDebit  SettlementType = "debit"
)

func (s SettlementType) IsValid() bool {
	return s == SettlementTypeCredit || s == SettlementTypeDebit
}

type Settlement struct {
	ID                   int            `json:"id"`
	UserID               int            `json:"user_id"`
	Amount               int64          `json:"amount"` // Amount in cents
	Type                 SettlementType `json:"type"`
	AccountID            int            `json:"account_id"`
	SourceTransactionID  int            `json:"source_transaction_id"`
	ParentTransactionID  int            `json:"parent_transaction_id"`
	Date                 time.Time      `json:"date"`
	CreatedAt            *time.Time     `json:"created_at"`
	UpdatedAt            *time.Time     `json:"updated_at"`
}

type SettlementUpdateRequest struct {
	Date *Date `json:"date,omitempty"`
}

type SettlementFilter struct {
	IDs                   []int `query:"id[]"`
	UserIDs               []int `query:"user_id[]"`
	AccountIDs            []int `query:"account_id[]"`
	SourceTransactionIDs  []int `query:"source_transaction_id[]"`
	ParentTransactionIDs  []int `query:"parent_transaction_id[]"`
	Limit                 *int  `query:"limit,omitempty"`
	Offset                *int  `query:"offset,omitempty"`
}
