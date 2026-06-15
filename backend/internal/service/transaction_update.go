package service

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/pkg/applog"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

// cloneTransactionForUpdate returns a copy of t that is deep enough for the
// update loop to mutate freely without touching the original. The loop mutates
// row-level fields plus the Tags and LinkedTransactions slices — including
// LinkedTransactions[i].Date/.Description in the non-linked propagation path —
// so those backing arrays must not be shared with the pristine snapshot.
// Pointer fields (TransactionRecurrence, InstallmentNumber, CategoryID, ...) are
// only ever reassigned, never mutated in place on the clone, so sharing them is
// safe; the shared TransactionRecurrence is intentionally mutated in place when
// shrinking the original recurrence.
func cloneTransactionForUpdate(t *domain.Transaction) *domain.Transaction {
	if t == nil {
		return nil
	}

	clone := *t
	clone.Tags = slices.Clone(t.Tags)
	clone.SettlementsFromSource = slices.Clone(t.SettlementsFromSource)

	if t.LinkedTransactions != nil {
		clone.LinkedTransactions = make([]domain.Transaction, len(t.LinkedTransactions))
		for i := range t.LinkedTransactions {
			lt := t.LinkedTransactions[i]
			lt.Tags = slices.Clone(t.LinkedTransactions[i].Tags)
			lt.LinkedTransactions = slices.Clone(t.LinkedTransactions[i].LinkedTransactions)
			clone.LinkedTransactions[i] = lt
		}
	}

	return &clone
}

func (s *transactionService) Update(ctx context.Context, id, userID int, req *domain.TransactionUpdateRequest) error {
	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	previousTransaction, err := s.getByID(ctx, userID, id)
	if err != nil {
		return err
	}

	if errs := s.validateUpdateTransactionRequest(ctx, userID, *previousTransaction, req); len(errs) > 0 {
		return pkgErrors.ServiceErrors(errs)
	}

	sourceIDs, err := s.transactionRepo.GetSourceTransactionIDs(ctx, previousTransaction.ID)
	if err != nil {
		return pkgErrors.Internal("failed to get source transaction IDs", err)
	}
	isLinkedTxEdit := len(sourceIDs) > 0

	prevDate := domain.Date{Time: previousTransaction.Date}
	date := lo.CoalesceOrEmpty(req.Date, &prevDate)
	dateDiff := lo.FromPtr(date).Time.Sub(previousTransaction.Date)
	dateDiffDays := int(dateDiff.Hours() / 24)

	data := &transactionUpdateData{
		userID:                 userID,
		req:                    req,
		previousTransaction:    *previousTransaction,
		currentTransaction:     cloneTransactionForUpdate(previousTransaction),
		transactions:           []*domain.Transaction{},
		transactionIDsToRemove: make(map[int]bool),
		isLinkedTxEdit:         isLinkedTxEdit,
	}

	data.isSharedAccountEdit, err = s.detectSharedAccountEdit(ctx, previousTransaction, data.isLinkedTxEdit, sourceIDs)
	if err != nil {
		return err
	}

	// Linked transaction edits never change split/type/recurrence (those fields are
	// rejected by validation), and shared-account edits keep their 1:1 mirror in
	// amount-sync directly. Treat both as unchanged so rebuildTransactions does not
	// misread the absent SplitSettings as a "removed split" and delete the partner's
	// installments.
	if data.isLinkedTxEdit || data.isSharedAccountEdit {
		data.scenario = updateChanges{
			Value:           NOT_CHANGED,
			SplitHasChanged: false,
			HadRecurrence:   previousTransaction.TransactionRecurrenceID != nil,
		}
	} else {
		data.scenario, err = s.determineTypeUpdateScenario(ctx, data)
		if err != nil {
			return err
		}
	}

	errs := s.createTags(ctx, userID, req.Tags)
	if len(errs) > 0 {
		return pkgErrors.ServiceErrors(errs)
	}

	// carrega todas transações e parcelas
	err = s.fetchRelatedTransactions(ctx, data)
	if err != nil {
		return err
	}

	// atualiza/remove a recorrência de acordo com o recurrenceSettings enviado
	err = s.handlerRecurrenceUpdate(ctx, data)
	if err != nil {
		return err
	}

	// normaliza as parcelas de acordo com as recorrências atualizadas
	err = s.normalizeInstallments(ctx, data)
	if err != nil {
		return err
	}

	// faz um resync nas transações vinculadas de acordo com o split enviado
	err = s.rebuildTransactions(ctx, data)
	if err != nil {
		return err
	}

	for i := range data.transactions {
		if !s.shouldUpdateTransactionBasedOnPropagationSettings(data.transactions[i], data) {
			continue
		}

		own := data.transactions[i]
		if own == nil {
			return pkgErrors.Internal(fmt.Sprintf("ownTransactions index %d not found", i), nil)
		}

		if lo.FromPtr(req.AccountID) > 0 {
			own.AccountID = *req.AccountID
		}

		if lo.FromPtr(req.CategoryID) > 0 && !own.Type.IsTransfer() {
			own.CategoryID = req.CategoryID
		}

		if req.Amount != nil && *req.Amount > 0 {
			own.Amount = *req.Amount
			s.syncSharedAccountMirrorAmount(data, own, *req.Amount)
		}

		if req.Date != nil && !req.Date.IsZero() {
			own.Date = own.Date.AddDate(0, 0, dateDiffDays)

			if !isLinkedTxEdit {
				for i := range own.LinkedTransactions {
					own.LinkedTransactions[i].Date = own.LinkedTransactions[i].Date.AddDate(0, 0, dateDiffDays)
				}
			}
		}

		if req.Description != nil && strings.TrimSpace(*req.Description) != "" {
			own.Description = *req.Description

			if !isLinkedTxEdit {
				for i := range own.LinkedTransactions {
					own.LinkedTransactions[i].Description = *req.Description
				}
			}
		}

		own.Tags = req.Tags
		for i := range own.LinkedTransactions {
			if own.LinkedTransactions[i].UserID == userID {
				own.LinkedTransactions[i].Tags = req.Tags
			}
		}

		wasNewTransaction := own.ID == 0
		if wasNewTransaction {
			created, err := s.transactionRepo.Create(ctx, own)
			if err != nil {
				return err
			}
			own.ID = created.ID
			own.LinkedTransactions = created.LinkedTransactions

		} else {
			// For a linked-tx edit, `own.LinkedTransactions` holds the SOURCE
			// transactions (entity.ToDomain merges LinkedTransactions and
			// SourceTransactions for the consumer). Persisting that back via
			// `Association("LinkedTransactions").Replace` would write reverse-
			// direction rows into the linked_transactions join table, which
			// surfaces as duplicated `linked_transactions` payloads on later
			// fetches (the secondary symptom flagged in #117). Clear it so the
			// partner's update only mutates row-level fields.
			linkedSnapshot := own.LinkedTransactions
			if data.isLinkedTxEdit {
				own.LinkedTransactions = nil
			}
			if err := s.transactionRepo.Update(ctx, own); err != nil {
				return err
			}
			if data.isLinkedTxEdit {
				own.LinkedTransactions = linkedSnapshot
			}
			// Re-fetch linked transactions if any were newly created (ID=0) during
			// this update so that syncSettlementsForTransaction gets valid IDs.
			hasNewLinkedTx := lo.ContainsBy(own.LinkedTransactions, func(lt domain.Transaction) bool {
				return lt.ID == 0
			})
			if hasNewLinkedTx {
				fetched, err := s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{IDs: []int{own.ID}})
				if err != nil {
					return err
				}
				own.LinkedTransactions = fetched.LinkedTransactions
			}
		}

		if wasNewTransaction || s.shouldSyncSettlementsOnUpdate(data) {
			if err := s.syncSettlementsForTransaction(ctx, data.userID, data, own); err != nil {
				return err
			}
		}

	}

	if len(data.transactionIDsToRemove) > 0 {
		if err := s.transactionRepo.Delete(ctx, lo.Keys(data.transactionIDsToRemove)); err != nil {
			return err
		}
	}

	// When the partner side edits `amount` on their linked tx, only their own
	// row mutates — the original author's source transaction (and the author's
	// own linked legs, e.g. the from-side of a split) keeps the value the
	// author chose. Settlements derived from the source still need to reflect
	// the partner's new amount, so we recompute them on the source's behalf
	// using the freshly-persisted lt.Amount (#117).
	if data.isLinkedTxEdit && req.Amount != nil && *req.Amount > 0 {
		if err := s.syncLinkedTxAmountEdit(ctx, data, sourceIDs); err != nil {
			return err
		}
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return err
	}

	// NOTIF-04: fire split_updated for partner-initiated edits that affect the
	// linked side (amount / split add / split remove). Cosmetic edits (D-02) and
	// self-edits (D-03) fire nothing — guarded inside the helper.
	// Pass context.Background() to make the post-commit boundary explicit: the
	// txCtx is spent after Commit and any future DB reads inside the helper must
	// not silently use the completed transaction.
	//nolint:contextcheck // intentional detached context for post-commit dispatch (NOTIF-06)
	s.maybeDispatchSplitUpdatedNotification(context.Background(), userID, sourceIDs, data)
	return nil
}

