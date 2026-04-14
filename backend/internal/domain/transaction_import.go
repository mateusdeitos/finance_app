package domain

import "time"

// ImportDecimalSeparatorValue controls how decimal numbers are parsed in CSV imports.
type ImportDecimalSeparatorValue string

const (
	DecimalSeparatorComma ImportDecimalSeparatorValue = "comma"
	DecimalSeparatorDot   ImportDecimalSeparatorValue = "dot"
)

// ImportTypeDefinitionRule controls how transaction type is inferred from CSV amount sign.
type ImportTypeDefinitionRule string

const (
	TypeDefinitionPositiveAsIncome  ImportTypeDefinitionRule = "positive_as_income"
	TypeDefinitionPositiveAsExpense ImportTypeDefinitionRule = "positive_as_expense"
)

// ImportRowStatus indicates whether a parsed CSV row is new or a duplicate.
type ImportRowStatus string

const (
	ImportRowStatusPending   ImportRowStatus = "pending"
	ImportRowStatusDuplicate ImportRowStatus = "duplicate"
)

// ParsedImportRow represents a single row from a parsed CSV import file.
// It includes inferred values (e.g. category from transaction history) and
// a status flag for duplicate detection.
type ParsedImportRow struct {
	RowIndex             int             `json:"row_index"`
	Status               ImportRowStatus `json:"status"`
	Date                 *time.Time      `json:"date,omitempty"`
	Description          string          `json:"description"`
	Type                 TransactionType `json:"type"`
	Amount               int64           `json:"amount"` // cents
	CategoryID           *int            `json:"category_id,omitempty"`
	CategoryInferred     bool            `json:"category_inferred"`
	DestinationAccountID *int            `json:"destination_account_id,omitempty"`
	RecurrenceType       *RecurrenceType `json:"recurrence_type,omitempty"`
	RecurrenceCount      *int            `json:"recurrence_count,omitempty"`
	ParseErrors          []string        `json:"parse_errors,omitempty"`
}

// ImportCSVResponse is the response returned by the CSV parse endpoint.
type ImportCSVResponse struct {
	Rows           []ParsedImportRow `json:"rows"`
	TotalRows      int               `json:"total_rows"`
	DuplicateCount int               `json:"duplicate_count"`
	ErrorCount     int               `json:"error_count"`
}

// CheckDuplicateRequest is the request body for the check-duplicate endpoint.
type CheckDuplicateRequest struct {
	Date        string `json:"date"`        // YYYY-MM-DD
	Description string `json:"description"`
	Amount      int64  `json:"amount"`      // cents
	AccountID   *int   `json:"account_id"`  // optional; when set, only checks within that account
}
