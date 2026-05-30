package repository

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
)

type DBTransaction interface {
	Begin(ctx context.Context) (context.Context, error)
	Commit(ctx context.Context) error
	Rollback(ctx context.Context) error
}

type UserRepository interface {
	Create(ctx context.Context, user *domain.User) (*domain.User, error)
	GetByID(ctx context.Context, id int) (*domain.User, error)
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	GetByExternalID(ctx context.Context, externalID string) (*domain.User, error)
	Update(ctx context.Context, user *domain.User) error
	Delete(ctx context.Context, id int) error
}

type UserSocialRepository interface {
	Create(ctx context.Context, userSocial *domain.UserSocial) error
	GetByProviderID(ctx context.Context, provider domain.ProviderType, providerID string) (*domain.UserSocial, error)
	GetByUserID(ctx context.Context, userID int) ([]*domain.UserSocial, error)
	Delete(ctx context.Context, userID int, provider domain.ProviderType) error
}

type UserConnectionRepository interface {
	Create(ctx context.Context, userConnection *domain.UserConnection) (*domain.UserConnection, error)
	Update(ctx context.Context, userConnection *domain.UserConnection) error
	Delete(ctx context.Context, id int) error
	Search(ctx context.Context, options domain.UserConnectionSearchOptions) ([]*domain.UserConnection, error)
}

type AccountRepository interface {
	Create(ctx context.Context, account *domain.Account) (*domain.Account, error)
	GetByID(ctx context.Context, id int) (*domain.Account, error)
	GetByUserID(ctx context.Context, userID int) ([]*domain.Account, error)
	GetSharedAccounts(ctx context.Context, userID int) ([]*domain.Account, error)
	Update(ctx context.Context, account *domain.Account) error
	Delete(ctx context.Context, id int) error
	Deactivate(ctx context.Context, id int) error
	Activate(ctx context.Context, id int) error
	Search(ctx context.Context, options domain.AccountSearchOptions) ([]*domain.Account, error)
}

type CategoryRepository interface {
	Create(ctx context.Context, category *domain.Category) (*domain.Category, error)
	Search(ctx context.Context, options domain.CategorySearchOptions) ([]*domain.Category, error)
	Update(ctx context.Context, category *domain.Category) error
	Delete(ctx context.Context, id int) error
}

type TagRepository interface {
	Create(ctx context.Context, tag *domain.Tag) (*domain.Tag, error)
	Update(ctx context.Context, tag *domain.Tag) error
	Delete(ctx context.Context, id int) error
	Search(ctx context.Context, options domain.TagSearchOptions) ([]*domain.Tag, error)
}

type TransactionRepository interface { //nolint:interfacebloat // transaction is the domain root; related reads/writes naturally cluster here
	Create(ctx context.Context, transaction *domain.Transaction) (*domain.Transaction, error)
	Update(ctx context.Context, transaction *domain.Transaction) error
	Search(ctx context.Context, filter domain.TransactionFilter) ([]*domain.Transaction, error)
	SearchOne(ctx context.Context, filter domain.TransactionFilter) (*domain.Transaction, error)
	FindOrphanedSettlementTransactions(ctx context.Context, filter domain.TransactionFilter) ([]*domain.Transaction, error)
	Delete(ctx context.Context, ids []int) error
	GetGroupedByRecurrences(ctx context.Context, userID *int, recurrenceIDs []int) (map[int][]*domain.Transaction, error)
	GetSourceTransactionIDs(ctx context.Context, linkedTransactionID int) ([]int, error)
	GetBalance(ctx context.Context, filter domain.BalanceFilter) (*domain.BalanceResult, error)
	NullifyCategory(ctx context.Context, categoryID int) error
	ReassignCategory(ctx context.Context, fromID, toID int) error
}

type TransactionRecurrenceRepository interface {
	Create(ctx context.Context, recurrence *domain.TransactionRecurrence) (*domain.TransactionRecurrence, error)
	Update(ctx context.Context, recurrence *domain.TransactionRecurrence) error
	Delete(ctx context.Context, ids []int) error
	Search(ctx context.Context, filter domain.TransactionRecurrenceFilter) ([]*domain.TransactionRecurrence, error)
}

type UserSettingsRepository interface {
	GetByUserID(ctx context.Context, userID int) (*domain.UserSettings, error)
	CreateOrUpdate(ctx context.Context, settings *domain.UserSettings) error
}

type SettlementRepository interface {
	Search(ctx context.Context, filter domain.SettlementFilter) ([]*domain.Settlement, error)
	Create(ctx context.Context, settlement *domain.Settlement) (*domain.Settlement, error)
	Update(ctx context.Context, settlement *domain.Settlement) error
	Delete(ctx context.Context, ids []int) error
}

type ChargeRepository interface {
	Create(ctx context.Context, charge *domain.Charge) (*domain.Charge, error)
	GetByID(ctx context.Context, id int) (*domain.Charge, error)
	Search(ctx context.Context, options domain.ChargeSearchOptions) ([]*domain.Charge, error)
	Update(ctx context.Context, charge *domain.Charge) error
	Count(ctx context.Context, options domain.ChargeSearchOptions) (int64, error)
	ConditionalAccept(ctx context.Context, id int) error
}

// PushSubscriptionRepository manages push subscription persistence.
// DeleteByEndpoint is IDOR-scoped (user_id + endpoint); DeleteByEndpointAdmin
// is intentionally unscoped and must only be called by internal server-side
// pruning logic after a 404/410 response from the push service (Phase 23).
type PushSubscriptionRepository interface {
	// Upsert inserts or updates a push subscription keyed on endpoint.
	// DESIGN: endpoint is globally unique (not per-user).  On conflict the row,
	// including user_id, is reassigned to the latest subscriber.  This
	// intentionally supports shared-device re-registration (e.g. partners
	// sharing one browser): when the same browser re-registers its push
	// subscription, the row is transferred to whoever is currently logged in.
	// The push endpoint is an unguessable per-browser secret never exposed by
	// any API, so cross-user takeover requires already possessing that secret.
	// See research pitfall 1 in 22-RESEARCH.md.
	Upsert(ctx context.Context, sub *domain.PushSubscription) error
	DeleteByEndpoint(ctx context.Context, userID int, endpoint string) error
	DeleteByEndpointAdmin(ctx context.Context, endpoint string) error
	ExistsForUser(ctx context.Context, userID int, endpoint string) (bool, error)
	// ListByUserID returns all active subscriptions for a recipient user.
	// Called from the dispatch goroutine; no IDOR guard needed (internal call only).
	ListByUserID(ctx context.Context, userID int) ([]*domain.PushSubscription, error)
}

type NotificationRepository interface {
	Create(ctx context.Context, notification *domain.Notification) (*domain.Notification, error)
	List(ctx context.Context, filter domain.NotificationFilter) (*domain.NotificationListResult, error)
	UnreadCount(ctx context.Context, userID int) (int64, error)
	MarkRead(ctx context.Context, userID, notificationID int) error
	MarkAllRead(ctx context.Context, userID int) error
}

// Repositories contains all repository interfaces
type Repositories struct {
	DBTransaction         DBTransaction
	User                  UserRepository
	UserSocial            UserSocialRepository
	Account               AccountRepository
	Category              CategoryRepository
	Tag                   TagRepository
	Transaction           TransactionRepository
	TransactionRecurrence TransactionRecurrenceRepository
	UserSettings          UserSettingsRepository
	UserConnection        UserConnectionRepository
	Settlement            SettlementRepository
	Charge                ChargeRepository
	PushSubscription      PushSubscriptionRepository
	Notification          NotificationRepository
}
