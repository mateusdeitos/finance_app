package service

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

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

	date := lo.CoalesceOrEmpty(req.Date, &previousTransaction.Date)
	dateDiff := lo.FromPtr(date).Sub(previousTransaction.Date)
	dateDiffDays := int(dateDiff.Hours() / 24)

	data := &transactionUpdateData{
		userID:                 userID,
		req:                    req,
		previousTransaction:    previousTransaction,
		transactions:           []*domain.Transaction{},
		transactionIDsToRemove: make(map[int]bool),
	}

	data.scenario, err = s.determineTypeUpdateScenario(ctx, data)
	if err != nil {
		return err
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
		}

		if req.Date != nil && !req.Date.IsZero() {
			own.Date = own.Date.AddDate(0, 0, dateDiffDays)

			for i := range own.LinkedTransactions {
				own.LinkedTransactions[i].Date = own.LinkedTransactions[i].Date.AddDate(0, 0, dateDiffDays)
			}
		}

		if req.Description != nil && strings.TrimSpace(*req.Description) != "" {
			own.Description = *req.Description

			for i := range own.LinkedTransactions {
				own.LinkedTransactions[i].Description = *req.Description
			}
		}

		own.Tags = req.Tags
		for i := range own.LinkedTransactions {
			if own.LinkedTransactions[i].UserID == userID {
				own.LinkedTransactions[i].Tags = req.Tags
			}
		}

		if own.ID == 0 {
			created, err := s.transactionRepo.Create(ctx, own)
			if err != nil {
				return err
			}
			own.ID = created.ID
			own.LinkedTransactions = created.LinkedTransactions

		} else {
			if err := s.transactionRepo.Update(ctx, own); err != nil {
				return err
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

		if err := s.syncSettlementsForTransaction(ctx, data.userID, own); err != nil {
			return err
		}

	}

	if len(data.transactionIDsToRemove) > 0 {
		if err := s.transactionRepo.Delete(ctx, lo.Keys(data.transactionIDsToRemove)); err != nil {
			return err
		}
	}

	return s.dbTransaction.Commit(ctx)
}

