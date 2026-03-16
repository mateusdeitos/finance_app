package service

import (
	"context"

	pkgErrors "github.com/finance_app/backend/pkg/errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
)

type accountService struct {
	dbTransaction      repository.DBTransaction
	accountRepo        repository.AccountRepository
	userRepo           repository.UserRepository
	userConnectionRepo repository.UserConnectionRepository
}

func NewAccountService(repos *repository.Repositories) AccountService {
	return &accountService{
		dbTransaction:      repos.DBTransaction,
		accountRepo:        repos.Account,
		userRepo:           repos.User,
		userConnectionRepo: repos.UserConnection,
	}
}

// isConnectionAccount returns true when the account is referenced by any user_connection.
func (s *accountService) isConnectionAccount(ctx context.Context, accountID int) (bool, error) {
	conns, err := s.userConnectionRepo.Search(ctx, domain.UserConnectionSearchOptions{
		AccountIDs: []int{accountID},
	})
	if err != nil {
		return false, err
	}
	return len(conns) > 0, nil
}

func (s *accountService) Create(ctx context.Context, userID int, account *domain.Account) (*domain.Account, error) {
	account.UserID = userID

	if account.InitialBalance != 0 {
		isConn, err := s.isConnectionAccount(ctx, account.ID)
		if err != nil {
			return nil, pkgErrors.Internal("failed to check connection account", err)
		}
		if isConn {
			return nil, pkgErrors.BadRequest("initial balance cannot be set on connection accounts")
		}
	}

	return s.accountRepo.Create(ctx, account)
}

func (s *accountService) GetByID(ctx context.Context, userID, id int) (*domain.Account, error) {
	accounts, err := s.accountRepo.Search(ctx, domain.AccountSearchOptions{
		UserIDs: []int{userID},
		IDs:     []int{id},
	})
	if err != nil {
		return nil, pkgErrors.Internal("failed to get account", err)
	}
	if len(accounts) == 0 {
		return nil, pkgErrors.NotFound("account")
	}

	return accounts[0], nil
}

func (s *accountService) Search(ctx context.Context, options domain.AccountSearchOptions) ([]*domain.Account, error) {
	return s.accountRepo.Search(ctx, options)
}

func (s *accountService) SearchOne(ctx context.Context, options domain.AccountSearchOptions) (*domain.Account, error) {
	options.Limit = 1
	options.Offset = 0

	accounts, err := s.accountRepo.Search(ctx, options)
	if err != nil {
		return nil, err
	}
	if len(accounts) == 0 {
		return nil, pkgErrors.NotFound("account")
	}

	return accounts[0], nil
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

	if account.InitialBalance != 0 {
		isConn, err := s.isConnectionAccount(ctx, account.ID)
		if err != nil {
			return pkgErrors.Internal("failed to check connection account", err)
		}
		if isConn {
			return pkgErrors.BadRequest("initial balance cannot be set on connection accounts")
		}
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
	// TODO: block if there are user_connections associated with the account

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
