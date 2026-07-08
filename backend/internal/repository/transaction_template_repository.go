package repository

import (
	"context"
	"errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"gorm.io/gorm"
)

// ErrTemplateLimitReached is returned by Create when the user already has the
// maximum of 3 templates at the moment of insert. The service maps this to
// pkgErrors.ErrTemplateLimitReached (HTTP 409, tag TEMPLATE.LIMIT_REACHED).
var ErrTemplateLimitReached = errors.New("template limit reached")

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
		Order("created_at ASC").
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

// Create is a race-safe capped conditional INSERT (SECURITY T-27-02): the
// COUNT subquery and the INSERT evaluate as a single atomic statement, so two
// concurrent creates at count=2 cannot both land a 4th row. RowsAffected == 0
// means the cap was already reached at insert time -> ErrTemplateLimitReached.
func (r *transactionTemplateRepository) Create(ctx context.Context, t *domain.TransactionTemplate) (*domain.TransactionTemplate, error) {
	ent := entity.TransactionTemplateFromDomain(t)
	payloadJSON, err := ent.Payload.Value()
	if err != nil {
		return nil, err
	}

	var created entity.TransactionTemplate
	result := GetTxFromContext(ctx, r.db).Raw(`
		INSERT INTO transaction_templates (user_id, name, payload, created_at, updated_at)
		SELECT ?, ?, ?, NOW(), NOW()
		WHERE (SELECT COUNT(*) FROM transaction_templates WHERE user_id = ?) < 3
		RETURNING id, user_id, name, payload, created_at, updated_at
	`, ent.UserID, ent.Name, payloadJSON, ent.UserID).Scan(&created)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, ErrTemplateLimitReached
	}
	return created.ToDomain(), nil
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
