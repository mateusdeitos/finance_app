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

// DeleteSettlement removes a settlement's division: it deletes the partner's
// linked transaction (settlement.parent_transaction_id) and the settlement
// itself, while KEEPING the author's source transaction. Only the settlement
// owner (the author) may do this. For a recurring split each installment has its
// own settlement + partner tx (scoped to the same connection account), so
// propagation controls how many installments' divisions are removed. The partner
// is notified after commit.
func (s *transactionService) DeleteSettlement(ctx context.Context, userID int, settlementID int, propagation domain.TransactionPropagationSettings) error {
	if !propagation.IsValid() {
		return pkgErrors.ErrInvalidPropagationSettings(propagation)
	}

	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	targets, err := s.settlementRepo.Search(ctx, domain.SettlementFilter{IDs: []int{settlementID}})
	if err != nil {
		return pkgErrors.Internal("failed to search settlement", err)
	}
	if len(targets) == 0 {
		return pkgErrors.NotFound("settlement")
	}
	target := targets[0]

	// Author-only: the settlement belongs to the author who created the split.
	if target.UserID != userID {
		return pkgErrors.ErrSettlementForbidden
	}

	// The author's source transaction drives the recurrence scope + notification copy.
	source, err := s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{IDs: []int{target.SourceTransactionID}})
	if err != nil {
		return err
	}

	// Settlements in scope. For a recurring split, propagation walks the author's
	// installments and collects the sibling settlements for the SAME partner
	// (same connection account), never other splits of the same transaction.
	scope := []*domain.Settlement{target}
	if propagation != domain.TransactionPropagationSettingsCurrent && source.TransactionRecurrenceID != nil {
		installments, err := s.collectInstallments(ctx, source.UserID, source, propagation == domain.TransactionPropagationSettingsCurrentAndFuture)
		if err != nil {
			return err
		}
		installmentIDs := lo.Map(installments, func(t *domain.Transaction, _ int) int { return t.ID })
		scope, err = s.settlementRepo.Search(ctx, domain.SettlementFilter{
			SourceTransactionIDs: installmentIDs,
			UserIDs:              []int{userID},
			AccountIDs:           []int{target.AccountID},
		})
		if err != nil {
			return pkgErrors.Internal("failed to search settlements in scope", err)
		}
	}

	// The partner transactions to delete are the settlements' parent transactions.
	pontaTxIDs := lo.Uniq(lo.Map(scope, func(st *domain.Settlement, _ int) int { return st.ParentTransactionID }))
	pontaTxs, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{IDs: pontaTxIDs})
	if err != nil {
		return pkgErrors.Internal("failed to search partner transactions", err)
	}

	// deleteTransactions soft-deletes the partner txs, hard-deletes their
	// settlements (by parent_transaction_id) and cleans the partner's now-empty
	// recurrence. pullLinked=false keeps the author's source transaction(s) intact.
	if err := s.deleteTransactions(ctx, pontaTxs, false); err != nil {
		return err
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}

	// Notify the partner that the author removed the shared division. Their
	// transaction is gone, so there is no navigation target (EntityID 0); the body
	// carries description + amount (persisted on the notification row).
	if len(pontaTxs) > 0 {
		event := domain.NotificationEvent{
			RecipientUserID: pontaTxs[0].UserID,
			ActorUserID:     userID,
			Type:            domain.NotificationTypeSharedTransactionDeleted,
			EntityType:      "transaction",
			EntityID:        0,
			Amount:          target.Amount,
			Description:     source.Description,
			TxKind:          string(source.Type),
		}
		//nolint:gosec,contextcheck // G118: detached context on purpose — the post-commit push must outlive the request ctx (NOTIF-06)
		go s.services.Notification.Dispatch(context.Background(), []domain.NotificationEvent{event})
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

	return s.dispatchDelete(ctx, transaction.UserID, transaction, propagation, true)
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
		if err := s.dispatchDelete(ctx, userID, transaction, propagation, false); err != nil {
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

	if err := s.dispatchDelete(ctx, source.UserID, source, propagation, true); err != nil {
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
func (s *transactionService) dispatchDelete(
	ctx context.Context,
	installmentUserID int,
	transaction *domain.Transaction,
	propagation domain.TransactionPropagationSettings,
	pullLinked bool,
) error {
	switch propagation {
	case domain.TransactionPropagationSettingsCurrent:
		return s.deleteTransactions(ctx, []*domain.Transaction{transaction}, pullLinked)
	case domain.TransactionPropagationSettingsAll:
		installments, err := s.collectInstallments(ctx, installmentUserID, transaction, false)
		if err != nil {
			return err
		}
		return s.deleteTransactions(ctx, installments, pullLinked)
	case domain.TransactionPropagationSettingsCurrentAndFuture:
		installments, err := s.collectInstallments(ctx, installmentUserID, transaction, true)
		if err != nil {
			return err
		}
		return s.deleteTransactions(ctx, installments, pullLinked)
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
//
// It always removes the settlements bound to any of the deleted transactions
// (see deleteSettlementsForTransactions), on both the author and the partner
// paths.
func (s *transactionService) deleteTransactions(ctx context.Context, targets []*domain.Transaction, pullLinked bool) error {
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

	transactionIDs := lo.Map(toDelete, func(t *domain.Transaction, _ int) int { return t.ID })

	if err := s.deleteSettlementsForTransactions(ctx, transactionIDs); err != nil {
		return err
	}

	if err := s.transactionRepo.Delete(ctx, transactionIDs); err != nil {
		return pkgErrors.Internal("failed to delete transactions", err)
	}

	if err := s.deleteRecurrencesWithoutTransactions(ctx, toDelete); err != nil {
		return pkgErrors.Internal("failed to delete recurrences without transactions", err)
	}

	return nil
}

// deleteSettlementsForTransactions hard-deletes the settlements bound to any of
// the given transactions. A settlement's parent_transaction_id is the partner
// (receiving) transaction, which is always part of the deletion set whenever a
// share is torn down: the author path pulls the linked partner tx (pullLinked),
// and the partner (scenario A) path deletes the parent directly. Removing them
// keeps shared-account balances correct and leaves no orphan rows — the FK
// CASCADE does not fire because transactions are only soft-deleted.
func (s *transactionService) deleteSettlementsForTransactions(ctx context.Context, transactionIDs []int) error {
	settlements, err := s.settlementRepo.Search(ctx, domain.SettlementFilter{
		ParentTransactionIDs: transactionIDs,
	})
	if err != nil {
		return pkgErrors.Internal("failed to search settlements to delete", err)
	}
	if len(settlements) == 0 {
		return nil
	}
	settlementIDs := lo.Map(settlements, func(st *domain.Settlement, _ int) int { return st.ID })
	if err := s.settlementRepo.Delete(ctx, settlementIDs); err != nil {
		return pkgErrors.Internal("failed to delete settlements", err)
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
