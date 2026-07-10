package service

import (
	"context"
	"time"

	"github.com/finance_app/backend/internal/domain"
)

type UserService interface {
	GetByExternalID(ctx context.Context, externalID string) (*domain.User, error)
}

type AuthService interface {
	OAuthCallback(ctx context.Context, provider string, user *domain.User, providerID string) (*domain.User, string, error)
	// ValidateToken authenticates a JWT. For a normal token it returns the user
	// and a nil impersonator. For an impersonation token it returns the
	// impersonated (target) user plus the acting admin as the impersonator,
	// after verifying the backing session is still active.
	ValidateToken(ctx context.Context, token string) (*domain.User, *domain.Impersonator, error)
	// TestLogin upserts a user by email and returns a JWT. Only for non-production use.
	TestLogin(ctx context.Context, email string) (string, error)
}

// ImpersonationService issues and revokes admin impersonation sessions.
type ImpersonationService interface {
	// Start verifies the caller is an admin, that the target exists and is not
	// an admin, records an audit session, and returns a short-lived token that
	// authenticates as the target while carrying the admin as `act`.
	Start(ctx context.Context, adminUserID, targetUserID int, reason, ipAddress, userAgent string) (*domain.StartImpersonationResult, error)
	// Stop revokes the given session. actorAdminID must own the session.
	// Idempotent: revoking an already-revoked session is a no-op.
	Stop(ctx context.Context, sessionID string, actorAdminID int) error
	// SearchUsers backs the admin user picker.
	SearchUsers(ctx context.Context, query string, limit int) ([]*domain.User, error)
}

type TransactionService interface {
	Create(ctx context.Context, userID int, transaction *domain.TransactionCreateRequest) (int, error)
	Update(ctx context.Context, userID, id int, transaction *domain.TransactionUpdateRequest) error
	Search(ctx context.Context, userID int, period domain.Period, filter domain.TransactionFilter) ([]*domain.Transaction, error)
	Suggestions(ctx context.Context, userID int, filter domain.TransactionFilter) ([]*domain.Transaction, error)
	Delete(ctx context.Context, userID int, id int, propagationSettings domain.TransactionPropagationSettings) error
	GetBalance(ctx context.Context, userID int, period domain.Period, filter domain.BalanceFilter) (*domain.BalanceResult, error)
	ParseImportCSV(ctx context.Context, userID, accountID int, typeDefinitionRule domain.ImportTypeDefinitionRule, csvData []byte) (*domain.ImportCSVResponse, error)
	CheckDuplicatesBulk(ctx context.Context, userID int, accountID *int, rows []domain.CheckDuplicateRowInput) ([]domain.CheckDuplicateRowResult, error)
}

type AccountService interface {
	Create(ctx context.Context, userID int, account *domain.Account) (*domain.Account, error)
	GetByID(ctx context.Context, userID, id int) (*domain.Account, error)
	Search(ctx context.Context, options domain.AccountSearchOptions) ([]*domain.Account, error)
	SearchOne(ctx context.Context, options domain.AccountSearchOptions) (*domain.Account, error)
	Update(ctx context.Context, userID int, account *domain.Account) error
	// Deactivate soft-disables an account (is_active = false) without removing data.
	Deactivate(ctx context.Context, userID, id int) error
	// Delete permanently removes an account. When the account has transactions the
	// caller must pick a strategy (delete the transactions, or migrate them to
	// targetAccountID). Connection accounts cannot be deleted.
	Delete(ctx context.Context, userID, id int, strategy domain.AccountDeletionStrategy, targetAccountID *int) error
	// GetDeletionInfo reports the impact of deleting the account (e.g. linked
	// transaction count) so the client can prompt before a destructive delete.
	GetDeletionInfo(ctx context.Context, userID, id int) (*domain.AccountDeletionInfo, error)
	Activate(ctx context.Context, userID, id int) error
	Reorder(ctx context.Context, userID int, orderedIDs []int) error
}

type CategoryService interface {
	Create(ctx context.Context, userID int, category *domain.Category) (*domain.Category, error)
	GetByID(ctx context.Context, userID, id int) (domain.Category, error)
	GetTree(ctx context.Context, options domain.CategorySearchOptions) ([]*domain.Category, error)
	Search(ctx context.Context, options domain.CategorySearchOptions) ([]*domain.Category, error)
	Update(ctx context.Context, userID int, category *domain.Category) error
	Delete(ctx context.Context, userID, id int, req domain.DeleteCategoryRequest) error
}

type TagService interface {
	Create(ctx context.Context, userID int, tag *domain.Tag) (*domain.Tag, error)
	Update(ctx context.Context, userID int, tag *domain.Tag) error
	Delete(ctx context.Context, userID, id int) error
	Search(ctx context.Context, options domain.TagSearchOptions) ([]*domain.Tag, error)
}

