package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateEndpoint(t *testing.T) {
	t.Run("valid https endpoint passes", func(t *testing.T) {
		err := validateEndpoint("https://fcm.googleapis.com/fcm/send/abc123")
		require.NoError(t, err)
	})

	t.Run("http scheme is rejected", func(t *testing.T) {
		err := validateEndpoint("http://example.com/push/abc")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "endpoint must be a valid HTTPS URL")
	})

	t.Run("empty endpoint is rejected", func(t *testing.T) {
		err := validateEndpoint("")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "endpoint must be a valid HTTPS URL")
	})

	t.Run("garbage string is rejected", func(t *testing.T) {
		err := validateEndpoint("not-a-url-at-all")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "endpoint must be a valid HTTPS URL")
	})

	t.Run("https with no host is rejected", func(t *testing.T) {
		err := validateEndpoint("https://")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "endpoint must be a valid HTTPS URL")
	})
}
