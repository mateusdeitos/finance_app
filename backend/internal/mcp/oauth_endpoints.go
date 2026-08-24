package mcp

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/finance_app/backend/internal/service"
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
	err := decodeJSON(r, &req)
	invalidTokenAuthMethod := req.TokenEndpointAuthMethod != "" && req.TokenEndpointAuthMethod != "none"
	invalidClientMetadata := err != nil ||
		len(req.RedirectURIs) == 0 ||
		!validRedirectURIs(req.RedirectURIs) ||
		invalidTokenAuthMethod
	if invalidClientMetadata {
		oauthError(w, "invalid_client_metadata", "public client metadata is invalid", http.StatusBadRequest)
		return
	}

	client, err := s.services.MCPAuthorization.RegisterClient(
		r.Context(),
		strings.TrimSpace(req.ClientName),
		req.RedirectURIs,
	)
	if err != nil {
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
	_, err = s.appUser(r.Context(), r)
	if err != nil {
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
	err := r.ParseForm()
	if err != nil {
		oauthError(w, "invalid_request", "invalid form", http.StatusBadRequest)
		return
	}
	req := authRequest{
		ClientID:      r.Form.Get("client_id"),
		RedirectURI:   r.Form.Get("redirect_uri"),
		State:         r.Form.Get("state"),
		CodeChallenge: r.Form.Get("code_challenge"),
		Scope:         r.Form.Get("scope"),
		Resource:      r.Form.Get("resource"),
	}
	_, err = s.validateAuthorizationRequest(r.Context(), req)
	if err != nil {
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

	code, err := s.services.MCPAuthorization.CreateAuthorizationCode(
		r.Context(),
		user.ID,
		req.ClientID,
		req.RedirectURI,
		strings.Fields(req.Scope),
		req.CodeChallenge,
	)
	if err != nil {
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
	err := r.ParseForm()
	if err != nil {
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

	accessToken, err := s.services.MCPAuthorization.ExchangeAuthorizationCode(
		r.Context(),
		code,
		clientID,
		redirectURI,
		verifier,
	)
	if errors.Is(err, service.ErrMCPInvalidGrant) {
		oauthError(w, "invalid_grant", "authorization code is invalid or expired", http.StatusBadRequest)
		return
	}
	if err != nil {
		oauthError(w, "server_error", "could not issue token", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": accessToken.Value,
		"token_type":   "Bearer",
		"expires_in":   accessToken.ExpiresIn,
		"scope":        strings.Join(accessToken.Scopes, " "),
	})
}