// detectSharedAccountEdit reports whether the edit targets a transaction created
// directly on a connection account — a 1:1 inverted mirror on the partner's
// connection account, with no settlement, whose source and mirror must always
// share the same amount. The discriminator is the SOURCE transaction's account:
// a split's source lives on a private account, a shared-account transaction's
// source on a connection account. Only worth checking when a mirror exists.
func (s *transactionService) detectSharedAccountEdit(ctx context.Context, previousTransaction *domain.Transaction, isLinkedTxEdit bool, sourceIDs []int) (bool, error) {
	if !isLinkedTxEdit && len(previousTransaction.LinkedTransactions) == 0 {
		return false, nil
	}

	sourceForDetection := previousTransaction
	if isLinkedTxEdit {
		src, err := s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{IDs: []int{sourceIDs[0]}})
		if err != nil {
			return false, err
		}
		sourceForDetection = src
	}

	sourceAccount, err := s.services.Account.GetByID(ctx, sourceForDetection.UserID, sourceForDetection.AccountID)
	if err != nil {
		return false, err
	}
	return sourceAccount.UserConnection != nil, nil
}

// syncSharedAccountMirrorAmount keeps the partner's 1:1 mirror equal in amount
// when the author edits a shared-account transaction. Splits intentionally
// differ (the private source holds the full amount, the mirror the share), so
// this is a no-op outside the shared-account author-edit case.
func (s *transactionService) syncSharedAccountMirrorAmount(data *transactionUpdateData, own *domain.Transaction, amount int64) {
	if !data.isSharedAccountEdit || data.isLinkedTxEdit {
		return
	}
	for i := range own.LinkedTransactions {
		own.LinkedTransactions[i].Amount = amount
	}
}

// syncLinkedTxAmountEdit propagates a partner-initiated amount edit on a linked
// transaction back to the author's side. For shared-account mirrors the source
// transaction on the author's connection account must adopt the same amount
// (honoring propagation, mapping each mirror back to its source via the
// linked_transactions join). For splits the settlements derived from the source
// are recomputed against the partner's freshly-persisted amount (#117).
func (s *transactionService) syncLinkedTxAmountEdit(ctx context.Context, data *transactionUpdateData, sourceIDs []int) error {
	if data.isSharedAccountEdit {
		for _, mirrorTx := range data.transactions {
			if !s.shouldUpdateTransactionBasedOnPropagationSettings(mirrorTx, data) {
				continue
			}
			srcIDs, err := s.transactionRepo.GetSourceTransactionIDs(ctx, mirrorTx.ID)
			if err != nil {
				return pkgErrors.Internal("failed to get source transaction IDs for shared-account sync", err)
			}
			if err := s.transactionRepo.UpdateAmountByIDs(ctx, srcIDs, *data.req.Amount); err != nil {
				return err
			}
		}
		return nil
	}

	for _, sourceID := range sourceIDs {
		sourceTx, err := s.transactionRepo.SearchOne(ctx, domain.TransactionFilter{IDs: []int{sourceID}})
		if err != nil {
			return pkgErrors.Internal("failed to fetch source transaction for settlement recompute", err)
		}
		if err := s.syncSettlementsForTransaction(ctx, sourceTx.UserID, data, sourceTx); err != nil {
			return err
		}
	}
	return nil
}

