package service

import (
	"context"
	"fmt"
	"time"

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

	// Autorização: rejeita quem não tem nenhuma relação com a transação — nem é o
	// autor original, nem é o dono da linha.
	if transaction.OriginalUserID != nil && *transaction.OriginalUserID != userID && transaction.UserID != userID {
		return pkgErrors.ErrParentTransactionBelongsToAnotherUser
	}

	// Notificação disparada ao autor quando a exclusão parte do usuário da ponta.
	// É populada nos ramos da ponta e enviada após o commit.
	var deleteEvent *domain.NotificationEvent

	// Autor = criou a transação (OriginalUserID nil OU igual ao usuário atual). A
	// source de splits/compartilhadas é criada com OriginalUserID = &autor.
	isAuthor := transaction.OriginalUserID == nil || *transaction.OriginalUserID == userID

	if isAuthor {
		// Caminho do autor: preserva o comportamento atual. Se o autor passou o id de
		// uma transação vinculada (o lado da ponta), troca para a source e deleta os
		// dois lados. A busca da source NÃO é mais escopada por usuário.
		sourceIDs, err := s.transactionRepo.GetSourceTransactionIDs(ctx, id)
		if err != nil {
			return pkgErrors.Internal("failed to get source transaction IDs", err)
		}
		if len(sourceIDs) > 0 {
			sourceTransaction, err := s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{IDs: []int{sourceIDs[0]}})
			if err != nil {
				return err
			}
			transaction = sourceTransaction
		}

		if err := s.dispatchDelete(ctx, transaction.UserID, transaction, propagationSettings, true, false); err != nil {
			return err
		}
	} else {
		// Caminho da ponta (garantido pela autorização acima:
		// OriginalUserID != nil && *OriginalUserID != userID && UserID == userID).
		settlements, err := s.settlementRepo.Search(ctx, domain.SettlementFilter{
			ParentTransactionIDs: []int{transaction.ID},
		})
		if err != nil {
			return pkgErrors.Internal("failed to search settlements for delete", err)
		}

		if len(settlements) > 0 {
			// Cenário A (split em conta privada): desfaz o split apenas do lado da
			// ponta — apaga a transação da ponta + os settlements vinculados, sem
			// tocar na transação privada do autor. Propaga para as parcelas da
			// recorrência da própria ponta.
			if err := s.dispatchDelete(ctx, userID, transaction, propagationSettings, false, true); err != nil {
				return err
			}

			// A transação privada do autor sobrevive — a notificação aponta para ela.
			entityID := 0
			if sourceIDs, err := s.transactionRepo.GetSourceTransactionIDs(ctx, id); err == nil && len(sourceIDs) > 0 {
				entityID = sourceIDs[0]
			}
			deleteEvent = &domain.NotificationEvent{
				RecipientUserID: *transaction.OriginalUserID,
				ActorUserID:     userID,
				Type:            domain.NotificationTypeSharedTransactionDeleted,
				EntityType:      "transaction",
				EntityID:        entityID,
				Amount:          transaction.Amount,
				Description:     transaction.Description,
				TxKind:          string(transaction.Type),
			}
		} else {
			// Cenário B (conta compartilhada) / transferência entre usuários: sem
			// settlement, apaga os dois lados. Troca para a source e propaga pelas
			// parcelas escopadas ao dono da source (autor).
			source := transaction
			sourceIDs, err := s.transactionRepo.GetSourceTransactionIDs(ctx, id)
			if err != nil {
				return pkgErrors.Internal("failed to get source transaction IDs", err)
			}
			if len(sourceIDs) > 0 {
				source, err = s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{IDs: []int{sourceIDs[0]}})
				if err != nil {
					return err
				}
			}

			if err := s.dispatchDelete(ctx, source.UserID, source, propagationSettings, true, false); err != nil {
				return err
			}

			// A transação do autor também é apagada, então não há alvo de navegação:
			// entity_id = 0 e o corpo carrega descrição + valor. TxKind usa o tipo da
			// source (o tipo original do autor), pois o lado da ponta é invertido.
			deleteEvent = &domain.NotificationEvent{
				RecipientUserID: *transaction.OriginalUserID,
				ActorUserID:     userID,
				Type:            domain.NotificationTypeSharedTransactionDeleted,
				EntityType:      "transaction",
				EntityID:        0,
				Amount:          transaction.Amount,
				Description:     transaction.Description,
				TxKind:          string(source.Type),
			}
		}
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}

	if deleteEvent != nil {
		//nolint:gosec,contextcheck // G118: contexto destacado intencional — o push pós-commit precisa sobreviver ao ctx da request (NOTIF-06)
		go s.services.Notification.Dispatch(context.Background(), []domain.NotificationEvent{*deleteEvent})
	}

	return nil
}

// getByID busca uma transação escopada ao usuário. Usado pelo fluxo de update.
func (s *transactionService) getByID(ctx context.Context, userID int, id int) (*domain.Transaction, error) {
	return s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{
		IDs:    []int{id},
		UserID: &userID,
	})
}

