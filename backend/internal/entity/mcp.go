package entity

import "time"

// MCPRegisteredClient maps to mcp_registered_clients. JSON serialization of
// RedirectURIs is owned by the repository boundary.
type MCPRegisteredClient struct {
	ID           string `gorm:"primaryKey"`
	Name         string
	RedirectURIs string `gorm:"not null"`
	CreatedAt    time.Time
}

func (MCPRegisteredClient) TableName() string { return "mcp_registered_clients" }

// MCPAuthorizationCode maps to mcp_authorization_codes. The code itself is
// never stored, only its SHA-256 hash.
type MCPAuthorizationCode struct {
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

func (MCPAuthorizationCode) TableName() string { return "mcp_authorization_codes" }
