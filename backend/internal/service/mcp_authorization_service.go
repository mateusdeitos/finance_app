package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrMCPUnknownClient = errors.New("unknown MCP client")
	ErrMCPInvalidGrant  = errors.New("MCP authorization code is invalid or expired")
	ErrMCPInvalidToken  = errors.New("invalid MCP access token")
)

type mcpAuthorizationService struct {
	repo     repository.MCPAuthorizationRepository
	cfg      *config.Config
	issuer   string
	resource string
}

func NewMCPAuthorizationService(repos *repository.Repositories, cfg *config.Config) MCPAuthorizationService {
	base := strings.TrimRight(cfg.App.URL, "/")
	return &mcpAuthorizationService{
		repo: repos.MCPAuthorization, cfg: cfg, issuer: base, resource: base + "/mcp",
	}
}

func (s *mcpAuthorizationService) RegisterClient(ctx context.Context, name string, redirectURIs []string) (*domain.MCPRegisteredClient, error) {
	client := &domain.MCPRegisteredClient{
		ID: "mcp_" + uuid.NewString(), Name: strings.TrimSpace(name),
		RedirectURIs: append([]string(nil), redirectURIs...), CreatedAt: time.Now(),
	}
	if client.Name == "" {
		client.Name = "MCP client"
	}
	if err := s.repo.CreateClient(ctx, client); err != nil {
		return nil, err
	}
	return client, nil
}

func (s *mcpAuthorizationService) GetClient(ctx context.Context, id string) (*domain.MCPRegisteredClient, error) {
	client, err := s.repo.GetClient(ctx, id)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, ErrMCPUnknownClient
	}
	return client, nil
}

func (s *mcpAuthorizationService) CreateAuthorizationCode(ctx context.Context, userID int, clientID, redirectURI string, scopes []string, codeChallenge string) (string, error) {
	code, err := randomMCPToken(32)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256([]byte(code))
	grant := &domain.MCPAuthorizationCode{
		CodeHash: hex.EncodeToString(hash[:]), ClientID: clientID, RedirectURI: redirectURI,
		UserID: userID, Scopes: append([]string(nil), scopes...), CodeChallenge: codeChallenge,
		ExpiresAt: time.Now().Add(s.cfg.MCP.AuthorizationCodeTTL()), CreatedAt: time.Now(),
	}
	if err := s.repo.CreateAuthorizationCode(ctx, grant); err != nil {
		return "", err
	}
	return code, nil
}

func (s *mcpAuthorizationService) ExchangeAuthorizationCode(ctx context.Context, code, clientID, redirectURI, codeVerifier string) (*domain.MCPAccessToken, error) {
	hash := sha256.Sum256([]byte(code))
	grant, err := s.repo.ConsumeAuthorizationCode(ctx, hex.EncodeToString(hash[:]), clientID, redirectURI, mcpPKCEChallenge(codeVerifier), time.Now())
	if err != nil {
		return nil, err
	}
	if grant == nil {
		return nil, ErrMCPInvalidGrant
	}

	now := time.Now()
	expiresAt := now.Add(s.cfg.MCP.AccessTokenTTL())
	claims := jwt.MapClaims{
		"sub": strconv.Itoa(grant.UserID), "client_id": grant.ClientID, "scope": strings.Join(grant.Scopes, " "),
		"iss": s.issuer, "aud": s.resource, "iat": now.Unix(), "exp": expiresAt.Unix(), "jti": uuid.NewString(),
	}
	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.MCP.JWTSecret))
	if err != nil {
		return nil, err
	}
	return &domain.MCPAccessToken{Value: raw, ExpiresIn: int(s.cfg.MCP.AccessTokenTTL().Seconds()), Scopes: grant.Scopes}, nil
}

func (s *mcpAuthorizationService) ValidateAccessToken(_ context.Context, raw string) (*domain.MCPAccessTokenInfo, error) {
	token, err := jwt.Parse(raw, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, ErrMCPInvalidToken
		}
		return []byte(s.cfg.MCP.JWTSecret), nil
	}, jwt.WithAudience(s.resource), jwt.WithIssuer(s.issuer))
	if err != nil || !token.Valid {
		return nil, ErrMCPInvalidToken
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ErrMCPInvalidToken
	}
	subject, _ := claims["sub"].(string)
	userID, err := strconv.Atoi(subject)
	if err != nil {
		return nil, ErrMCPInvalidToken
	}
	expiresAt, err := claims.GetExpirationTime()
	if err != nil || expiresAt == nil {
		return nil, ErrMCPInvalidToken
	}
	scope, _ := claims["scope"].(string)
	return &domain.MCPAccessTokenInfo{UserID: userID, Scopes: strings.Fields(scope), ExpiresAt: expiresAt.Time}, nil
}

func mcpPKCEChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func randomMCPToken(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
