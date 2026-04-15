package domain

import (
	"errors"
	"time"
)

type ChargeStatus string

const (
	ChargeStatusPending   ChargeStatus = "pending"
	ChargeStatusPaid      ChargeStatus = "paid"
	ChargeStatusRejected  ChargeStatus = "rejected"
	ChargeStatusCancelled ChargeStatus = "cancelled"
)

func (s ChargeStatus) IsValid() bool {
	return s == ChargeStatusPending || s == ChargeStatusPaid ||
		s == ChargeStatusRejected || s == ChargeStatusCancelled
}

var ErrInvalidStatusTransition = errors.New("invalid charge status transition")

type Charge struct {
	ID               int
	ChargerUserID    int
	PayerUserID      int
	ChargerAccountID *int
	PayerAccountID   *int
	ConnectionID     int
	PeriodMonth      int
	PeriodYear       int
	Description      *string
	Status           ChargeStatus
	Date             *time.Time
	CreatedAt        *time.Time
	UpdatedAt        *time.Time
}

func (c *Charge) ValidateTransition(newStatus ChargeStatus) error {
	switch c.Status {
	case ChargeStatusPending:
		if newStatus == ChargeStatusPaid || newStatus == ChargeStatusRejected || newStatus == ChargeStatusCancelled {
			return nil
		}
	}
	return ErrInvalidStatusTransition
}

type ChargeSearchOptions struct {
	UserID       int          `json:"user_id" query:"user_id"`
	Direction    string       `json:"direction" query:"direction"`        // "sent" | "received" | "" (all)
	Status       ChargeStatus `json:"status" query:"status"`             // "" means no filter
	ConnectionID int          `json:"connection_id" query:"connection_id"` // 0 means no filter
	Limit        int          `json:"limit" query:"limit"`
	Offset       int          `json:"offset" query:"offset"`
}

type CreateChargeRequest struct {
	ConnectionID int       `json:"connection_id"`
	MyAccountID  int       `json:"my_account_id"`
	PeriodMonth  int       `json:"period_month"`
	PeriodYear   int       `json:"period_year"`
	Description  *string   `json:"description"`
	Date         time.Time `json:"date"`
}

type AcceptChargeRequest struct {
	AccountID int       `json:"account_id"`
	Amount    *int64    `json:"amount,omitempty"`
	Date      time.Time `json:"date"`
}
