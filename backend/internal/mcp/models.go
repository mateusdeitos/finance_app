package mcp

import "time"

// authorizationCode is the persisted, one-time OAuth code granted after a
// user consents to an MCP client.
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

// registeredClient is a dynamically registered public MCP client.
type registeredClient struct {
	ID           string `gorm:"primaryKey"`
	Name         string
	RedirectURIs string `gorm:"not null"`
	CreatedAt    time.Time
}

func (registeredClient) TableName() string { return "mcp_registered_clients" }
