package service

import (
	"context"
	"fmt"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

func (s *transactionService) Delete(ctx context.Context, userID int, id int, propagationSettings domain.TransactionPropagationSettings) error {
	if !propagationSettings.IsValid() {
		return pkgErrors.ErrInvalidPropagationSettings(propagationSettings)
	}

	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	transaction, err := s.getByID(ctx, userID, id)
	if err != nil {
		return err
	}

	// verifica se a transação pai pertence ao usuário, caso contrário, não permite deletar a transação
	if transaction.OriginalUserID != nil && *transaction.OriginalUserID != userID {
		return pkgErrors.ErrParentTransactionBelongsToAnotherUser
	} else if transaction.ParentID != nil {
		parentTransaction, err := s.getByID(ctx, userID, *transaction.ParentID)
		if err != nil {
			return err
		}

		// faz a troca para o fluxo deletar a transação pai e a transação atual
		transaction = parentTransaction
	}

	switch propagationSettings {
	case domain.TransactionPropagationSettingsCurrent:
		{
			if err := s.deleteCurrentAndAllTransactionsLinked(ctx, []*domain.Transaction{transaction}); err != nil {
				return pkgErrors.Internal("failed to delete all transactions linked", err)
			}
		}
	case domain.TransactionPropagationSettingsAll:
		{
			if err := s.deleteAllInstallmentsOfRecurrence(ctx, userID, transaction); err != nil {
				return pkgErrors.Internal("failed to delete all installments of recurrence", err)
			}
		}
	case domain.TransactionPropagationSettingsCurrentAndFuture:
		{
			if err := s.deleteCurrentAndFutureInstallmentsOfRecurrence(ctx, userID, transaction); err != nil {
				return pkgErrors.Internal("failed to delete current and future installments of recurrence", err)
			}
		}
	default:
		return pkgErrors.ErrInvalidPropagationSettings(propagationSettings)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}

	return nil
}

func (s *transactionService) getByID(ctx context.Context, userID int, id int) (*domain.Transaction, error) {
	transactions, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{
		IDs:    []int{id},
		UserID: &userID,
	})
	if err != nil {
		return nil, pkgErrors.Internal("failed to get transaction", err)
	}

	if len(transactions) == 0 {
		return nil, pkgErrors.NotFound("transaction")
	}

	return transactions[0], nil
}

// deleteAllInstallmentsOfRecurrence deleta todas as parcelas de uma recorrência e a própria recorrência
// se as transações possuem transações vinculadas a outros usuários, elas também serão deletadas, juntamente com as recorrências dos outros usuários
func (s *transactionService) deleteAllInstallmentsOfRecurrence(ctx context.Context, userID int, transaction *domain.Transaction) error {
	// se a transação não possui uma recorrência, deleta apenas a transação e transações vinculadas a ela
	if transaction.TransactionRecurrenceID == nil {
		return s.deleteCurrentAndAllTransactionsLinked(ctx, []*domain.Transaction{transaction})
	}

	// obtém todas as parcelas da recorrência
	transactionInstallments, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{*transaction.TransactionRecurrenceID},
		UserID:        &userID,
	})
	if err != nil {
		return pkgErrors.Internal(fmt.Sprintf("failed to get installments for recurrence %d", *transaction.TransactionRecurrenceID), err)
	}

	// deleta todas as parcelas e transações vinculadas a elas
	err = s.deleteCurrentAndAllTransactionsLinked(ctx, transactionInstallments)
	if err != nil {
		return pkgErrors.Internal(fmt.Sprintf("failed to delete installments for recurrence %d", *transaction.TransactionRecurrenceID), err)
	}

	return nil
}

// deleteCurrentAndAllTransactionsLinked deleta todas as transações vinculadas às transações pai
// se as transações possuem recorrências, elas também serão deletadas
func (s *transactionService) deleteCurrentAndAllTransactionsLinked(ctx context.Context, parentTransactions []*domain.Transaction) error {
	// obtém todas as transações vinculadas às transações pai
	transactions, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{
		ParentIDs: lo.Map(parentTransactions, func(transaction *domain.Transaction, _ int) int {
			return transaction.ID
		}),
	})
	if err != nil {
		return pkgErrors.Internal("failed to get transactions", err)
	}

	// concatena as transações pai e as transações vinculadas
	t := make([]*domain.Transaction, 0, len(transactions)+len(parentTransactions))
	t = append(t, transactions...)
	t = append(t, parentTransactions...)

	// deleta todas as transações, primeiro as vinculadas e depois as pai para evitar erros de chave estrangeira
	transactionIDs := lo.Map(t, func(transaction *domain.Transaction, _ int) int {
		return transaction.ID
	})

	if err := s.transactionRepo.Delete(ctx, transactionIDs); err != nil {
		return pkgErrors.Internal("failed to delete transactions", err)
	}

	if err := s.deleteRecurrencesWithoutTransactions(ctx, t); err != nil {
		return pkgErrors.Internal("failed to delete recurrences without transactions", err)
	}

	return nil
}

func (s *transactionService) deleteRecurrencesWithoutTransactions(ctx context.Context, transactions []*domain.Transaction) error {
	recurrenceIDs := lo.FilterMap(transactions, func(transaction *domain.Transaction, _ int) (int, bool) {
		return lo.FromPtr(transaction.TransactionRecurrenceID), transaction.TransactionRecurrenceID != nil
	})

	if len(recurrenceIDs) == 0 {
		return nil
	}

	recurrenceIDs = lo.Uniq(recurrenceIDs)

	transactionsByRecurrence, err := s.transactionRepo.GetGroupedByRecurrences(ctx, nil, recurrenceIDs)
	if err != nil {
		return pkgErrors.Internal("failed to get transactions grouped by recurrences", err)
	}

	excludeRecurrenceIDs := make([]int, 0, len(recurrenceIDs))
	for recurrenceID, transactions := range transactionsByRecurrence {
		if len(transactions) == 0 {
			excludeRecurrenceIDs = append(excludeRecurrenceIDs, recurrenceID)
		}
	}

	// deleta todas as recorrências sem transações
	if err := s.transactionRecurRepo.Delete(ctx, excludeRecurrenceIDs); err != nil {
		return pkgErrors.Internal("failed to delete recurrences", err)
	}

	return nil
}

func (s *transactionService) deleteCurrentAndFutureInstallmentsOfRecurrence(ctx context.Context, userID int, transaction *domain.Transaction) error {
	if transaction.TransactionRecurrenceID == nil || transaction.InstallmentNumber == nil {
		return s.deleteCurrentAndAllTransactionsLinked(ctx, []*domain.Transaction{transaction})
	}

	// obtém as futuras parcelas da recorrência
	transactionInstallments, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{
		RecurrenceIDs: []int{*transaction.TransactionRecurrenceID},
		UserID:        &userID,
		InstallmentNumber: &domain.ComparableSearch[int]{
			GreaterThanOrEqual: transaction.InstallmentNumber,
		},
	})
	if err != nil {
		return pkgErrors.Internal(fmt.Sprintf("failed to get installments for recurrence %d", *transaction.TransactionRecurrenceID), err)
	}

	// deleta todas as parcelas
	err = s.deleteCurrentAndAllTransactionsLinked(ctx, transactionInstallments)
	if err != nil {
		return pkgErrors.Internal(fmt.Sprintf("failed to delete installments for recurrence %d", *transaction.TransactionRecurrenceID), err)
	}

	return nil
}
