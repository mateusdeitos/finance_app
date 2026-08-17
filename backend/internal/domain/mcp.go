package domain

import "time"

// MCPRegisteredClient is a public OAuth client registered to access the MCP
// resource. RedirectURIs are persisted as a structured list by the repository.
type MCPRegisteredClient struct {
	ID           string
	Name         string
	RedirectURIs []string
	CreatedAt    time.Time
}

// MCPAuthorizationCode is the durable, one-time grant created after consent.
// Only a hash of the code is persisted.
type MCPAuthorizationCode struct {
	ID            uint
	CodeHash      string
	ClientID      string
	RedirectURI   string
	UserID        int
	Scopes        []string
	CodeChallenge string
	ExpiresAt     time.Time
	UsedAt        *time.Time
	CreatedAt     time.Time
}

// MCPAccessToken is returned after a valid authorization-code exchange.
type MCPAccessToken struct {
	Value     string
	ExpiresIn int
	Scopes    []string
}

// MCPAccessTokenInfo is the authenticated identity carried by an MCP token.
type MCPAccessTokenInfo struct {
	UserID    int
	Scopes    []string
	ExpiresAt time.Time
}
