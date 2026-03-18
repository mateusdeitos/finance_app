package service

import (
	"context"
	"errors"

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
	services           *Services
}

func NewUserConnectionService(repos *repository.Repositories, services *Services) UserConnectionService {
	return &userConnectionService{
		dbTransaction:      repos.DBTransaction,
		userConnectionRepo: repos.UserConnection,
		userRepo:           repos.User,
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
		ToDefaultSplitPercentage:   fromDefaultSplitPercentage,
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
		ToDefaultSplitPercentage:   fromDefaultSplitPercentage,
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