func (s *transactionService) determineTypeUpdateScenario(ctx context.Context, data *transactionUpdateData) (updateChanges, error) {
	newType := lo.FromPtr(lo.CoalesceOrEmpty(data.req.TransactionType, &data.previousTransaction.Type))
	hadSplitSettings := len(data.previousTransaction.LinkedTransactions) > 0 && data.previousTransaction.Type != domain.TransactionTypeTransfer
	hasSplitSettings := len(data.req.SplitSettings) > 0

	checkIsTransferToSameUser := func(accountID, userID int) (bool, error) {
		conn, err := s.getConnectionFromDestinationAccountID(ctx, userID, accountID)
		if err != nil {
			return false, err
		}
		// If no connection found, the account is a regular private account → same-user transfer.
		// If a connection exists, it's a cross-user transfer.
		return conn == nil, nil
	}

	var scenario updateScenario

	switch data.previousTransaction.Type {
	case domain.TransactionTypeExpense:
		switch newType {
		case domain.TransactionTypeIncome:
			switch hasSplitSettings {
			case true:
				scenario = lo.Ternary(hadSplitSettings, EXPENSE_WITH_SPLIT_TO_INCOME_WITH_SPLIT, EXPENSE_WITHOUT_SPLIT_TO_INCOME_WITH_SPLIT)
			case false:
				scenario = lo.Ternary(hadSplitSettings, EXPENSE_WITH_SPLIT_TO_INCOME_WITHOUT_SPLIT, EXPENSE_WITHOUT_SPLIT_TO_INCOME_WITHOUT_SPLIT)
			}

		case domain.TransactionTypeTransfer:
			isTransferToSameUser, err := checkIsTransferToSameUser(*data.req.DestinationAccountID, data.userID)
			if err != nil {
				return updateChanges{}, err
			}

			switch hadSplitSettings {
			case true:
				scenario = lo.Ternary(isTransferToSameUser, EXPENSE_WITH_SPLIT_TO_TRANSFER_TO_SAME_USER, EXPENSE_WITH_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER)
			case false:
				scenario = lo.Ternary(isTransferToSameUser, EXPENSE_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER, EXPENSE_WITHOUT_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER)
			}

		case domain.TransactionTypeExpense:
			switch hasSplitSettings {
			case true:
				scenario = lo.Ternary(hadSplitSettings, EXPENSE_WITH_SPLIT_TO_EXPENSE_WITH_SPLIT, EXPENSE_WITHOUT_SPLIT_TO_EXPENSE_WITH_SPLIT)
			case false:
				scenario = lo.Ternary(hadSplitSettings, EXPENSE_WITH_SPLIT_TO_EXPENSE_WITHOUT_SPLIT, EXPENSE_WITHOUT_SPLIT_TO_EXPENSE_WITHOUT_SPLIT)
			}
		}

	case domain.TransactionTypeIncome:
		switch newType {
		case domain.TransactionTypeExpense:
			switch hasSplitSettings {
			case true:
				scenario = lo.Ternary(hadSplitSettings, INCOME_WITH_SPLIT_TO_EXPENSE_WITH_SPLIT, INCOME_WITHOUT_SPLIT_TO_EXPENSE_WITH_SPLIT)
			case false:
				scenario = lo.Ternary(hadSplitSettings, INCOME_WITH_SPLIT_TO_EXPENSE_WITHOUT_SPLIT, INCOME_WITHOUT_SPLIT_TO_EXPENSE_WITHOUT_SPLIT)
			}

		case domain.TransactionTypeTransfer:
			isTransferToSameUser, err := checkIsTransferToSameUser(*data.req.DestinationAccountID, data.userID)
			if err != nil {
				return updateChanges{}, err
			}

			switch hadSplitSettings {
			case true:
				scenario = lo.Ternary(isTransferToSameUser, INCOME_WITH_SPLIT_TO_TRANSFER_TO_SAME_USER, INCOME_WITH_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER)
			case false:
				scenario = lo.Ternary(isTransferToSameUser, INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_SAME_USER, INCOME_WITHOUT_SPLIT_TO_TRANSFER_TO_DIFFERENT_USER)
			}

		case domain.TransactionTypeIncome:
			switch hasSplitSettings {
			case true:
				scenario = lo.Ternary(hadSplitSettings, INCOME_WITH_SPLIT_TO_INCOME_WITH_SPLIT, INCOME_WITHOUT_SPLIT_TO_INCOME_WITH_SPLIT)
			case false:
				scenario = lo.Ternary(hadSplitSettings, INCOME_WITH_SPLIT_TO_INCOME_WITHOUT_SPLIT, INCOME_WITHOUT_SPLIT_TO_INCOME_WITHOUT_SPLIT)
			}
		}

	case domain.TransactionTypeTransfer:
		switch newType {
		case domain.TransactionTypeExpense:
			switch hasSplitSettings {
			case true:
				scenario = TRANSFER_TO_EXPENSE_WITH_SPLIT
			case false:
				scenario = TRANSFER_TO_EXPENSE_WITHOUT_SPLIT
			}

		case domain.TransactionTypeIncome:
			switch hasSplitSettings {
			case true:
				scenario = TRANSFER_TO_INCOME_WITH_SPLIT
			case false:
				scenario = TRANSFER_TO_INCOME_WITHOUT_SPLIT
			}

		case domain.TransactionTypeTransfer:
			isTransferToSameUser, err := checkIsTransferToSameUser(*data.req.DestinationAccountID, data.userID)
			if err != nil {
				return updateChanges{}, err
			}

			// The previous transfer was cross-user if any linked transaction belongs to a different user.
			transferWasToSameUser := !lo.ContainsBy(data.previousTransaction.LinkedTransactions, func(lt domain.Transaction) bool {
				return lt.UserID != data.userID
			})

			switch isTransferToSameUser {
			case true:
				scenario = lo.Ternary(transferWasToSameUser, TRANSFER_SAME_USER_TO_SAME_USER, TRANSFER_DIFFERENT_USER_TO_SAME_USER)
			case false:
				scenario = lo.Ternary(transferWasToSameUser, TRANSFER_SAME_USER_TO_DIFFERENT_USER, TRANSFER_DIFFERENT_USER_TO_DIFFERENT_USER)
			}
		}
	}

	splitHasChanged := len(data.req.SplitSettings) != len(data.previousTransaction.LinkedTransactions)

	if len(data.req.SplitSettings) > 0 {
		err := s.injectUserConnectionsOnSplitSettings(ctx, data.userID, data.req.SplitSettings)
		if err != nil {
			return updateChanges{}, err
		}

		// se a quantidade de splits nao mudou, pode acontecer que uma conexao existente foi removida e uma nova foi adicionada
		if !splitHasChanged {
			userIDAccountIDMapPrevious := lo.Reduce(data.previousTransaction.LinkedTransactions, func(agg map[int]int, transaction domain.Transaction, _ int) map[int]int {
				agg[transaction.UserID] = transaction.AccountID
				return agg
			}, map[int]int{})

			userIDAccountIDMapCurrent := make(map[int]int)
			for _, splitSetting := range data.req.SplitSettings {
				if splitSetting.UserConnection == nil {
					continue
				}

				userIDAccountIDMapCurrent[splitSetting.UserConnection.ToUserID] = splitSetting.UserConnection.ToAccountID
			}

			for userID, prevAccountID := range userIDAccountIDMapPrevious {
				if currentAccountID, exist := userIDAccountIDMapCurrent[userID]; !exist || prevAccountID != currentAccountID {
					splitHasChanged = true
					break
				}
			}

		}
	}

	return updateChanges{
		Value:           scenario,
		SplitHasChanged: splitHasChanged,
		HadRecurrence:   data.previousTransaction.TransactionRecurrenceID != nil,
	}, nil
}

func (s *transactionService) normalizeInstallments(ctx context.Context, data *transactionUpdateData) error {
	if len(data.transactions) == 0 {
		return nil
	}

	// For propagation=current with an existing recurrence, the other installments were not
	// fetched and must not be touched — skip all normalization.
	if data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrent &&
		data.scenario.HadRecurrence {
		return nil
	}

	r := data.transactions[0].TransactionRecurrence

	if r == nil && data.currentTransaction.TransactionRecurrenceID == nil {
		return nil
	}

	if r == nil {
		r = &domain.TransactionRecurrence{
			Installments: 0,
		}
	}

	// Determine the starting installment number to compute expected transaction count.
	// For offset installments (e.g., current_installment=4, total=12), the first
	// transaction has InstallmentNumber=4, and we expect 9 transactions (not 12).
	minInstallment := 1
	if data.transactions[0].InstallmentNumber != nil && *data.transactions[0].InstallmentNumber > 0 {
		minInstallment = *data.transactions[0].InstallmentNumber
	}
	expectedCount := r.Installments - minInstallment + 1
	if expectedCount < 0 {
		expectedCount = 0
	}

	for i := range data.transactions {

		if expectedCount >= i+1 {
			continue
		}

		// reduziu numero de parcelas, remove a transação e todas as parcelas associadas
		data.transactionIDsToRemove[data.transactions[i].ID] = true

		for j := range data.transactions[i].LinkedTransactions {
			data.transactionIDsToRemove[data.transactions[i].LinkedTransactions[j].ID] = true
		}

		data.transactions[i].LinkedTransactions = nil

	}

	existingCount := len(data.transactions)
	if expectedCount > existingCount {
		base := data.currentTransaction
		lastInstallment := minInstallment + existingCount - 1
		// Use the last existing transaction's date as the anchor for new installments,
		// so dates continue sequentially from where the series left off.
		lastExisting, ok := lo.Last(data.transactions)
		if !ok {
			applog.FromContext(ctx).With("abort_recurrence_normalize", "last_transaction_not_found")
			return nil
		}
		lastExistingDate := lastExisting.Date
		for i := existingCount; i < expectedCount; i++ {
			installmentNum := lastInstallment + (i - existingCount) + 1
			increment := i - existingCount + 1
			data.transactions = append(data.transactions, &domain.Transaction{
				ID:                      0,
				InstallmentNumber:       lo.ToPtr(installmentNum),
				Date:                    s.incrementInstallmentDate(lastExistingDate, r.Type, increment),
				UserID:                  base.UserID,
				OriginalUserID:          base.OriginalUserID,
				Type:                    base.Type,
				OperationType:           base.OperationType,
				AccountID:               base.AccountID,
				CategoryID:              base.CategoryID,
				Amount:                  base.Amount,
				Description:             base.Description,
				Tags:                    base.Tags,
				TransactionRecurrenceID: base.TransactionRecurrenceID,
				TransactionRecurrence:   base.TransactionRecurrence,
			})
		}
	}

	return nil
}

