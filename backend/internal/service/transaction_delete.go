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

	transaction, err := s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{
		IDs: []int{id},
	})
	if err != nil {
		return err
	}

	// verifica se a transação "source" pertence ao usuário, caso contrário, não permite deletar a transação
	if transaction.OriginalUserID != nil && *transaction.OriginalUserID != userID && transaction.UserID != userID {
		return pkgErrors.ErrParentTransactionBelongsToAnotherUser
	}
	sourceIDs, err := s.transactionRepo.GetSourceTransactionIDs(ctx, id)
	if err != nil {
		return pkgErrors.Internal("failed to get source transaction IDs", err)
	}
	if len(sourceIDs) > 0 {
		sourceTransaction, err := s.getByID(ctx, userID, sourceIDs[0])
		if err != nil {
			return err
		}
		// faz a troca para o fluxo deletar a transação source e a transação atual
		transaction = sourceTransaction
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
	return s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{
		IDs:    []int{id},
		UserID: &userID,
	})
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

// deleteCurrentAndAllTransactionsLinked deleta todas as transações vinculadas às transações source (via LinkedTransactions no Search)
// se as transações possuem recorrências, elas também serão deletadas
func (s *transactionService) deleteCurrentAndAllTransactionsLinked(ctx context.Context, sourceTransactions []*domain.Transaction) error {
	sourceIDs := lo.Map(sourceTransactions, func(t *domain.Transaction, _ int) int { return t.ID })
	sources, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{
		IDs: sourceIDs,
	})
	if err != nil {
		return pkgErrors.Internal("failed to get source transactions with linked", err)
	}
	var linkedTransactions []*domain.Transaction
	for _, s := range sources {
		for i := range s.LinkedTransactions {
			linkedTransactions = append(linkedTransactions, &s.LinkedTransactions[i])
		}
	}

	// concatena as transações source e as transações vinculadas
	t := make([]*domain.Transaction, 0, len(linkedTransactions)+len(sourceTransactions))
	t = append(t, linkedTransactions...)
	t = append(t, sourceTransactions...)

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
