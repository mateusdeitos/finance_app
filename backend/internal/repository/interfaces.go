package repository

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
)

type UserRepository interface {
	Create(ctx context.Context, user *domain.User) (*domain.User, error)
	GetByID(ctx context.Context, id int) (*domain.User, error)
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	Update(ctx context.Context, user *domain.User) error
	Delete(ctx context.Context, id int) error
}

type UserSocialRepository interface {
	Create(ctx context.Context, userSocial *domain.UserSocial) error
	GetByProviderID(ctx context.Context, provider domain.ProviderType, providerID string) (*domain.UserSocial, error)
	GetByUserID(ctx context.Context, userID int) ([]*domain.UserSocial, error)
	Delete(ctx context.Context, userID int, provider domain.ProviderType) error
}

type AccountRepository interface {
	Create(ctx context.Context, account *domain.Account) (*domain.Account, error)
	GetByID(ctx context.Context, id int) (*domain.Account, error)
	GetByUserID(ctx context.Context, userID int) ([]*domain.Account, error)
	GetSharedAccounts(ctx context.Context, userID int) ([]*domain.Account, error)
	Update(ctx context.Context, account *domain.Account) error
	Delete(ctx context.Context, id int) error
}

type CategoryRepository interface {
	Create(ctx context.Context, category *domain.Category) (*domain.Category, error)
	GetByID(ctx context.Context, id int) (*domain.Category, error)
	GetByUserID(ctx context.Context, userID int) ([]*domain.Category, error)
	GetByUserIDWithChildren(ctx context.Context, userID int) ([]*domain.Category, error)
	Update(ctx context.Context, category *domain.Category) error
	Delete(ctx context.Context, id int) error
}

type TagRepository interface {
	Create(ctx context.Context, tag *domain.Tag) (*domain.Tag, error)
	GetByID(ctx context.Context, id int) (*domain.Tag, error)
	GetByUserID(ctx context.Context, userID int) ([]*domain.Tag, error)
	GetByIDs(ctx context.Context, ids []int) ([]*domain.Tag, error)
	GetByName(ctx context.Context, userID int, name string) (*domain.Tag, error)
	Update(ctx context.Context, tag *domain.Tag) error
	Delete(ctx context.Context, id int) error
}

type TransactionRepository interface {
	Create(ctx context.Context, transaction *domain.Transaction) (*domain.Transaction, error)
	GetByID(ctx context.Context, id int) (*domain.Transaction, error)
	GetByFilter(ctx context.Context, filter domain.TransactionFilter, orderBy domain.TransactionOrderBy, limit, offset int) ([]*domain.Transaction, int64, error)
	GetGrouped(ctx context.Context, filter domain.TransactionFilter, groupBy domain.TransactionGroupBy) (map[string][]*domain.Transaction, error)
	Update(ctx context.Context, transaction *domain.Transaction) error
	BulkUpdate(ctx context.Context, updates domain.BulkUpdateTransaction) error
	Delete(ctx context.Context, id int) error
	GetByDescription(ctx context.Context, userID int, description string, limit int) ([]*domain.Transaction, error)
}

type TransactionRecurrenceRepository interface {
	Create(ctx context.Context, recurrence *domain.TransactionRecurrence) error
	GetByTransactionID(ctx context.Context, transactionID int) ([]*domain.TransactionRecurrence, error)
	DeleteByTransactionID(ctx context.Context, transactionID int) error
}

type UserSettingsRepository interface {
	GetByUserID(ctx context.Context, userID int) (*domain.UserSettings, error)
	CreateOrUpdate(ctx context.Context, settings *domain.UserSettings) error
}

// Repositories contains all repository interfaces
type Repositories struct {
	User                UserRepository
	UserSocial          UserSocialRepository
	Account             AccountRepository
	Category            CategoryRepository
	Tag                 TagRepository
	Transaction         TransactionRepository
	TransactionRecurrence TransactionRecurrenceRepository
	UserSettings        UserSettingsRepository
}

