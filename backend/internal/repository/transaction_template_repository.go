package repository

import (
	"context"
	"errors"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"gorm.io/gorm"
)

var (
	// ErrTemplateDuplicateName converts the database's case-insensitive unique
	// index into the service's public duplicate-name error.
	ErrTemplateDuplicateName = errors.New("template duplicate name")
)

type transactionTemplateRepository struct {
	db *gorm.DB
}

func NewTransactionTemplateRepository(db *gorm.DB) TransactionTemplateRepository {
	return &transactionTemplateRepository{db: db}
}

func (r *transactionTemplateRepository) ListByUserID(ctx context.Context, userID int) ([]*domain.TransactionTemplate, error) {
	var ents []entity.TransactionTemplate
	if err := GetTxFromContext(ctx, r.db).
		Where("user_id = ?", userID).
		Order("last_used_at DESC NULLS LAST, created_at DESC, id DESC").
		Find(&ents).Error; err != nil {
		return nil, err
	}
	result := make([]*domain.TransactionTemplate, len(ents))
	for i := range ents {
		e := ents[i]
		result[i] = e.ToDomain()
	}
	return result, nil
}

func (r *transactionTemplateRepository) Create(ctx context.Context, t *domain.TransactionTemplate) (*domain.TransactionTemplate, error) {
	ent := entity.TransactionTemplateFromDomain(t)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return nil, ErrTemplateDuplicateName
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

// GetByIDForUser scopes the read by (id, user_id) — SAFE-02: a row that
// doesn't match the caller returns NotFound (404), never leaking existence
// across users.
func (r *transactionTemplateRepository) GetByIDForUser(ctx context.Context, userID, id int) (*domain.TransactionTemplate, error) {
	var ent entity.TransactionTemplate
	err := GetTxFromContext(ctx, r.db).
		Where("id = ? AND user_id = ?", id, userID).
		First(&ent).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, pkgErrors.NotFound("transaction template")
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

// Update is a full replace of name + payload (D-06), scoped by (id, user_id).
func (r *transactionTemplateRepository) Update(ctx context.Context, userID int, t *domain.TransactionTemplate) error {
	ent := entity.TransactionTemplateFromDomain(t)
	result := GetTxFromContext(ctx, r.db).
		Model(&entity.TransactionTemplate{}).
		Where("id = ? AND user_id = ?", t.ID, userID).
		Updates(map[string]interface{}{"name": ent.Name, "payload": ent.Payload})
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrDuplicatedKey) {
			return ErrTemplateDuplicateName
		}
		return result.Error
	}
	if result.RowsAffected == 0 {
		return pkgErrors.NotFound("transaction template")
	}
	return nil
}

func (r *transactionTemplateRepository) Delete(ctx context.Context, userID, id int) error {
	result := GetTxFromContext(ctx, r.db).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&entity.TransactionTemplate{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return pkgErrors.NotFound("transaction template")
	}
	return nil
}

// MarkUsed updates the caller-owned template's recency without changing its payload.
func (r *transactionTemplateRepository) MarkUsed(ctx context.Context, userID, id int) error {
	result := GetTxFromContext(ctx, r.db).
		Model(&entity.TransactionTemplate{}).
		Where("id = ? AND user_id = ?", id, userID).
		UpdateColumn("last_used_at", time.Now().UTC())
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return pkgErrors.NotFound("transaction template")
	}
	return nil
}
