package mcp

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/finance_app/backend/internal/config"
	"github.com/stretchr/testify/require"
)

func testServer(t *testing.T) *Server {
	t.Helper()
	s, err := New(&config.Config{App: config.AppConfig{URL: "https://api.example.com"}, MCP: config.MCPConfig{JWTSecret: "test-secret", AccessTokenHours: 168, AuthorizationCodeMins: 10}}, nil, nil)
	require.NoError(t, err)
	return s
}

func TestMCPProtectedResourceMetadataAndChallenge(t *testing.T) {
	s := testServer(t)
	h := s.Handler()

	metadata := httptest.NewRecorder()
	h.ServeHTTP(metadata, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/.well-known/oauth-protected-resource/mcp", nil))
	require.Equal(t, http.StatusOK, metadata.Code)
	require.Contains(t, metadata.Body.String(), `"resource":"https://api.example.com/mcp"`)

	unauthenticated := httptest.NewRecorder()
	h.ServeHTTP(unauthenticated, httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/mcp", nil))
	require.Equal(t, http.StatusUnauthorized, unauthenticated.Code)
	require.Contains(t, unauthenticated.Header().Get("WWW-Authenticate"), "resource_metadata=https://api.example.com/.well-known/oauth-protected-resource/mcp")
}

func TestMCPAccessTokenIsBoundToResourceAndScopes(t *testing.T) {
	s := testServer(t)
	token, err := s.issueAccessToken(42, "client", []string{readScope, writeScope})
	require.NoError(t, err)

	info, err := s.verifyAccessToken(t.Context(), token, nil)
	require.NoError(t, err)
	require.Equal(t, "42", info.UserID)
	require.ElementsMatch(t, []string{readScope, writeScope}, info.Scopes)
}
