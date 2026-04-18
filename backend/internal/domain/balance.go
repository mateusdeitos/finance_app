package domain

type BalanceFilter struct {
	UserID          int
	Period          Period
	AccountIDs      []int `query:"account_id[]"`
	CategoryIDs     []int `query:"category_id[]"`
	TagIDs          []int `query:"tag_id[]"`
	Accumulated     bool  `query:"accumulated"`
	HideSettlements bool  `query:"hide_settlements"`
}

type BalanceResult struct {
	Balance int64 `json:"balance"`
}
