// Package mcp exposes the finance domain to remote MCP clients. It deliberately
// talks to Services rather than looping back through the public HTTP API.
package mcp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"html/template"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	mcpauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
	"gorm.io/gorm"
)

const (
	readScope  = "finance:read"
	writeScope = "finance:transactions:write"
)

type authorizationCode struct {
	ID            uint   `gorm:"primaryKey"`
	CodeHash      string `gorm:"uniqueIndex;not null"`
	ClientID      string `gorm:"not null"`
	RedirectURI   string `gorm:"not null"`
	UserID        int    `gorm:"not null"`
	Scopes        string `gorm:"not null"`
	CodeChallenge string `gorm:"not null"`
	ExpiresAt     time.Time
	UsedAt        *time.Time
	CreatedAt     time.Time
}

func (authorizationCode) TableName() string { return "mcp_authorization_codes" }

type registeredClient struct {
	ID           string `gorm:"primaryKey"`
	Name         string
	RedirectURIs string `gorm:"not null"`
	CreatedAt    time.Time
}

func (registeredClient) TableName() string { return "mcp_registered_clients" }

type Server struct {
	cfg      *config.Config
	db       *gorm.DB
	services *service.Services
	resource string
	issuer   string
}

func New(cfg *config.Config, db *gorm.DB, services *service.Services) (*Server, error) {
	if cfg.MCP.JWTSecret == "" {
		return nil, errors.New("MCP_JWT_SECRET is required when MCP is enabled")
	}
	base := strings.TrimRight(cfg.App.URL, "/")
	return &Server{cfg: cfg, db: db, services: services, resource: base + "/mcp", issuer: base}, nil
}

// Handler returns a standard net/http mux suitable for Echo.WrapHandler.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/.well-known/oauth-protected-resource/mcp", mcpauth.ProtectedResourceMetadataHandler(&oauthex.ProtectedResourceMetadata{
		Resource: s.resource, AuthorizationServers: []string{s.issuer}, ScopesSupported: []string{readScope, writeScope},
		BearerMethodsSupported: []string{"header"}, ResourceName: "Dividim MCP",
	}))
	mux.HandleFunc("/.well-known/oauth-authorization-server", s.authorizationServerMetadata)
	mux.HandleFunc("/oauth/register", s.registerClient)
	mux.HandleFunc("/oauth/authorize", s.authorize)
	mux.HandleFunc("/oauth/authorize/approve", s.approve)
	mux.HandleFunc("/oauth/token", s.token)

	transport := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return s.protocolServer() }, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	mux.Handle("/mcp", mcpauth.RequireBearerToken(s.verifyAccessToken, &mcpauth.RequireBearerTokenOptions{
		ResourceMetadataURL: s.issuer + "/.well-known/oauth-protected-resource/mcp",
	})(transport))
	return mux
}

func (s *Server) authorizationServerMetadata(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"issuer": s.issuer, "authorization_endpoint": s.issuer + "/oauth/authorize", "token_endpoint": s.issuer + "/oauth/token",
		"registration_endpoint": s.issuer + "/oauth/register", "response_types_supported": []string{"code"},
		"grant_types_supported": []string{"authorization_code"}, "code_challenge_methods_supported": []string{"S256"},
		"token_endpoint_auth_methods_supported": []string{"none"}, "scopes_supported": []string{readScope, writeScope},
	})
}

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
	if err != nil || len(req.RedirectURIs) == 0 || !validRedirectURIs(req.RedirectURIs) || (req.TokenEndpointAuthMethod != "" && req.TokenEndpointAuthMethod != "none") {
		oauthError(w, "invalid_client_metadata", "public client metadata is invalid", http.StatusBadRequest)
		return
	}
	b, err := json.Marshal(req.RedirectURIs)
	if err != nil {
		oauthError(w, "server_error", "could not register client", http.StatusInternalServerError)
		return
	}
	client := registeredClient{ID: "mcp_" + uuid.NewString(), Name: strings.TrimSpace(req.ClientName), RedirectURIs: string(b)}
	if client.Name == "" {
		client.Name = "MCP client"
	}
	err = s.db.Create(&client).Error
	if err != nil {
		oauthError(w, "server_error", "could not register client", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"client_id": client.ID, "client_name": client.Name, "redirect_uris": req.RedirectURIs, "token_endpoint_auth_method": "none"})
}

