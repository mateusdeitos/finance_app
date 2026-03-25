package repository

import (
	"context"
	"errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type accountRepository struct {
	db *gorm.DB
}

func NewAccountRepository(db *gorm.DB) AccountRepository {
	return &accountRepository{db: db}
}

func (r *accountRepository) Create(ctx context.Context, account *domain.Account) (*domain.Account, error) {
	ent := entity.AccountFromDomain(account)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *accountRepository) GetByID(ctx context.Context, id int) (*domain.Account, error) {
	var ent entity.Account
	if err := GetTxFromContext(ctx, r.db).First(&ent, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *accountRepository) GetByUserID(ctx context.Context, userID int) ([]*domain.Account, error) {
	var ents []entity.Account
	q := GetTxFromContext(ctx, r.db)

	q = q.Where("user_id = ? OR (shared_with_user_id = ? AND shared_allowed = true)", userID, userID)
	if err := q.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Account, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}

func (r *accountRepository) GetSharedAccounts(ctx context.Context, userID int) ([]*domain.Account, error) {
	var ents []entity.Account
	if err := GetTxFromContext(ctx, r.db).Where("shared_with_user_id = ?", userID).Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Account, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}

func (r *accountRepository) Update(ctx context.Context, account *domain.Account) error {
	ent := entity.AccountFromDomain(account)
	return GetTxFromContext(ctx, r.db).
		Model(ent).
		Select("name", "description", "initial_balance", "updated_at").
		Updates(ent).Error
}

func (r *accountRepository) Delete(ctx context.Context, id int) error {
	return GetTxFromContext(ctx, r.db).Delete(&entity.Account{}, id).Error
}

func (r *accountRepository) Deactivate(ctx context.Context, id int) error {
	return GetTxFromContext(ctx, r.db).
		Model(&entity.Account{}).
		Where("id = ?", id).
		Updates(map[string]any{"is_active": false}).Error
}

func (r *accountRepository) Activate(ctx context.Context, id int) error {
	return GetTxFromContext(ctx, r.db).
		Model(&entity.Account{}).
		Where("id = ?", id).
		Updates(map[string]any{"is_active": true}).Error
}

func (r *accountRepository) Search(ctx context.Context, options domain.AccountSearchOptions) ([]*domain.Account, error) {
	var ents []entity.Account
	query := GetTxFromContext(ctx, r.db)

	if options.Limit > 0 {
		query = query.Limit(options.Limit)
	}
	if options.Offset > 0 {
		query = query.Offset(options.Offset)
	}

	query = query.Select(`accounts.*`)

	if len(options.UserIDs) > 0 {
		query = query.Select(`accounts.*, CASE WHEN user_connections.id IS NOT NULL THEN
            jsonb_build_object(
                'id', user_connections.id,
                'from_user_id', user_connections.from_user_id,
                'from_account_id', user_connections.from_account_id,
                'from_default_split_percentage', user_connections.from_default_split_percentage,
                'to_user_id', user_connections.to_user_id,
                'to_account_id', user_connections.to_account_id,
                'to_default_split_percentage', user_connections.to_default_split_percentage,
                'connection_status', user_connections.connection_status,
                'created_at', user_connections.created_at,
                'updated_at', user_connections.updated_at
            )
        ELSE NULL
    END AS user_connection`)

		query = query.Joins(`LEFT JOIN user_connections ON user_connections.connection_status = ?
		AND (
			(user_connections.from_account_id = accounts.id AND user_connections.from_user_id IN ?)
			OR (user_connections.to_account_id = accounts.id AND user_connections.to_user_id IN ?)
		)`,
			domain.UserConnectionStatusAccepted,
			options.UserIDs,
			options.UserIDs,
		)

		query = query.Where("user_id IN ?", options.UserIDs)
	}

	if len(options.IDs) > 0 {
		query = query.Where("accounts.id IN ?", options.IDs)
	}

	if options.ActiveOnly != nil {
		query = query.Where("accounts.is_active = ?", *options.ActiveOnly)
	}

	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Account, len(ents))
	for i, ent := range ents {
		result[i] = ent.ToDomain()
	}
	return result, nil
}
