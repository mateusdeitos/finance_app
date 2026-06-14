package domain

import "time"

// BudgetScope is a typed forward marker; only Private exists in v1.7 (D-26-2).
// There is no `scope` DB column — this is a lightweight seam for the future shared milestone.
type BudgetScope string

const (
	BudgetScopePrivate BudgetScope = "private"
)

func (s BudgetScope) IsValid() bool {
	return s == BudgetScopePrivate
}

// Budget is one per-category cap. A user's "budget" = their set of Budget rows.
type Budget struct {
	ID          int        `json:"id"`
	OwnerUserID int        `json:"owner_user_id"`
	CategoryID  int        `json:"category_id"`
	AmountCents int64      `json:"amount_cents"` // cents (int64 convention)
	Active      bool       `json:"active"`       // D-26-5 pause toggle
	CreatedAt   *time.Time `json:"created_at"`
	UpdatedAt   *time.Time `json:"updated_at"`
}

// BudgetAlertThreshold is a child of Budget; no timestamp columns exist on its table.
type BudgetAlertThreshold struct {
	ID              int     `json:"id"`
	BudgetID        int     `json:"budget_id"`
	ThresholdPct    int     `json:"threshold_pct"`
	Enabled         bool    `json:"enabled"`           // D-26-6 per-threshold toggle
	LastFiredPeriod *string `json:"last_fired_period"` // "YYYY-MM" or nil; D-26-7
}

// BudgetFilter is the query filter for budget lookups (modeled on TransactionFilter).
type BudgetFilter struct {
	IDs          []int `json:"ids"`
	OwnerUserIDs []int `json:"owner_user_ids"`
	CategoryIDs  []int `json:"category_ids"`
	ActiveOnly   bool  `json:"active_only"` // D-26-5: live caps only
}

// BudgetSpentResult carries per-category realizado data for SPEND-03 (Phase 27 consumer).
type BudgetSpentResult struct {
	Budget         Budget `json:"budget"`
	SpentCents     int64  `json:"spent_cents"`     // realizado, from GetBalance
	RemainingCents int64  `json:"remaining_cents"` // AmountCents - SpentCents
}
