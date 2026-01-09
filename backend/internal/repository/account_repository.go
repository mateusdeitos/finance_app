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
	return GetTxFromContext(ctx, r.db).Save(ent).Error
}

func (r *accountRepository) Delete(ctx context.Context, id int) error {
	return GetTxFromContext(ctx, r.db).Delete(&entity.Account{}, id).Error
}

func (r *accountRepository) Search(ctx context.Context, options domain.AccountSearchOptions) ([]*domain.Account, error) {
	var ents []entity.Account
	query := GetTxFromContext(ctx, r.db)

	if len(options.UserIDs) > 0 {
		query = query.Where("user_id IN ?", options.UserIDs)
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
