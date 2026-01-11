package domain

import (
	"encoding/json"
	"fmt"
	"time"
)

type TransactionType string

const (
	TransactionTypeExpense  TransactionType = "expense"
	TransactionTypeIncome   TransactionType = "income"
	TransactionTypeTransfer TransactionType = "transfer"
)

func (t TransactionType) IsValid() bool {
	return t == TransactionTypeExpense || t == TransactionTypeIncome || t == TransactionTypeTransfer
}

type RecurrenceType string

const (
	RecurrenceTypeDaily   RecurrenceType = "daily"
	RecurrenceTypeWeekly  RecurrenceType = "weekly"
	RecurrenceTypeMonthly RecurrenceType = "monthly"
	RecurrenceTypeYearly  RecurrenceType = "yearly"
)

func (t RecurrenceType) IsValid() bool {
	return t == RecurrenceTypeDaily || t == RecurrenceTypeWeekly || t == RecurrenceTypeMonthly || t == RecurrenceTypeYearly
}

type Transaction struct {
	ID                      int             `json:"id"`
	ParentID                *int            `json:"parent_id,omitempty"`
	TransactionRecurrenceID *int            `json:"transaction_recurrence_id,omitempty"`
	InstallmentNumber       *int            `json:"installment_number,omitempty"`
	UserID                  int             `json:"user_id"`
	Type                    TransactionType `json:"type"`
	AccountID               int             `json:"account_id"`
	CategoryID              *int            `json:"category_id,omitempty"`
	Amount                  int64           `json:"amount"` // Amount in cents
	Date                    time.Time       `json:"date"`
	Description             string          `json:"description"`
	DestinationAccountID    *int            `json:"destination_account_id,omitempty"`
	Tags                    []Tag           `json:"tags,omitempty"`
	CreatedAt               *time.Time      `json:"created_at"`
	UpdatedAt               *time.Time      `json:"updated_at"`
}

type TransactionCreateRequest struct {
	TransactionType      TransactionType     `json:"transaction_type"`
	AccountID            int                 `json:"account_id"`
	CategoryID           int                 `json:"category_id,omitempty"`
	Amount               int64               `json:"amount"`
	Date                 time.Time           `json:"date"`
	Description          string              `json:"description"`
	DestinationAccountID *int                `json:"destination_account_id,omitempty"`
	Tags                 []Tag               `json:"tags,omitempty"`
	RecurrenceSettings   *RecurrenceSettings `json:"recurrence_settings,omitempty"`
	SplitSettings        []SplitSettings     `json:"split_settings,omitempty"`
}

type TransactionRecurrence struct {
	ID           int        `json:"id"`
	UserID       int        `json:"user_id"`
	Installments int        `json:"installments"`
	CreatedAt    *time.Time `json:"created_at"`
	UpdatedAt    *time.Time `json:"updated_at"`
}

type RecurrenceSettings struct {
	Type        RecurrenceType `json:"type"`
	Repetitions *int           `json:"repetitions,omitempty"` // nil = indefinite
	EndDate     *time.Time     `json:"end_date,omitempty"`
}

type SplitSettings struct {
	ConnectionID int    `json:"connection_id"`
	Percentage   *int   `json:"percentage,omitempty"`
	Amount       *int64 `json:"amount,omitempty"`
}

type TransactionFilter struct {
	AccountIDs  []int             `query:"account_id[]"`
	CategoryIDs []int             `query:"category_id[]"`
	TagIDs      []int             `query:"tag_id[]"`
	Period      *Period           `query:"period,omitempty"`
	Description *string           `query:"description,omitempty"`
	UserID      *int              `query:"user_id,omitempty"`
	Types       []TransactionType `query:"type[]"`
}

type TransactionGroupBy string

const (
	GroupByDate         TransactionGroupBy = "date"
	GroupByGroupingDate TransactionGroupBy = "grouping_date"
	GroupByCategory     TransactionGroupBy = "category"
	GroupByAccount      TransactionGroupBy = "account"
	GroupByTag          TransactionGroupBy = "tag"
	GroupByUser         TransactionGroupBy = "user"
)

type TransactionOrderBy string

const (
	OrderByDate         TransactionOrderBy = "date"
	OrderByGroupingDate TransactionOrderBy = "grouping_date"
	OrderByCategory     TransactionOrderBy = "category"
	OrderByAccount      TransactionOrderBy = "account"
	OrderByValue        TransactionOrderBy = "value"
	OrderByDescription  TransactionOrderBy = "description"
	OrderByTag          TransactionOrderBy = "tag"
	OrderByUser         TransactionOrderBy = "user"
	OrderBySplitPercent TransactionOrderBy = "split_percentage"
)

type BulkUpdateTransaction struct {
	IDs        []int      `json:"ids"`
	Date       *time.Time `json:"date,omitempty"`
	CategoryID *int       `json:"category_id,omitempty"`
	AccountID  *int       `json:"account_id,omitempty"`
	TagIDs     []int      `json:"tag_ids,omitempty"`
}
