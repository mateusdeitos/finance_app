package domain

type BalanceFilter struct {
	UserID          int
	Period          Period
	AccountIDs      []int `query:"account_id[]"`
	CategoryIDs     []int `query:"category_id[]"`
	TagIDs          []int `query:"tag_id[]"`
	Accumulated     bool  `query:"accumulated"`
	HideSettlements bool  `query:"hide_settlements"`
	// Reviewed filters by review status: true → only reviewed transactions,
	// false → only unreviewed transactions, nil → no filter. Applied to both
	// the transactions leg and (via the source transaction) the settlements leg
	// so the balance stays consistent with the filtered listing.
	Reviewed *bool `query:"reviewed,omitempty"`
}

type BalanceResult struct {
	Balance int64 `json:"balance"`
}
