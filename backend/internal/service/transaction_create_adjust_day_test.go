package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// TestAdjustLinkedTransactionDay locks the day-of-month clamping behavior for the
// partner's linked transaction date — in particular the month-end edge cases
// (February and day 31 on 30-day months). Pure logic, no DB required.
func TestAdjustLinkedTransactionDay(t *testing.T) {
	utc := func(y int, m time.Month, d int) time.Time {
		return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	}
	ptr := func(i int) *int { return &i }

	tests := []struct {
		name     string
		base     time.Time
		day      *int
		expected time.Time
	}{
		{
			name:     "nil preference keeps the source date untouched",
			base:     utc(2026, time.July, 8),
			day:      nil,
			expected: utc(2026, time.July, 8),
		},
		{
			name:     "day within the month is applied as-is",
			base:     utc(2026, time.July, 8),
			day:      ptr(10),
			expected: utc(2026, time.July, 10),
		},
		{
			name:     "day 30 in February (non-leap) clamps to the 28th",
			base:     utc(2026, time.February, 8),
			day:      ptr(30),
			expected: utc(2026, time.February, 28),
		},
		{
			name:     "day 30 in February (leap year) clamps to the 29th",
			base:     utc(2028, time.February, 8),
			day:      ptr(30),
			expected: utc(2028, time.February, 29),
		},
		{
			name:     "day 31 in February (non-leap) clamps to the 28th",
			base:     utc(2026, time.February, 1),
			day:      ptr(31),
			expected: utc(2026, time.February, 28),
		},
		{
			name:     "day 31 in April (30 days) clamps to the 30th",
			base:     utc(2026, time.April, 5),
			day:      ptr(31),
			expected: utc(2026, time.April, 30),
		},
		{
			name:     "day 31 in June (30 days) clamps to the 30th",
			base:     utc(2026, time.June, 15),
			day:      ptr(31),
			expected: utc(2026, time.June, 30),
		},
		{
			name:     "day 31 in July (31 days) is applied as-is",
			base:     utc(2026, time.July, 1),
			day:      ptr(31),
			expected: utc(2026, time.July, 31),
		},
		{
			name:     "day 30 in November (30 days) is applied as-is",
			base:     utc(2026, time.November, 8),
			day:      ptr(30),
			expected: utc(2026, time.November, 30),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := adjustLinkedTransactionDay(tt.base, tt.day)
			assert.Equal(t, tt.expected, got)
		})
	}
}

// TestAdjustLinkedTransactionDayPreservesTimeAndLocation ensures only the day is
// changed — the time-of-day components and location of the source date are kept.
func TestAdjustLinkedTransactionDayPreservesTimeAndLocation(t *testing.T) {
	base := time.Date(2026, time.February, 8, 13, 45, 30, 123, time.UTC)
	day := 31

	got := adjustLinkedTransactionDay(base, &day)

	assert.Equal(t, 2026, got.Year())
	assert.Equal(t, time.February, got.Month())
	assert.Equal(t, 28, got.Day(), "Feb clamps day 31 to 28 in 2026")
	assert.Equal(t, 13, got.Hour())
	assert.Equal(t, 45, got.Minute())
	assert.Equal(t, 30, got.Second())
	assert.Equal(t, 123, got.Nanosecond())
	assert.Equal(t, time.UTC, got.Location())
}
