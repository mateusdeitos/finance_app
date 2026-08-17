package mcp

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/finance_app/backend/internal/domain"
	mcpauth "github.com/modelcontextprotocol/go-sdk/auth"
)

// authRequest is the validated subset of an OAuth authorization request used
// by both the browser authorization endpoint and the consent form postback.
type authRequest struct {
	ClientID      string
	RedirectURI   string
	State         string
	CodeChallenge string
	Scope         string
	Resource      string
}

func (s *Server) parseAuthorizationRequest(r *http.Request) (authRequest, error) {
	if r.URL.Query().Get("response_type") != "code" {
		return authRequest{}, errors.New("response_type must be code")
	}
	req := authRequest{
		ClientID: r.URL.Query().Get("client_id"), RedirectURI: r.URL.Query().Get("redirect_uri"),
		State: r.URL.Query().Get("state"), CodeChallenge: r.URL.Query().Get("code_challenge"),
		Scope: r.URL.Query().Get("scope"), Resource: r.URL.Query().Get("resource"),
	}
	_, err := s.validateAuthorizationRequest(r.Context(), req)
	return req, err
}

func (s *Server) validateAuthorizationRequest(ctx context.Context, req authRequest) (*clientMetadata, error) {
	if req.State == "" || req.CodeChallenge == "" || !validPKCE(req.CodeChallenge) || req.Resource != s.resource {
		return nil, errors.New("state, S256 PKCE, and the MCP resource are required")
	}
	meta, err := s.client(ctx, req.ClientID)
	if err != nil {
		return nil, err
	}
	if !contains(meta.RedirectURIs, req.RedirectURI) {
		return nil, errors.New("redirect_uri is not registered")
	}
	scopes := strings.Fields(req.Scope)
	if len(scopes) == 0 || !contains(scopes, readScope) || !onlyKnownScopes(scopes) {
		return nil, errors.New("finance:read scope is required")
	}
	return meta, nil
}

type clientMetadata struct {
	ID           string
	Name         string
	RedirectURIs []string
}

func (s *Server) client(ctx context.Context, id string) (*clientMetadata, error) {
	if strings.HasPrefix(id, "https://") {
		return fetchClientMetadata(ctx, id)
	}

	client, err := s.services.MCPAuthorization.GetClient(ctx, id)
	if err != nil {
		return nil, errors.New("unknown client")
	}
	return &clientMetadata{ID: client.ID, Name: client.Name, RedirectURIs: client.RedirectURIs}, nil
}

func (s *Server) appUser(ctx context.Context, r *http.Request) (*domain.User, error) {
	cookie, err := r.Cookie("auth_token")
	if err != nil {
		return nil, err
	}
	user, impersonator, err := s.services.Auth.ValidateToken(ctx, cookie.Value)
	if err != nil || impersonator != nil {
		return nil, errors.New("invalid session")
	}
	return user, nil
}

func (s *Server) verifyAccessToken(ctx context.Context, raw string, _ *http.Request) (*mcpauth.TokenInfo, error) {
	info, err := s.services.MCPAuthorization.ValidateAccessToken(ctx, raw)
	if err != nil {
		return nil, mcpauth.ErrInvalidToken
	}
	return &mcpauth.TokenInfo{UserID: strconv.Itoa(info.UserID), Scopes: info.Scopes, Expiration: info.ExpiresAt}, nil
}
