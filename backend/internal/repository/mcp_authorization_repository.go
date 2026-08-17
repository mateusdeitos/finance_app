package repository

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type mcpAuthorizationRepository struct {
	db *gorm.DB
}

func NewMCPAuthorizationRepository(db *gorm.DB) MCPAuthorizationRepository {
	return &mcpAuthorizationRepository{db: db}
}

func (r *mcpAuthorizationRepository) CreateClient(ctx context.Context, client *domain.MCPRegisteredClient) error {
	redirectURIs, err := json.Marshal(client.RedirectURIs)
	if err != nil {
		return err
	}
	ent := &entity.MCPRegisteredClient{
		ID:           client.ID,
		Name:         client.Name,
		RedirectURIs: string(redirectURIs),
		CreatedAt:    client.CreatedAt,
	}
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return err
	}
	client.CreatedAt = ent.CreatedAt
	return nil
}

func (r *mcpAuthorizationRepository) GetClient(ctx context.Context, id string) (*domain.MCPRegisteredClient, error) {
	var ent entity.MCPRegisteredClient
	if err := GetTxFromContext(ctx, r.db).First(&ent, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	var redirectURIs []string
	if err := json.Unmarshal([]byte(ent.RedirectURIs), &redirectURIs); err != nil {
		return nil, err
	}
	return &domain.MCPRegisteredClient{
		ID: ent.ID, Name: ent.Name, RedirectURIs: redirectURIs, CreatedAt: ent.CreatedAt,
	}, nil
}

func (r *mcpAuthorizationRepository) CreateAuthorizationCode(ctx context.Context, code *domain.MCPAuthorizationCode) error {
	ent := &entity.MCPAuthorizationCode{
		CodeHash: code.CodeHash, ClientID: code.ClientID, RedirectURI: code.RedirectURI,
		UserID: code.UserID, Scopes: strings.Join(code.Scopes, " "), CodeChallenge: code.CodeChallenge,
		ExpiresAt: code.ExpiresAt, UsedAt: code.UsedAt, CreatedAt: code.CreatedAt,
	}
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return err
	}
	code.ID = ent.ID
	code.CreatedAt = ent.CreatedAt
	return nil
}

func (r *mcpAuthorizationRepository) ConsumeAuthorizationCode(ctx context.Context, codeHash, clientID, redirectURI, codeChallenge string, now time.Time) (*domain.MCPAuthorizationCode, error) {
	var ent entity.MCPAuthorizationCode
	result := GetTxFromContext(ctx, r.db).
		Model(&ent).
		Clauses(clause.Returning{}).
		Where("code_hash = ? AND client_id = ? AND redirect_uri = ? AND code_challenge = ? AND used_at IS NULL AND expires_at > ?", codeHash, clientID, redirectURI, codeChallenge, now).
		Update("used_at", now)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected != 1 {
		return nil, nil
	}
	return &domain.MCPAuthorizationCode{
		ID: ent.ID, CodeHash: ent.CodeHash, ClientID: ent.ClientID, RedirectURI: ent.RedirectURI,
		UserID: ent.UserID, Scopes: strings.Fields(ent.Scopes), CodeChallenge: ent.CodeChallenge,
		ExpiresAt: ent.ExpiresAt, UsedAt: ent.UsedAt, CreatedAt: ent.CreatedAt,
	}, nil
}
