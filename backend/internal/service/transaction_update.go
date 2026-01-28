package service

import (
	"context"
	"fmt"
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

	if errs := s.validateUpdateTransactionRequest(ctx, userID, previousTransaction, req); len(errs) > 0 {
		return pkgErrors.ServiceErrors(errs)
	}

	date := lo.CoalesceOrEmpty(req.Date, &previousTransaction.Date)
	dateDiff := lo.FromPtr(date).Sub(previousTransaction.Date)
	dateDiffDays := int(dateDiff.Hours() / 24)

	var ownTransactions, parentTransactions, sharedTransactions []*domain.Transaction

	hasParent := previousTransaction.ParentID != nil

	// busca as relacionadas caso setado para propagar para relacionadas
	// se tiver parent, precisa propagar sempre para o sibling (transação compartilhada do usuário destino da conexão)
	if req.PropagateToRelated || hasParent {
		// a ideia aqui é retornar:
		// - ownTransactions: todas as transações filhas do usuário atual relacionadas a transação atual
		// - parentTransactions: todas as transações pai relacionadas as ownTransactions
		// - sharedTransactions: todas as transações compartilhadas relacionadas as ownTransactions
		// todos slices devem ter o mesmo tamanho, pois o índice é o link entre as transações
		ownTransactions, parentTransactions, sharedTransactions, err = s.fetchRelatedTransactions(ctx, userID, id, previousTransaction, req)
		if err != nil {
			return err
		}
	} else {
		ownTransactions = []*domain.Transaction{previousTransaction}
		parentTransactions = []*domain.Transaction{}
		sharedTransactions = []*domain.Transaction{}
	}

	safeGet := func(slice []*domain.Transaction, index int) *domain.Transaction {
		if index < 0 || index >= len(slice) {
			return nil
		}
		return slice[index]
	}

	for i := range ownTransactions {
		own := safeGet(ownTransactions, i)
		if own == nil {
			return pkgErrors.Internal(fmt.Sprintf("ownTransactions index %d not found", i), nil)
		}

		parent := safeGet(parentTransactions, i)
		shared := safeGet(sharedTransactions, i)

		if parent != nil && shared == nil {
			return pkgErrors.Internal(fmt.Sprintf("parentTransactions index found %d but sharedTransactions index %d not found", i, i), nil)
		}

		// se parent era income e virou expense, own=income e shared=expense e vice-versa
		if lo.FromPtr(req.TransactionType).IsValid() && !lo.FromPtr(req.TransactionType).IsTransfer() {
			var sharedType *domain.TransactionType
			if parent != nil && parent.ID == id {
				sharedType = req.TransactionType

				parent.UpdateType(lo.FromPtr(sharedType))
				own.UpdateType(parent.Type.Invert())

			} else {
				own.UpdateType(*req.TransactionType)

				sharedType = lo.ToPtr(own.Type.Invert())

				if parent != nil {
					parent.UpdateType(own.Type.Invert())
				}
			}

			if shared != nil && sharedType != nil {
				shared.UpdateType(*sharedType)
			}
		}

		// apenas atualiza account se:
		// - account id foi passado
		// - usuario é o dono da transação
		// - se pai existir, significa que está alterando o parent, então altera o account do parent
		// - caso contrário é uma transação simples, então altera o account da transação
		if lo.FromPtr(req.AccountID) > 0 {
			if parent != nil {
				parent.AccountID = *req.AccountID
			} else {
				own.AccountID = *req.AccountID
			}
		}

		// apenas atualiza category se:
		// - category id foi passado
		// - usuario é o dono da transação
		if lo.FromPtr(req.CategoryID) > 0 {
			if parent != nil {
				parent.CategoryID = req.CategoryID
			}
			own.CategoryID = req.CategoryID
		}

		if req.Amount != nil && *req.Amount > 0 {

			// apenas atualiza o amount do parent se a transação sendo atualizada é o parent
			if parent != nil && parent.ID == id {
				parent.Amount = *req.Amount

				if req.PropagateToRelated {
					if req.SplitSettings == nil {
						req.SplitSettings = []domain.SplitSettings{
							{
								Percentage: lo.ToPtr(int(float64(own.Amount) / float64(parent.Amount) * 100)),
							},
						}
					}

					own.Amount = s.calculateAmount(parent.Amount, req.SplitSettings[0])

					if shared != nil {
						shared.Amount = s.calculateAmount(parent.Amount, req.SplitSettings[0])
					}
				}
			} else {
				previousAmount := own.Amount
				own.Amount = *req.Amount
				if shared != nil {
					shared.Amount = *req.Amount
				}

				// propaga a mudança para o parent proporcionalmente ao amount da transação atual
				if parent != nil {
					rate := float64(parent.Amount) / float64(previousAmount)
					parent.Amount = int64(float64(own.Amount) * rate)
				}
			}
		}

		if req.Date != nil && !req.Date.IsZero() {
			if parent != nil {
				parent.Date = parent.Date.AddDate(0, 0, dateDiffDays)
			}

			own.Date = own.Date.AddDate(0, 0, dateDiffDays)

			if shared != nil {
				shared.Date = shared.Date.AddDate(0, 0, dateDiffDays)
			}
		}

		if req.Description != nil && strings.TrimSpace(*req.Description) != "" {
			if parent != nil {
				parent.Description = *req.Description
			}

			own.Description = *req.Description

			if shared != nil {
				shared.Description = *req.Description
			}
		}

		if parent != nil {
			parent.Tags = req.Tags
		}

		own.Tags = req.Tags

		if err := s.transactionRepo.Update(ctx, own); err != nil {
			return err
		}

		if parent != nil {
			if err := s.transactionRepo.Update(ctx, parent); err != nil {
				return err
			}
		}

		if shared != nil {
			if err := s.transactionRepo.Update(ctx, shared); err != nil {
				return err
			}
		}
	}

	return s.dbTransaction.Commit(ctx)
}

