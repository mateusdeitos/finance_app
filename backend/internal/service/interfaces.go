package service

import (
	"context"
	"io"

	"github.com/finance_app/backend/internal/domain"
)

type AuthService interface {
	OAuthCallback(ctx context.Context, provider string, user *domain.User, providerID string) (*domain.User, string, error)
	ValidateToken(ctx context.Context, token string) (*domain.User, error)
}

type TransactionService interface {
	Create(ctx context.Context, userID int, transaction *domain.Transaction) (*domain.Transaction, error)
	GetByID(ctx context.Context, userID, id int) (*domain.Transaction, error)
	List(ctx context.Context, userID int, filter domain.TransactionFilter, orderBy domain.TransactionOrderBy, limit, offset int) ([]*domain.Transaction, int64, error)
	GetGrouped(ctx context.Context, userID int, filter domain.TransactionFilter, groupBy domain.TransactionGroupBy) (map[string][]*domain.Transaction, error)
	Update(ctx context.Context, userID int, transaction *domain.Transaction) error
	BulkUpdate(ctx context.Context, userID int, updates domain.BulkUpdateTransaction) error
	Delete(ctx context.Context, userID, id int) error
	ImportCSV(ctx context.Context, userID int, reader io.Reader) ([]*domain.Transaction, error)
	SuggestCategory(ctx context.Context, userID int, description string) (*domain.Category, error)
	CreateRecurring(ctx context.Context, userID int, transaction *domain.Transaction, config domain.TransactionRecurrenceConfig) ([]*domain.Transaction, error)
}

type AccountService interface {
	Create(ctx context.Context, userID int, account *domain.Account) (*domain.Account, error)
	GetByID(ctx context.Context, userID, id int) (*domain.Account, error)
	List(ctx context.Context, userID int) ([]*domain.Account, error)
	Update(ctx context.Context, userID int, account *domain.Account) error
	Delete(ctx context.Context, userID, id int) error
	Share(ctx context.Context, userID, accountID int, sharedWithUserID int, splitPercentage *int) error
}

type CategoryService interface {
	Create(ctx context.Context, userID int, category *domain.Category) (*domain.Category, error)
	GetByID(ctx context.Context, userID, id int) (*domain.Category, error)
	List(ctx context.Context, userID int) ([]*domain.Category, error)
	Update(ctx context.Context, userID int, category *domain.Category) error
	Delete(ctx context.Context, userID, id int) error
}

type TagService interface {
	Create(ctx context.Context, userID int, tag *domain.Tag) (*domain.Tag, error)
	GetByID(ctx context.Context, userID, id int) (*domain.Tag, error)
	List(ctx context.Context, userID int) ([]*domain.Tag, error)
	Update(ctx context.Context, userID int, tag *domain.Tag) error
	Delete(ctx context.Context, userID, id int) error
}

// Services contains all service interfaces
type Services struct {
	Auth        AuthService
	Account     AccountService
	Category    CategoryService
	Tag         TagService
	Transaction TransactionService
}
