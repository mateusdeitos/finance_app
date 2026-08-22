package mcp

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	"github.com/finance_app/backend/internal/service"
	testdb "github.com/finance_app/backend/pkg/tests"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMCPIntegrationOAuthAndTransactionTools(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping MCP integration test")
	}

	ctx := t.Context()
	database, err := testdb.NewTestDatabase(ctx)
	require.NoError(t, err)

	cfg := &config.Config{
		JWT: config.JWTConfig{Secret: "app-test-secret", ExpirationHours: 1},
		MCP: config.MCPConfig{JWTSecret: "mcp-test-secret", AccessTokenHours: 1, AuthorizationCodeMins: 10},
	}
	repos := integrationRepositories(database.Db)
	services := integrationServices(repos, cfg)

	appToken, err := services.Auth.TestLogin(ctx, "mcp-integration@example.com")
	require.NoError(t, err)
	user, err := repos.User.GetByEmail(ctx, "mcp-integration@example.com")
	require.NoError(t, err)
	require.NotNil(t, user)

	account, err := services.Account.Create(ctx, user.ID, &domain.Account{Name: "Conta MCP"})
	require.NoError(t, err)
	category, err := services.Category.Create(ctx, user.ID, &domain.Category{Name: "Mercado"})
	require.NoError(t, err)
	_, err = services.Auth.TestLogin(ctx, "other-mcp-user@example.com")
	require.NoError(t, err)
	otherUser, err := repos.User.GetByEmail(ctx, "other-mcp-user@example.com")
	require.NoError(t, err)
	require.NotNil(t, otherUser)
	otherAccount, err := services.Account.Create(ctx, otherUser.ID, &domain.Account{Name: "Conta privada"})
	require.NoError(t, err)
	otherCategory, err := services.Category.Create(ctx, otherUser.ID, &domain.Category{Name: "Categoria privada"})
	require.NoError(t, err)
	transactionDate, err := parseMCPDate("2026-08-17")
	require.NoError(t, err)
	otherTransactionID, err := services.Transaction.Create(ctx, otherUser.ID, &domain.TransactionCreateRequest{
		TransactionType: domain.TransactionTypeExpense, AccountID: otherAccount.ID, CategoryID: otherCategory.ID,
		Amount: 9900, Date: transactionDate, Description: "Transação de outro usuário",
	})
	require.NoError(t, err)

	httpServer := httptest.NewUnstartedServer(nil)
	cfg.App.URL = "http://" + httpServer.Listener.Addr().String()
	services.MCPAuthorization = service.NewMCPAuthorizationService(repos, cfg)
	server, err := New(cfg, services)
	require.NoError(t, err)
	httpServer.Config.Handler = server.Handler()
	httpServer.Start()
	t.Cleanup(httpServer.Close)

	accessToken := authorizeIntegrationClient(t, httpServer.URL, appToken)

	mcpHTTPClient := &http.Client{Transport: &bearerTransport{token: accessToken, base: http.DefaultTransport}}
	client := mcpsdk.NewClient(&mcpsdk.Implementation{Name: "integration-test", Version: "1.0.0"}, nil)
	session, err := client.Connect(ctx, &mcpsdk.StreamableClientTransport{
		Endpoint: httpServer.URL + "/mcp", HTTPClient: mcpHTTPClient,
		MaxRetries: -1, DisableStandaloneSSE: true,
	}, nil)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, session.Close()) })

	tools, err := session.ListTools(ctx, nil)
	require.NoError(t, err)
	require.Contains(t, toolNames(tools.Tools), "finance_create_transaction")
	require.Contains(t, toolNames(tools.Tools), "finance_update_transaction")
	require.Contains(t, toolNames(tools.Tools), "finance_list_transactions")

	created, err := session.CallTool(ctx, &mcpsdk.CallToolParams{Name: "finance_create_transaction", Arguments: map[string]any{
		"transaction_type": "expense", "account_id": account.ID, "category_id": category.ID,
		"amount_cents": 2590, "date": "2026-08-17", "description": "Compra via MCP",
		"tags": []map[string]any{{"name": "mercado"}},
	}})
	require.NoError(t, err)
	require.False(t, created.IsError)
	createdJSON, err := json.Marshal(created.StructuredContent)
	require.NoError(t, err)
	var createdBody struct {
		TransactionID int `json:"transaction_id"`
	}
	require.NoError(t, json.Unmarshal(createdJSON, &createdBody))
	require.Positive(t, createdBody.TransactionID)

	updated, err := session.CallTool(ctx, &mcpsdk.CallToolParams{Name: "finance_update_transaction", Arguments: map[string]any{
		"transaction_id": createdBody.TransactionID, "amount_cents": 3000,
		"description": "Compra ajustada via MCP", "propagation_settings": "current",
		"tags": []map[string]any{{"name": "mercado"}},
	}})
	require.NoError(t, err)
	require.False(t, updated.IsError)

	userTags, err := services.Tag.Search(ctx, domain.TagSearchOptions{UserIDs: []int{user.ID}, Name: "mercado"})
	require.NoError(t, err)
	require.Len(t, userTags, 1, "create and update must reuse the tag by name")

	forbidden, err := session.CallTool(ctx, &mcpsdk.CallToolParams{Name: "finance_update_transaction", Arguments: map[string]any{
		"transaction_id": otherTransactionID, "description": "Tentativa indevida",
		"propagation_settings": "current",
	}})
	require.NoError(t, err)
	require.True(t, forbidden.IsError)
	otherTransactions, err := services.Transaction.Search(ctx, otherUser.ID, domain.Period{}, domain.TransactionFilter{IDs: []int{otherTransactionID}})
	require.NoError(t, err)
	require.Len(t, otherTransactions, 1)
	require.Equal(t, "Transação de outro usuário", otherTransactions[0].Description)

	listed, err := session.CallTool(ctx, &mcpsdk.CallToolParams{Name: "finance_list_transactions", Arguments: map[string]any{
		"month": 8, "year": 2026, "account_ids": []int{account.ID},
	}})
	require.NoError(t, err)
	require.False(t, listed.IsError)
	listedJSON, err := json.Marshal(listed.StructuredContent)
	require.NoError(t, err)
	require.Contains(t, string(listedJSON), "Compra ajustada via MCP")
	require.Contains(t, string(listedJSON), "3000")
}

