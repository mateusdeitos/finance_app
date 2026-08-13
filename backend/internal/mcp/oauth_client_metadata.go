package mcp

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"html/template"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (s *Server) renderConsent(ctx context.Context, w http.ResponseWriter, req authRequest) {
	metadata, _ := s.client(ctx, req.ClientID)
	name := req.ClientID
	if metadata != nil && metadata.Name != "" {
		name = metadata.Name
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = template.Must(template.New("consent").Parse(`<!doctype html><title>Autorizar agente</title><main><h1>Conectar {{.Name}}</h1><p>O cliente poderá ler suas finanças{{if .Write}} e criar, editar e excluir transações{{end}}.</p><form method="post" action="/oauth/authorize/approve">{{range .Fields}}<input type="hidden" name="{{.K}}" value="{{.V}}">{{end}}<button name="approve" value="yes">Autorizar</button><button name="approve" value="no">Cancelar</button></form></main>`)).Execute(w, map[string]any{
		"Name":  name,
		"Write": contains(strings.Fields(req.Scope), writeScope),
		"Fields": []map[string]string{
			{"K": "client_id", "V": req.ClientID},
			{"K": "redirect_uri", "V": req.RedirectURI},
			{"K": "state", "V": req.State},
			{"K": "code_challenge", "V": req.CodeChallenge},
			{"K": "scope", "V": req.Scope},
			{"K": "resource", "V": req.Resource},
		},
	})
}

func redirectOAuthError(w http.ResponseWriter, r *http.Request, req authRequest, code string) {
	redirectURI, _ := url.Parse(req.RedirectURI)
	query := redirectURI.Query()
	query.Set("error", code)
	query.Set("state", req.State)
	redirectURI.RawQuery = query.Encode()
	http.Redirect(w, r, redirectURI.String(), http.StatusFound)
}

// fetchClientMetadata supports HTTPS client IDs while protecting the server
// from requests to local or private network destinations.
func fetchClientMetadata(ctx context.Context, raw string) (*clientMetadata, error) {
	clientURL, err := url.Parse(raw)
	if err != nil || clientURL.Scheme != "https" || clientURL.Hostname() == "" || isPrivateHost(clientURL.Hostname()) {
		return nil, errors.New("invalid client metadata URL")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, errors.New("invalid client metadata URL")
	}
	response, err := safeMetadataClient().Do(req)
	if err != nil {
		return nil, errors.New("could not fetch client metadata")
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("client metadata unavailable")
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if err != nil {
		return nil, errors.New("invalid client metadata")
	}
	var document struct {
		ClientID     string   `json:"client_id"`
		ClientName   string   `json:"client_name"`
		RedirectURIs []string `json:"redirect_uris"`
	}
	if json.Unmarshal(body, &document) != nil || document.ClientID != raw || !validRedirectURIs(document.RedirectURIs) {
		return nil, errors.New("invalid client metadata")
	}
	return &clientMetadata{ID: document.ClientID, Name: document.ClientName, RedirectURIs: document.RedirectURIs}, nil
}

func safeMetadataClient() *http.Client {
	dialer := &net.Dialer{Timeout: 2 * time.Second}
	transport := &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
			if err != nil {
				return nil, err
			}
			for _, ip := range ips {
				if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
					continue
				}
				return dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			}
			return nil, errors.New("client metadata host resolves to a private address")
		},
	}
	return &http.Client{
		Timeout:   3 * time.Second,
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func isPrivateHost(host string) bool {
	ip := net.ParseIP(host)
	if ip == nil {
		return strings.EqualFold(host, "localhost") || strings.HasSuffix(strings.ToLower(host), ".local")
	}
	return ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified()
}

func validRedirectURIs(uris []string) bool {
	for _, raw := range uris {
		uri, err := url.Parse(raw)
		if err != nil {
			return false
		}
		validScheme := uri.Scheme == "https" || uri.Scheme == "http" && isLoopbackHost(uri.Hostname())
		if uri.Fragment != "" || uri.Host == "" || !validScheme {
			return false
		}
	}
	return true
}

func isLoopbackHost(host string) bool {
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func validPKCE(value string) bool { return len(value) >= 43 && len(value) <= 128 }

func pkceChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func normalizeScopes(value string) string { return strings.Join(strings.Fields(value), " ") }

func onlyKnownScopes(scopes []string) bool {
	for _, scope := range scopes {
		if scope != readScope && scope != writeScope {
			return false
		}
	}
	return true
}
