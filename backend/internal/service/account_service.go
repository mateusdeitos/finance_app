package service

import (
	"context"

	pkgErrors "github.com/finance_app/backend/pkg/errors"

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
	return s.accountRepo.Create(ctx, account)
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

	account.UserID = existing.UserID

	if err := s.accountRepo.Update(ctx, account); err != nil {
		return pkgErrors.Internal("failed to update account", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}

	return nil
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