func integrationRepositories(db *gorm.DB) *repository.Repositories {
	return &repository.Repositories{
		DBTransaction:         repository.NewDBTransaction(db),
		User:                  repository.NewUserRepository(db),
		UserSocial:            repository.NewUserSocialRepository(db),
		Account:               repository.NewAccountRepository(db),
		Category:              repository.NewCategoryRepository(db),
		Tag:                   repository.NewTagRepository(db),
		Transaction:           repository.NewTransactionRepository(db),
		TransactionRecurrence: repository.NewTransactionRecurrenceRepository(db),
		Settlement:            repository.NewSettlementRepository(db),
		UserConnection:        repository.NewUserConnectionRepository(db),
		Charge:                repository.NewChargeRepository(db),
		Impersonation:         repository.NewImpersonationRepository(db),
		MCPAuthorization:      repository.NewMCPAuthorizationRepository(db),
	}
}

func integrationServices(repos *repository.Repositories, cfg *config.Config) *service.Services {
	services := &service.Services{
		Auth:             service.NewAuthService(repos, cfg),
		User:             service.NewUserService(repos),
		Category:         service.NewCategoryService(repos),
		Tag:              service.NewTagService(repos),
		Settlement:       service.NewSettlementService(repos),
		MCPAuthorization: service.NewMCPAuthorizationService(repos, cfg),
	}
	services.Account = service.NewAccountService(repos, services)
	services.UserConnection = service.NewUserConnectionService(repos, services)
	services.Transaction = service.NewTransactionService(repos, services)
	return services
}

