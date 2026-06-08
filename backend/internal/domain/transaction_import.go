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
// any transactions or settlements detected as possible duplicates of this row.
type ParsedImportRow struct {
	RowIndex int             `json:"row_index"`
	Status   ImportRowStatus `json:"status"`
	// Date is a calendar date (no time-of-day). It serializes as YYYY-MM-DD so
	// the frontend's date components parse it as a local date instead of a UTC
	// instant — emitting a full RFC3339 timestamp here shifts the displayed day
	// by one in negative-offset timezones (e.g. UTC-3).
	Date                         *Date             `json:"date,omitempty"`
	Description                  string            `json:"description"`
	Type                         TransactionType   `json:"type"`
	Amount                       int64             `json:"amount"` // cents
	CategoryID                   *int              `json:"category_id,omitempty"`
	CategoryInferred             bool              `json:"category_inferred"`
	DestinationAccountID         *int              `json:"destination_account_id,omitempty"`
	RecurrenceType               *RecurrenceType   `json:"recurrence_type,omitempty"`
	RecurrenceCount              *int              `json:"recurrence_count,omitempty"`
	RecurrenceCurrentInstallment *int              `json:"recurrence_current_installment,omitempty"`
	ParseErrors                  []string          `json:"parse_errors,omitempty"`
	DuplicateMatches             []Transaction     `json:"duplicate_matches,omitempty"`
	SettlementMatches            []SettlementMatch `json:"settlement_matches,omitempty"`
}

// SettlementMatch is a settlement flagged as a possible duplicate of an
// imported income/expense row. Description is hydrated from the settlement's
// source transaction so the UI can show meaningful text — settlements
// themselves have no description column.
type SettlementMatch struct {
	ID                  int            `json:"id"`
	AccountID           int            `json:"account_id"`
	Amount              int64          `json:"amount"` // cents
	Type                SettlementType `json:"type"`
	Date                time.Time      `json:"date"`
	SourceTransactionID int            `json:"source_transaction_id"`
	Description         string         `json:"description"`
}

// DuplicateCriteria describes the thresholds used to flag a row as a possible
// duplicate. It is returned alongside detection results so clients always
// display the current, authoritative values instead of hard-coding them.
type DuplicateCriteria struct {
	DescriptionSimilarityThreshold float64 `json:"description_similarity_threshold"`
	AmountToleranceCents           int64   `json:"amount_tolerance_cents"`
}

// ImportCSVResponse is the response returned by the CSV parse endpoint.
type ImportCSVResponse struct {
	Rows              []ParsedImportRow `json:"rows"`
	TotalRows         int               `json:"total_rows"`
	DuplicateCount    int               `json:"duplicate_count"`
	ErrorCount        int               `json:"error_count"`
	DuplicateCriteria DuplicateCriteria `json:"duplicate_criteria"`
}

// CheckDuplicateRowInput is a single row submitted to the bulk duplicate check.
// Type drives the settlement comparison: income matches against credit
// settlements, expense matches against debit settlements, transfer skips
// settlement matching entirely.
type CheckDuplicateRowInput struct {
	RowIndex    int             `json:"row_index"`
	Date        Date            `json:"date"`
	Amount      int64           `json:"amount"` // cents
	Description string          `json:"description"`
	Type        TransactionType `json:"type,omitempty"`
}

// CheckDuplicatesBulkRequest is the request body for the bulk duplicate check.
type CheckDuplicatesBulkRequest struct {
	AccountID *int                     `json:"account_id"` // optional; when set, only checks within that account
	Rows      []CheckDuplicateRowInput `json:"rows"`
}

// CheckDuplicateRowResult holds the duplicate matches for one bulk-checked row.
// Matches lists existing transactions; SettlementMatches lists existing
// settlements (income rows match credit settlements, expense rows match
// debit settlements). Both share the same amount/description thresholds.
type CheckDuplicateRowResult struct {
	RowIndex          int               `json:"row_index"`
	Matches           []Transaction     `json:"matches"`
	SettlementMatches []SettlementMatch `json:"settlement_matches,omitempty"`
}

// CheckDuplicatesBulkResponse is the response of the bulk duplicate check.
type CheckDuplicatesBulkResponse struct {
	Rows []CheckDuplicateRowResult `json:"rows"`
}
