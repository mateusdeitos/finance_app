// Package mcp exposes the finance domain to remote MCP clients. It deliberately
// talks to Services rather than looping back through the public HTTP API.
package mcp

import (
	"errors"
	"net/http"
	"strings"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/service"
	mcpauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
	"gorm.io/gorm"
)

const (
	readScope  = "finance:read"
	writeScope = "finance:transactions:write"
)

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