func authorizeIntegrationClient(t *testing.T, baseURL, appToken string) string {
	t.Helper()
	redirectURI := "http://127.0.0.1/oauth/callback"
	clientID := registerIntegrationClient(t, baseURL, redirectURI)
	verifier := strings.Repeat("integration-verifier-", 3)
	challenge := pkceChallenge(verifier)
	scope := readScope + " " + writeScope
	authorizeURL := baseURL + "/oauth/authorize?" + url.Values{
		"response_type":  {"code"},
		"client_id":      {clientID},
		"redirect_uri":   {redirectURI},
		"state":          {"integration-state"},
		"code_challenge": {challenge},
		"scope":          {scope},
		"resource":       {baseURL + "/mcp"},
	}.Encode()
	authorizeReq, err := http.NewRequestWithContext(t.Context(), http.MethodGet, authorizeURL, nil)
	require.NoError(t, err)
	authorizeReq.AddCookie(&http.Cookie{Name: "auth_token", Value: appToken})
	authorizeResp, err := http.DefaultClient.Do(authorizeReq)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, authorizeResp.StatusCode)
	authorizeBody, err := io.ReadAll(authorizeResp.Body)
	require.NoError(t, err)
	require.NoError(t, authorizeResp.Body.Close())
	require.Contains(t, string(authorizeBody), "Conectar Inspector de integração")

	approveResp := postIntegrationForm(t, baseURL+"/oauth/authorize/approve", url.Values{
		"client_id":      {clientID},
		"redirect_uri":   {redirectURI},
		"state":          {"integration-state"},
		"code_challenge": {challenge},
		"scope":          {scope},
		"resource":       {baseURL + "/mcp"},
		"approve":        {"yes"},
	}, appToken, false)
	require.Equal(t, http.StatusFound, approveResp.StatusCode)
	location, err := url.Parse(approveResp.Header.Get("Location"))
	require.NoError(t, err)
	require.Equal(t, "integration-state", location.Query().Get("state"))
	code := location.Query().Get("code")
	require.NotEmpty(t, code)
	require.NoError(t, approveResp.Body.Close())

	tokenValues := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"client_id":     {clientID},
		"redirect_uri":  {redirectURI},
		"code_verifier": {verifier},
	}
	tokenResp := postIntegrationForm(t, baseURL+"/oauth/token", tokenValues, "", true)
	require.Equal(t, http.StatusOK, tokenResp.StatusCode)
	var tokenBody struct {
		AccessToken string `json:"access_token"`
		Scope       string `json:"scope"`
	}
	require.NoError(t, json.NewDecoder(tokenResp.Body).Decode(&tokenBody))
	require.NoError(t, tokenResp.Body.Close())
	require.NotEmpty(t, tokenBody.AccessToken)
	require.Equal(t, scope, tokenBody.Scope)

	replayResp := postIntegrationForm(t, baseURL+"/oauth/token", tokenValues, "", true)
	require.Equal(t, http.StatusBadRequest, replayResp.StatusCode)
	var replayBody map[string]string
	require.NoError(t, json.NewDecoder(replayResp.Body).Decode(&replayBody))
	require.NoError(t, replayResp.Body.Close())
	require.Equal(t, "invalid_grant", replayBody["error"])
	return tokenBody.AccessToken
}

func registerIntegrationClient(t *testing.T, baseURL, redirectURI string) string {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"client_name": "Inspector de integração", "redirect_uris": []string{redirectURI},
		"grant_types": []string{"authorization_code"}, "token_endpoint_auth_method": "none",
	})
	require.NoError(t, err)
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, baseURL+"/oauth/register", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	defer resp.Body.Close()
	var response struct {
		ClientID string `json:"client_id"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&response))
	require.NotEmpty(t, response.ClientID)
	return response.ClientID
}

func postIntegrationForm(t *testing.T, endpoint string, values url.Values, appToken string, followRedirect bool) *http.Response {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, endpoint, strings.NewReader(values.Encode()))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if appToken != "" {
		req.AddCookie(&http.Cookie{Name: "auth_token", Value: appToken})
	}
	client := &http.Client{}
	if !followRedirect {
		client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	}
	resp, err := client.Do(req)
	require.NoError(t, err)
	return resp
}

type bearerTransport struct {
	token string
	base  http.RoundTripper
}

func (t *bearerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.Header.Set("Authorization", "Bearer "+t.token)
	return t.base.RoundTrip(clone)
}

func toolNames(tools []*mcpsdk.Tool) []string {
	names := make([]string, len(tools))
	for i, tool := range tools {
		names[i] = tool.Name
	}
	return names
}