func (s *transactionService) rebuildTransactions(
	ctx context.Context,
	data *transactionUpdateData,
) error {

	var userIDAccountIDMap map[int]int
	if data.scenario.SplitHasChanged {
		userIDAccountIDMap = lo.Reduce(data.req.SplitSettings, func(agg map[int]int, splitSetting domain.SplitSettings, _ int) map[int]int {
			conn := splitSetting.UserConnection
			agg[conn.ToUserID] = conn.ToAccountID
			return agg
		}, make(map[int]int))
	}

	// cache of recurrences created for new linked users during AddedSplit
	linkedUserRecurrenceByUserID := make(map[int]*domain.TransactionRecurrence)

	for i := range data.transactions {
		if !s.shouldUpdateTransactionBasedOnPropagationSettings(data.transactions[i], data) {
			continue
		}

		baseAmount := data.transactions[i].Amount
		if data.req.Amount != nil {
			baseAmount = *data.req.Amount
		}

		if data.scenario.RemovedSplit() || data.scenario.WasTransfer() {
			for j := range data.transactions[i].LinkedTransactions {
				data.transactionIDsToRemove[data.transactions[i].LinkedTransactions[j].ID] = true
			}

			data.transactions[i].LinkedTransactions = nil
		}

		isNewInstallment := data.transactions[i].ID == 0
		if data.scenario.AddedSplit() || (isNewInstallment && len(data.req.SplitSettings) > 0) {
			for j := range data.req.SplitSettings {
				splitSetting := data.req.SplitSettings[j]
				if splitSetting.UserConnection == nil {
					return pkgErrors.ErrSplitSettingInvalidConnectionID(j)
				}

				conn := splitSetting.UserConnection
				amount := s.calculateAmount(baseAmount, splitSetting)

				lt := domain.Transaction{
					ID:                0,
					Date:              adjustLinkedTransactionDay(data.transactions[i].Date, conn.ToLinkedTransactionDayOfMonth),
					Description:       data.transactions[i].Description,
					UserID:            conn.ToUserID,
					OriginalUserID:    &data.userID,
					Type:              data.transactions[i].Type,
					OperationType:     data.transactions[i].OperationType,
					AccountID:         conn.ToAccountID,
					CategoryID:        nil,
					Amount:            amount,
					Tags:              []domain.Tag{},
					InstallmentNumber: data.transactions[i].InstallmentNumber,
				}

				// if the parent has a recurrence, create one for the linked user too
				if data.transactions[i].TransactionRecurrenceID != nil && data.transactions[i].TransactionRecurrence != nil {
					r, ok := linkedUserRecurrenceByUserID[conn.ToUserID]
					if !ok {
						parentR := data.transactions[i].TransactionRecurrence
						created, err := s.transactionRecurRepo.Create(ctx, &domain.TransactionRecurrence{
							UserID:       conn.ToUserID,
							Type:         parentR.Type,
							Installments: parentR.Installments,
						})
						if err != nil {
							return err
						}
						linkedUserRecurrenceByUserID[conn.ToUserID] = created
						r = created
					}
					lt.TransactionRecurrenceID = &r.ID
					lt.TransactionRecurrence = r
				}

				data.transactions[i].LinkedTransactions = append(data.transactions[i].LinkedTransactions, lt)
			}
		} else if data.req.Amount != nil && len(data.req.SplitSettings) > 0 && !data.scenario.SplitHasChanged && !data.scenario.TypeChangedToTransfer() && !data.scenario.RemainedTransfer() {
			// Amount changed but split connections are unchanged: recalculate linked transaction amounts.
			toAccountByUserID := make(map[int]domain.SplitSettings, len(data.req.SplitSettings))
			for _, ss := range data.req.SplitSettings {
				if ss.UserConnection != nil {
					toAccountByUserID[ss.UserConnection.ToUserID] = ss
				}
			}
			for j := range data.transactions[i].LinkedTransactions {
				lt := &data.transactions[i].LinkedTransactions[j]
				if ss, ok := toAccountByUserID[lt.UserID]; ok {
					lt.Amount = s.calculateAmount(baseAmount, ss)
				}
			}
		} else if data.scenario.SplitHasChanged && !data.scenario.TypeChangedToTransfer() && !data.scenario.RemainedTransfer() {
			linkedTransactions := make([]domain.Transaction, 0, len(userIDAccountIDMap))
			transactionsByUserIDMap := make(map[int]*domain.Transaction, len(data.transactions[i].LinkedTransactions))

			// remove as transactions que foram removidas e atualiza as que continuam existindo
			for j := range data.transactions[i].LinkedTransactions {
				if accountID, exist := userIDAccountIDMap[data.transactions[i].LinkedTransactions[j].UserID]; !exist {
					data.transactionIDsToRemove[data.transactions[i].LinkedTransactions[j].ID] = true
					continue
				} else if accountID != data.transactions[i].LinkedTransactions[j].AccountID {
					data.transactions[i].LinkedTransactions[j].AccountID = accountID
				}

				linkedTransactions = append(linkedTransactions, data.transactions[i].LinkedTransactions[j])

				if _, exist := transactionsByUserIDMap[data.transactions[i].LinkedTransactions[j].UserID]; !exist {
					transactionsByUserIDMap[data.transactions[i].LinkedTransactions[j].UserID] = &data.transactions[i].LinkedTransactions[j]
				}
			}

			for _, splitSetting := range data.req.SplitSettings {
				if splitSetting.UserConnection == nil {
					return pkgErrors.ErrSplitSettingInvalidConnectionID(i)
				}

				conn := splitSetting.UserConnection

				amount := s.calculateAmount(baseAmount, splitSetting)

				t, found := transactionsByUserIDMap[conn.ToUserID]
				if found {
					t.Amount = amount
					continue
				}

				data.transactions[i].LinkedTransactions = append(data.transactions[i].LinkedTransactions, domain.Transaction{
					ID:             0,
					Date:           adjustLinkedTransactionDay(data.transactions[i].Date, conn.ToLinkedTransactionDayOfMonth),
					Description:    data.transactions[i].Description,
					UserID:         conn.ToUserID,
					OriginalUserID: &data.userID,
					Type:           data.transactions[i].Type,
					OperationType:  data.transactions[i].OperationType,
					AccountID:      conn.ToAccountID,
					CategoryID:     nil,
					Amount:         amount,
					Tags:           []domain.Tag{},
					CreatedAt:      nil,
					UpdatedAt:      nil,
				})
			}

		}

		if data.scenario.TypeChangedToTransfer() || data.scenario.RemainedTransfer() {
			if err := s.rebuildTransferLinkedTransactions(ctx, data.transactions[i], data, baseAmount); err != nil {
				return err
			}
		} else if data.scenario.TypeChanged() {
			data.transactions[i].SetType(*data.req.TransactionType)

			for j := range data.transactions[i].LinkedTransactions {
				data.transactions[i].LinkedTransactions[j].SetType(*data.req.TransactionType)
			}
		}
	}

	return nil
}