func (s *transactionService) determineTypeUpdateScenario(ctx context.Context, data *transactionUpdateData) (updateChanges, error) {
	newType := lo.FromPtr(lo.CoalesceOrEmpty(data.req.TransactionType, &data.previousTransaction.Type))
	hadSplitSettings := len(data.previousTransaction.LinkedTransactions) > 0 && data.previousTransaction.Type != domain.TransactionTypeTransfer
	hasSplitSettings := len(data.req.SplitSettings) > 0

	checkIsTransferToSameUser := func(accountID, userID int) (bool, error) {
		destinationAccount, err := s.services.Account.SearchOne(ctx, domain.AccountSearchOptions{
			IDs: []int{accountID},
		})
		if err != nil {
			return false, err
		}

		return destinationAccount.UserID == userID, nil
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

			transferWasToSameUser, err := checkIsTransferToSameUser(data.previousTransaction.AccountID, data.userID)
			if err != nil {
				return updateChanges{}, err
			}

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

func (s *transactionService) normalizeInstallments(_ context.Context, data *transactionUpdateData) error {
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

	if r == nil && data.previousTransaction.TransactionRecurrenceID == nil {
		return nil
	}

	if r == nil {
		r = &domain.TransactionRecurrence{
			Installments: 0,
		}
	}

	for i := range data.transactions {

		if r.Installments >= i+1 {
			continue
		}

		// reduziu numero de parcelas, remove a transação e todas as parcelas associadas
		data.transactionIDsToRemove[data.transactions[i].ID] = true

		for j := range data.transactions[i].LinkedTransactions {
			data.transactionIDsToRemove[data.transactions[i].LinkedTransactions[j].ID] = true
		}

		data.transactions[i].LinkedTransactions = nil

	}

	if r.Installments > len(data.transactions) {
		base := data.previousTransaction
		for i := len(data.transactions); i < r.Installments; i++ {
			baseDate := lo.CoalesceOrEmpty(data.req.Date, &base.Date)
			data.transactions = append(data.transactions, &domain.Transaction{
				ID:                      0,
				InstallmentNumber:       lo.ToPtr(i + 1),
				Date:                    s.incrementInstallmentDate(*baseDate, r.Type, i),
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
					ID:             0,
					Date:           data.transactions[i].Date,
					Description:    data.transactions[i].Description,
					UserID:         conn.ToUserID,
					OriginalUserID: &data.userID,
					Type:           data.transactions[i].Type,
					OperationType:  data.transactions[i].OperationType,
					AccountID:      conn.ToAccountID,
					CategoryID:     nil,
					Amount:         amount,
					Tags:           []domain.Tag{},
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
					Date:           data.transactions[i].Date,
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
			// Remove all existing linked transactions. For TypeChangedToTransfer these are
			// split-linked txs; for RemainedTransfer these are the old credit/debit txs that
			// must be replaced by the new ones built below.
			for j := range data.transactions[i].LinkedTransactions {
				if data.transactions[i].LinkedTransactions[j].ID > 0 {
					data.transactionIDsToRemove[data.transactions[i].LinkedTransactions[j].ID] = true
				}
			}

			userID := data.transactions[i].UserID
			accountID := *data.req.DestinationAccountID

			if !data.scenario.IsTransferToSameUser() {
				c, err := s.getConnectionFromDestinationAccountID(ctx, data.userID, accountID)
				if err != nil {
					return err
				}

				c.SwapIfNeeded(data.userID)

				userID = c.ToUserID
				accountID = c.ToAccountID
			}

			data.transactions[i].Type = domain.TransactionTypeTransfer
			data.transactions[i].OperationType = domain.OperationTypeDebit
			data.transactions[i].CategoryID = nil
			data.transactions[i].AccountID = lo.FromPtr(lo.CoalesceOrEmpty(data.req.AccountID, &data.transactions[i].AccountID))
			data.transactions[i].Amount = baseAmount

			data.transactions[i].LinkedTransactions = []domain.Transaction{
				{
					ID:             0,
					Date:           data.transactions[i].Date,
					Description:    data.transactions[i].Description,
					UserID:         userID,
					OriginalUserID: data.transactions[i].OriginalUserID,
					Type:           domain.TransactionTypeTransfer,
					OperationType:  domain.OperationTypeCredit,
					AccountID:      accountID,
					CategoryID:     nil,
					Amount:         baseAmount,
					Tags:           lo.Ternary(data.scenario.IsTransferToSameUser(), data.transactions[i].Tags, []domain.Tag{}),
					CreatedAt:      nil,
					UpdatedAt:      nil,
				},
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

func (s *transactionService) syncSettlementsForTransaction(ctx context.Context, userID int, own *domain.Transaction) error {
	if own.Type.IsTransfer() || len(own.LinkedTransactions) == 0 {
		existing, err := s.services.Settlement.Search(ctx, domain.SettlementFilter{
			SourceTransactionIDs: []int{own.ID},
		})
		if err != nil {
			return err
		}
		if len(existing) > 0 {
			ids := make([]int, len(existing))
			for i, s := range existing {
				ids[i] = s.ID
			}
			if err := s.services.Settlement.Delete(ctx, ids); err != nil {
				return err
			}
		}
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
	if len(existing) > 0 {
		ids := make([]int, len(existing))
		for i, s := range existing {
			ids[i] = s.ID
		}
		if err := s.services.Settlement.Delete(ctx, ids); err != nil {
			return err
		}
	}

	// Map counterpart's connection account ID → author's connection account ID.
	// lt.AccountID is set to connection.ToAccountID in injectLinkedTransactions/rebuildTransactions.
	connAccountByToAccount := make(map[int]int, len(own.LinkedTransactions))
	if len(own.LinkedTransactions) > 0 {
		toAccountIDs := make([]int, len(own.LinkedTransactions))
		for i, lt := range own.LinkedTransactions {
			toAccountIDs[i] = lt.AccountID
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

	for _, lt := range own.LinkedTransactions {
		accountID := own.AccountID
		if connAccount, ok := connAccountByToAccount[lt.AccountID]; ok {
			accountID = connAccount
		}

		_, err := s.services.Settlement.Create(ctx, &domain.Settlement{
			UserID:              userID,
			Amount:              lt.Amount,
			Type:                settlementType,
			AccountID:           accountID,
			SourceTransactionID: own.ID,
			ParentTransactionID: lt.ID,
		})
		if err != nil {
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

	if data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrent && t.ID != data.previousTransaction.ID {
		return false
	} else if data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrentAndFuture &&
		t.ID != data.previousTransaction.ID &&
		!t.Date.After(data.previousTransaction.Date) {
		return false
	}

	return true
}

func (s *transactionService) handlerRecurrenceUpdate(
	ctx context.Context,
	data *transactionUpdateData,
) error {
	if data.req.RecurrenceSettings == nil && data.previousTransaction.TransactionRecurrenceID == nil {
		return nil
	}

	if data.req.RecurrenceSettings == nil && data.previousTransaction.TransactionRecurrenceID != nil {
		// propagation=current: only detach the current transaction from the recurrence.
		// The recurrence record itself must be preserved because other installments still reference it.
		if data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrent {
			data.previousTransaction.TransactionRecurrenceID = nil
			data.previousTransaction.TransactionRecurrence = nil
			data.transactions[0].TransactionRecurrenceID = nil
			data.transactions[0].TransactionRecurrence = nil
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
	// created for the current+future batch.
	hasPastInstallments := data.req.PropagationSettings == domain.TransactionPropagationSettingsCurrentAndFuture &&
		lo.FromPtr(data.previousTransaction.InstallmentNumber) > 1

	if hasPastInstallments && data.previousTransaction.TransactionRecurrenceID != nil {
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

	r, err := upsertRecurrence(data.userID, *data.previousTransaction)
	if err != nil {
		return err
	}

	for i := range data.transactions {
		data.transactions[i].TransactionRecurrence = &r
		data.transactions[i].TransactionRecurrenceID = &r.ID
		data.transactions[i].InstallmentNumber = lo.ToPtr(i + 1)

		for j := range data.transactions[i].LinkedTransactions {
			rlt, err := upsertRecurrence(data.transactions[i].LinkedTransactions[j].UserID, data.transactions[i].LinkedTransactions[j])
			if err != nil {
				return err
			}

			data.transactions[i].LinkedTransactions[j].TransactionRecurrence = &rlt
			data.transactions[i].LinkedTransactions[j].TransactionRecurrenceID = &rlt.ID
			data.transactions[i].LinkedTransactions[j].InstallmentNumber = lo.ToPtr(i + 1)
		}
	}

	return nil
}

func (s *transactionService) fetchRelatedTransactions(
	ctx context.Context,
	data *transactionUpdateData) error {

	transactions := []*domain.Transaction{data.previousTransaction}
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

		// aqui deve retornar o restante da transações relacionadas, incluindo os parents, own e siblings
		recurrenceTransactions, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{
			RecurrenceIDs:     []int{*data.previousTransaction.TransactionRecurrenceID},
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

	if transaction.OriginalUserID != nil && *transaction.OriginalUserID != userID {
		errs = append(errs, pkgErrors.ErrParentTransactionBelongsToAnotherUser)
	}

	if req.TransactionType != nil && !req.TransactionType.IsValid() {
		errs = append(errs, pkgErrors.ErrInvalidTransactionType(*req.TransactionType))
	}

	sourceIDs, _ := s.transactionRepo.GetSourceTransactionIDs(ctx, transaction.ID)
	if len(sourceIDs) > 0 {
		errs = append(errs, pkgErrors.ErrChildTransactionCannotBeUpdated)
	}

	if lo.FromPtr(req.AccountID) > 0 {
		if len(sourceIDs) > 0 {
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