type authRequest struct{ ClientID, RedirectURI, State, CodeChallenge, Scope, Resource string }

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
		back := r.URL.RequestURI()
		http.Redirect(w, r, "/auth/google?redirect="+url.QueryEscape(back), http.StatusFound)
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
	req := authRequest{ClientID: r.Form.Get("client_id"), RedirectURI: r.Form.Get("redirect_uri"), State: r.Form.Get("state"), CodeChallenge: r.Form.Get("code_challenge"), Scope: r.Form.Get("scope"), Resource: r.Form.Get("resource")}
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
	code, err := randomURLToken(32)
	if err != nil {
		oauthError(w, "server_error", "could not create code", http.StatusInternalServerError)
		return
	}
	hash := sha256.Sum256([]byte(code))
	row := authorizationCode{CodeHash: hex.EncodeToString(hash[:]), ClientID: req.ClientID, RedirectURI: req.RedirectURI, UserID: user.ID, Scopes: normalizeScopes(req.Scope), CodeChallenge: req.CodeChallenge, ExpiresAt: time.Now().Add(s.cfg.MCP.AuthorizationCodeTTL())}
	err = s.db.Create(&row).Error
	if err != nil {
		oauthError(w, "server_error", "could not store code", http.StatusInternalServerError)
		return
	}
	u, _ := url.Parse(req.RedirectURI)
	q := u.Query()
	q.Set("code", code)
	q.Set("state", req.State)
	q.Set("iss", s.issuer)
	u.RawQuery = q.Encode()
	http.Redirect(w, r, u.String(), http.StatusFound)
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
	if code == "" || clientID == "" || redirectURI == "" || !validPKCE(r.Form.Get("code_verifier")) {
		oauthError(w, "invalid_request", "missing or invalid token parameters", 400)
		return
	}
	hash := sha256.Sum256([]byte(code))
	var row authorizationCode
	err = s.db.Where("code_hash = ?", hex.EncodeToString(hash[:])).First(&row).Error
	if err != nil || row.UsedAt != nil || row.ExpiresAt.Before(time.Now()) || row.ClientID != clientID || row.RedirectURI != redirectURI || pkceChallenge(r.Form.Get("code_verifier")) != row.CodeChallenge {
		oauthError(w, "invalid_grant", "authorization code is invalid or expired", 400)
		return
	}
	now := time.Now()
	if result := s.db.Model(&authorizationCode{}).Where("id = ? AND used_at IS NULL", row.ID).Update("used_at", now); result.Error != nil || result.RowsAffected != 1 {
		oauthError(w, "invalid_grant", "authorization code already used", 400)
		return
	}
	token, err := s.issueAccessToken(row.UserID, row.ClientID, strings.Fields(row.Scopes))
	if err != nil {
		oauthError(w, "server_error", "could not issue token", 500)
		return
	}
	writeJSON(w, 200, map[string]any{"access_token": token, "token_type": "Bearer", "expires_in": int(s.cfg.MCP.AccessTokenTTL().Seconds()), "scope": row.Scopes})
}

func (s *Server) parseAuthorizationRequest(r *http.Request) (authRequest, error) {
	if r.URL.Query().Get("response_type") != "code" {
		return authRequest{}, errors.New("response_type must be code")
	}
	req := authRequest{ClientID: r.URL.Query().Get("client_id"), RedirectURI: r.URL.Query().Get("redirect_uri"), State: r.URL.Query().Get("state"), CodeChallenge: r.URL.Query().Get("code_challenge"), Scope: r.URL.Query().Get("scope"), Resource: r.URL.Query().Get("resource")}
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
	ID, Name     string
	RedirectURIs []string
}

func (s *Server) client(ctx context.Context, id string) (*clientMetadata, error) {
	if strings.HasPrefix(id, "https://") {
		return fetchClientMetadata(ctx, id)
	}
	var client registeredClient
	err := s.db.First(&client, "id = ?", id).Error
	if err != nil {
		return nil, errors.New("unknown client")
	}
	var redirects []string
	_ = json.Unmarshal([]byte(client.RedirectURIs), &redirects)
	return &clientMetadata{ID: client.ID, Name: client.Name, RedirectURIs: redirects}, nil
}

func (s *Server) appUser(ctx context.Context, r *http.Request) (*domain.User, error) {
	c, err := r.Cookie("auth_token")
	if err != nil {
		return nil, err
	}
	user, imp, err := s.services.Auth.ValidateToken(ctx, c.Value)
	if err != nil || imp != nil {
		return nil, errors.New("invalid session")
	}
	return user, nil
}

