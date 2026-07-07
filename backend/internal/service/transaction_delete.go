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

	// Reject anyone with no relation to the transaction: neither the original
	// creator nor the owner of the row.
	if transaction.OriginalUserID != nil && *transaction.OriginalUserID != userID && transaction.UserID != userID {
		return pkgErrors.ErrParentTransactionBelongsToAnotherUser
	}

	// Notification fired to the author when the deletion comes from the partner
	// on the receiving end. Populated by the partner paths, dispatched post-commit.
	var deleteEvent *domain.NotificationEvent

	// The author created the transaction (OriginalUserID nil OR equal to the
	// current user). The source of splits/shared transactions is created with
	// OriginalUserID = &author.
	if transaction.OriginalUserID == nil || *transaction.OriginalUserID == userID {
		if err := s.deleteAsAuthor(ctx, transaction, id, propagationSettings); err != nil {
			return err
		}
	} else {
		deleteEvent, err = s.deleteAsPartner(ctx, userID, transaction, id, propagationSettings)
		if err != nil {
			return err
		}
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}

	if deleteEvent != nil {
		//nolint:gosec,contextcheck // G118: detached context on purpose — the post-commit push must outlive the request ctx (NOTIF-06)
		go s.services.Notification.Dispatch(context.Background(), []domain.NotificationEvent{*deleteEvent})
	}

	return nil
}

// deleteAsAuthor preserves the pre-existing behavior: delete both sides plus
// installments. If the author passed the id of a linked (partner) transaction,
// swap to the source first. The swap is no longer scoped to the deleting user.
func (s *transactionService) deleteAsAuthor(ctx context.Context, transaction *domain.Transaction, id int, propagation domain.TransactionPropagationSettings) error {
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

	return s.dispatchDelete(ctx, transaction.UserID, transaction, propagation, true, false)
}

// deleteAsPartner handles deletion initiated by the partner on the receiving end
// (guaranteed by the authorization check in Delete: OriginalUserID != nil &&
// *OriginalUserID != userID && UserID == userID). It returns the notification
// event to fire to the author after commit.
func (s *transactionService) deleteAsPartner(ctx context.Context, userID int, transaction *domain.Transaction, id int, propagation domain.TransactionPropagationSettings) (*domain.NotificationEvent, error) {
	settlements, err := s.settlementRepo.Search(ctx, domain.SettlementFilter{
		ParentTransactionIDs: []int{transaction.ID},
	})
	if err != nil {
		return nil, pkgErrors.Internal("failed to search settlements for delete", err)
	}

	// Scenario A (split on a private account): undo the split only on the
	// partner side — delete the partner transaction(s) plus their settlements,
	// leaving the author's private transaction untouched. Propagates across the
	// partner's own recurrence.
	if len(settlements) > 0 {
		if err := s.dispatchDelete(ctx, userID, transaction, propagation, false, true); err != nil {
			return nil, err
		}

		// The author's private transaction survives — link the notification to it.
		entityID := 0
		if sourceIDs, err := s.transactionRepo.GetSourceTransactionIDs(ctx, id); err == nil && len(sourceIDs) > 0 {
			entityID = sourceIDs[0]
		}
		return &domain.NotificationEvent{
			RecipientUserID: *transaction.OriginalUserID,
			ActorUserID:     userID,
			Type:            domain.NotificationTypeSharedTransactionDeleted,
			EntityType:      "transaction",
			EntityID:        entityID,
			Amount:          transaction.Amount,
			Description:     transaction.Description,
			TxKind:          string(transaction.Type),
		}, nil
	}

	// Scenario B (transaction on a shared account) / cross-user transfer: no
	// settlement, delete both sides. Swap to the source and propagate across the
	// installments scoped to the source owner (the author).
	source := transaction
	sourceIDs, err := s.transactionRepo.GetSourceTransactionIDs(ctx, id)
	if err != nil {
		return nil, pkgErrors.Internal("failed to get source transaction IDs", err)
	}
	if len(sourceIDs) > 0 {
		source, err = s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{IDs: []int{sourceIDs[0]}})
		if err != nil {
			return nil, err
		}
	}

	if err := s.dispatchDelete(ctx, source.UserID, source, propagation, true, false); err != nil {
		return nil, err
	}

	// The author's transaction is also deleted, so there is no navigation target:
	// entity_id = 0 and the body carries description + amount. TxKind uses the
	// source type (the author's original type), since the partner side is inverted.
	return &domain.NotificationEvent{
		RecipientUserID: *transaction.OriginalUserID,
		ActorUserID:     userID,
		Type:            domain.NotificationTypeSharedTransactionDeleted,
		EntityType:      "transaction",
		EntityID:        0,
		Amount:          transaction.Amount,
		Description:     transaction.Description,
		TxKind:          string(source.Type),
	}, nil
}

// dispatchDelete resolves the propagation mode and delegates to deleteTransactions.
//   - installmentUserID: owner of the recurrence whose installments are collected.
//   - pullLinked: when true, also delete the linked transactions (the other side).
//   - deleteSettlements: when true, remove the settlements bound to the targets.
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

// collectInstallments returns the recurrence installments that must be deleted.
// With no recurrence (or no installment number in future-only mode) it returns
// just the transaction itself. userID scopes the search to the recurrence owner
// (the source on the author/scenario-B path, the partner on scenario A).
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

// deleteTransactions deletes the given set of transactions.
//   - pullLinked: also delete the linked transactions (the other side of the
//     share), the linked ones first and the sources afterwards.
//   - deleteSettlements: remove the settlements whose parent_transaction_id points
//     at the targets. Required in the split scenario, where the author's source is
//     NOT deleted and — being a soft delete — the FK CASCADE does not fire, so the
//     settlement must be removed explicitly for the shared balance to stay correct.
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

	// delete every recurrence with no remaining transactions
	if err := s.transactionRecurRepo.Delete(ctx, excludeRecurrenceIDs); err != nil {
		return pkgErrors.Internal("failed to delete recurrences", err)
	}

	return nil
}

// getByID fetches a transaction scoped to the user. Used by the update flow.
func (s *transactionService) getByID(ctx context.Context, userID int, id int) (*domain.Transaction, error) {
	return s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{
		IDs:    []int{id},
		UserID: &userID,
	})
}