func (s *transactionService) rebuildTransferLinkedTransactions(
	ctx context.Context,
	tx *domain.Transaction,
	data *transactionUpdateData,
	baseAmount int64,
) error {
	// Remove all existing linked transactions. For TypeChangedToTransfer these are
	// split-linked txs; for RemainedTransfer these are the old credit/debit txs that
	// must be replaced by the new ones built below.
	for j := range tx.LinkedTransactions {
		if tx.LinkedTransactions[j].ID > 0 {
			data.transactionIDsToRemove[tx.LinkedTransactions[j].ID] = true
		}
	}

	tx.Type = domain.TransactionTypeTransfer
	tx.OperationType = domain.OperationTypeDebit
	tx.CategoryID = nil
	tx.AccountID = lo.FromPtr(lo.CoalesceOrEmpty(data.req.AccountID, &tx.AccountID))
	tx.Amount = baseAmount

	accountID := *data.req.DestinationAccountID

	if data.scenario.IsTransferToSameUser() {
		tx.LinkedTransactions = []domain.Transaction{
			{
				ID:                      0,
				InstallmentNumber:       tx.InstallmentNumber,
				Date:                    tx.Date,
				Description:             tx.Description,
				UserID:                  tx.UserID,
				OriginalUserID:          tx.OriginalUserID,
				Type:                    domain.TransactionTypeTransfer,
				OperationType:           domain.OperationTypeCredit,
				AccountID:               accountID,
				CategoryID:              nil,
				Amount:                  baseAmount,
				Tags:                    tx.Tags,
				TransactionRecurrenceID: tx.TransactionRecurrenceID,
			},
		}
		return nil
	}

	c, err := s.getConnectionFromDestinationAccountID(ctx, data.userID, accountID)
	if err != nil {
		return err
	}

	c.SwapIfNeeded(data.userID)

	// Cross-user transfer: create both the fromTx (author's credit on shared account)
	// and the toTx (receiver's credit on their shared account), matching the creation
	// logic in injectLinkedTransactions.
	fromTx := domain.Transaction{
		ID:                      0,
		InstallmentNumber:       tx.InstallmentNumber,
		Date:                    tx.Date,
		Description:             tx.Description,
		UserID:                  c.FromUserID,
		OriginalUserID:          tx.OriginalUserID,
		Type:                    domain.TransactionTypeTransfer,
		OperationType:           domain.OperationTypeCredit,
		AccountID:               c.FromAccountID,
		CategoryID:              nil,
		Amount:                  baseAmount,
		Tags:                    []domain.Tag{},
		TransactionRecurrenceID: tx.TransactionRecurrenceID,
	}

	toTx := domain.Transaction{
		ID:                0,
		InstallmentNumber: tx.InstallmentNumber,
		Date:              tx.Date,
		Description:       tx.Description,
		UserID:            c.ToUserID,
		OriginalUserID:    tx.OriginalUserID,
		Type:              domain.TransactionTypeTransfer,
		OperationType:     domain.OperationTypeCredit,
		AccountID:         c.ToAccountID,
		CategoryID:        nil,
		Amount:            baseAmount,
		Tags:              []domain.Tag{},
	}

	// Propagate recurrence to the toTx: reuse the cached recurrence for the toUser
	// or create a new one (once), matching the creation logic in injectLinkedTransactions.
	if tx.TransactionRecurrenceID != nil && tx.TransactionRecurrence != nil {
		if data.transferToUserRecurrence == nil {
			r, err := s.transactionRecurRepo.Create(ctx, &domain.TransactionRecurrence{
				UserID:       c.ToUserID,
				Type:         tx.TransactionRecurrence.Type,
				Installments: tx.TransactionRecurrence.Installments,
			})
			if err != nil {
				return err
			}
			data.transferToUserRecurrence = r
		}
		toTx.TransactionRecurrenceID = &data.transferToUserRecurrence.ID
		toTx.InstallmentNumber = tx.InstallmentNumber
	}

	tx.LinkedTransactions = []domain.Transaction{fromTx, toTx}
	return nil
}

// shouldSyncSettlementsOnUpdate reports whether an existing transaction's
// settlements may have been invalidated by the current update request.
// Settlements only depend on `amount`, `account_id`, split membership, and
// transaction type — pure category/date/description edits leave settlements
// untouched, so we skip the delete+recreate that would otherwise churn IDs and
// (for non-original linked-tx edits) create stray settlements (#117).
//
// Linked-tx edits never recompute settlements via `own`: the partner's tx is
// not a valid `SourceTransactionID` key. Amount-driven recomputes are handled
// on the source transaction after propagation in `Update`.
func (s *transactionService) shouldSyncSettlementsOnUpdate(data *transactionUpdateData) bool {
	if data.isLinkedTxEdit {
		return false
	}

	req := data.req
	if req.Amount != nil {
		return true
	}
	if lo.FromPtr(req.AccountID) > 0 {
		return true
	}
	if data.scenario.SplitHasChanged {
		return true
	}
	if data.scenario.TypeChanged() {
		return true
	}
	// A custom settlement date on any split shifts the affected settlements
	// even when the split membership itself is unchanged.
	for _, ss := range req.SplitSettings {
		if ss.Date != nil {
			return true
		}
	}
	return false
}

func (s *transactionService) deleteSettlementsForSource(ctx context.Context, sourceTransactionID int) error {
	existing, err := s.services.Settlement.Search(ctx, domain.SettlementFilter{
		SourceTransactionIDs: []int{sourceTransactionID},
	})
	if err != nil {
		return err
	}
	if len(existing) == 0 {
		return nil
	}
	ids := make([]int, len(existing))
	for i, st := range existing {
		ids[i] = st.ID
	}
	return s.services.Settlement.Delete(ctx, ids)
}

