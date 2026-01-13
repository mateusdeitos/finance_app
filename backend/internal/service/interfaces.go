package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
)

type AuthService interface {
	OAuthCallback(ctx context.Context, provider string, user *domain.User, providerID string) (*domain.User, string, error)
	ValidateToken(ctx context.Context, token string) (*domain.User, error)
}

type TransactionService interface {
	Create(ctx context.Context, userID int, transaction *domain.TransactionCreateRequest) error
	Search(ctx context.Context, userID int, period domain.Period, filter domain.TransactionFilter) ([]*domain.Transaction, error)
	Delete(ctx context.Context, userID int, id int, propagationSettings domain.TransactionPropagationSettings) error
}

type AccountService interface {
	Create(ctx context.Context, userID int, account *domain.Account) (*domain.Account, error)
	GetByID(ctx context.Context, userID, id int) (*domain.Account, error)
	Search(ctx context.Context, options domain.AccountSearchOptions) ([]*domain.Account, error)
	Update(ctx context.Context, userID int, account *domain.Account) error
	Delete(ctx context.Context, userID, id int) error
}

type CategoryService interface {
	Create(ctx context.Context, userID int, category *domain.Category) (*domain.Category, error)
	GetByID(ctx context.Context, userID, id int) (domain.Category, error)
	Search(ctx context.Context, options domain.CategorySearchOptions) ([]*domain.Category, error)
	Update(ctx context.Context, userID int, category *domain.Category) error
	Delete(ctx context.Context, userID, id int) error
}

type TagService interface {
	Create(ctx context.Context, userID int, tag *domain.Tag) (*domain.Tag, error)
	Update(ctx context.Context, userID int, tag *domain.Tag) error
	Delete(ctx context.Context, userID, id int) error
	Search(ctx context.Context, options domain.TagSearchOptions) ([]*domain.Tag, error)
}

type UserConnectionService interface {
	Create(ctx context.Context, fromUserID, toUserID, fromDefaultSplitPercentage int) (*domain.UserConnection, error)
	UpdateStatus(ctx context.Context, userID int, id int, status domain.UserConnectionStatusEnum) error
	Delete(ctx context.Context, userID, id int) error
	Search(ctx context.Context, options domain.UserConnectionSearchOptions) ([]*domain.UserConnection, error)
}

// Services contains all service interfaces
type Services struct {
	Auth           AuthService
	Account        AccountService
	Category       CategoryService
	Tag            TagService
	Transaction    TransactionService
	UserConnection UserConnectionService
}
