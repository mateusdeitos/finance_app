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

type transactionUpdateData struct {
	userID                 int
	req                    *domain.TransactionUpdateRequest
	previousTransaction    *domain.Transaction
	transactions           []*domain.Transaction
	transactionIDsToRemove []int
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

	date := lo.CoalesceOrEmpty(req.Date, &previousTransaction.Date)
	dateDiff := lo.FromPtr(date).Sub(previousTransaction.Date)
	dateDiffDays := int(dateDiff.Hours() / 24)

	data := &transactionUpdateData{
		userID:                 userID,
		req:                    req,
		previousTransaction:    previousTransaction,
		transactions:           []*domain.Transaction{},
		transactionIDsToRemove: []int{},
	}

	err = s.fetchRelatedTransactions(ctx, data)
	if err != nil {
		return err
	}

	err = s.handlerRecurrenceUpdate(ctx, data)
	if err != nil {
		return err
	}

	for i := range data.transactions {
		own := data.transactions[i]
		if own == nil {
			return pkgErrors.Internal(fmt.Sprintf("ownTransactions index %d not found", i), nil)
		}

		var err error
		own.LinkedTransactions, err = s.rebuildLinkedTransactions(ctx, own, data)
		if err != nil {
			return err
		}

		if previousTransaction.TransactionRecurrence != nil {
			own.TransactionRecurrence = previousTransaction.TransactionRecurrence
			own.InstallmentNumber = lo.ToPtr(i + 1)

			for _, linkedTransaction := range own.LinkedTransactions {
				linkedTransaction.TransactionRecurrence = previousTransaction.TransactionRecurrence
				linkedTransaction.InstallmentNumber = lo.ToPtr(i + 1)
			}
		}

		// se parent era income e virou expense, own=income e shared=expense e vice-versa
		if lo.FromPtr(req.TransactionType).IsValid() {
			s.handleTransactionTypeChange(ctx, userID, *previousTransaction, own, *req.TransactionType)
		}

		if lo.FromPtr(req.AccountID) > 0 {
			own.AccountID = *req.AccountID
		}

		if lo.FromPtr(req.CategoryID) > 0 {
			own.CategoryID = req.CategoryID
		}

		if req.Amount != nil && *req.Amount > 0 {
			own.Amount = *req.Amount
		}

		if req.Date != nil && !req.Date.IsZero() {
			own.Date = own.Date.AddDate(0, 0, dateDiffDays)

			for _, linkedTransaction := range own.LinkedTransactions {
				linkedTransaction.Date = linkedTransaction.Date.AddDate(0, 0, dateDiffDays)
			}
		}

		if req.Description != nil && strings.TrimSpace(*req.Description) != "" {
			own.Description = *req.Description

			for _, linkedTransaction := range own.LinkedTransactions {
				linkedTransaction.Description = *req.Description
			}
		}

		own.Tags = req.Tags
		for _, linkedTransaction := range own.LinkedTransactions {
			if linkedTransaction.UserID == userID {
				linkedTransaction.Tags = req.Tags
			}
		}

		own, err = s.handleTransactionRecurrenceUpdate(ctx, userID, i, *own)
		if err != nil {
			return err
		}

		if own == nil {
			continue
		}

		if err := s.transactionRepo.Update(ctx, own); err != nil {
			return err
		}
	}

	return s.dbTransaction.Commit(ctx)
}

