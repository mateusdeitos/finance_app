package domain

import "time"

// TransactionTemplate is the domain model for a user's saved transaction template.
// Templates capture the form fields of a transaction (type, account, category, tags,
// description, split) without an amount or date. They are stored per user, capped at 3.
type TransactionTemplate struct {
	ID        int                        `json:"id"`
	UserID    int                        `json:"user_id"`
	Name      string                     `json:"name"`
	Payload   TransactionTemplatePayload `json:"payload"`
	CreatedAt *time.Time                 `json:"created_at,omitempty"`
	UpdatedAt *time.Time                 `json:"updated_at,omitempty"`
}

// TransactionTemplatePayload is the strict write-boundary for a template's transaction
// fields. On create/update the backend unmarshals incoming JSON into this struct
// (dropping unknown keys, including "amount" and "date" which have no fields here — D-02)
// then re-serializes the canonical form into the payload JSONB column.
//
// SplitSettings reuses domain.SplitSettings verbatim so both split modes
// (Percentage *int and Amount *int64) round-trip faithfully through unmarshal→marshal (TMPL-05).
//
// NOTE: DisallowUnknownFields / strict unmarshaling is wired in the service (Phase 27).
// Phase 26 defines the type only.
type TransactionTemplatePayload struct {
	Type                 TransactionType `json:"type"`
	AccountID            *int            `json:"account_id,omitempty"`
	CategoryID           *int            `json:"category_id,omitempty"`
	DestinationAccountID *int            `json:"destination_account_id,omitempty"`
	Description          string          `json:"description"`
	TagIDs               []int           `json:"tag_ids,omitempty"`
	SplitSettings        []SplitSettings `json:"split_settings,omitempty"`
	// NO Amount, NO Date (D-02) — a struct unmarshal naturally drops them.
}
