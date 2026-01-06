package domain

import "time"

type TransactionType string

const (
	TransactionTypeExpense  TransactionType = "expense"
	TransactionTypeIncome   TransactionType = "income"
	TransactionTypeTransfer TransactionType = "transfer"
)

type RecurrenceType string

const (
	RecurrenceTypeDaily   RecurrenceType = "daily"
	RecurrenceTypeWeekly  RecurrenceType = "weekly"
	RecurrenceTypeMonthly RecurrenceType = "monthly"
	RecurrenceTypeYearly  RecurrenceType = "yearly"
)

type Transaction struct {
	ID                   int             `json:"id"`
	UserID               int             `json:"user_id"`
	Type                 TransactionType `json:"type"`
	AccountID            int             `json:"account_id"`
	CategoryID           *int            `json:"category_id,omitempty"`
	Amount               int64           `json:"amount"` // Amount in cents
	Date                 time.Time       `json:"date"`
	GroupingDate         *time.Time      `json:"grouping_date,omitempty"`
	Description          string          `json:"description"`
	DestinationAccountID *int            `json:"destination_account_id,omitempty"`
	SplitPercentage      *int            `json:"split_percentage,omitempty"`
	Tags                 []Tag           `json:"tags,omitempty"`
	CreatedAt            *time.Time      `json:"created_at"`
	UpdatedAt            *time.Time      `json:"updated_at"`
}

type TransactionRecurrence struct {
	ID            int       `json:"id"`
	TransactionID int       `json:"transaction_id"`
	Index         int       `json:"index"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type TransactionRecurrenceConfig struct {
	Type        RecurrenceType `json:"type"`
	Repetitions *int           `json:"repetitions,omitempty"` // nil = indefinite
	StartDate   time.Time      `json:"start_date"`
}

type TransactionFilter struct {
	AccountIDs        []int             `json:"account_ids,omitempty"`
	CategoryIDs       []int             `json:"category_ids,omitempty"`
	TagIDs            []int             `json:"tag_ids,omitempty"`
	StartDate         *time.Time        `json:"start_date,omitempty"`
	EndDate           *time.Time        `json:"end_date,omitempty"`
	StartGroupingDate *time.Time        `json:"start_grouping_date,omitempty"`
	EndGroupingDate   *time.Time        `json:"end_grouping_date,omitempty"`
	MinAmount         *int64            `json:"min_amount,omitempty"`
	MaxAmount         *int64            `json:"max_amount,omitempty"`
	Description       *string           `json:"description,omitempty"`
	UserID            *int              `json:"user_id,omitempty"`
	Types             []TransactionType `json:"types,omitempty"`
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