type UserConnectionService interface {
	Create(ctx context.Context, fromUserID, toUserID, fromDefaultSplitPercentage int) (*domain.UserConnection, error)
	AcceptInviteByExternalID(ctx context.Context, currentUserID int, inviterExternalID string, fromDefaultSplitPercentage int) (*domain.UserConnection, error)
	UpdateStatus(ctx context.Context, userID int, id int, status domain.UserConnectionStatusEnum) error
	UpdateSettings(ctx context.Context, userID, id int, accountName string, defaultSplitPercentage int, linkedTransactionDayOfMonth *int) (*domain.UserConnection, error)
	Delete(ctx context.Context, userID, id int) error
	Search(ctx context.Context, options domain.UserConnectionSearchOptions) ([]*domain.UserConnection, error)
	SearchOne(ctx context.Context, options domain.UserConnectionSearchOptions) (*domain.UserConnection, error)
}

type SettlementService interface {
	Search(ctx context.Context, filter domain.SettlementFilter) ([]*domain.Settlement, error)
	SearchOne(ctx context.Context, filter domain.SettlementFilter) (*domain.Settlement, error)
	Create(ctx context.Context, settlement *domain.Settlement) (*domain.Settlement, error)
	Update(ctx context.Context, settlement *domain.Settlement) error
	UpdateDate(ctx context.Context, callerUserID, id int, date time.Time) error
	Delete(ctx context.Context, ids []int) error
}

type ChargeService interface {
	Create(ctx context.Context, callerUserID int, req *domain.CreateChargeRequest) (*domain.Charge, error)
	Cancel(ctx context.Context, callerUserID, chargeID int) error
	Reject(ctx context.Context, callerUserID, chargeID int) error
	Delete(ctx context.Context, callerUserID, chargeID int) error
	List(ctx context.Context, options domain.ChargeSearchOptions) ([]*domain.Charge, error)
	PendingCount(ctx context.Context, callerUserID int) (int64, error)
	Accept(ctx context.Context, callerUserID int, chargeID int, req *domain.AcceptChargeRequest) error
}

type OnboardingService interface {
	GetStatus(ctx context.Context, userID int) (*domain.OnboardingStatus, error)
	Complete(ctx context.Context, userID int, req *domain.OnboardingSetupRequest) error
}

type PushSubscriptionService interface {
	Subscribe(ctx context.Context, userID int, req *domain.SubscribePushRequest) error
	Unsubscribe(ctx context.Context, userID int, endpoint string) error
	Status(ctx context.Context, userID int, endpoint string) (*domain.PushSubscriptionStatusResponse, error)
}

type NotificationService interface {
	// Dispatch persists inbox rows and sends push notifications best-effort.
	// Always called in a goroutine with context.Background() — never the request ctx.
	Dispatch(ctx context.Context, events []domain.NotificationEvent)
	// SendTest delivers a sample push notification to the user's own
	// subscriptions so they can preview how notifications render. Display-only:
	// no inbox row is persisted.
	SendTest(ctx context.Context, userID int) error
	List(ctx context.Context, userID int, filter domain.NotificationFilter) (*domain.NotificationListResult, error)
	UnreadCount(ctx context.Context, userID int) (int64, error)
	MarkRead(ctx context.Context, userID, notificationID int) error
	MarkAllRead(ctx context.Context, userID int) error
	Delete(ctx context.Context, userID, notificationID int) error
	DeleteAllRead(ctx context.Context, userID int) error
}

// TransactionTemplateService is the security + validation boundary for
// per-user transaction templates. userID is always the second parameter
// (first after ctx) — SEE the SECURITY (IDOR) comment on every method in
// transaction_template_service.go: userID must come from the auth context,
// never from the request/DTO.
type TransactionTemplateService interface {
	List(ctx context.Context, userID int) ([]*domain.TransactionTemplate, error)
	Create(ctx context.Context, userID int, name string, payload domain.TransactionTemplatePayload) (*domain.TransactionTemplate, error)
	Update(ctx context.Context, userID, id int, name string, payload domain.TransactionTemplatePayload) error
	Delete(ctx context.Context, userID, id int) error
}

// Services contains all service interfaces
type Services struct {
	Auth                AuthService
	User                UserService
	Account             AccountService
	Category            CategoryService
	Tag                 TagService
	Transaction         TransactionService
	UserConnection      UserConnectionService
	Settlement          SettlementService
	Charge              ChargeService
	Onboarding          OnboardingService
	PushSubscription    PushSubscriptionService
	Notification        NotificationService
	TransactionTemplate TransactionTemplateService
	Impersonation       ImpersonationService
}
