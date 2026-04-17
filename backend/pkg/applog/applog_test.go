package applog

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestFromContext_NoLogger verifies that FromContext returns a non-nil *Logger
// and that calling .Info().Msg("test") on it does not panic, even when no logger
// was stored in the context.
func TestFromContext_NoLogger(t *testing.T) {
	ctx := context.Background()
	lg := FromContext(ctx)
	require.NotNil(t, lg)
	// Must not panic
	lg.Info().Msg("test")
}

// TestWithLogger_RoundTrip verifies that a logger stored via WithLogger can be
// retrieved via FromContext, and that Zerolog() returns the same pointer.
func TestWithLogger_RoundTrip(t *testing.T) {
	ctx := context.Background()
	var buf bytes.Buffer
	zl := zerolog.New(&buf)

	ctx = WithLogger(ctx, &zl)
	retrieved := FromContext(ctx)
	require.NotNil(t, retrieved)
	assert.Equal(t, &zl, retrieved.Zerolog())
}

// TestWith_AccumulatesFields verifies that fields added via With() are present
// in subsequent log emissions.
func TestWith_AccumulatesFields(t *testing.T) {
	var buf bytes.Buffer
	zl := zerolog.New(&buf)
	ctx := WithLogger(context.Background(), &zl)

	lg := FromContext(ctx)
	lg.With("key1", "val1").With("key2", "val2")
	lg.Info().Msg("test")

	var logLine map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &logLine)
	require.NoError(t, err)
	assert.Equal(t, "val1", logLine["key1"])
	assert.Equal(t, "val2", logLine["key2"])
}

// TestWith_MutatesInPlace verifies that With() mutates the logger in-place
// (pointer mutation, not copy), so a subsequent FromContext call on the same
// context sees the accumulated fields.
func TestWith_MutatesInPlace(t *testing.T) {
	var buf bytes.Buffer
	zl := zerolog.New(&buf)
	ctx := WithLogger(context.Background(), &zl)

	// Add a field via the first FromContext retrieval
	FromContext(ctx).With("k", "v")

	// A second retrieval on the SAME ctx must see field "k"
	FromContext(ctx).Info().Msg("check")

	var logLine map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &logLine)
	require.NoError(t, err)
	assert.Equal(t, "v", logLine["k"])
}

// TestIntermediateLogs_CarryAccumulatedFields verifies that intermediate log
// events (Warn in this case) carry all fields accumulated via With().
func TestIntermediateLogs_CarryAccumulatedFields(t *testing.T) {
	var buf bytes.Buffer
	zl := zerolog.New(&buf)
	ctx := WithLogger(context.Background(), &zl)

	lg := FromContext(ctx)
	lg.With("req_id", "abc")
	lg.Warn().Msg("slow query")

	var logLine map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &logLine)
	require.NoError(t, err)
	assert.Equal(t, "abc", logLine["req_id"])
}