func (s *transactionService) rebuildLinkedTransactions(
	ctx context.Context,
	own *domain.Transaction,
	data *transactionUpdateData,
) ([]domain.Transaction, error) {
	if len(data.req.SplitSettings) == 0 {
		return []domain.Transaction{}, nil
	}

	accountsIDs := lo.Map(own.LinkedTransactions, func(linkedTransaction domain.Transaction, _ int) int {
		return linkedTransaction.AccountID
	})
	connections, err := s.services.UserConnection.Search(ctx, domain.UserConnectionSearchOptions{
		AccountIDs: accountsIDs,
	})
	if err != nil {
		return []domain.Transaction{}, err
	}

	accountIDsUserIDsMap := lo.Reduce(own.LinkedTransactions, func(agg map[string]*domain.Transaction, transaction domain.Transaction, _ int) map[string]*domain.Transaction {
		hash := fmt.Sprintf("%d-%d", transaction.AccountID, transaction.UserID)
		agg[hash] = &transaction
		return agg
	}, map[string]*domain.Transaction{})

	connectionsTransactionsMap := lo.Reduce(connections, func(agg map[int]domain.Transaction, connection *domain.UserConnection, _ int) map[int]domain.Transaction {
		hashFrom := fmt.Sprintf("%d-%d", connection.FromAccountID, connection.FromUserID)
		if t, ok := accountIDsUserIDsMap[hashFrom]; ok {
			agg[connection.ID] = *t
			return agg
		}

		hashTo := fmt.Sprintf("%d-%d", connection.ToAccountID, connection.ToUserID)
		if t, ok := accountIDsUserIDsMap[hashTo]; ok {
			agg[connection.ID] = *t
			return agg
		}

		return agg
	}, map[int]domain.Transaction{})

	splitSettingsMap := make(map[int]domain.SplitSettings)

	newConnectionIDs := lo.FilterMap(data.req.SplitSettings, func(splitSetting domain.SplitSettings, _ int) (int, bool) {
		splitSettingsMap[splitSetting.ConnectionID] = splitSetting

		if connection, ok := connectionsTransactionsMap[splitSetting.ConnectionID]; !ok {
			return connection.ID, true
		}
		return 0, false
	})

	if len(newConnectionIDs) > 0 {
		newConnections, err := s.services.UserConnection.Search(ctx, domain.UserConnectionSearchOptions{
			IDs: newConnectionIDs,
		})
		if err != nil {
			return []domain.Transaction{}, err
		}

		for _, newConnection := range newConnections {
			newConnection.SwapIfNeeded(data.userID)
			splitSetting, ok := splitSettingsMap[newConnection.ID]
			if !ok {
				return []domain.Transaction{}, pkgErrors.Internal("split setting not found", nil)
			}

			connectionsTransactionsMap[newConnection.ID] = domain.Transaction{
				ID:             0,
				UserID:         newConnection.ToUserID,
				OriginalUserID: &data.userID,
				AccountID:      newConnection.ToAccountID,
				Type:           own.Type,
				OperationType:  own.OperationType,
				Date:           own.Date,
				Description:    own.Description,
				Amount:         s.calculateAmount(own.Amount, splitSetting),
				CategoryID:     nil,
			}
		}
	}

	return lo.Values(connectionsTransactionsMap), nil
}

func (s *transactionService) handlerRecurrenceUpdate(
	ctx context.Context,
	data *transactionUpdateData,
) error {
	if data.req.RecurrenceSettings == nil && data.previousTransaction.TransactionRecurrenceID == nil {
		return nil
	}

	if data.req.RecurrenceSettings == nil && data.previousTransaction.TransactionRecurrenceID != nil {
		if err := s.transactionRecurRepo.Delete(ctx, []int{*data.previousTransaction.TransactionRecurrenceID}); err != nil {
			return err
		}

		for _, linkedTransaction := range data.previousTransaction.LinkedTransactions {
			if linkedTransaction.TransactionRecurrenceID == nil {
				continue
			}

			if err := s.transactionRecurRepo.Delete(ctx, []int{*data.previousTransaction.TransactionRecurrenceID}); err != nil {
				return err
			}
		}

		return nil
	}

	if rErrs := s.validateRecurrenceSettings(lo.FromPtr(data.req.Date), data.req.RecurrenceSettings); len(rErrs) > 0 {
		return pkgErrors.ServiceErrors(rErrs)
	}

	date := lo.CoalesceOrEmpty(data.req.Date, &data.previousTransaction.Date)
	newRecurrence := domain.RecurrenceFromSettings(*data.req.RecurrenceSettings, data.userID, *date)

	if data.previousTransaction.TransactionRecurrenceID != nil {
		newRecurrence.ID = *data.previousTransaction.TransactionRecurrenceID
	}

	data.previousTransaction.TransactionRecurrence = newRecurrence

	for i := range data.previousTransaction.LinkedTransactions {
		linkedTransaction := &data.previousTransaction.LinkedTransactions[i]
		id, _ := lo.Coalesce(lo.FromPtr(linkedTransaction.TransactionRecurrenceID), 0)

		newRecurrence.ID = id
		linkedTransaction.TransactionRecurrence = newRecurrence
	}

	return nil
}