func (s *Server) issueAccessToken(userID int, clientID string, scopes []string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{"sub": strconv.Itoa(userID), "client_id": clientID, "scope": strings.Join(scopes, " "), "iss": s.issuer, "aud": s.resource, "iat": now.Unix(), "exp": now.Add(s.cfg.MCP.AccessTokenTTL()).Unix(), "jti": uuid.NewString()}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.MCP.JWTSecret))
}
func (s *Server) verifyAccessToken(_ context.Context, raw string, _ *http.Request) (*mcpauth.TokenInfo, error) {
	t, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.cfg.MCP.JWTSecret), nil
	}, jwt.WithAudience(s.resource), jwt.WithIssuer(s.issuer))
	if err != nil || !t.Valid {
		return nil, mcpauth.ErrInvalidToken
	}
	claims, ok := t.Claims.(jwt.MapClaims)
	if !ok {
		return nil, mcpauth.ErrInvalidToken
	}
	sub, _ := claims["sub"].(string)
	exp, _ := claims.GetExpirationTime()
	if sub == "" || exp == nil {
		return nil, mcpauth.ErrInvalidToken
	}
	scope, _ := claims["scope"].(string)
	return &mcpauth.TokenInfo{UserID: sub, Scopes: strings.Fields(scope), Expiration: exp.Time}, nil
}

func (s *Server) protocolServer() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "dividim", Version: "1.0.0"}, nil)
	read := &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: boolPtr(false)}
	write := &mcp.ToolAnnotations{ReadOnlyHint: false, DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}
	destructive := &mcp.ToolAnnotations{ReadOnlyHint: false, DestructiveHint: boolPtr(true), OpenWorldHint: boolPtr(false)}
	mcp.AddTool(server, &mcp.Tool{Name: "finance_get_context", Description: "Lista contas, categorias, tags e conexões disponíveis ao usuário.", Annotations: read}, s.getContext)
	mcp.AddTool(server, &mcp.Tool{Name: "finance_list_transactions", Description: "Lista transações do mês; valores são sempre centavos.", Annotations: read}, s.listTransactions)
	mcp.AddTool(server, &mcp.Tool{Name: "finance_get_transaction", Description: "Obtém uma transação pertencente ao usuário autenticado.", Annotations: read}, s.getTransaction)
	mcp.AddTool(server, &mcp.Tool{Name: "finance_get_balance", Description: "Calcula o saldo do período em centavos.", Annotations: read}, s.getBalance)
	mcp.AddTool(server, &mcp.Tool{Name: "finance_suggest_transactions", Description: "Sugere lançamentos anteriores a partir de uma descrição.", Annotations: read}, s.suggestTransactions)
	mcp.AddTool(server, &mcp.Tool{Name: "finance_create_transaction", Description: "Cria uma despesa, receita ou transferência. Requer aprovação do cliente MCP.", Annotations: write}, s.createTransaction)
	mcp.AddTool(server, &mcp.Tool{Name: "finance_update_transaction", Description: "Atualiza uma transação. propagation_settings é obrigatório.", Annotations: write}, s.updateTransaction)
	mcp.AddTool(server, &mcp.Tool{Name: "finance_delete_transaction", Description: "Exclui uma transação. propagation_settings é obrigatório.", Annotations: destructive}, s.deleteTransaction)
	return server
}

func userID(ctx context.Context, scope string) (int, error) {
	ti := mcpauth.TokenInfoFromContext(ctx)
	if ti == nil || !contains(ti.Scopes, scope) {
		return 0, errors.New("insufficient scope")
	}
	id, err := strconv.Atoi(ti.UserID)
	return id, err
}

type empty struct{}

func (s *Server) getContext(ctx context.Context, _ *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, readScope)
	if err != nil {
		return nil, nil, err
	}
	accounts, err := s.services.Account.Search(ctx, domain.AccountSearchOptions{UserIDs: []int{id}})
	if err != nil {
		return nil, nil, err
	}
	categories, err := s.services.Category.GetTree(ctx, domain.CategorySearchOptions{UserIDs: []int{id}})
	if err != nil {
		return nil, nil, err
	}
	tags, err := s.services.Tag.Search(ctx, domain.TagSearchOptions{UserIDs: []int{id}})
	if err != nil {
		return nil, nil, err
	}
	conns, err := s.services.UserConnection.Search(ctx, domain.UserConnectionSearchOptions{ParticipantUserID: id, ConnectionStatus: domain.UserConnectionStatusAccepted})
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"accounts": accounts, "categories": categories, "tags": tags, "connections": conns}, nil
}

