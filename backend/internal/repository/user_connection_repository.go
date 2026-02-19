package repository

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"github.com/samber/lo"
	"gorm.io/gorm"
)

type userConnectionRepository struct {
	db *gorm.DB
}

func NewUserConnectionRepository(db *gorm.DB) UserConnectionRepository {
	return &userConnectionRepository{db: db}
}

func (r *userConnectionRepository) Create(ctx context.Context, userConnection *domain.UserConnection) (*domain.UserConnection, error) {
	ent := entity.UserConnectionFromDomain(userConnection)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *userConnectionRepository) Update(ctx context.Context, userConnection *domain.UserConnection) error {
	ent := entity.UserConnectionFromDomain(userConnection)
	return GetTxFromContext(ctx, r.db).Save(ent).Error
}

func (r *userConnectionRepository) Delete(ctx context.Context, id int) error {
	return GetTxFromContext(ctx, r.db).Delete(&entity.UserConnection{}, id).Error
}

func (r *userConnectionRepository) Search(ctx context.Context, options domain.UserConnectionSearchOptions) ([]*domain.UserConnection, error) {
	var ents []entity.UserConnection
	query := GetTxFromContext(ctx, r.db)

	if options.Limit > 0 {
		query = query.Limit(options.Limit)
	}
	if options.Offset > 0 {
		query = query.Offset(options.Offset)
	}

	if len(options.IDs) > 0 {
		query = query.Where("id IN ?", options.IDs)
	}
	if len(options.FromUserIDs) > 0 {
		query = query.Where("from_user_id IN ?", options.FromUserIDs)
	}
	if len(options.ToUserIDs) > 0 {
		query = query.Where("to_user_id IN ?", options.ToUserIDs)
	}
	if len(options.AccountIDs) > 0 {
		query = query.Where("(from_account_id IN ? OR to_account_id IN ?)", options.AccountIDs, options.AccountIDs)
	} else {
		if len(options.FromAccountIDs) > 0 {
			query = query.Where("from_account_id IN ?", options.FromAccountIDs)
		}
		if len(options.ToAccountIDs) > 0 {
			query = query.Where("to_account_id IN ?", options.ToAccountIDs)
		}
	}
	if options.ConnectionStatus != "" {
		query = query.Where("connection_status = ?", options.ConnectionStatus)
	}
	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := lo.Map(ents, func(ent entity.UserConnection, _ int) *domain.UserConnection {
		return ent.ToDomain()
	})

	return result, nil
}
