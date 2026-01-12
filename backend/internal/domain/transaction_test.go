package domain

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
)

func TestPeriodUnmarshalJSON(t *testing.T) {
	type testStruct struct {
		Period Period `json:"period"`
	}
	t.Run("valid period", func(t *testing.T) {
		filter := &testStruct{}
		data := map[string]string{
			"period": "2025-01",
		}

		jsonData, err := json.Marshal(data)
		if err != nil {
			t.Fatal(err)
		}

		err = json.Unmarshal(jsonData, filter)
		assert.NoError(t, err)
		assert.Equal(t, 1, filter.Period.Month)
		assert.Equal(t, 2025, filter.Period.Year)
	})

	t.Run("invalid period", func(t *testing.T) {
		filter := &testStruct{}
		data := map[string]string{
			"period": "2025-13",
		}

		jsonData, err := json.Marshal(data)
		if err != nil {
			t.Fatal(err)
		}

		err = json.Unmarshal(jsonData, filter)
		assert.Error(t, err)
	})

	t.Run("should return the correct start and end date", func(t *testing.T) {
		testCases := []struct {
			Period    Period
			StartDate time.Time
			EndDate   time.Time
		}{
			{
				Period: Period{
					Month: 1,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.January, 31, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 2,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.February, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.February, 28, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 3,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.March, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.March, 31, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 4,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.April, 30, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 5,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.May, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.May, 31, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 6,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.June, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.June, 30, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 7,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.July, 31, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 8,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.August, 31, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 9,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.September, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.September, 30, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 10,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.October, 31, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 11,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.November, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.November, 30, 23, 59, 59, 999999999, time.UTC),
			},
			{
				Period: Period{
					Month: 12,
					Year:  2026,
				},
				StartDate: time.Date(2026, time.December, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2026, time.December, 31, 23, 59, 59, 999999999, time.UTC),
			},
		}

		for _, testCase := range testCases {
			period := testCase.Period
			startDate := testCase.StartDate
			endDate := testCase.EndDate
			assert.Equal(t, startDate, period.StartDate())
			assert.Equal(t, endDate, period.EndDate())
		}
	})
}

func TestComparableSearchToSQL(t *testing.T) {
	type testStruct struct {
		IntegerComparableSearch ComparableSearch[int]
		StringComparableSearch  ComparableSearch[string]
		BooleanComparableSearch ComparableSearch[bool]
		FloatComparableSearch   ComparableSearch[float64]
		TimeComparableSearch    ComparableSearch[time.Time]
	}

	t.Run("integer comparable search", func(t *testing.T) {
		comparableSearch := &testStruct{
			IntegerComparableSearch: ComparableSearch[int]{
				GreaterThan: lo.ToPtr(1),
			},
		}

		sql := comparableSearch.IntegerComparableSearch.ToSQL("installment_number")
		assert.Equal(t, "installment_number > 1", sql)

		comparableSearch = &testStruct{
			IntegerComparableSearch: ComparableSearch[int]{
				LessThan: lo.ToPtr(-1),
			},
		}

		sql = comparableSearch.IntegerComparableSearch.ToSQL("installment_number")
		assert.Equal(t, "installment_number < -1", sql)
	})

	t.Run("string comparable search", func(t *testing.T) {
		comparableSearch := &testStruct{
			StringComparableSearch: ComparableSearch[string]{
				Equal: lo.ToPtr("test"),
			},
		}

		sql := comparableSearch.StringComparableSearch.ToSQL("description")
		assert.Equal(t, "description = 'test'", sql)
	})

	t.Run("boolean comparable search", func(t *testing.T) {
		comparableSearch := &testStruct{
			BooleanComparableSearch: ComparableSearch[bool]{
				Equal: lo.ToPtr(true),
			},
		}

		sql := comparableSearch.BooleanComparableSearch.ToSQL("is_active")
		assert.Equal(t, "is_active = true", sql)
	})

	t.Run("float comparable search", func(t *testing.T) {
		comparableSearch := &testStruct{
			FloatComparableSearch: ComparableSearch[float64]{
				Equal: lo.ToPtr(1.0),
			},
		}

		sql := comparableSearch.FloatComparableSearch.ToSQL("amount")
		assert.Equal(t, "amount = 1.000000", sql)
	})

	t.Run("time comparable search", func(t *testing.T) {
		comparableSearch := &testStruct{
			TimeComparableSearch: ComparableSearch[time.Time]{
				Equal: lo.ToPtr(time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)),
			},
		}

		sql := comparableSearch.TimeComparableSearch.ToSQL("date")
		assert.Equal(t, "date = '2026-01-01T00:00:00Z'", sql)
	})
}