func (s *transactionService) syncSettlementsForTransaction(ctx context.Context, userID int, data *transactionUpdateData, own *domain.Transaction) error {
	if own.Type.IsTransfer() || len(own.LinkedTransactions) == 0 {
		return s.deleteSettlementsForSource(ctx, own.ID)
	}

	// Shared (connection) account expenses/incomes mirror to the partner via a
	// linked transaction but never produce a settlement — the same guard exists
	// in Create at transaction_create.go:252. Without this short-circuit, editing
	// a shared-account transaction would treat the partner's mirrored row as a
	// split partner and create a stray settlement.
	//
	// We deliberately do NOT clean up any pre-existing settlements here: a
	// settlement may carry a user-customized date, and silently deleting it on
	// an unrelated edit (amount/description) would destroy that data. The
	// shared-account invariant means none should exist in the first place; if
	// one does, leave it alone.
	account, err := s.services.Account.GetByID(ctx, userID, own.AccountID)
	if err != nil {
		return err
	}
	if account.UserConnection != nil {
		return nil
	}

	settlementType := domain.SettlementTypeCredit
	if own.Type == domain.TransactionTypeIncome {
		settlementType = domain.SettlementTypeDebit
	}

	existing, err := s.services.Settlement.Search(ctx, domain.SettlementFilter{
		SourceTransactionIDs: []int{own.ID},
	})
	if err != nil {
		return err
	}
	// Existing settlements indexed by parent (linked) transaction id so we can
	// match each one to a current LinkedTransaction and update it in place.
	// Tearing down and recreating churns settlement IDs, which breaks concurrent
	// callers — e.g. a bulk action that targets settlement.ID at the same time
	// the source transaction is being updated would get a not-found because
	// the recreated settlement has a fresh ID.
	existingByParentID := make(map[int]*domain.Settlement, len(existing))
	for _, s := range existing {
		existingByParentID[s.ParentTransactionID] = s
	}

	// Map counterpart's connection account ID → author's connection account ID.
	// lt.AccountID is set to connection.ToAccountID in injectLinkedTransactions/rebuildTransactions.
	// Only consider linked transactions belonging to other users (skip same-user from-side).
	connAccountByToAccount := make(map[int]int, len(own.LinkedTransactions))
	if len(own.LinkedTransactions) > 0 {
		var toAccountIDs []int
		for _, lt := range own.LinkedTransactions {
			if lt.UserID != userID {
				toAccountIDs = append(toAccountIDs, lt.AccountID)
			}
		}
		conns, err := s.services.UserConnection.Search(ctx, domain.UserConnectionSearchOptions{
			AccountIDs: toAccountIDs,
		})
		if err != nil {
			return err
		}
		for _, conn := range conns {
			conn.SwapIfNeeded(userID)
			connAccountByToAccount[conn.ToAccountID] = conn.FromAccountID
		}
	}

	// Map of ToAccountID → custom settlement date diff taken from the update request's
	// split_settings. The user's date input is the intended settlement date for the
	// EDITED installment (data.currentTransaction, whose Date already reflects any
	// requested date change). For every other affected installment in the recurrence
	// we shift its own date by the same diff so the offset between the installment
	// date and the settlement date stays consistent.
	requestedDateDiffByToAccount := make(map[int]time.Duration, len(data.req.SplitSettings))
	for _, ss := range data.req.SplitSettings {
		if ss.UserConnection == nil || ss.Date == nil {
			continue
		}
		conn := *ss.UserConnection
		conn.SwapIfNeeded(userID)
		requestedDateDiffByToAccount[conn.ToAccountID] = ss.Date.Time.Sub(data.currentTransaction.Date)
	}

	keptParentIDs := make(map[int]bool, len(own.LinkedTransactions))

	for _, lt := range own.LinkedTransactions {
		// Skip linked transactions belonging to the same user (e.g. the from-side
		// of a split on the author's connection account). Settlements only track
		// debts between different users.
		if lt.UserID == userID {
			continue
		}

		accountID := own.AccountID
		if connAccount, ok := connAccountByToAccount[lt.AccountID]; ok {
			accountID = connAccount
		}

		if existingSettlement, ok := existingByParentID[lt.ID]; ok {
			// In-place update: preserve the settlement ID. Date precedence is
			// explicit request override (own.Date + diff) > existing record's
			// date — the source transaction's date never overwrites a settlement
			// that already exists, which keeps any previously customized date
			// sticky when the request didn't override it.
			settlementDate := existingSettlement.Date
			if diff, ok := requestedDateDiffByToAccount[lt.AccountID]; ok {
				settlementDate = own.Date.Add(diff)
			}

			existingSettlement.Amount = lt.Amount
			existingSettlement.Type = settlementType
			existingSettlement.AccountID = accountID
			existingSettlement.Date = settlementDate

			if err := s.services.Settlement.Update(ctx, existingSettlement); err != nil {
				return err
			}
			keptParentIDs[lt.ID] = true
			continue
		}

		// New settlement (newly added split). Date precedence: explicit request
		// override (own.Date + diff) > source transaction's current date.
		settlementDate := own.Date
		if diff, ok := requestedDateDiffByToAccount[lt.AccountID]; ok {
			settlementDate = own.Date.Add(diff)
		}

		_, err := s.services.Settlement.Create(ctx, &domain.Settlement{
			UserID:              userID,
			Amount:              lt.Amount,
			Type:                settlementType,
			AccountID:           accountID,
			SourceTransactionID: own.ID,
			ParentTransactionID: lt.ID,
			Date:                settlementDate,
		})
		if err != nil {
			return err
		}
	}

	// Delete only orphans — settlements whose parent linked transaction is no
	// longer present (split removed, connection swapped, etc.).
	orphanIDs := make([]int, 0)
	for parentID, st := range existingByParentID {
		if !keptParentIDs[parentID] {
			orphanIDs = append(orphanIDs, st.ID)
		}
	}
	if len(orphanIDs) > 0 {
		if err := s.services.Settlement.Delete(ctx, orphanIDs); err != nil {
			return err
		}
	}

	return nil
}

func (s *transactionService) shouldUpdateTransactionBasedOnPropagationSettings(t *domain.Transaction, data *transactionUpdateData) bool {
	// se a transação é nova, atualiza ela
	if t.ID == 0 {
		return true
	}

	if data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrent && t.ID != data.currentTransaction.ID {
		return false
	} else if data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrentAndFuture &&
		t.ID != data.currentTransaction.ID &&
		!t.Date.After(data.currentTransaction.Date) {
		return false
	}

	return true
}

func (s *transactionService) handlerRecurrenceUpdate(
	ctx context.Context,
	data *transactionUpdateData,
) error {
	// RecurrenceSettings is a disallowed field for linked transaction edits, so a
	// missing value here must not be interpreted as "remove the recurrence".
	if data.isLinkedTxEdit {
		return nil
	}

	if data.req.RecurrenceSettings == nil && data.previousTransaction.TransactionRecurrenceID == nil {
		return nil
	}

	if data.req.RecurrenceSettings == nil && data.previousTransaction.TransactionRecurrenceID != nil {
		// propagation=current: only detach the current transaction from the recurrence.
		// The recurrence record itself must be preserved because other installments still reference it.
		if data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrent {
			data.currentTransaction.TransactionRecurrenceID = nil
			data.currentTransaction.TransactionRecurrence = nil
			return nil
		}

		recurrenceIDs := []int{}
		for i := range data.transactions {
			if data.transactions[i].TransactionRecurrenceID == nil {
				continue
			}

			recurrenceIDs = append(recurrenceIDs, *data.transactions[i].TransactionRecurrenceID)

			for j := range data.transactions[i].LinkedTransactions {
				if data.transactions[i].LinkedTransactions[j].TransactionRecurrenceID == nil {
					continue
				}

				recurrenceIDs = append(recurrenceIDs, *data.transactions[i].LinkedTransactions[j].TransactionRecurrenceID)
			}

			// mark all installments except the one being updated for removal
			if data.transactions[i].ID != data.previousTransaction.ID {
				data.transactionIDsToRemove[data.transactions[i].ID] = true
				for j := range data.transactions[i].LinkedTransactions {
					data.transactionIDsToRemove[data.transactions[i].LinkedTransactions[j].ID] = true
				}
				data.transactions[i].LinkedTransactions = nil
			} else {
				// clear recurrence from the current transaction
				data.transactions[i].TransactionRecurrenceID = nil
				data.transactions[i].TransactionRecurrence = nil
			}
		}

		// keep only the current transaction in data.transactions
		data.transactions = lo.Filter(data.transactions, func(t *domain.Transaction, _ int) bool {
			return t.ID == data.previousTransaction.ID
		})

		// propagation=current_and_future: past installments (not fetched) still reference the recurrence
		// record, so we must not delete it.
		hasPastInstallments := data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrentAndFuture &&
			lo.FromPtr(data.previousTransaction.InstallmentNumber) > 1

		if !hasPastInstallments {
			if err := s.transactionRecurRepo.Delete(ctx, recurrenceIDs); err != nil {
				return err
			}
		}

		return nil
	}

	// For propagation=current with an existing recurrence, the recurrence is shared with
	// other installments — we must not modify or recreate it. normalizeInstallments will
	// also be skipped so no new stubs are created.
	if data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrent &&
		data.scenario.HadRecurrence {
		return nil
	}

	if rErrs := s.validateRecurrenceSettings(data.req.RecurrenceSettings); len(rErrs) > 0 {
		return pkgErrors.ServiceErrors(rErrs)
	}

	// For propagation=current_and_future when past installments exist, the old recurrence
	// must be shrunk to cover only the past installments, and a new recurrence must be
	// created for the current+future batch — but only when the recurrence itself actually
	// changed. Edits that leave Type and TotalInstallments untouched (e.g. split-only,
	// description-only) must keep the original recurrence and preserve installment numbers.
	hasPastInstallments := data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrentAndFuture &&
		lo.FromPtr(data.previousTransaction.InstallmentNumber) > 1

	previousRecurrence := data.previousTransaction.TransactionRecurrence
	recurrenceSettingsChanged := previousRecurrence == nil ||
		data.req.RecurrenceSettings.Type != previousRecurrence.Type ||
		data.req.RecurrenceSettings.TotalInstallments != previousRecurrence.Installments

	shouldSplitRecurrence := hasPastInstallments && recurrenceSettingsChanged

	if shouldSplitRecurrence && data.previousTransaction.TransactionRecurrenceID != nil {
		oldRecurrence := data.previousTransaction.TransactionRecurrence
		oldRecurrence.Installments = lo.FromPtr(data.previousTransaction.InstallmentNumber) - 1
		if err := s.transactionRecurRepo.Update(ctx, oldRecurrence); err != nil {
			return err
		}

		// Clear recurrenceID so upsertRecurrence creates a fresh recurrence for this batch
		for i := range data.transactions {
			data.transactions[i].TransactionRecurrenceID = nil
			for j := range data.transactions[i].LinkedTransactions {
				data.transactions[i].LinkedTransactions[j].TransactionRecurrenceID = nil
			}
		}
	}

	recurrenceByUserID := make(map[int]domain.TransactionRecurrence)

	upsertRecurrence := func(userID int, t domain.Transaction) (domain.TransactionRecurrence, error) {
		if r, ok := recurrenceByUserID[userID]; ok {
			return r, nil
		}

		// CurrentInstallment is only used when converting a standalone transaction
		// to a recurrence (sets the starting offset). When the transaction already
		// had a recurrence, existing installment numbers are preserved.
		recurrence := domain.RecurrenceFromSettings(*data.req.RecurrenceSettings, userID)
		if t.TransactionRecurrenceID != nil {
			recurrence.ID = *t.TransactionRecurrenceID

			err := s.transactionRecurRepo.Update(ctx, recurrence)
			if err != nil {
				return domain.TransactionRecurrence{}, err
			}

			recurrenceByUserID[userID] = *recurrence

			return *recurrence, nil
		}

		r, err := s.transactionRecurRepo.Create(ctx, recurrence)
		if err != nil {
			return domain.TransactionRecurrence{}, err
		}

		recurrenceByUserID[userID] = *r

		return *r, nil
	}

	r, err := upsertRecurrence(data.userID, *data.currentTransaction)
	if err != nil {
		return err
	}

	for i := range data.transactions {
		data.transactions[i].TransactionRecurrence = &r
		data.transactions[i].TransactionRecurrenceID = &r.ID

		if data.scenario.HadRecurrence && !shouldSplitRecurrence {
			// Preserve existing installment numbers — either propagation!=current_and_future
			// (numbers already correct from creation) or current_and_future where the
			// recurrence itself is untouched (split-only, description-only, etc.).
		} else if !data.scenario.HadRecurrence {
			// Standalone → recurrence: number from CurrentInstallment.
			startFrom := data.req.RecurrenceSettings.CurrentInstallment
			data.transactions[i].InstallmentNumber = lo.ToPtr(startFrom + i)
		} else {
			// current_and_future with past installments AND the recurrence itself changed
			// (new type or new total): fresh recurrence, renumber from 1.
			data.transactions[i].InstallmentNumber = lo.ToPtr(i + 1)
		}

		for j := range data.transactions[i].LinkedTransactions {
			rlt, err := upsertRecurrence(data.transactions[i].LinkedTransactions[j].UserID, data.transactions[i].LinkedTransactions[j])
			if err != nil {
				return err
			}

			data.transactions[i].LinkedTransactions[j].TransactionRecurrence = &rlt
			data.transactions[i].LinkedTransactions[j].TransactionRecurrenceID = &rlt.ID
			data.transactions[i].LinkedTransactions[j].InstallmentNumber = data.transactions[i].InstallmentNumber
		}
	}

	return nil
}

