package service

import (
	"context"
	"errors"
	"strings"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	apperrors "github.com/finance_app/backend/pkg/errors"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"gorm.io/gorm"
)

type userConnectionService struct {
	dbTransaction      repository.DBTransaction
	userConnectionRepo repository.UserConnectionRepository
	userRepo           repository.UserRepository
	accountRepo        repository.AccountRepository
	services           *Services
}

func NewUserConnectionService(repos *repository.Repositories, services *Services) UserConnectionService {
	return &userConnectionService{
		dbTransaction:      repos.DBTransaction,
		userConnectionRepo: repos.UserConnection,
		userRepo:           repos.User,
		accountRepo:        repos.Account,
		services:           services,
	}
}

func (s *userConnectionService) Create(ctx context.Context, fromUserID, toUserID, fromDefaultSplitPercentage int) (*domain.UserConnection, error) {
	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return nil, apperrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	fromUser, err := s.userRepo.GetByID(ctx, toUserID)
	if err != nil {
		return nil, apperrors.Internal("failed to get to user", err)
	}
	if fromUser == nil {
		return nil, apperrors.NotFound("from user")
	}

	toUser, err := s.userRepo.GetByID(ctx, toUserID)
	if err != nil {
		return nil, apperrors.Internal("failed to get to user", err)
	}
	if toUser == nil {
		return nil, apperrors.NotFound("to user")
	}

	// cria conta para o usuário que está iniciando o pedido de conexão
	fromAccount, err := s.services.Account.Create(ctx, fromUserID, &domain.Account{
		Name:   toUser.Name,
		UserID: fromUserID,
	})
	if err != nil {
		return nil, apperrors.Internal("failed to create from account", err)
	}

	// cria conta para o usuário que está recebendo o pedido de conexão
	toAccount, err := s.services.Account.Create(ctx, toUserID, &domain.Account{
		Name:   fromUser.Name,
		UserID: toUserID,
	})
	if err != nil {
		return nil, apperrors.Internal("failed to create to account", err)
	}

	var userConnection *domain.UserConnection
	if userConnection, err = s.userConnectionRepo.Create(ctx, &domain.UserConnection{
		FromUserID:                 fromUserID,
		FromAccountID:              fromAccount.ID,
		FromDefaultSplitPercentage: fromDefaultSplitPercentage,
		ToUserID:                   toUserID,
		ToAccountID:                toAccount.ID,
		ToDefaultSplitPercentage:   100 - fromDefaultSplitPercentage,
		ConnectionStatus:           domain.UserConnectionStatusPending,
	}); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return nil, apperrors.AlreadyExists("user connection")
		}

		return nil, apperrors.Internal("failed to create user connection", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return nil, apperrors.Internal("failed to commit transaction", err)
	}

	return userConnection, nil
}

func (s *userConnectionService) AcceptInviteByExternalID(ctx context.Context, currentUserID int, inviterExternalID string, fromDefaultSplitPercentage int) (*domain.UserConnection, error) {
	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return nil, apperrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	inviter, err := s.userRepo.GetByExternalID(ctx, inviterExternalID)
	if err != nil {
		return nil, apperrors.Internal("failed to get inviter", err)
	}
	if inviter == nil {
		return nil, apperrors.NotFound("inviter user")
	}

	currentUser, err := s.userRepo.GetByID(ctx, currentUserID)
	if err != nil {
		return nil, apperrors.Internal("failed to get current user", err)
	}
	if currentUser == nil {
		return nil, apperrors.NotFound("current user")
	}

	// create account for the inviter (representing the current user)
	inviterAccount, err := s.services.Account.Create(ctx, inviter.ID, &domain.Account{
		Name:   currentUser.Name,
		UserID: inviter.ID,
	})
	if err != nil {
		return nil, apperrors.Internal("failed to create inviter account", err)
	}

	// create account for the current user (representing the inviter)
	currentUserAccount, err := s.services.Account.Create(ctx, currentUserID, &domain.Account{
		Name:   inviter.Name,
		UserID: currentUserID,
	})
	if err != nil {
		return nil, apperrors.Internal("failed to create current user account", err)
	}

	userConnection, err := s.userConnectionRepo.Create(ctx, &domain.UserConnection{
		FromUserID:                 inviter.ID,
		FromAccountID:              inviterAccount.ID,
		FromDefaultSplitPercentage: fromDefaultSplitPercentage,
		ToUserID:                   currentUserID,
		ToAccountID:                currentUserAccount.ID,
		ToDefaultSplitPercentage:   100 - fromDefaultSplitPercentage,
		ConnectionStatus:           domain.UserConnectionStatusAccepted,
	})
	if err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return nil, apperrors.AlreadyExists("user connection")
		}
		return nil, apperrors.Internal("failed to create user connection", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return nil, apperrors.Internal("failed to commit transaction", err)
	}

	return userConnection, nil
}

