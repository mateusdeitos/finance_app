package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestChargeStatusIsValid(t *testing.T) {
	tests := []struct {
		name     string
		status   ChargeStatus
		expected bool
	}{
		{"pending is valid", ChargeStatusPending, true},
		{"paid is valid", ChargeStatusPaid, true},
		{"rejected is valid", ChargeStatusRejected, true},
		{"cancelled is valid", ChargeStatusCancelled, true},
		{"invalid string is not valid", ChargeStatus("invalid"), false},
		{"empty string is not valid", ChargeStatus(""), false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expected, tc.status.IsValid())
		})
	}
}

func TestChargeValidateTransition(t *testing.T) {
	tests := []struct {
		name       string
		current    ChargeStatus
		next       ChargeStatus
		expectsNil bool
	}{
		// Valid transitions from pending
		{"pending -> paid", ChargeStatusPending, ChargeStatusPaid, true},
		{"pending -> rejected", ChargeStatusPending, ChargeStatusRejected, true},
		{"pending -> cancelled", ChargeStatusPending, ChargeStatusCancelled, true},
		// Invalid: pending -> pending
		{"pending -> pending", ChargeStatusPending, ChargeStatusPending, false},
		// Terminal states: paid has no exits
		{"paid -> pending", ChargeStatusPaid, ChargeStatusPending, false},
		{"paid -> paid", ChargeStatusPaid, ChargeStatusPaid, false},
		{"paid -> rejected", ChargeStatusPaid, ChargeStatusRejected, false},
		{"paid -> cancelled", ChargeStatusPaid, ChargeStatusCancelled, false},
		// Terminal states: rejected has no exits
		{"rejected -> pending", ChargeStatusRejected, ChargeStatusPending, false},
		{"rejected -> paid", ChargeStatusRejected, ChargeStatusPaid, false},
		{"rejected -> rejected", ChargeStatusRejected, ChargeStatusRejected, false},
		{"rejected -> cancelled", ChargeStatusRejected, ChargeStatusCancelled, false},
		// Terminal states: cancelled has no exits
		{"cancelled -> pending", ChargeStatusCancelled, ChargeStatusPending, false},
		{"cancelled -> paid", ChargeStatusCancelled, ChargeStatusPaid, false},
		{"cancelled -> rejected", ChargeStatusCancelled, ChargeStatusRejected, false},
		{"cancelled -> cancelled", ChargeStatusCancelled, ChargeStatusCancelled, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			c := &Charge{Status: tc.current}
			err := c.ValidateTransition(tc.next)
			if tc.expectsNil {
				assert.NoError(t, err)
			} else {
				assert.ErrorIs(t, err, ErrInvalidStatusTransition)
			}
		})
	}
}