func (s *transactionService) fetchRelatedTransactions(
	ctx context.Context,
	data *transactionUpdateData) error {

	// Seed the list with the MUTABLE clone (currentTransaction); the pristine
	// previousTransaction is never placed in data.transactions so the update loop
	// cannot mutate the before-snapshot. The remaining read-only filters below use
	// previousTransaction since both hold identical values at this point (before any
	// mutation) and it documents that we are keying off the original installment.
	transactions := []*domain.Transaction{data.currentTransaction}
	hasInstallments := data.previousTransaction.TransactionRecurrenceID != nil && data.previousTransaction.InstallmentNumber != nil

	// propagation current atualiza somente a transação atual e linked transactions
	shouldUpdateInstallments := hasInstallments && data.req.PropagationSettings != domain.TransactionPropagationSettingsCurrent

	if shouldUpdateInstallments {
		var installmentNumberFilter *domain.ComparableSearch[int]
		switch data.req.PropagationSettings {
		case domain.TransactionPropagationSettingsAll:
			installmentNumberFilter = &domain.ComparableSearch[int]{
				GreaterThanOrEqual: lo.ToPtr(1),
			}
		case domain.TransactionPropagationSettingsCurrentAndFuture:
			installmentNumberFilter = &domain.ComparableSearch[int]{
				GreaterThanOrEqual: lo.ToPtr(lo.FromPtr(data.previousTransaction.InstallmentNumber) + 1),
			}
		}

		idsNotIn := []int{data.previousTransaction.ID}

		// Fetch remaining installments on the same account. The AccountIDs filter
		// prevents picking up fromTx children of cross-user transfers that share
		// the author's recurrence ID but live on the shared account.
		recurrenceTransactions, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{
			RecurrenceIDs:     []int{*data.previousTransaction.TransactionRecurrenceID},
			AccountIDs:        []int{data.previousTransaction.AccountID},
			InstallmentNumber: installmentNumberFilter,
			IDsNotIn:          idsNotIn,
		})
		if err != nil {
			return pkgErrors.Internal("failed to get recurrence transactions", err)
		}

		transactions = append(transactions, recurrenceTransactions...)
	}

	if hasInstallments {
		slices.SortFunc(transactions, func(a, b *domain.Transaction) int {
			return lo.FromPtr(a.InstallmentNumber) - lo.FromPtr(b.InstallmentNumber)
		})
	}

	data.transactions = append(data.transactions, transactions...)

	return nil
}

