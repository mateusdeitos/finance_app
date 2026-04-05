package domain

import "time"

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