type listInput struct {
	Month       int                      `json:"month"`
	Year        int                      `json:"year"`
	AccountIDs  []int                    `json:"account_ids,omitempty"`
	CategoryIDs []int                    `json:"category_ids,omitempty"`
	TagIDs      []int                    `json:"tag_ids,omitempty"`
	Types       []domain.TransactionType `json:"types,omitempty"`
	Limit       int                      `json:"limit,omitempty"`
	Offset      int                      `json:"offset,omitempty"`
	Description string                   `json:"description,omitempty"`
	Reviewed    *bool                    `json:"reviewed,omitempty"`
}

func (s *Server) listTransactions(ctx context.Context, _ *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, readScope)
	if err != nil {
		return nil, nil, err
	}
	if in.Limit <= 0 {
		in.Limit = 50
	}
	if in.Limit > 100 {
		in.Limit = 100
	}
	f := domain.TransactionFilter{AccountIDs: in.AccountIDs, CategoryIDs: in.CategoryIDs, TagIDs: in.TagIDs, Types: in.Types, Limit: &in.Limit, Offset: &in.Offset, WithSettlements: true, Reviewed: in.Reviewed}
	if in.Description != "" {
		f.Description = &domain.TextSearch{Query: in.Description}
	}
	txs, err := s.services.Transaction.Search(ctx, id, domain.Period{Month: in.Month, Year: in.Year}, f)
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"transactions": txs}, nil
}

type idInput struct {
	TransactionID int `json:"transaction_id"`
}

func (s *Server) getTransaction(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, readScope)
	if err != nil {
		return nil, nil, err
	}
	txs, err := s.services.Transaction.Search(ctx, id, domain.Period{}, domain.TransactionFilter{IDs: []int{in.TransactionID}, WithSettlements: true})
	if err != nil {
		return nil, nil, err
	}
	if len(txs) == 0 {
		return nil, nil, errors.New("transaction not found")
	}
	return nil, map[string]any{"transaction": txs[0]}, nil
}

type balanceInput struct {
	Month           int   `json:"month"`
	Year            int   `json:"year"`
	AccountIDs      []int `json:"account_ids,omitempty"`
	CategoryIDs     []int `json:"category_ids,omitempty"`
	TagIDs          []int `json:"tag_ids,omitempty"`
	Accumulated     bool  `json:"accumulated,omitempty"`
	HideSettlements bool  `json:"hide_settlements,omitempty"`
	Reviewed        *bool `json:"reviewed,omitempty"`
}

func (s *Server) getBalance(ctx context.Context, _ *mcp.CallToolRequest, in balanceInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, readScope)
	if err != nil {
		return nil, nil, err
	}
	result, err := s.services.Transaction.GetBalance(ctx, id, domain.Period{Month: in.Month, Year: in.Year}, domain.BalanceFilter{AccountIDs: in.AccountIDs, CategoryIDs: in.CategoryIDs, TagIDs: in.TagIDs, Accumulated: in.Accumulated, HideSettlements: in.HideSettlements, Reviewed: in.Reviewed})
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"balance": result}, nil
}

type suggestionsInput struct {
	Query string `json:"query"`
	Limit int    `json:"limit,omitempty"`
}

func (s *Server) suggestTransactions(ctx context.Context, _ *mcp.CallToolRequest, in suggestionsInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, readScope)
	if err != nil {
		return nil, nil, err
	}
	if strings.TrimSpace(in.Query) == "" {
		return nil, nil, errors.New("query is required")
	}
	if in.Limit <= 0 {
		in.Limit = 10
	}
	if in.Limit > 50 {
		in.Limit = 50
	}
	transactions, err := s.services.Transaction.Suggestions(ctx, id, domain.TransactionFilter{Description: &domain.TextSearch{Query: in.Query}, Limit: &in.Limit})
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"transactions": transactions}, nil
}

type createInput struct {
	TransactionType      domain.TransactionType     `json:"transaction_type"`
	AccountID            int                        `json:"account_id"`
	CategoryID           int                        `json:"category_id,omitempty"`
	AmountCents          int64                      `json:"amount_cents"`
	Date                 domain.Date                `json:"date"`
	Description          string                     `json:"description"`
	DestinationAccountID *int                       `json:"destination_account_id,omitempty"`
	TagIDs               []int                      `json:"tag_ids,omitempty"`
	RecurrenceSettings   *domain.RecurrenceSettings `json:"recurrence_settings,omitempty"`
	SplitSettings        []domain.SplitSettings     `json:"split_settings,omitempty"`
}

