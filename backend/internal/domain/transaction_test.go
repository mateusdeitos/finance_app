package domain

import (
	"encoding/json"
	"testing"

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
}