func (s *transactionService) validateUpdateTransactionRequest(ctx context.Context, userID int, transaction domain.Transaction, req *domain.TransactionUpdateRequest) []*pkgErrors.ServiceError {
	errs := []*pkgErrors.ServiceError{}

	if transaction.OriginalUserID != nil && *transaction.OriginalUserID != userID && transaction.UserID != userID {
		errs = append(errs, pkgErrors.ErrParentTransactionBelongsToAnotherUser)
	}

	if req.TransactionType != nil && !req.TransactionType.IsValid() {
		errs = append(errs, pkgErrors.ErrInvalidTransactionType(*req.TransactionType))
	}

	// Transactions generated by a charge settlement are structurally bound to the
	// charge: their type cannot change and they cannot become recurring.
	if transaction.ChargeID != nil {
		if req.TransactionType != nil && *req.TransactionType != transaction.Type {
			errs = append(errs, pkgErrors.ErrChargeTransactionTypeCannotChange)
		}
		if req.RecurrenceSettings != nil {
			errs = append(errs, pkgErrors.ErrChargeTransactionRecurrenceNotAllowed)
		}
	}

	sourceIDs, _ := s.transactionRepo.GetSourceTransactionIDs(ctx, transaction.ID)
	isLinkedTransaction := len(sourceIDs) > 0
	if isLinkedTransaction {
		// amount, date, description, tags and category_id are allowed for linked tx edits.
		disallowedFieldSet := lo.FromPtr(req.AccountID) > 0 ||
			req.TransactionType != nil ||
			req.RecurrenceSettings != nil ||
			len(req.SplitSettings) > 0 ||
			req.DestinationAccountID != nil
		if disallowedFieldSet {
			errs = append(errs, pkgErrors.ErrLinkedTransactionDisallowedFieldChanged)
		}
	}

	if lo.FromPtr(req.AccountID) > 0 {
		if isLinkedTransaction {
			errs = append(errs, pkgErrors.ErrAccountCannotBeChangedForSharedTransactions)
		} else {
			_, err := s.services.Account.GetByID(ctx, userID, *req.AccountID)
			if err != nil {
				errs = append(errs, pkgErrors.NotFound("account"))
			}
		}
	}

	if lo.FromPtr(req.CategoryID) > 0 {
		_, err := s.services.Category.GetByID(ctx, userID, *req.CategoryID)
		if err != nil {
			errs = append(errs, pkgErrors.NotFound("category"))
		}
	}

	if req.Amount != nil && *req.Amount <= 0 {
		errs = append(errs, pkgErrors.ErrAmountMustBeGreaterThanZero)
	}

	if req.Date != nil && req.Date.IsZero() {
		errs = append(errs, pkgErrors.ErrDateIsRequired)
	}

	if req.Description != nil && strings.TrimSpace(*req.Description) == "" {
		errs = append(errs, pkgErrors.ErrDescriptionIsRequired)
	}

	if len(req.Tags) > 0 {
		for i, tag := range req.Tags {
			if strings.TrimSpace(tag.Name) == "" {
				errs = append(errs, pkgErrors.ErrTagNameCannotBeEmpty(i))
			}
		}
	}

	if req.RecurrenceSettings != nil {
		if rErrs := s.validateRecurrenceSettings(req.RecurrenceSettings); len(rErrs) > 0 {
			errs = append(errs, rErrs...)
		}
	}

	if lo.FromPtr(req.TransactionType) == domain.TransactionTypeTransfer {
		if req.DestinationAccountID == nil {
			errs = append(errs, pkgErrors.ErrMissingDestinationAccount)
		} else if req.AccountID != nil && *req.DestinationAccountID == *req.AccountID {
			errs = append(errs, pkgErrors.ErrTransferSourceMustDifferFromDestination)
		}

		if len(req.SplitSettings) > 0 {
			errs = append(errs, pkgErrors.ErrSplitSettingsNotAllowedForTransfer)
		}
	}

	if len(req.SplitSettings) > 0 {
		for i, splitSetting := range req.SplitSettings {
			if splitSetting.ConnectionID <= 0 {
				errs = append(errs, pkgErrors.ErrSplitSettingInvalidConnectionID(i))
			}

			if splitSetting.Percentage == nil && splitSetting.Amount == nil {
				errs = append(errs, pkgErrors.ErrSplitSettingPercentageOrAmountIsRequired(i))
			}

			if splitSetting.Percentage != nil && splitSetting.Amount != nil {
				errs = append(errs, pkgErrors.ErrSplitSettingPercentageAndAmountCannotBeUsedTogether(i))
			}

			if splitSetting.Percentage != nil && (*splitSetting.Percentage < 1 || *splitSetting.Percentage > 100) {
				errs = append(errs, pkgErrors.ErrSplitSettingPercentageMustBeBetween1And100(i))
			}

			if splitSetting.Amount != nil && *splitSetting.Amount <= 0 {
				errs = append(errs, pkgErrors.ErrSplitSettingAmountMustBeGreaterThanZero(i))
			}
		}
	}

	return errs
}

// maybeDispatchSplitUpdatedNotification fires split_updated notifications for
// partner-initiated edits that affect the linked split side. It is called after
// the DB transaction commits (NOTIF-04).
//
// Detection rules (D-01 through D-04):
//   - D-01: fires only on AddedSplit / RemovedSplit / linked-side amount change.
//   - D-02: cosmetic-only edits (category/description/date) hit no switch arm → no fire.
//   - D-03: self-edit guard — the original author editing their own tx never notifies.
//   - D-04: remove still notifies; entity_id points to the (soft-deleted) linked tx.
func (s *transactionService) maybeDispatchSplitUpdatedNotification(
	ctx context.Context,
	callerUserID int,
	sourceIDs []int,
	data *transactionUpdateData,
) {
	changes := data.scenario
	var events []domain.NotificationEvent

	switch {
	case changes.AddedSplit():
		// D-03: only fire when partner-initiated (caller != original author).
		// Explicitly check for nil to avoid lo.FromPtr returning 0, which would
		// cause the guard to never fire for legacy rows with nil OriginalUserID.
		if data.previousTransaction.OriginalUserID != nil &&
			callerUserID == *data.previousTransaction.OriginalUserID {
			return
		}
		// The recipient must deep-link to the linked tx THEY own (just created on
		// their connection account), not the author's source tx — which the
		// recipient can't fetch (inbox /by-ids returns empty). Re-fetch the source
		// with its freshly-created linked transactions and map by UserID.
		linkedTxIDByRecipient := make(map[int]int)
		//nolint:contextcheck // intentional detached context — runs post-commit, must use a fresh connection (NOTIF-06)
		if srcTx, err := s.transactionRepo.SearchOne(context.Background(), domain.TransactionFilter{IDs: []int{data.previousTransaction.ID}}); err == nil && srcTx != nil {
			for _, lt := range srcTx.LinkedTransactions {
				if lt.UserID != callerUserID {
					linkedTxIDByRecipient[lt.UserID] = lt.ID
				}
			}
		}
		for _, ss := range data.req.SplitSettings {
			if ss.UserConnection == nil {
				continue
			}
			recipientID := ss.UserConnection.ToUserID
			if recipientID == callerUserID {
				recipientID = ss.UserConnection.FromUserID
			}
			if recipientID == callerUserID {
				continue
			}
			entityID, ok := linkedTxIDByRecipient[recipientID]
			if !ok {
				continue
			}
			events = append(events, domain.NotificationEvent{
				RecipientUserID: recipientID,
				ActorUserID:     callerUserID,
				Type:            domain.NotificationTypeSplitUpdated,
				EntityType:      "transaction",
				EntityID:        entityID,
				Amount:          lo.FromPtr(data.req.Amount),
				Description:     data.previousTransaction.Description,
				TxKind:          string(data.previousTransaction.Type),
			})
		}

	case changes.RemovedSplit():
		// D-03: only fire when partner-initiated; D-04: removal still notifies.
		// Explicitly check for nil to avoid lo.FromPtr returning 0, which would
		// cause the guard to never fire for legacy rows with nil OriginalUserID.
		if data.previousTransaction.OriginalUserID != nil &&
			callerUserID == *data.previousTransaction.OriginalUserID {
			return
		}
		for _, lt := range data.previousTransaction.LinkedTransactions {
			if lt.UserID == callerUserID {
				continue
			}
			events = append(events, domain.NotificationEvent{
				RecipientUserID: lt.UserID,
				ActorUserID:     callerUserID,
				Type:            domain.NotificationTypeSplitUpdated,
				EntityType:      "transaction",
				EntityID:        lt.ID, // deep-link to the (soft-deleted) linked tx
				Amount:          lt.Amount,
				Description:     data.previousTransaction.Description,
			})
		}

	case data.isLinkedTxEdit && data.req.Amount != nil && *data.req.Amount > 0:
		// Caller IS the partner editing their linked tx amount.
		// Recipient = source transaction owner.
		for _, srcID := range sourceIDs {
			//nolint:contextcheck // intentional detached context for post-commit dispatch (NOTIF-06)
			sourceTx, err := s.transactionRepo.SearchOne(context.Background(), domain.TransactionFilter{
				IDs: []int{srcID},
			})
			if err != nil || sourceTx == nil {
				continue
			}
			if sourceTx.UserID == callerUserID {
				continue
			}
			events = append(events, domain.NotificationEvent{
				RecipientUserID: sourceTx.UserID,
				ActorUserID:     callerUserID,
				Type:            domain.NotificationTypeSplitUpdated,
				EntityType:      "transaction",
				EntityID:        srcID,
				Amount:          *data.req.Amount,
				Description:     sourceTx.Description,
			})
		}
	}

	if len(events) > 0 {
		//nolint:gosec,contextcheck // G118: intentional detached context — post-commit push dispatch must outlive request ctx (NOTIF-06)
		go s.services.Notification.Dispatch(context.Background(), events)
	}
}
