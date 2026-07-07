package repository

import (
	"context"
	"errors"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type impersonationRepository struct {
	db *gorm.DB
}

func NewImpersonationRepository(db *gorm.DB) ImpersonationRepository {
	return &impersonationRepository{db: db}
}

func (r *impersonationRepository) Create(ctx context.Context, session *domain.ImpersonationSession) error {
	ent := entity.ImpersonationSessionFromDomain(session)
	return GetTxFromContext(ctx, r.db).Create(ent).Error
}

func (r *impersonationRepository) GetByID(ctx context.Context, id string) (*domain.ImpersonationSession, error) {
	var ent entity.ImpersonationSession
	if err := GetTxFromContext(ctx, r.db).Where("id = ?", id).First(&ent).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *impersonationRepository) Revoke(ctx context.Context, id string, at time.Time) error {
	return GetTxFromContext(ctx, r.db).
		Model(&entity.ImpersonationSession{}).
		Where("id = ? AND revoked_at IS NULL", id).
		Update("revoked_at", at).Error
}
