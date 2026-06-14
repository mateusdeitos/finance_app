package entity

import (
	"testing"

	"github.com/finance_app/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ptr[T any](v T) *T {
	return &v
}

// TestTransactionTemplateConverterRoundTrip verifies that TransactionTemplateFromDomain
// followed by ToDomain produces a result deep-equal to the original domain template,
// preserving all payload fields including both split modes (TMPL-05).
func TestTransactionTemplateConverterRoundTrip(t *testing.T) {
	original := &domain.TransactionTemplate{
		ID:     42,
		UserID: 7,
		Name:   "groceries",
		Payload: domain.TransactionTemplatePayload{
			Type:        domain.TransactionTypeExpense,
			AccountID:   ptr(10),
			CategoryID:  ptr(3),
			Description: "weekly groceries",
			TagIDs:      []int{1, 2},
			SplitSettings: []domain.SplitSettings{
				// row 0: percentage mode
				{ConnectionID: 1, Percentage: ptr(50)},
				// row 1: fixed-amount mode (cents)
				{ConnectionID: 1, Amount: ptr(int64(2500))},
			},
		},
	}

	entity := TransactionTemplateFromDomain(original)
	result := entity.ToDomain()

	require.Equal(t, original.ID, result.ID, "ID mismatch")
	require.Equal(t, original.UserID, result.UserID, "UserID mismatch")
	require.Equal(t, original.Name, result.Name, "Name mismatch")
	require.Equal(t, original.Payload, result.Payload, "Payload mismatch — full deep-equal")

	// Explicitly assert both split modes are preserved (TMPL-05)
	require.Len(t, result.Payload.SplitSettings, 2, "expected 2 split rows")

	splitRow0 := result.Payload.SplitSettings[0]
	assert.NotNil(t, splitRow0.Percentage, "row 0 should be percentage mode")
	assert.Nil(t, splitRow0.Amount, "row 0 should not have Amount set")

	splitRow1 := result.Payload.SplitSettings[1]
	assert.NotNil(t, splitRow1.Amount, "row 1 should be fixed-amount mode")
	assert.Nil(t, splitRow1.Percentage, "row 1 should not have Percentage set")
}

// TestTransactionTemplateJSONBRoundTrip verifies that the JSONB column driver
// (Value → Scan) preserves the full typed payload including both split modes.
func TestTransactionTemplateJSONBRoundTrip(t *testing.T) {
	original := TransactionTemplatePayload{
		Type:        domain.TransactionType("expense"),
		AccountID:   ptr(5),
		CategoryID:  ptr(2),
		Description: "coffee",
		TagIDs:      []int{3, 4},
		SplitSettings: []domain.SplitSettings{
			// percentage mode
			{ConnectionID: 1, Percentage: ptr(40)},
			// fixed-amount mode
			{ConnectionID: 1, Amount: ptr(int64(1000))},
		},
	}

	// Call Value() to produce the JSON bytes that would be stored in the DB
	driverVal, err := original.Value()
	require.NoError(t, err, "Value() should not return an error")

	jsonBytes, ok := driverVal.([]byte)
	require.True(t, ok, "Value() should return []byte")

	// Scan() simulates reading back from the DB
	var scanned TransactionTemplatePayload
	err = scanned.Scan(jsonBytes)
	require.NoError(t, err, "Scan() should not return an error")

	assert.Equal(t, original, scanned, "JSONB round-trip: scanned payload must equal original")

	// Verify both split modes survived the round-trip (TMPL-05)
	require.Len(t, scanned.SplitSettings, 2, "expected 2 split rows after Scan")

	assert.NotNil(t, scanned.SplitSettings[0].Percentage, "row 0: percentage mode preserved")
	assert.Nil(t, scanned.SplitSettings[0].Amount, "row 0: Amount must remain nil")

	assert.NotNil(t, scanned.SplitSettings[1].Amount, "row 1: fixed-amount mode preserved")
	assert.Nil(t, scanned.SplitSettings[1].Percentage, "row 1: Percentage must remain nil")
}
