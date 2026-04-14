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
