package service

import (
	"context"

	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
)

type accountService struct {
	dbTransaction repository.DBTransaction
	accountRepo   repository.AccountRepository
	userRepo      repository.UserRepository
}

func NewAccountService(repos *repository.Repositories) AccountService {
	return &accountService{
		dbTransaction: repos.DBTransaction,
		accountRepo:   repos.Account,
		userRepo:      repos.User,
	}
}

func (s *accountService) Create(ctx context.Context, userID int, account *domain.Account) (*domain.Account, error) {
	account.UserID = userID
	account.ID = 0

	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return nil, pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	if account.SharedWithUserID != nil {
		if *account.SharedWithUserID == userID {
			return nil, pkgErrors.BadRequest("cannot share account with yourself")
		}

		sharedUser, err := s.userRepo.GetByID(ctx, *account.SharedWithUserID)
		if err != nil {
			return nil, pkgErrors.Internal("failed to get shared user", err)
		}
		if sharedUser == nil {
			return nil, pkgErrors.NotFound("shared user")
		}

		account.SharedAllowed = false
	}

	createdAccount, err := s.accountRepo.Create(ctx, account)
	if err != nil {
		return nil, pkgErrors.Internal("failed to create account", err)
	}

	err = s.dbTransaction.Commit(ctx)
	if err != nil {
		return nil, pkgErrors.Internal("failed to commit transaction", err)
	}

	return createdAccount, nil
}

func (s *accountService) GetByID(ctx context.Context, userID, id int) (*domain.Account, error) {
	account, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return nil, pkgErrors.Internal("failed to get account", err)
	}
	if account == nil {
		return nil, pkgErrors.NotFound("account")
	}

	return account, nil
}

func (s *accountService) List(ctx context.Context, userID int) ([]*domain.Account, error) {
	return s.accountRepo.GetByUserID(ctx, userID)
}

func (s *accountService) Update(ctx context.Context, userID int, account *domain.Account) error {
	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	existing, err := s.GetByID(ctx, userID, account.ID)
	if err != nil {
		return err
	}

	if existing == nil {
		return pkgErrors.NotFound("account")
	}

	// Only owner can update
	if existing.UserID != userID {
		return pkgErrors.Forbidden("only account owner can update")
	}

	// Não permite mudar o usuário compartilhado
	if existing.SharedWithUserID != nil && account.SharedWithUserID != nil && lo.FromPtr(existing.SharedWithUserID) != lo.FromPtr(account.SharedWithUserID) {
		return pkgErrors.BadRequest("cannot change shared user")
	}

	// Caso o usuário compartilhe a conta para outro usuário, cria uma nova conta para o usuário compartilhado
	if account.SharedWithUserID != nil && *account.SharedWithUserID != userID {
		account.SharedAllowed = false
		user, err := s.userRepo.GetByID(ctx, *account.SharedWithUserID)
		if err != nil {
			return pkgErrors.Internal("failed to get shared user", err)
		}
		if user == nil {
			return pkgErrors.NotFound("shared user")
		}
	} else {
		account.SharedWithUserID = nil
	}

	account.UserID = existing.UserID

	if err := s.accountRepo.Update(ctx, account); err != nil {
		return pkgErrors.Internal("failed to update account", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}

	return nil
}

func (s *accountService) AcceptSharedAccount(ctx context.Context, userID, id int) error {
	account, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}

	if lo.FromPtr(account.SharedWithUserID) != userID {
		return pkgErrors.Forbidden("account is not shared with user to accept")
	}

	account.SharedAllowed = true
	account.SharedWithUserID = &userID
	return s.accountRepo.Update(ctx, account)
}

func (s *accountService) Delete(ctx context.Context, userID, id int) error {
	// Verify ownership
	existing, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}

	// Only owner can delete
	if existing.UserID != userID {
		return pkgErrors.Forbidden("only account owner can delete")
	}

	return s.accountRepo.Delete(ctx, id)
}
