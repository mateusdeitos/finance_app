package domain

import "time"

// ImportTypeDefinitionRule controls how transaction type is inferred from CSV amount sign.
type ImportTypeDefinitionRule string

const (
	TypeDefinitionPositiveAsIncome  ImportTypeDefinitionRule = "positive_as_income"
	TypeDefinitionPositiveAsExpense ImportTypeDefinitionRule = "positive_as_expense"
)

// ImportRowStatus indicates the parse status of a CSV row.
type ImportRowStatus string

const (
	ImportRowStatusPending ImportRowStatus = "pending"
)

// ParsedImportRow represents a single row from a parsed CSV import file.
// It includes inferred values (e.g. category from transaction history) and
// any transactions detected as possible duplicates of this row.
type ParsedImportRow struct {
	RowIndex                     int             `json:"row_index"`
	Status                       ImportRowStatus `json:"status"`
	Date                         *time.Time      `json:"date,omitempty"`
	Description                  string          `json:"description"`
	Type                         TransactionType `json:"type"`
	Amount                       int64           `json:"amount"` // cents
	CategoryID                   *int            `json:"category_id,omitempty"`
	CategoryInferred             bool            `json:"category_inferred"`
	DestinationAccountID         *int            `json:"destination_account_id,omitempty"`
	RecurrenceType               *RecurrenceType `json:"recurrence_type,omitempty"`
	RecurrenceCount              *int            `json:"recurrence_count,omitempty"`
	RecurrenceCurrentInstallment *int            `json:"recurrence_current_installment,omitempty"`
	ParseErrors                  []string        `json:"parse_errors,omitempty"`
	DuplicateMatches             []Transaction   `json:"duplicate_matches,omitempty"`
}

// ImportCSVResponse is the response returned by the CSV parse endpoint.
type ImportCSVResponse struct {
	Rows           []ParsedImportRow `json:"rows"`
	TotalRows      int               `json:"total_rows"`
	DuplicateCount int               `json:"duplicate_count"`
	ErrorCount     int               `json:"error_count"`
}

// CheckDuplicateRowInput is a single row submitted to the bulk duplicate check.
type CheckDuplicateRowInput struct {
	RowIndex    int    `json:"row_index"`
	Date        Date   `json:"date"`
	Amount      int64  `json:"amount"` // cents
	Description string `json:"description"`
}

// CheckDuplicatesBulkRequest is the request body for the bulk duplicate check.
type CheckDuplicatesBulkRequest struct {
	AccountID *int                     `json:"account_id"` // optional; when set, only checks within that account
	Rows      []CheckDuplicateRowInput `json:"rows"`
}

// CheckDuplicateRowResult holds the duplicate matches for one bulk-checked row.
type CheckDuplicateRowResult struct {
	RowIndex int           `json:"row_index"`
	Matches  []Transaction `json:"matches"`
}

// CheckDuplicatesBulkResponse is the response of the bulk duplicate check.
type CheckDuplicatesBulkResponse struct {
	Rows []CheckDuplicateRowResult `json:"rows"`
}
