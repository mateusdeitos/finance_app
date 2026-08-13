package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
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

	var client registeredClient
	if err := s.db.First(&client, "id = ?", id).Error; err != nil {
		return nil, errors.New("unknown client")
	}
	var redirects []string
	_ = json.Unmarshal([]byte(client.RedirectURIs), &redirects)
	return &clientMetadata{ID: client.ID, Name: client.Name, RedirectURIs: redirects}, nil
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

func (s *Server) issueAccessToken(userID int, clientID string, scopes []string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub": strconv.Itoa(userID), "client_id": clientID, "scope": strings.Join(scopes, " "),
		"iss": s.issuer, "aud": s.resource, "iat": now.Unix(),
		"exp": now.Add(s.cfg.MCP.AccessTokenTTL()).Unix(), "jti": uuid.NewString(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.MCP.JWTSecret))
}

func (s *Server) verifyAccessToken(_ context.Context, raw string, _ *http.Request) (*mcpauth.TokenInfo, error) {
	token, err := jwt.Parse(raw, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.cfg.MCP.JWTSecret), nil
	}, jwt.WithAudience(s.resource), jwt.WithIssuer(s.issuer))
	if err != nil || !token.Valid {
		return nil, mcpauth.ErrInvalidToken
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, mcpauth.ErrInvalidToken
	}
	subject, _ := claims["sub"].(string)
	expiresAt, _ := claims.GetExpirationTime()
	if subject == "" || expiresAt == nil {
		return nil, mcpauth.ErrInvalidToken
	}
	scope, _ := claims["scope"].(string)
	return &mcpauth.TokenInfo{UserID: subject, Scopes: strings.Fields(scope), Expiration: expiresAt.Time}, nil
}
