package mcp

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/stretchr/testify/require"
)

type stubMCPAuthorizationService struct {
	tokenInfo *domain.MCPAccessTokenInfo
}

func (*stubMCPAuthorizationService) RegisterClient(context.Context, string, []string) (*domain.MCPRegisteredClient, error) {
	return &domain.MCPRegisteredClient{}, nil
}
func (*stubMCPAuthorizationService) GetClient(context.Context, string) (*domain.MCPRegisteredClient, error) {
	return &domain.MCPRegisteredClient{}, nil
}
func (*stubMCPAuthorizationService) CreateAuthorizationCode(context.Context, int, string, string, []string, string) (string, error) {
	return "", nil
}
func (*stubMCPAuthorizationService) ExchangeAuthorizationCode(context.Context, string, string, string, string) (*domain.MCPAccessToken, error) {
	return &domain.MCPAccessToken{}, nil
}
func (s *stubMCPAuthorizationService) ValidateAccessToken(context.Context, string) (*domain.MCPAccessTokenInfo, error) {
	return s.tokenInfo, nil
}

func testServer(t *testing.T) *Server {
	t.Helper()
	authorization := &stubMCPAuthorizationService{
		tokenInfo: &domain.MCPAccessTokenInfo{
			UserID:    42,
			Scopes:    []string{readScope, writeScope},
			ExpiresAt: time.Now().Add(time.Hour),
		},
	}
	services := &service.Services{
		MCPAuthorization: authorization,
	}
	cfg := &config.Config{
		App: config.AppConfig{
			URL: "https://api.example.com",
		},
		MCP: config.MCPConfig{
			JWTSecret:             "test-secret",
			AccessTokenHours:      168,
			AuthorizationCodeMins: 10,
		},
	}
	s, err := New(cfg, services)
	require.NoError(t, err)
	return s
}

func TestMCPProtectedResourceMetadataAndChallenge(t *testing.T) {
	s := testServer(t)
	h := s.Handler()

	metadata := httptest.NewRecorder()
	metadataRequest := httptest.NewRequestWithContext(
		t.Context(),
		http.MethodGet,
		"/.well-known/oauth-protected-resource/mcp",
		nil,
	)
	h.ServeHTTP(metadata, metadataRequest)
	require.Equal(t, http.StatusOK, metadata.Code)
	require.Contains(t, metadata.Body.String(), `"resource":"https://api.example.com/mcp"`)

	unauthenticated := httptest.NewRecorder()
	unauthenticatedRequest := httptest.NewRequestWithContext(
		t.Context(),
		http.MethodPost,
		"/mcp",
		nil,
	)
	h.ServeHTTP(unauthenticated, unauthenticatedRequest)
	require.Equal(t, http.StatusUnauthorized, unauthenticated.Code)
	require.Contains(
		t,
		unauthenticated.Header().Get("WWW-Authenticate"),
		"resource_metadata=https://api.example.com/.well-known/oauth-protected-resource/mcp",
	)
}

func TestMCPAccessTokenIsBoundToResourceAndScopes(t *testing.T) {
	s := testServer(t)
	info, err := s.verifyAccessToken(t.Context(), "delegated-to-service", nil)
	require.NoError(t, err)
	require.Equal(t, "42", info.UserID)
	require.ElementsMatch(t, []string{readScope, writeScope}, info.Scopes)
}

func TestMCPProtocolServerBuildsAllToolSchemas(t *testing.T) {
	s := testServer(t)

	require.NotPanics(t, func() {
		s.protocolServer()
	})
}
