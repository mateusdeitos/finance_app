package domain

import (
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"time"

	"gorm.io/gorm"
)

type TransactionType string

const (
	TransactionTypeExpense  TransactionType = "expense"
	TransactionTypeIncome   TransactionType = "income"
	TransactionTypeTransfer TransactionType = "transfer"
)

func (t TransactionType) Invert() TransactionType {
	if t == TransactionTypeExpense {
		return TransactionTypeIncome
	}
	return TransactionTypeExpense
}

func (t TransactionType) IsValid() bool {
	return t == TransactionTypeExpense || t == TransactionTypeIncome || t == TransactionTypeTransfer
}

func (t TransactionType) IsTransfer() bool {
	return t == TransactionTypeTransfer
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

type OperationType string

const (
	OperationTypeCredit OperationType = "credit"
	OperationTypeDebit  OperationType = "debit"
)

func OperationTypeFromTransactionType(t TransactionType) OperationType {
	switch t {
	case TransactionTypeIncome:
		return OperationTypeCredit
	case TransactionTypeExpense:
		return OperationTypeDebit
	}
	return OperationTypeDebit
}

func (o OperationType) Invert() OperationType {
	if o == OperationTypeCredit {
		return OperationTypeDebit
	}
	return OperationTypeCredit
}

type Transaction struct {
	ID                      int                    `json:"id"`
	TransactionRecurrenceID *int                   `json:"transaction_recurrence_id,omitempty"`
	InstallmentNumber       *int                   `json:"installment_number,omitempty"`
	UserID                  int                    `json:"user_id"`
	OriginalUserID          *int                   `json:"original_user_id"`
	Type                    TransactionType        `json:"type"`
	AccountID               int                    `json:"account_id"`
	CategoryID              *int                   `json:"category_id,omitempty"`
	Amount                  int64                  `json:"amount"` // Amount in cents
	OperationType           OperationType          `json:"operation_type"`
	Date                    time.Time              `json:"date"`
	Description             string                 `json:"description"`
	Tags                    []Tag                  `json:"tags,omitempty"`
	LinkedTransactions      []Transaction          `json:"linked_transactions,omitempty"`
	TransactionRecurrence   *TransactionRecurrence `json:"transaction_recurrence,omitempty"`
	SettlementsFromSource   []Settlement           `json:"settlements_from_source,omitempty"`
	ChargeID                *int                   `json:"charge_id,omitempty"`
	CreatedAt               *time.Time             `json:"created_at"`
	UpdatedAt               *time.Time             `json:"updated_at"`
	DeletedAt               *time.Time             `json:"deleted_at,omitempty"`
}

func (t *Transaction) SetType(newType TransactionType) {
	t.Type = newType
	t.OperationType = OperationTypeFromTransactionType(t.Type)
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

type TransactionUpdateRequest struct {
	TransactionType      *TransactionType               `json:"transaction_type"`
	AccountID            *int                           `json:"account_id"`
	CategoryID           *int                           `json:"category_id,omitempty"`
	Amount               *int64                         `json:"amount"`
	Date                 *time.Time                     `json:"date"`
	Description          *string                        `json:"description"`
	DestinationAccountID *int                           `json:"destination_account_id,omitempty"`
	Tags                 []Tag                          `json:"tags,omitempty"`
	PropagationSettings  TransactionPropagationSettings `json:"propagation_settings"`
	RecurrenceSettings   *RecurrenceSettings            `json:"recurrence_settings,omitempty"`
	SplitSettings        []SplitSettings                `json:"split_settings,omitempty"`
}

type TransactionRecurrence struct {
	ID           int            `json:"id"`
	UserID       int            `json:"user_id"`
	Type         RecurrenceType `json:"type"`
	Installments int            `json:"installments"`
	CreatedAt    *time.Time     `json:"created_at"`
	UpdatedAt    *time.Time     `json:"updated_at"`
}

func RecurrenceFromSettings(recurrenceSettings RecurrenceSettings, userID int) *TransactionRecurrence {
	return &TransactionRecurrence{
		ID:           0,
		Type:         recurrenceSettings.Type,
		Installments: recurrenceSettings.TotalInstallments,
		UserID:       userID,
	}
}

type TransactionRecurrenceFilter struct {
	IDs            []int `query:"id[]"`
	UserID         int   `query:"user_id"`
	TransactionIDs []int `query:"transaction_id[]"`
}

type RecurrenceSettings struct {
	Type               RecurrenceType `json:"type"`
	CurrentInstallment int            `json:"current_installment"`
	TotalInstallments  int            `json:"total_installments"`
}

type SplitSettings struct {
	ConnectionID   int `json:"connection_id"`
	UserConnection *UserConnection
	Percentage     *int   `json:"percentage,omitempty"`
	Amount         *int64 `json:"amount,omitempty"`
}

type TransactionFilter struct {
	IDs               []int                        `query:"id[]"`
	IDsNotIn          []int                        `query:"id_not_in[]"`
	RecurrenceIDs     []int                        `query:"recurrence_id[]"`
	AccountIDs        []int                        `query:"account_id[]"`
	CategoryIDs       []int                        `query:"category_id[]"`
	TagIDs            []int                        `query:"tag_id[]"`
	Description       *TextSearch                  `query:"description,omitempty"`
	UserID            *int                         `query:"user_id,omitempty"`
	Types             []TransactionType            `query:"type[]"`
	InstallmentNumber *ComparableSearch[int]       `query:"installment_number,omitempty"`
	StartDate         *ComparableSearch[time.Time] `query:"start_date,omitempty"`
	EndDate           *ComparableSearch[time.Time] `query:"end_date,omitempty"`
	SortBy            *SortBy                      `query:"sort_by,omitempty"`
	Limit             *int                         `query:"limit,omitempty"`
	Offset            *int                         `query:"offset,omitempty"`
	WithSettlements   bool                         `query:"with_settlements"`
}

type TextSearch struct {
	Query string `query:"query"`
	Exact bool   `query:"exact"`
}

type SortBy struct {
	Field string
	Order SortOrder
}

func (s *SortBy) Scope() func(db *gorm.DB) *gorm.DB {

	return func(db *gorm.DB) *gorm.DB {
		if s.Field == "" {
			return db
		}

		if !s.Order.IsValid() {
			s.Order = SortOrderAsc
		}

		return db.Order(fmt.Sprintf("%s %s", s.Field, s.Order))
	}
}

type SortOrder string

const (
	SortOrderAsc  SortOrder = "asc"
	SortOrderDesc SortOrder = "desc"
)

func (s SortOrder) IsValid() bool {
	return s == SortOrderAsc || s == SortOrderDesc
}

type ComparableSearch[R comparable] struct {
	GreaterThan        *R
	LessThan           *R
	GreaterThanOrEqual *R
	LessThanOrEqual    *R
	Equal              *R
	NotEqual           *R
}

func (c *ComparableSearch[R]) IsValid() bool {
	return c.GreaterThan != nil || c.LessThan != nil || c.GreaterThanOrEqual != nil || c.LessThanOrEqual != nil || c.Equal != nil || c.NotEqual != nil
}

func (c *ComparableSearch[R]) ToSQL(field string) string {
	var getString = func(value *R, op string) string {
		valueR := *value
		kind := reflect.TypeOf(valueR).Kind()

		isTime := kind == reflect.Struct && reflect.TypeOf(valueR).String() == "time.Time"
		if isTime {
			v := reflect.ValueOf(valueR).Interface().(time.Time)
			return fmt.Sprintf("%s %s '%s'", field, op, v.Format(time.RFC3339))
		}

		if kind == reflect.String {
			v := reflect.ValueOf(valueR).String()
			return fmt.Sprintf("%s %s '%s'", field, op, v)
		}

		isInt := slices.Contains(
			[]reflect.Kind{reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64},
			kind,
		)

		if isInt {
			v := reflect.ValueOf(valueR).Int()
			return fmt.Sprintf("%s %s %d", field, op, v)
		}

		isFloat := slices.Contains(
			[]reflect.Kind{reflect.Float32, reflect.Float64},
			kind,
		)

		if isFloat {
			v := reflect.ValueOf(valueR).Float()
			return fmt.Sprintf("%s %s %f", field, op, v)
		}

		if kind == reflect.Bool {
			v := reflect.ValueOf(valueR).Bool()
			return fmt.Sprintf("%s %s %t", field, op, v)
		}

		return fmt.Sprintf("%s %s %v", field, op, valueR)
	}

	if c.GreaterThan != nil {
		return getString(c.GreaterThan, ">")
	}
	if c.GreaterThanOrEqual != nil {
		return getString(c.GreaterThanOrEqual, ">=")
	}
	if c.LessThan != nil {
		return getString(c.LessThan, "<")
	}
	if c.LessThanOrEqual != nil {
		return getString(c.LessThanOrEqual, "<=")
	}
	if c.Equal != nil {
		return getString(c.Equal, "=")
	}
	if c.NotEqual != nil {
		return getString(c.NotEqual, "!=")
	}
	return ""
}

type TransactionPropagationSettings string

const (
	TransactionPropagationSettingsAll              TransactionPropagationSettings = "all"
	TransactionPropagationSettingsCurrent          TransactionPropagationSettings = "current"
	TransactionPropagationSettingsCurrentAndFuture TransactionPropagationSettings = "current_and_future"
)

func (p TransactionPropagationSettings) IsValid() bool {
	return p == TransactionPropagationSettingsAll || p == TransactionPropagationSettingsCurrent || p == TransactionPropagationSettingsCurrentAndFuture
}

type Period struct {
	Month int
	Year  int
}

func (p *Period) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}

	month, year := 0, 0
	fmt.Sscanf(s, "%d-%d", &year, &month)
	p.Month = month
	p.Year = year
	if !p.IsValid() {
		return fmt.Errorf("invalid period: %s, must be in the format YYYY-MM", s)
	}
	return nil
}

func (p *Period) String() string {
	return fmt.Sprintf("%d-%d", p.Year, p.Month)
}

func (p *Period) IsValid() bool {
	return p.Month > 0 && p.Month <= 12 && p.Year > 0
}

func (p *Period) StartDate() time.Time {
	return time.Date(p.Year, time.Month(p.Month), 1, 0, 0, 0, 0, time.UTC)
}

func (p *Period) EndDate() time.Time {
	return time.Date(p.Year, time.Month(p.Month)+1, 0, 23, 59, 59, 999999999, time.UTC)
}

type BulkUpdateTransaction struct {
	IDs        []int      `json:"ids"`
	Date       *time.Time `json:"date,omitempty"`
	CategoryID *int       `json:"category_id,omitempty"`
	AccountID  *int       `json:"account_id,omitempty"`
	TagIDs     []int      `json:"tag_ids,omitempty"`
}
