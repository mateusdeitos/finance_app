package mcp

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
)

// authorizationServerMetadata advertises the OAuth endpoints needed by MCP
// clients after protected-resource discovery.
func (s *Server) authorizationServerMetadata(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"issuer":                                s.issuer,
		"authorization_endpoint":                s.issuer + "/oauth/authorize",
		"token_endpoint":                        s.issuer + "/oauth/token",
		"registration_endpoint":                 s.issuer + "/oauth/register",
		"response_types_supported":              []string{"code"},
		"grant_types_supported":                 []string{"authorization_code"},
		"code_challenge_methods_supported":      []string{"S256"},
		"token_endpoint_auth_methods_supported": []string{"none"},
		"scopes_supported":                      []string{readScope, writeScope},
	})
}

// registerClient performs dynamic registration for public MCP clients.
func (s *Server) registerClient(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ClientName              string   `json:"client_name"`
		RedirectURIs            []string `json:"redirect_uris"`
		GrantTypes              []string `json:"grant_types"`
		TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
	}
	if err := decodeJSON(r, &req); err != nil || len(req.RedirectURIs) == 0 || !validRedirectURIs(req.RedirectURIs) || (req.TokenEndpointAuthMethod != "" && req.TokenEndpointAuthMethod != "none") {
		oauthError(w, "invalid_client_metadata", "public client metadata is invalid", http.StatusBadRequest)
		return
	}

	redirectURIs, err := json.Marshal(req.RedirectURIs)
	if err != nil {
		oauthError(w, "server_error", "could not register client", http.StatusInternalServerError)
		return
	}

	client := registeredClient{
		ID:           "mcp_" + uuid.NewString(),
		Name:         strings.TrimSpace(req.ClientName),
		RedirectURIs: string(redirectURIs),
	}
	if client.Name == "" {
		client.Name = "MCP client"
	}
	if err := s.db.Create(&client).Error; err != nil {
		oauthError(w, "server_error", "could not register client", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"client_id":                  client.ID,
		"client_name":                client.Name,
		"redirect_uris":              req.RedirectURIs,
		"token_endpoint_auth_method": "none",
	})
}

func (s *Server) authorize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	req, err := s.parseAuthorizationRequest(r)
	if err != nil {
		oauthError(w, "invalid_request", err.Error(), http.StatusBadRequest)
		return
	}
	if _, err := s.appUser(r.Context(), r); err != nil {
		// The existing Google login owns the session. The auth callback recognizes
		// this backend-only redirect and returns here after setting auth_token.
		http.Redirect(w, r, "/auth/google?redirect="+url.QueryEscape(r.URL.RequestURI()), http.StatusFound)
		return
	}
	s.renderConsent(r.Context(), w, req)
}

func (s *Server) approve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if err := r.ParseForm(); err != nil {
		oauthError(w, "invalid_request", "invalid form", http.StatusBadRequest)
		return
	}
	req := authRequest{
		ClientID: r.Form.Get("client_id"), RedirectURI: r.Form.Get("redirect_uri"), State: r.Form.Get("state"),
		CodeChallenge: r.Form.Get("code_challenge"), Scope: r.Form.Get("scope"), Resource: r.Form.Get("resource"),
	}
	if _, err := s.validateAuthorizationRequest(r.Context(), req); err != nil {
		oauthError(w, "invalid_request", err.Error(), http.StatusBadRequest)
		return
	}

	user, err := s.appUser(r.Context(), r)
	if err != nil {
		oauthError(w, "login_required", "login required", http.StatusUnauthorized)
		return
	}
	if r.Form.Get("approve") != "yes" {
		redirectOAuthError(w, r, req, "access_denied")
		return
	}

	code, err := randomURLToken(32)
	if err != nil {
		oauthError(w, "server_error", "could not create code", http.StatusInternalServerError)
		return
	}
	codeHash := sha256.Sum256([]byte(code))
	row := authorizationCode{
		CodeHash: hex.EncodeToString(codeHash[:]), ClientID: req.ClientID, RedirectURI: req.RedirectURI,
		UserID: user.ID, Scopes: normalizeScopes(req.Scope), CodeChallenge: req.CodeChallenge,
		ExpiresAt: time.Now().Add(s.cfg.MCP.AuthorizationCodeTTL()),
	}
	if err := s.db.Create(&row).Error; err != nil {
		oauthError(w, "server_error", "could not store code", http.StatusInternalServerError)
		return
	}

	redirectURI, _ := url.Parse(req.RedirectURI)
	query := redirectURI.Query()
	query.Set("code", code)
	query.Set("state", req.State)
	query.Set("iss", s.issuer)
	redirectURI.RawQuery = query.Encode()
	http.Redirect(w, r, redirectURI.String(), http.StatusFound)
}

func (s *Server) token(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if err := r.ParseForm(); err != nil {
		oauthError(w, "invalid_request", "invalid form", http.StatusBadRequest)
		return
	}
	if r.Form.Get("grant_type") != "authorization_code" {
		oauthError(w, "unsupported_grant_type", "only authorization_code is supported", http.StatusBadRequest)
		return
	}

	code := r.Form.Get("code")
	clientID := r.Form.Get("client_id")
	redirectURI := r.Form.Get("redirect_uri")
	verifier := r.Form.Get("code_verifier")
	if code == "" || clientID == "" || redirectURI == "" || !validPKCE(verifier) {
		oauthError(w, "invalid_request", "missing or invalid token parameters", http.StatusBadRequest)
		return
	}

	codeHash := sha256.Sum256([]byte(code))
	var row authorizationCode
	err := s.db.Where("code_hash = ?", hex.EncodeToString(codeHash[:])).First(&row).Error
	if err != nil || row.UsedAt != nil || row.ExpiresAt.Before(time.Now()) || row.ClientID != clientID || row.RedirectURI != redirectURI || pkceChallenge(verifier) != row.CodeChallenge {
		oauthError(w, "invalid_grant", "authorization code is invalid or expired", http.StatusBadRequest)
		return
	}

	now := time.Now()
	if result := s.db.Model(&authorizationCode{}).Where("id = ? AND used_at IS NULL", row.ID).Update("used_at", now); result.Error != nil || result.RowsAffected != 1 {
		oauthError(w, "invalid_grant", "authorization code already used", http.StatusBadRequest)
		return
	}

	accessToken, err := s.issueAccessToken(row.UserID, row.ClientID, strings.Fields(row.Scopes))
	if err != nil {
		oauthError(w, "server_error", "could not issue token", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": accessToken,
		"token_type":   "Bearer",
		"expires_in":   int(s.cfg.MCP.AccessTokenTTL().Seconds()),
		"scope":        row.Scopes,
	})
}