func (s *transactionService) fetchRelatedTransactions(
	ctx context.Context,
	userID,
	id int,
	previousTransaction *domain.Transaction,
	req *domain.TransactionUpdateRequest) ([]*domain.Transaction, []*domain.Transaction, []*domain.Transaction, error) {

	ownTransactions := []*domain.Transaction{}
	parentTransactions := []*domain.Transaction{}
	sharedTransactions := []*domain.Transaction{}

	hasParent := previousTransaction.ParentID != nil
	hasInstallments := previousTransaction.TransactionRecurrenceID != nil && previousTransaction.InstallmentNumber != nil
	recurrenceIDs := []int{}
	if hasInstallments {
		recurrenceIDs = append(recurrenceIDs, *previousTransaction.TransactionRecurrenceID)
	}

	shouldPropagateChangesToParent := req.PropagateToRelated

	if hasParent {
		ownTransactions = append(ownTransactions, previousTransaction)

		if shouldPropagateChangesToParent {
			parentTransaction, err := s.getByID(ctx, userID, *previousTransaction.ParentID)
			if err != nil {
				return nil, nil, nil, err
			}
			parentTransactions = append(parentTransactions, parentTransaction)

			if parentTransaction.TransactionRecurrenceID != nil {
				recurrenceIDs = append(recurrenceIDs, *parentTransaction.TransactionRecurrenceID)
			}
		}

		// busca todos filhos da transação pai menos a transação atual
		// mesmo req.PropagateToRelated = false, deve atualizar o sibling, pois é como se as duas transações fossem a mesma transação
		siblingTransactions, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{
			IDsNotIn:  []int{id},
			ParentIDs: []int{*previousTransaction.ParentID},
		})
		if err != nil {
			return nil, nil, nil, err
		}
		if len(siblingTransactions) != 1 {
			return nil, nil, nil, pkgErrors.Internal(fmt.Sprintf("failed to fetch related transactions: siblingTransactions: %d", len(siblingTransactions)), nil)
		}

		sharedTransactions = append(sharedTransactions, siblingTransactions...)

		for _, siblingTransaction := range siblingTransactions {
			if siblingTransaction.TransactionRecurrenceID != nil {
				recurrenceIDs = append(recurrenceIDs, *siblingTransaction.TransactionRecurrenceID)
			}
		}
	} else {
		var childTransactions []*domain.Transaction
		var err error

		// busca todos filhos da transação atual
		if req.PropagateToRelated {
			childTransactions, err = s.transactionRepo.Search(ctx, domain.TransactionFilter{
				ParentIDs: []int{id},
			})
			if err != nil {
				return nil, nil, nil, err
			}
		}

		// caso não possua filhos ou não queira propagar mudanças
		if len(childTransactions) == 0 {
			ownTransactions = append(ownTransactions, previousTransaction)
		} else {

			// caso possua filhos, é uma transação compartilhada
			parentTransactions = append(parentTransactions, previousTransaction)
			for _, childTransaction := range childTransactions {
				if childTransaction.TransactionRecurrenceID != nil {
					recurrenceIDs = append(recurrenceIDs, *childTransaction.TransactionRecurrenceID)
				}

				if childTransaction.UserID == userID {
					ownTransactions = append(ownTransactions, childTransaction)
				} else {
					sharedTransactions = append(sharedTransactions, childTransaction)
				}
			}
		}

	}

	// propagation current atualiza somente a transação atual, parent e sibling
	shouldUpdateInstallments := hasInstallments && req.PropagationSettings != domain.TransactionPropagationSettingsCurrent

	if shouldUpdateInstallments {
		var installmentNumberFilter *domain.ComparableSearch[int]
		switch req.PropagationSettings {
		case domain.TransactionPropagationSettingsAll:
			installmentNumberFilter = &domain.ComparableSearch[int]{
				GreaterThanOrEqual: lo.ToPtr(1),
			}
		case domain.TransactionPropagationSettingsCurrentAndFuture:
			installmentNumberFilter = &domain.ComparableSearch[int]{
				GreaterThanOrEqual: lo.ToPtr(lo.FromPtr(previousTransaction.InstallmentNumber) + 1),
			}
		}

		idsNotIn := []int{id}

		// set tem parent, já obteve e appendou
		if hasParent {
			idsNotIn = append(idsNotIn, *previousTransaction.ParentID)
		}

		// aqui deve retornar o restante da transações relacionadas, incluindo os parents, own e siblings
		recurrenceTransactions, err := s.transactionRepo.Search(ctx, domain.TransactionFilter{
			RecurrenceIDs:     recurrenceIDs,
			InstallmentNumber: installmentNumberFilter,
			IDsNotIn:          idsNotIn,
		})
		if err != nil {
			return nil, nil, nil, pkgErrors.Internal("failed to get recurrence transactions", err)
		}

		for _, recurrenceTransaction := range recurrenceTransactions {
			// se nao tem parent e é do usuário atual, é uma transação pai
			if recurrenceTransaction.ParentID == nil && recurrenceTransaction.UserID == userID {
				parentTransactions = append(parentTransactions, recurrenceTransaction)

			} else if recurrenceTransaction.ParentID != nil && recurrenceTransaction.UserID == userID {
				// se tem parent e é do usuário atual, é uma transação filha
				ownTransactions = append(ownTransactions, recurrenceTransaction)
			} else {
				// se é de outro usuário, é uma transação compartilhada
				sharedTransactions = append(sharedTransactions, recurrenceTransaction)
			}
		}
	}

	// cenários possíveis:
	validScenarios := []func(o, p, s int) bool{}

	// 2. Transação é do usuário atual, sem compartilhamento e com parcelamento len(own) > 1, len(parent) = 0, len(shared) = 0)
	// 1. Transação é do usuário atual, sem compartilhamento e sem parcelamento len(own) > 0, len(parent) = 0, len(shared) = 0)
	validScenarios = append(validScenarios, func(o, p, s int) bool {
		return o >= 1 && p == 0 && s == 0
	})

	// 3. Transação é do usuário atual, com compartilhamento e sem parcelamento len(own) = len(parent) = len(shared) = 1)
	// 4. Transação é do usuário atual, com compartilhamento e com parcelamento len(own) = len(parent) = len(shared) > 1)
	validScenarios = append(validScenarios, func(o, p, s int) bool {
		return o >= 1 && o == p && p == s
	})

	// 5. atualizando transação filha sem propagar para o parent
	if !req.PropagateToRelated {
		validScenarios = append(validScenarios, func(o, p, s int) bool {
			return o == 1 && p == 0 && (s == 0 || s == 1)
		})
	}

	valid := lo.SomeBy(validScenarios, func(f func(o, p, s int) bool) bool {
		return f(len(ownTransactions), len(parentTransactions), len(sharedTransactions))
	})

	if valid {
		return ownTransactions, parentTransactions, sharedTransactions, nil
	}

	return nil, nil, nil, pkgErrors.Internal(fmt.Sprintf("failed to fetch related transactions: ownTransactions: %d, parentTransactions: %d, sharedTransactions: %d", len(ownTransactions), len(parentTransactions), len(sharedTransactions)), nil)
}

func (s *transactionService) validateUpdateTransactionRequest(ctx context.Context, userID int, transaction *domain.Transaction, req *domain.TransactionUpdateRequest) []*pkgErrors.ServiceError {
	errs := []*pkgErrors.ServiceError{}

	if transaction.OriginalUserID != nil && *transaction.OriginalUserID != userID {
		errs = append(errs, pkgErrors.ErrParentTransactionBelongsToAnotherUser)
	}

	if req.TransactionType != nil && !req.TransactionType.IsValid() {
		errs = append(errs, pkgErrors.ErrInvalidTransactionType(*req.TransactionType))
	}

	if lo.FromPtr(req.AccountID) > 0 {
		if transaction.ParentID != nil {
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
