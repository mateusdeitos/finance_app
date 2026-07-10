package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type userRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	ent := entity.UserFromDomain(user)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *userRepository) GetByID(ctx context.Context, id int) (*domain.User, error) {
	var ent entity.User
	if err := GetTxFromContext(ctx, r.db).First(&ent, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *userRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	var ent entity.User
	if err := GetTxFromContext(ctx, r.db).Where("email = ?", email).First(&ent).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *userRepository) GetByExternalID(ctx context.Context, externalID string) (*domain.User, error) {
	var ent entity.User
	if err := GetTxFromContext(ctx, r.db).Where("external_id = ?", externalID).First(&ent).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *userRepository) Update(ctx context.Context, user *domain.User) error {
	ent := entity.UserFromDomain(user)
	return GetTxFromContext(ctx, r.db).Save(ent).Error
}

func (r *userRepository) Delete(ctx context.Context, id int) error {
	return GetTxFromContext(ctx, r.db).Delete(&entity.User{}, id).Error
}

func (r *userRepository) Search(ctx context.Context, query string, limit int) ([]*domain.User, error) {
	if limit <= 0 {
		limit = 20
	}
	q := GetTxFromContext(ctx, r.db).Model(&entity.User{}).Order("name ASC").Limit(limit)
	if trimmed := strings.TrimSpace(query); trimmed != "" {
		like := "%" + strings.ToLower(trimmed) + "%"
		q = q.Where("LOWER(name) LIKE ? OR LOWER(email) LIKE ?", like, like)
	}

	var ents []entity.User
	if err := q.Find(&ents).Error; err != nil {
		return nil, err
	}

	users := make([]*domain.User, 0, len(ents))
	for i := range ents {
		users = append(users, ents[i].ToDomain())
	}
	return users, nil
}
