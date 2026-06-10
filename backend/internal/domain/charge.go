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

type ChargeInitiatorRole string

const (
	ChargeInitiatorRoleCharger ChargeInitiatorRole = "charger"
	ChargeInitiatorRolePayer   ChargeInitiatorRole = "payer"
)

func (r ChargeInitiatorRole) IsValid() bool {
	return r == ChargeInitiatorRoleCharger || r == ChargeInitiatorRolePayer
}

type Charge struct {
	ID               int          `json:"id"`
	ChargerUserID    int          `json:"charger_user_id"`
	PayerUserID      int          `json:"payer_user_id"`
	ChargerAccountID *int         `json:"charger_account_id"`
	PayerAccountID   *int         `json:"payer_account_id"`
	// InitiatorUserID is the user who created the charge. It is independent of
	// the charger/payer roles: a payer can initiate ("I'll pay you") just as a
	// charger can ("you owe me"). The OTHER party is the one who must accept or
	// reject; the initiator is the one who can cancel.
	InitiatorUserID int          `json:"initiator_user_id"`
	ConnectionID    int          `json:"connection_id"`
	PeriodMonth     int          `json:"period_month"`
	PeriodYear      int          `json:"period_year"`
	Description     *string      `json:"description"`
	Amount          *int64       `json:"amount,omitempty"`
	Status          ChargeStatus `json:"status"`
	Date            *time.Time   `json:"date"`
	CreatedAt       *time.Time   `json:"created_at"`
	UpdatedAt       *time.Time   `json:"updated_at"`
}

// CounterpartyUserID returns the party that did NOT initiate the charge — the
// one expected to accept or reject it.
func (c *Charge) CounterpartyUserID() int {
	if c.InitiatorUserID == c.ChargerUserID {
		return c.PayerUserID
	}
	return c.ChargerUserID
}

// IsInitiator reports whether the given user created the charge.
func (c *Charge) IsInitiator(userID int) bool {
	return c.InitiatorUserID == userID
}

// IsParty reports whether the given user is the charger or the payer.
func (c *Charge) IsParty(userID int) bool {
	return c.ChargerUserID == userID || c.PayerUserID == userID
}

func (c *Charge) ValidateTransition(newStatus ChargeStatus) error {
	switch c.Status {
	case ChargeStatusPending:
		if newStatus == ChargeStatusPaid || newStatus == ChargeStatusRejected || newStatus == ChargeStatusCancelled {
			return nil
		}
	case ChargeStatusPaid, ChargeStatusRejected, ChargeStatusCancelled:
		// Terminal states — no transitions allowed
	}
	return ErrInvalidStatusTransition
}

type ChargeSearchOptions struct {
	UserID       int          `json:"user_id"       query:"user_id"`
	Direction    string       `json:"direction"     query:"direction"`      // "sent" | "received" | "" (all)
	Status       ChargeStatus `json:"status"        query:"status"`         // "" means no filter
	ConnectionID int          `json:"connection_id" query:"connection_id"`  // 0 means no filter
	IDs          []int        `json:"-"             query:"id[]"`           // filter by specific IDs; empty = no filter
	Limit        int          `json:"limit"         query:"limit"`
	Offset       int          `json:"offset"        query:"offset"`
}

type CreateChargeRequest struct {
	ConnectionID int                  `json:"connection_id"`
	MyAccountID  int                  `json:"my_account_id"`
	PeriodMonth  int                  `json:"period_month"`
	PeriodYear   int                  `json:"period_year"`
	Description  *string              `json:"description"`
	Amount       *int64               `json:"amount,omitempty"`
	Role         *ChargeInitiatorRole `json:"role,omitempty"`
	Date         time.Time            `json:"date"`
}

type AcceptChargeRequest struct {
	AccountID int       `json:"account_id"`
	Amount    *int64    `json:"amount,omitempty"`
	Date      time.Time `json:"date"`
}
