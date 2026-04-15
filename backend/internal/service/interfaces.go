package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
)

type UserService interface {
	GetByExternalID(ctx context.Context, externalID string) (*domain.User, error)
}

type AuthService interface {
	OAuthCallback(ctx context.Context, provider string, user *domain.User, providerID string) (*domain.User, string, error)
	ValidateToken(ctx context.Context, token string) (*domain.User, error)
	// TestLogin upserts a user by email and returns a JWT. Only for non-production use.
	TestLogin(ctx context.Context, email string) (string, error)
}

type TransactionService interface {
	Create(ctx context.Context, userID int, transaction *domain.TransactionCreateRequest) (int, error)
	Update(ctx context.Context, userID, id int, transaction *domain.TransactionUpdateRequest) error
	Search(ctx context.Context, userID int, period domain.Period, filter domain.TransactionFilter) ([]*domain.Transaction, error)
	Suggestions(ctx context.Context, userID int, filter domain.TransactionFilter) ([]*domain.Transaction, error)
	Delete(ctx context.Context, userID int, id int, propagationSettings domain.TransactionPropagationSettings) error
	GetBalance(ctx context.Context, userID int, period domain.Period, filter domain.BalanceFilter) (*domain.BalanceResult, error)
	ParseImportCSV(ctx context.Context, userID, accountID int, decimalSeparator domain.ImportDecimalSeparatorValue, typeDefinitionRule domain.ImportTypeDefinitionRule, csvData []byte) (*domain.ImportCSVResponse, error)
	CheckDuplicateTransaction(ctx context.Context, userID int, date string, description string, amount int64, accountID *int) (bool, error)
}

type AccountService interface {
	Create(ctx context.Context, userID int, account *domain.Account) (*domain.Account, error)
	GetByID(ctx context.Context, userID, id int) (*domain.Account, error)
	Search(ctx context.Context, options domain.AccountSearchOptions) ([]*domain.Account, error)
	SearchOne(ctx context.Context, options domain.AccountSearchOptions) (*domain.Account, error)
	Update(ctx context.Context, userID int, account *domain.Account) error
	Delete(ctx context.Context, userID, id int) error
	Activate(ctx context.Context, userID, id int) error
}

type CategoryService interface {
	Create(ctx context.Context, userID int, category *domain.Category) (*domain.Category, error)
	GetByID(ctx context.Context, userID, id int) (domain.Category, error)
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
	Delete(ctx context.Context, userID, id int) error
	Search(ctx context.Context, options domain.UserConnectionSearchOptions) ([]*domain.UserConnection, error)
	SearchOne(ctx context.Context, options domain.UserConnectionSearchOptions) (*domain.UserConnection, error)
}

type SettlementService interface {
	Search(ctx context.Context, filter domain.SettlementFilter) ([]*domain.Settlement, error)
	SearchOne(ctx context.Context, filter domain.SettlementFilter) (*domain.Settlement, error)
	Create(ctx context.Context, settlement *domain.Settlement) (*domain.Settlement, error)
	Update(ctx context.Context, settlement *domain.Settlement) error
	Delete(ctx context.Context, ids []int) error
}

type ChargeService interface {
	Create(ctx context.Context, callerUserID int, req *domain.CreateChargeRequest) (*domain.Charge, error)
	Cancel(ctx context.Context, callerUserID, chargeID int) error
	Reject(ctx context.Context, callerUserID, chargeID int) error
	List(ctx context.Context, options domain.ChargeSearchOptions) ([]*domain.Charge, error)
	PendingCount(ctx context.Context, callerUserID int) (int64, error)
	Accept(ctx context.Context, callerUserID int, chargeID int, req *domain.AcceptChargeRequest) error
}

// Services contains all service interfaces
type Services struct {
	Auth           AuthService
	User           UserService
	Account        AccountService
	Category       CategoryService
	Tag            TagService
	Transaction    TransactionService
	UserConnection UserConnectionService
	Settlement     SettlementService
	Charge         ChargeService
}
