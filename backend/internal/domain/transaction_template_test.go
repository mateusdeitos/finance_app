package domain

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestTransactionTemplatePayload_SplitModesRoundTrip (Test A) proves both split modes
// (percentage *int and fixed-amount *int64) survive unmarshal→marshal (TMPL-05).
func TestTransactionTemplatePayload_SplitModesRoundTrip(t *testing.T) {
	raw := `{
		"type": "expense",
		"description": "groceries",
		"split_settings": [
			{"connection_id": 1, "percentage": 50},
			{"connection_id": 2, "amount": 2500}
		]
	}`

	var payload TransactionTemplatePayload
	require.NoError(t, json.Unmarshal([]byte(raw), &payload))

	// First split row: percentage mode
	require.Len(t, payload.SplitSettings, 2)
	row0 := payload.SplitSettings[0]
	assert.NotNil(t, row0.Percentage, "first row Percentage must not be nil")
	assert.Equal(t, 50, *row0.Percentage)
	assert.Nil(t, row0.Amount, "first row Amount must be nil (percentage mode)")

	// Second split row: fixed-amount mode
	row1 := payload.SplitSettings[1]
	assert.NotNil(t, row1.Amount, "second row Amount must not be nil")
	assert.Equal(t, int64(2500), *row1.Amount)
	assert.Nil(t, row1.Percentage, "second row Percentage must be nil (fixed-amount mode)")

	// Re-marshal and unmarshal again — mode must be preserved
	remarshaled, err := json.Marshal(payload)
	require.NoError(t, err)

	var payload2 TransactionTemplatePayload
	require.NoError(t, json.Unmarshal(remarshaled, &payload2))

	row0b := payload2.SplitSettings[0]
	assert.NotNil(t, row0b.Percentage)
	assert.Equal(t, 50, *row0b.Percentage)
	assert.Nil(t, row0b.Amount)

	row1b := payload2.SplitSettings[1]
	assert.NotNil(t, row1b.Amount)
	assert.Equal(t, int64(2500), *row1b.Amount)
	assert.Nil(t, row1b.Percentage)
}

// TestTransactionTemplatePayload_AllFieldsPreserved (Test B) ensures every field
// of the payload survives unmarshal.
func TestTransactionTemplatePayload_AllFieldsPreserved(t *testing.T) {
	accountID := 10
	categoryID := 5
	destAccountID := 20
	raw := `{
		"type": "transfer",
		"account_id": 10,
		"category_id": 5,
		"destination_account_id": 20,
		"description": "monthly savings",
		"tag_ids": [1, 2, 3],
		"split_settings": [
			{"connection_id": 7, "percentage": 60}
		]
	}`

	var payload TransactionTemplatePayload
	require.NoError(t, json.Unmarshal([]byte(raw), &payload))

	assert.Equal(t, TransactionTypeTransfer, payload.Type)
	require.NotNil(t, payload.AccountID)
	assert.Equal(t, accountID, *payload.AccountID)
	require.NotNil(t, payload.CategoryID)
	assert.Equal(t, categoryID, *payload.CategoryID)
	require.NotNil(t, payload.DestinationAccountID)
	assert.Equal(t, destAccountID, *payload.DestinationAccountID)
	assert.Equal(t, "monthly savings", payload.Description)
	assert.Equal(t, []int{1, 2, 3}, payload.TagIDs)
	require.Len(t, payload.SplitSettings, 1)
	assert.Equal(t, 7, payload.SplitSettings[0].ConnectionID)
}

// TestTransactionTemplatePayload_AmountAndDateDropped (Test C) proves that raw JSON
// containing "amount" and "date" keys has those fields dropped after unmarshal into
// the strict struct (no such fields exist on TransactionTemplatePayload — D-02).
func TestTransactionTemplatePayload_AmountAndDateDropped(t *testing.T) {
	raw := `{
		"type": "expense",
		"description": "lunch",
		"amount": 9999,
		"date": "2026-06-14"
	}`

	var payload TransactionTemplatePayload
	require.NoError(t, json.Unmarshal([]byte(raw), &payload))

	remarshaled, err := json.Marshal(payload)
	require.NoError(t, err)

	output := string(remarshaled)
	assert.False(t, strings.Contains(output, `"amount"`), "marshaled output must not contain \"amount\"")
	assert.False(t, strings.Contains(output, `"date"`), "marshaled output must not contain \"date\"")
	assert.Equal(t, TransactionTypeExpense, payload.Type)
	assert.Equal(t, "lunch", payload.Description)
}