func (s *userConnectionService) UpdateStatus(ctx context.Context, userID int, id int, status domain.UserConnectionStatusEnum) error {
	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return apperrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	existing, err := s.userConnectionRepo.Search(ctx, domain.UserConnectionSearchOptions{
		IDs: []int{id},
	})
	if err != nil {
		return apperrors.Internal("failed to search user connection", err)
	}

	if len(existing) == 0 {
		return apperrors.NotFound("user connection")
	}

	if existing[0].ToUserID != userID {
		return apperrors.Forbidden("only user invited can update user connection status")
	}

	existing[0].ConnectionStatus = status

	if err := s.userConnectionRepo.Update(ctx, existing[0]); err != nil {
		return apperrors.Internal("failed to update user connection", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return apperrors.Internal("failed to commit transaction", err)
	}

	return nil
}

// UpdateSettings lets a participant edit, for their own side of the connection,
// the name shown on their connection account and the default split percentage.
// The split is stored complementarily (the other side becomes 100 - value).
func (s *userConnectionService) UpdateSettings(ctx context.Context, userID, id int, accountName string, defaultSplitPercentage int, linkedTransactionDayOfMonth *int) (*domain.UserConnection, error) {
	if strings.TrimSpace(accountName) == "" {
		return nil, apperrors.BadRequest("account name is required")
	}
	if defaultSplitPercentage < 0 || defaultSplitPercentage > 100 {
		return nil, apperrors.BadRequest("default split percentage must be between 0 and 100")
	}
	if linkedTransactionDayOfMonth != nil && (*linkedTransactionDayOfMonth < 1 || *linkedTransactionDayOfMonth > 31) {
		return nil, apperrors.BadRequest("linked transaction day of month must be between 1 and 31")
	}

	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return nil, apperrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	existing, err := s.userConnectionRepo.Search(ctx, domain.UserConnectionSearchOptions{
		IDs: []int{id},
	})
	if err != nil {
		return nil, apperrors.Internal("failed to search user connection", err)
	}
	if len(existing) == 0 {
		return nil, apperrors.NotFound("user connection")
	}

	conn := existing[0]

	// Resolve the caller's side of the connection. The default split is stored
	// from the "from" user's perspective, so map the caller onto the right field.
	var accountID int
	switch userID {
	case conn.FromUserID:
		conn.FromDefaultSplitPercentage = defaultSplitPercentage
		conn.ToDefaultSplitPercentage = 100 - defaultSplitPercentage
		conn.FromLinkedTransactionDayOfMonth = linkedTransactionDayOfMonth
		accountID = conn.FromAccountID
	case conn.ToUserID:
		conn.ToDefaultSplitPercentage = defaultSplitPercentage
		conn.FromDefaultSplitPercentage = 100 - defaultSplitPercentage
		conn.ToLinkedTransactionDayOfMonth = linkedTransactionDayOfMonth
		accountID = conn.ToAccountID
	default:
		return nil, apperrors.Forbidden("only a participant can update this connection")
	}

	// Rename the caller's own connection account (only affects what they see).
	account, err := s.accountRepo.GetByID(ctx, accountID)
	if err != nil {
		return nil, apperrors.Internal("failed to get connection account", err)
	}
	if account == nil {
		return nil, apperrors.NotFound("connection account")
	}
	account.Name = accountName
	if err := s.accountRepo.Update(ctx, account); err != nil {
		return nil, apperrors.Internal("failed to update connection account", err)
	}

	if err := s.userConnectionRepo.Update(ctx, conn); err != nil {
		return nil, apperrors.Internal("failed to update user connection", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return nil, apperrors.Internal("failed to commit transaction", err)
	}

	return conn, nil
}

func (s *userConnectionService) Delete(ctx context.Context, userID, id int) error {
	return s.userConnectionRepo.Delete(ctx, id)
}

func (s *userConnectionService) Search(ctx context.Context, options domain.UserConnectionSearchOptions) ([]*domain.UserConnection, error) {
	return s.userConnectionRepo.Search(ctx, options)
}

func (s *userConnectionService) SearchOne(ctx context.Context, options domain.UserConnectionSearchOptions) (*domain.UserConnection, error) {
	options.Limit = 1
	options.Offset = 0

	conns, err := s.userConnectionRepo.Search(ctx, options)
	if err != nil {
		return nil, err
	}

	if len(conns) == 0 {
		return nil, pkgErrors.NotFound("user connection")
	}
	return conns[0], nil
}
