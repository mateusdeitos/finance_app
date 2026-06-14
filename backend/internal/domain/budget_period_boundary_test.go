package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// TestPeriodBoundaryInclusion locks the Period boundary contract (D-26-8 / ROADMAP SC4).
// Every realizado/balance query filters transactions with date in the inclusive range
// [StartDate(), EndDate()], so EndDate() must be the last representable nanosecond of the
// month: a transaction dated exactly EndDate() is included while EndDate()+1ns is excluded.
//
// The exact boundary values are pinned with assert.Equal first so the inclusion assertions
// below are anchored to the real implementation — a zero-value or off-by-one EndDate() fails
// the pin rather than passing a tautology (x.After(x) == false holds for any x).
func TestPeriodBoundaryInclusion(t *testing.T) {
	period := Period{Month: 6, Year: 2026}

	wantStart := time.Date(2026, time.June, 1, 0, 0, 0, 0, time.UTC)
	wantEnd := time.Date(2026, time.June, 30, 23, 59, 59, 999999999, time.UTC)

	assert.Equal(t, wantStart, period.StartDate(),
		"StartDate() must be the first instant of June 2026 (UTC)")
	assert.Equal(t, wantEnd, period.EndDate(),
		"EndDate() must be the last nanosecond of June 2026 (UTC)")

	startDate := period.StartDate()
	endDate := period.EndDate()

	// inPeriod mirrors the inclusive [start, end] filter the realizado queries apply
	// (date >= StartDate AND date <= EndDate).
	inPeriod := func(d time.Time) bool {
		return !d.Before(startDate) && !d.After(endDate)
	}

	t.Run("transaction at exactly EndDate() is included", func(t *testing.T) {
		assert.True(t, inPeriod(endDate),
			"transaction dated exactly EndDate() must fall inside the period")
	})

	t.Run("transaction at EndDate()+1ns is excluded", func(t *testing.T) {
		assert.False(t, inPeriod(endDate.Add(time.Nanosecond)),
			"transaction dated 1ns past EndDate() must fall outside the period")
	})

	t.Run("transaction at exactly StartDate() is included", func(t *testing.T) {
		assert.True(t, inPeriod(startDate),
			"transaction dated exactly StartDate() must fall inside the period")
	})

	t.Run("transaction at StartDate()-1ns is excluded", func(t *testing.T) {
		assert.False(t, inPeriod(startDate.Add(-time.Nanosecond)),
			"transaction dated 1ns before StartDate() must fall outside the period")
	})
}
