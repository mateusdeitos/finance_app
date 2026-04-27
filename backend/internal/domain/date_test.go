package domain

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestDateMarshalJSON(t *testing.T) {
	t.Run("formats as YYYY-MM-DD", func(t *testing.T) {
		d := Date{Time: time.Date(2026, 4, 27, 15, 30, 0, 0, time.UTC)}
		data, err := json.Marshal(d)
		assert.NoError(t, err)
		assert.Equal(t, `"2026-04-27"`, string(data))
	})

	t.Run("zero time", func(t *testing.T) {
		d := Date{}
		data, err := json.Marshal(d)
		assert.NoError(t, err)
		assert.Equal(t, `"0001-01-01"`, string(data))
	})
}

func TestDateUnmarshalJSON(t *testing.T) {
	type wrapper struct {
		Date Date `json:"date"`
	}

	t.Run("valid date string", func(t *testing.T) {
		w := &wrapper{}
		err := json.Unmarshal([]byte(`{"date":"2026-04-27"}`), w)
		assert.NoError(t, err)
		assert.Equal(t, 2026, w.Date.Year())
		assert.Equal(t, time.April, w.Date.Month())
		assert.Equal(t, 27, w.Date.Day())
	})

	t.Run("invalid format returns error", func(t *testing.T) {
		w := &wrapper{}
		err := json.Unmarshal([]byte(`{"date":"27/04/2026"}`), w)
		assert.Error(t, err)
	})

	t.Run("empty string returns error", func(t *testing.T) {
		w := &wrapper{}
		err := json.Unmarshal([]byte(`{"date":""}`), w)
		assert.Error(t, err)
	})

	t.Run("roundtrip marshal then unmarshal", func(t *testing.T) {
		original := Date{Time: time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC)}
		data, err := json.Marshal(original)
		assert.NoError(t, err)

		var restored Date
		err = json.Unmarshal(data, &restored)
		assert.NoError(t, err)
		assert.True(t, original.Time.Equal(restored.Time))
	})
}