// dispatchDelete resolve o modo de propagação e delega para deleteTransactions.
//   - installmentUserID: dono da recorrência cujas parcelas serão coletadas.
//   - pullLinked: se true, também apaga as transações vinculadas (o outro lado).
//   - deleteSettlements: se true, remove os settlements vinculados às transações alvo.
func (s *transactionService) dispatchDelete(
	ctx context.Context,
	installmentUserID int,
	transaction *domain.Transaction,
	propagation domain.TransactionPropagationSettings,
	pullLinked bool,
	deleteSettlements bool,
) error {
	switch propagation {
	case domain.TransactionPropagationSettingsCurrent:
		return s.deleteTransactions(ctx, []*domain.Transaction{transaction}, pullLinked, deleteSettlements)
	case domain.TransactionPropagationSettingsAll:
		installments, err := s.collectInstallments(ctx, installmentUserID, transaction, false)
		if err != nil {
			return err
		}
		return s.deleteTransactions(ctx, installments, pullLinked, deleteSettlements)
	case domain.TransactionPropagationSettingsCurrentAndFuture:
		installments, err := s.collectInstallments(ctx, installmentUserID, transaction, true)
		if err != nil {
			return err
		}
		return s.deleteTransactions(ctx, installments, pullLinked, deleteSettlements)
	default:
		return pkgErrors.ErrInvalidPropagationSettings(propagation)
	}
}

// collectInstallments retorna as parcelas da recorrência da transação que devem
// ser apagadas. Sem recorrência (ou sem número de parcela no modo futuro), retorna
// apenas a própria transação. userID escopa a busca ao dono da recorrência (a
// source no caminho do autor/cenário B, a própria ponta no cenário A).
func (s *transactionService) collectInstallments(ctx context.Context, userID int, transaction *domain.Transaction, futureOnly bool) ([]*domain.Transaction, error) {
	if transaction.TransactionRecurrenceID == nil || (futureOnly && transaction.InstallmentNumber == nil) {
		return []*domain.Transaction{transaction}, nil
	}

	filter := domain.TransactionFilter{
		RecurrenceIDs: []int{*transaction.TransactionRecurrenceID},
		UserID:        &userID,
	}
	if futureOnly {
		filter.StartDate = &domain.ComparableSearch[time.Time]{
			GreaterThanOrEqual: lo.ToPtr(transaction.Date),
		}
	}

	installments, err := s.transactionRepo.Search(ctx, filter)
	if err != nil {
		return nil, pkgErrors.Internal(fmt.Sprintf("failed to get installments for recurrence %d", *transaction.TransactionRecurrenceID), err)
	}
	return installments, nil
}

// deleteTransactions apaga o conjunto de transações informado.
//   - pullLinked: também apaga as transações vinculadas (o outro lado do
//     compartilhamento), primeiro as vinculadas e depois as source.
//   - deleteSettlements: remove os settlements cujo parent_transaction_id aponta
//     para as transações alvo. Necessário no cenário de split, em que a source do
//     autor NÃO é apagada e, por ser soft-delete, o CASCADE da FK não dispara — o
//     settlement precisa ser removido explicitamente para o saldo compartilhado bater.
func (s *transactionService) deleteTransactions(ctx context.Context, targets []*domain.Transaction, pullLinked bool, deleteSettlements bool) error {
	toDelete := make([]*domain.Transaction, 0, len(targets)*2)
	toDelete = append(toDelete, targets...)

	if pullLinked {
		targetIDs := lo.Map(targets, func(t *domain.Transaction, _ int) int { return t.ID })
		sources, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{IDs: targetIDs})
		if err != nil {
			return pkgErrors.Internal("failed to get source transactions with linked", err)
		}
		for _, src := range sources {
			for i := range src.LinkedTransactions {
				toDelete = append(toDelete, &src.LinkedTransactions[i])
			}
		}
	}

	if deleteSettlements {
		targetIDs := lo.Map(targets, func(t *domain.Transaction, _ int) int { return t.ID })
		settlements, err := s.settlementRepo.Search(ctx, domain.SettlementFilter{
			ParentTransactionIDs: targetIDs,
		})
		if err != nil {
			return pkgErrors.Internal("failed to search settlements to delete", err)
		}
		if len(settlements) > 0 {
			settlementIDs := lo.Map(settlements, func(st *domain.Settlement, _ int) int { return st.ID })
			if err := s.settlementRepo.Delete(ctx, settlementIDs); err != nil {
				return pkgErrors.Internal("failed to delete settlements", err)
			}
		}
	}

	transactionIDs := lo.Map(toDelete, func(t *domain.Transaction, _ int) int { return t.ID })
	if err := s.transactionRepo.Delete(ctx, transactionIDs); err != nil {
		return pkgErrors.Internal("failed to delete transactions", err)
	}

	if err := s.deleteRecurrencesWithoutTransactions(ctx, toDelete); err != nil {
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