func (s *transactionService) handleTransactionRecurrenceUpdate(
	ctx context.Context,
	userID int,
	index int,
	t domain.Transaction,
) (*domain.Transaction, error) {
	if t.TransactionRecurrenceID == nil {
		t.TransactionRecurrenceID = nil
		t.InstallmentNumber = nil

		for _, linkedTransaction := range t.LinkedTransactions {
			linkedTransaction.TransactionRecurrenceID = nil
			linkedTransaction.InstallmentNumber = nil
		}

		return &t, nil
	}

	if lo.FromPtr(t.InstallmentNumber) > t.TransactionRecurrence.Installments {
		if err := s.Delete(ctx, userID, t.ID, domain.TransactionPropagationSettingsCurrent); err != nil {
			return nil, err
		}

		if len(t.LinkedTransactions) > 0 {
			for _, linkedTransaction := range t.LinkedTransactions {
				if err := s.Delete(ctx, linkedTransaction.UserID, linkedTransaction.ID, domain.TransactionPropagationSettingsCurrent); err != nil {
					return nil, err
				}
			}
		}

		return nil, nil
	}

	return &t, nil
}

func (s *transactionService) handleTransactionTypeChange(
	ctx context.Context,
	userID int,
	previousTransaction domain.Transaction,
	own *domain.Transaction,
	newType domain.TransactionType,
) {
}

func (s *transactionService) fetchRelatedTransactions(
	ctx context.Context,
	data *transactionUpdateData) error {

	transactions := []*domain.Transaction{data.previousTransaction}
	hasInstallments := data.previousTransaction.TransactionRecurrenceID != nil && data.previousTransaction.InstallmentNumber != nil

	// propagation current atualiza somente a transação atual, parent e sibling
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
		if !req.RecurrenceSettings.Type.IsValid() {
			errs = append(errs, pkgErrors.ErrInvalidRecurrenceType(req.RecurrenceSettings.Type))
		}

		if req.RecurrenceSettings.EndDate == nil && req.RecurrenceSettings.Repetitions == nil {
			errs = append(errs, pkgErrors.ErrRecurrenceEndDateOrRepetitionsIsRequired)
		}

		date := lo.CoalesceOrEmpty(req.Date, &transaction.Date)

		if req.RecurrenceSettings.EndDate != nil && date != nil {
			if !req.RecurrenceSettings.EndDate.After(*date) {
				errs = append(errs, pkgErrors.ErrRecurrenceEndDateMustBeAfterTransactionDate)
			}

			if int(req.RecurrenceSettings.EndDate.Sub(*date).Hours())%24 != 0 {
				errs = append(errs, pkgErrors.ErrRecurrenceEndDateMustBeAfterTransactionDate)
			}
		}

		if req.RecurrenceSettings.EndDate != nil && req.RecurrenceSettings.Repetitions != nil {
			errs = append(errs, pkgErrors.ErrRecurrenceEndDateAndRepetitionsCannotBeUsedTogether)
		}

		if req.RecurrenceSettings.EndDate == nil {
			if lo.FromPtr(req.RecurrenceSettings.Repetitions) < 1 {
				errs = append(errs, pkgErrors.ErrRecurrenceRepetitionsMustBePositive)
			}

			if lo.FromPtr(req.RecurrenceSettings.Repetitions) > 1000 {
				errs = append(errs, pkgErrors.ErrRecurrenceRepetitionsMustBeLessThanOrEqualTo(1000))
			}
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

	if len(req.SplitSettings) > 0 && req.TransactionType != nil && *req.TransactionType != domain.TransactionTypeExpense {
		errs = append(errs, pkgErrors.ErrSplitAllowedOnlyForExpense)
	} else if len(req.SplitSettings) > 0 {
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

			if splitSetting.Percentage != nil && *splitSetting.Percentage < 1 || *splitSetting.Percentage > 100 {
				errs = append(errs, pkgErrors.ErrSplitSettingPercentageMustBeBetween1And100(i))
			}

			if splitSetting.Amount != nil && *splitSetting.Amount <= 0 {
				errs = append(errs, pkgErrors.ErrSplitSettingAmountMustBeGreaterThanZero(i))
			}
		}
	}

	return errs
}