func (s *Server) createTransaction(ctx context.Context, _ *mcp.CallToolRequest, in createInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, writeScope)
	if err != nil {
		return nil, nil, err
	}
	tags, err := s.tags(ctx, id, in.TagIDs)
	if err != nil {
		return nil, nil, err
	}
	created, err := s.services.Transaction.Create(ctx, id, &domain.TransactionCreateRequest{TransactionType: in.TransactionType, AccountID: in.AccountID, CategoryID: in.CategoryID, Amount: in.AmountCents, Date: in.Date, Description: in.Description, DestinationAccountID: in.DestinationAccountID, Tags: tags, RecurrenceSettings: in.RecurrenceSettings, SplitSettings: in.SplitSettings})
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"transaction_id": created}, nil
}

type updateInput struct {
	TransactionID        int                                   `json:"transaction_id"`
	TransactionType      *domain.TransactionType               `json:"transaction_type,omitempty"`
	AccountID            *int                                  `json:"account_id,omitempty"`
	CategoryID           *int                                  `json:"category_id,omitempty"`
	AmountCents          *int64                                `json:"amount_cents,omitempty"`
	Date                 *domain.Date                          `json:"date,omitempty"`
	Description          *string                               `json:"description,omitempty"`
	DestinationAccountID *int                                  `json:"destination_account_id,omitempty"`
	TagIDs               *[]int                                `json:"tag_ids,omitempty"`
	RecurrenceSettings   *domain.RecurrenceSettings            `json:"recurrence_settings,omitempty"`
	SplitSettings        *[]domain.SplitSettings               `json:"split_settings,omitempty"`
	PropagationSettings  domain.TransactionPropagationSettings `json:"propagation_settings"`
}

func (s *Server) updateTransaction(ctx context.Context, _ *mcp.CallToolRequest, in updateInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, writeScope)
	if err != nil {
		return nil, nil, err
	}
	if !in.PropagationSettings.IsValid() {
		return nil, nil, errors.New("valid propagation_settings is required")
	}
	existingRows, err := s.services.Transaction.Search(ctx, id, domain.Period{}, domain.TransactionFilter{IDs: []int{in.TransactionID}, WithSettlements: true})
	if err != nil {
		return nil, nil, err
	}
	if len(existingRows) == 0 {
		return nil, nil, errors.New("transaction not found")
	}
	existing := existingRows[0]
	var tags []domain.Tag
	if in.TagIDs != nil {
		tags, err = s.tags(ctx, id, *in.TagIDs)
		if err != nil {
			return nil, nil, err
		}
	} else {
		tags = existing.Tags
	}
	req := &domain.TransactionUpdateRequest{TransactionType: in.TransactionType, AccountID: in.AccountID, CategoryID: in.CategoryID, Amount: in.AmountCents, Date: in.Date, Description: in.Description, DestinationAccountID: in.DestinationAccountID, Tags: tags, PropagationSettings: in.PropagationSettings, RecurrenceSettings: in.RecurrenceSettings}
	if in.SplitSettings != nil {
		req.SplitSettings = *in.SplitSettings
	} else if existing.OriginalUserID == nil || *existing.OriginalUserID == id {
		for _, linked := range existing.LinkedTransactions {
			if linked.UserID != id {
				return nil, nil, errors.New("split_settings is required when updating a shared transaction")
			}
		}
	}
	err = s.services.Transaction.Update(ctx, id, in.TransactionID, req)
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"transaction_id": in.TransactionID, "updated": true}, nil
}

type deleteInput struct {
	TransactionID       int                                   `json:"transaction_id"`
	PropagationSettings domain.TransactionPropagationSettings `json:"propagation_settings"`
}

func (s *Server) deleteTransaction(ctx context.Context, _ *mcp.CallToolRequest, in deleteInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, writeScope)
	if err != nil {
		return nil, nil, err
	}
	if !in.PropagationSettings.IsValid() {
		return nil, nil, errors.New("valid propagation_settings is required")
	}
	err = s.services.Transaction.Delete(ctx, id, in.TransactionID, in.PropagationSettings)
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"transaction_id": in.TransactionID, "deleted": true}, nil
}
func (s *Server) tags(ctx context.Context, userID int, ids []int) ([]domain.Tag, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	tags, err := s.services.Tag.Search(ctx, domain.TagSearchOptions{UserIDs: []int{userID}, IDs: ids})
	if err != nil {
		return nil, err
	}
	if len(tags) != len(ids) {
		return nil, errors.New("one or more tag_ids do not belong to the user")
	}
	out := make([]domain.Tag, len(tags))
	for i, t := range tags {
		out[i] = *t
	}
	return out, nil
}

