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
	transactionRepo    repository.TransactionRepository
	chargeRepo         repository.ChargeRepository
	services           *Services
}

func NewAccountService(repos *repository.Repositories, services *Services) AccountService {
	return &accountService{
		dbTransaction:      repos.DBTransaction,
		accountRepo:        repos.Account,
		userRepo:           repos.User,
		userConnectionRepo: repos.UserConnection,
		transactionRepo:    repos.Transaction,
		chargeRepo:         repos.Charge,
		services:           services,
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
	account.IsActive = true

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

func (s *accountService) Activate(ctx context.Context, userID, id int) error {
	existing, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}

	if existing.UserID != userID {
		return pkgErrors.Forbidden("only account owner can activate")
	}

	if existing.IsActive {
		return nil
	}

	if err := s.accountRepo.Activate(ctx, id); err != nil {
		return pkgErrors.Internal("failed to activate account", err)
	}

	return nil
}

func (s *accountService) Deactivate(ctx context.Context, userID, id int) error {
	existing, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}

	if existing.UserID != userID {
		return pkgErrors.Forbidden("only account owner can deactivate")
	}

	if !existing.IsActive {
		return nil
	}

	if err := s.accountRepo.Deactivate(ctx, id); err != nil {
		return pkgErrors.Internal("failed to deactivate account", err)
	}

	return nil
}

func (s *accountService) GetDeletionInfo(ctx context.Context, userID, id int) (*domain.AccountDeletionInfo, error) {
	existing, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	if existing.UserID != userID {
		return nil, pkgErrors.Forbidden("only account owner can delete")
	}

	count, err := s.transactionRepo.Count(ctx, domain.TransactionFilter{AccountIDs: []int{id}})
	if err != nil {
		return nil, pkgErrors.Internal("failed to count account transactions", err)
	}

	return &domain.AccountDeletionInfo{TransactionCount: count}, nil
}

// Delete permanently removes an account. Connection accounts are never
// deletable. When the account has transactions, the caller must choose a
// strategy: delete the transactions (tearing down their shared/linked
// counterparts via the transaction service) or migrate them to another account.
func (s *accountService) Delete(ctx context.Context, userID, id int, strategy domain.AccountDeletionStrategy, targetAccountID *int) error {
	existing, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}
	if existing.UserID != userID {
		return pkgErrors.Forbidden("only account owner can delete")
	}

	// Connection (shared) accounts must never be deleted — removing one would
	// cascade-delete the user_connection itself.
	isConn, err := s.isConnectionAccount(ctx, id)
	if err != nil {
		return pkgErrors.Internal("failed to check connection account", err)
	}
	if isConn {
		return pkgErrors.ErrAccountCannotDeleteConnectionAccount
	}

	count, err := s.transactionRepo.Count(ctx, domain.TransactionFilter{AccountIDs: []int{id}})
	if err != nil {
		return pkgErrors.Internal("failed to count account transactions", err)
	}

	if count > 0 {
		if !strategy.IsValid() {
			return pkgErrors.ErrAccountHasLinkedTransactions
		}

		switch strategy {
		case domain.AccountDeletionStrategyDeleteTransactions:
			// Tear down each transaction group through the transaction service so
			// shared/linked counterparts and settlements are removed consistently.
			// (DBTransaction is not re-entrant, so this runs outside an outer tx;
			// each group delete manages its own transaction.)
			if err := s.deleteAccountTransactions(ctx, userID, id, int(count)); err != nil {
				return err
			}
		case domain.AccountDeletionStrategyMigrate:
			if err := s.migrateAccountData(ctx, userID, id, targetAccountID); err != nil {
				return err
			}
		}
	}

	// Final hard delete. The accounts→charges FK is ON DELETE SET NULL, so any
	// remaining charge references are cleared automatically; the accounts→
	// transactions FK is ON DELETE CASCADE, removing the now soft-deleted rows.
	if err := s.accountRepo.Delete(ctx, id); err != nil {
		return pkgErrors.Internal("failed to delete account", err)
	}

	return nil
}

// deleteAccountTransactions removes every transaction on the account by deleting
// each one's group via the transaction service. It re-queries after each delete
// because a single group delete may remove several of the account's transactions
// at once (e.g. both legs of a transfer). maxIterations bounds the loop.
func (s *accountService) deleteAccountTransactions(ctx context.Context, userID, accountID, maxIterations int) error {
	for i := 0; i < maxIterations; i++ {
		txs, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{AccountIDs: []int{accountID}})
		if err != nil {
			return pkgErrors.Internal("failed to list account transactions", err)
		}
		if len(txs) == 0 {
			return nil
		}
		if err := s.services.Transaction.Delete(ctx, userID, txs[0].ID, domain.TransactionPropagationSettingsAll); err != nil {
			return err
		}
	}
	return nil
}

// migrateAccountData moves the account's transactions and charge references to
// the validated target account inside a single DB transaction.
func (s *accountService) migrateAccountData(ctx context.Context, userID, accountID int, targetAccountID *int) error {
	if targetAccountID == nil || *targetAccountID == accountID {
		return pkgErrors.ErrAccountInvalidMigrationTarget
	}
	target, err := s.GetByID(ctx, userID, *targetAccountID)
	if err != nil || target == nil || !target.IsActive {
		return pkgErrors.ErrAccountInvalidMigrationTarget
	}
	targetIsConn, err := s.isConnectionAccount(ctx, *targetAccountID)
	if err != nil {
		return pkgErrors.Internal("failed to check connection account", err)
	}
	if targetIsConn {
		return pkgErrors.ErrAccountInvalidMigrationTarget
	}

	ctx, err = s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	if err := s.transactionRepo.ReassignAccount(ctx, accountID, *targetAccountID); err != nil {
		return pkgErrors.Internal("failed to migrate transactions", err)
	}
	if err := s.chargeRepo.ReassignAccountRefs(ctx, accountID, *targetAccountID); err != nil {
		return pkgErrors.Internal("failed to migrate charge references", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}
	return nil
}

func (s *accountService) Reorder(ctx context.Context, userID int, orderedIDs []int) error {
	if err := s.accountRepo.Reorder(ctx, userID, orderedIDs); err != nil {
		return pkgErrors.Internal("failed to reorder accounts", err)
	}
	return nil
}
