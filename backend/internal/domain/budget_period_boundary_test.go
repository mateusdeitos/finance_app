package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestPeriodBoundaryInclusion(t *testing.T) {
	period := Period{Month: 6, Year: 2026}
	endDate := period.EndDate() // 2026-06-30 23:59:59.999999999 UTC

	t.Run("transaction at exactly EndDate() is included", func(t *testing.T) {
		txDate := endDate
		assert.False(t, txDate.After(endDate),
			"transaction at EndDate() must not be After endDate")
	})

	t.Run("transaction at EndDate()+1ns is excluded", func(t *testing.T) {
		txDate := endDate.Add(time.Nanosecond)
		assert.True(t, txDate.After(endDate),
			"transaction 1ns past EndDate() must be After endDate")
	})
}