func (s *Server) renderConsent(ctx context.Context, w http.ResponseWriter, req authRequest) {
	meta, _ := s.client(ctx, req.ClientID)
	name := req.ClientID
	if meta != nil && meta.Name != "" {
		name = meta.Name
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = template.Must(template.New("consent").Parse(`<!doctype html><title>Autorizar agente</title><main><h1>Conectar {{.Name}}</h1><p>O cliente poderá ler suas finanças{{if .Write}} e criar, editar e excluir transações{{end}}.</p><form method="post" action="/oauth/authorize/approve">{{range .Fields}}<input type="hidden" name="{{.K}}" value="{{.V}}">{{end}}<button name="approve" value="yes">Autorizar</button><button name="approve" value="no">Cancelar</button></form></main>`)).Execute(w, map[string]any{"Name": name, "Write": contains(strings.Fields(req.Scope), writeScope), "Fields": []map[string]string{{"K": "client_id", "V": req.ClientID}, {"K": "redirect_uri", "V": req.RedirectURI}, {"K": "state", "V": req.State}, {"K": "code_challenge", "V": req.CodeChallenge}, {"K": "scope", "V": req.Scope}, {"K": "resource", "V": req.Resource}}})
}
func fetchClientMetadata(ctx context.Context, raw string) (*clientMetadata, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || isPrivateHost(u.Hostname()) {
		return nil, errors.New("invalid client metadata URL")
	}
	c := safeMetadataClient()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, errors.New("invalid client metadata URL")
	}
	resp, err := c.Do(req)
	if err != nil {
		return nil, errors.New("could not fetch client metadata")
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("client metadata unavailable")
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return nil, errors.New("invalid client metadata")
	}
	var doc struct {
		ClientID     string   `json:"client_id"`
		ClientName   string   `json:"client_name"`
		RedirectURIs []string `json:"redirect_uris"`
	}
	if json.Unmarshal(body, &doc) != nil || doc.ClientID != raw || !validRedirectURIs(doc.RedirectURIs) {
		return nil, errors.New("invalid client metadata")
	}
	return &clientMetadata{ID: doc.ClientID, Name: doc.ClientName, RedirectURIs: doc.RedirectURIs}, nil
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
	return &http.Client{Timeout: 3 * time.Second, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
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
		u, err := url.Parse(raw)
		if err != nil {
			return false
		}
		validScheme := u.Scheme == "https" || u.Scheme == "http" && isLoopbackHost(u.Hostname())
		if u.Fragment != "" || u.Host == "" || !validScheme {
			return false
		}
	}
	return true
}
func isLoopbackHost(h string) bool { ip := net.ParseIP(h); return ip != nil && ip.IsLoopback() }
func validPKCE(v string) bool      { return len(v) >= 43 && len(v) <= 128 }
func pkceChallenge(v string) string {
	sum := sha256.Sum256([]byte(v))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
func normalizeScopes(v string) string { return strings.Join(strings.Fields(v), " ") }
func onlyKnownScopes(scopes []string) bool {
	for _, x := range scopes {
		if x != readScope && x != writeScope {
			return false
		}
	}
	return true
}
func contains[T comparable](items []T, want T) bool {
	for _, x := range items {
		if x == want {
			return true
		}
	}
	return false
}
func boolPtr(v bool) *bool { return &v }
func randomURLToken(n int) (string, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
func decodeJSON(r *http.Request, out any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 64<<10))
	return decoder.Decode(out)
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	err := json.NewEncoder(w).Encode(v)
	if err != nil {
		return
	}
}
func oauthError(w http.ResponseWriter, code, description string, status int) {
	writeJSON(w, status, map[string]string{"error": code, "error_description": description})
}
func redirectOAuthError(w http.ResponseWriter, r *http.Request, req authRequest, code string) {
	u, _ := url.Parse(req.RedirectURI)
	q := u.Query()
	q.Set("error", code)
	q.Set("state", req.State)
	u.RawQuery = q.Encode()
	http.Redirect(w, r, u.String(), http.StatusFound)
}
