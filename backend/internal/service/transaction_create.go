package service

import (
	"context"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

func (s *transactionService) Create(ctx context.Context, userID int, transaction *domain.TransactionCreateRequest) error {
	errs := s.validateCreateTransactionRequest(transaction)
	if len(errs) > 0 {
		return pkgErrors.ServiceErrors(errs)
	}

	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	_, err = s.services.Account.GetByID(ctx, userID, transaction.AccountID)
	if err != nil {
		return err
	}

	if transaction.CategoryID > 0 {
		_, err = s.services.Category.GetByID(ctx, userID, transaction.CategoryID)
		if err != nil {
			return err
		}
	}

	err = s.createTransactions(ctx, userID, transaction)
	if err != nil {
		return err
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}

	return nil
}

func (s *transactionService) validateCreateTransactionRequest(transaction *domain.TransactionCreateRequest) []*pkgErrors.ServiceError {
	errs := []*pkgErrors.ServiceError{}

	if !transaction.TransactionType.IsValid() {
		errs = append(errs, pkgErrors.ErrInvalidTransactionType(transaction.TransactionType))
	}

	if transaction.AccountID <= 0 {
		errs = append(errs, pkgErrors.ErrInvalidAccountID)
	}

	if transaction.CategoryID <= 0 && transaction.TransactionType != domain.TransactionTypeTransfer {
		errs = append(errs, pkgErrors.ErrInvalidCategoryID)
	}

	if transaction.Amount <= 0 {
		errs = append(errs, pkgErrors.ErrAmountMustBeGreaterThanZero)
	}

	if transaction.Date.IsZero() {
		errs = append(errs, pkgErrors.ErrDateIsRequired)
	}

	if strings.TrimSpace(transaction.Description) == "" {
		errs = append(errs, pkgErrors.ErrDescriptionIsRequired)
	}

	if len(transaction.Tags) > 0 {
		for i, tag := range transaction.Tags {
			if strings.TrimSpace(tag.Name) == "" {
				errs = append(errs, pkgErrors.ErrTagNameCannotBeEmpty(i))
			}
		}
	}

	if transaction.RecurrenceSettings != nil {
		if !transaction.RecurrenceSettings.Type.IsValid() {
			errs = append(errs, pkgErrors.ErrInvalidRecurrenceType(transaction.RecurrenceSettings.Type))
		}

		if transaction.RecurrenceSettings.EndDate == nil && transaction.RecurrenceSettings.Repetitions == nil {
			errs = append(errs, pkgErrors.ErrRecurrenceEndDateOrRepetitionsIsRequired)
		}

		if transaction.RecurrenceSettings.EndDate != nil && !transaction.RecurrenceSettings.EndDate.After(transaction.Date) {
			errs = append(errs, pkgErrors.ErrRecurrenceEndDateMustBeAfterTransactionDate)
		}

		if transaction.RecurrenceSettings.EndDate != nil {
			diff := transaction.RecurrenceSettings.EndDate.Sub(transaction.Date)
			if int(diff.Hours())%24 != 0 {
				errs = append(errs, pkgErrors.ErrRecurrenceEndDateMustBeAfterTransactionDate)
			}
		}

		if transaction.RecurrenceSettings.EndDate != nil && transaction.RecurrenceSettings.Repetitions != nil {
			errs = append(errs, pkgErrors.ErrRecurrenceEndDateAndRepetitionsCannotBeUsedTogether)
		}

		if transaction.RecurrenceSettings.EndDate == nil {
			if lo.FromPtr(transaction.RecurrenceSettings.Repetitions) < 1 {
				errs = append(errs, pkgErrors.ErrRecurrenceRepetitionsMustBePositive)
			}

			if lo.FromPtr(transaction.RecurrenceSettings.Repetitions) > 1000 {
				errs = append(errs, pkgErrors.ErrRecurrenceRepetitionsMustBeLessThanOrEqualTo(1000))
			}
		}

	}

	if transaction.TransactionType == domain.TransactionTypeTransfer {
		if transaction.DestinationAccountID == nil {
			errs = append(errs, pkgErrors.ErrMissingDestinationAccount)
		}
	}

	if len(transaction.SplitSettings) > 0 && transaction.TransactionType != domain.TransactionTypeExpense {
		errs = append(errs, pkgErrors.ErrSplitAllowedOnlyForExpense)
	} else if len(transaction.SplitSettings) > 0 {
		for i, splitSetting := range transaction.SplitSettings {
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

func (s *transactionService) createTransactions(ctx context.Context, userID int, transaction *domain.TransactionCreateRequest) error {
	transactions := []domain.Transaction{}

	errs := s.createTags(ctx, userID, transaction.Tags)
	if len(errs) > 0 {
		return pkgErrors.ServiceErrors(errs)
	}

	hasRecurrence := transaction.RecurrenceSettings != nil

	if hasRecurrence {
		recurrence, err := s.createRecurrence(ctx, userID, *transaction.RecurrenceSettings, transaction.Date)
		if err != nil {
			return err
		}

		for i := 1; i <= recurrence.Installments; i++ {
			transactions = append(transactions, domain.Transaction{
				ID:                      0,
				ParentID:                nil,
				TransactionRecurrenceID: &recurrence.ID,
				InstallmentNumber:       &i,
				Date:                    s.incrementInstallmentDate(transaction.Date, lo.FromPtr(transaction.RecurrenceSettings).Type, i-1),
				Description:             transaction.Description,
				DestinationAccountID:    transaction.DestinationAccountID,
				UserID:                  userID,
				Type:                    transaction.TransactionType,
				AccountID:               transaction.AccountID,
				CategoryID:              lo.Ternary(transaction.TransactionType == domain.TransactionTypeTransfer, nil, &transaction.CategoryID),
				Amount:                  transaction.Amount,
				Tags:                    transaction.Tags,
			})
		}
	} else {
		transactions = append(transactions, domain.Transaction{
			ID:                      0,
			ParentID:                nil,
			TransactionRecurrenceID: nil,
			InstallmentNumber:       nil,
			Date:                    transaction.Date,
			Description:             transaction.Description,
			DestinationAccountID:    transaction.DestinationAccountID,
			UserID:                  userID,
			Type:                    transaction.TransactionType,
			AccountID:               transaction.AccountID,
			CategoryID:              lo.Ternary(transaction.TransactionType == domain.TransactionTypeTransfer, nil, &transaction.CategoryID),
			Amount:                  transaction.Amount,
			Tags:                    transaction.Tags,
		})
	}

	for i := range transactions {
		t, err := s.transactionRepo.Create(ctx, &transactions[i])
		if err != nil {
			return err
		}

		transactions[i].ID = t.ID
		transactions[i].CreatedAt = t.CreatedAt
		transactions[i].UpdatedAt = t.UpdatedAt
	}

	if len(transaction.SplitSettings) > 0 {
		connectionIDs := lo.Map(transaction.SplitSettings, func(splitSetting domain.SplitSettings, _ int) int {
			return splitSetting.ConnectionID
		})

		connections, err := s.services.UserConnection.Search(ctx, domain.UserConnectionSearchOptions{
			IDs: connectionIDs,
		})
		if err != nil {
			return err
		}

		connMapByID := lo.Reduce(connections, func(agg map[int]*domain.UserConnection, connection *domain.UserConnection, _ int) map[int]*domain.UserConnection {
			agg[connection.ID] = connection
			return agg
		}, map[int]*domain.UserConnection{})

		originalTransactionsLen := len(transactions)

		sharedTransactions := make([]domain.Transaction, 0, len(transaction.SplitSettings)*2*originalTransactionsLen)

		for i, splitSetting := range transaction.SplitSettings {
			connection := connMapByID[splitSetting.ConnectionID]
			if connection == nil {
				return pkgErrors.ErrSplitSettingInvalidConnectionID(i)
			}

			if connection.FromUserID != userID && connection.ToUserID != userID {
				return pkgErrors.ErrSplitSettingInvalidConnectionID(i).AddTag("user_id_not_in_connection")
			}

			// o from e o to podem estar invertidos caso o usuário que está criando a transação não seja o usuário que criou a conexão
			// para facilitar, normalizo aqui para o from sempre ser o usuário que está criando a transação
			fromUserID, toUserID := connection.FromUserID, connection.ToUserID
			fromAccountID, toAccountID := connection.FromAccountID, connection.ToAccountID

			// se o from não for o usuário que está criando a transação, invertemos os IDs, pois é o To
			if fromUserID != userID {
				fromUserID, toUserID = toUserID, fromUserID
				fromAccountID, toAccountID = toAccountID, fromAccountID
			}

			var fromRecurrenceID, toRecurrenceID *int
			if hasRecurrence {
				fromRecurrence, err := s.createRecurrence(ctx, fromUserID, *transaction.RecurrenceSettings, transaction.Date)
				if err != nil {
					return err
				}
				fromRecurrenceID = &fromRecurrence.ID

				toRecurrence, err := s.createRecurrence(ctx, toUserID, *transaction.RecurrenceSettings, transaction.Date)
				if err != nil {
					return err
				}
				toRecurrenceID = &toRecurrence.ID
			}

			for j := 0; j < originalTransactionsLen; j++ {
				transaction := transactions[j]

				amount := transaction.Amount
				if splitSetting.Percentage != nil {
					amount = int64(float64(transaction.Amount) * float64(*splitSetting.Percentage) / 100)
				} else if splitSetting.Amount != nil {
					amount = *splitSetting.Amount
				}

				transactionType := domain.TransactionTypeExpense
				if transaction.Type == domain.TransactionTypeExpense {
					transactionType = domain.TransactionTypeIncome
				}

				id := transaction.ID
				// cria uma transação na conta compartilhada do autor da transação original com o tipo invertido para que o saldo do usuário considere corretamente a despesa - receita da divisão
				// ex: se a transação original é uma despesa de 100, e o usuário divide em 50% para o outro usuário, cria uma receita de 50 para o usuário atual e uma despesa de 50 para o outro usuário
				fromTransaction := domain.Transaction{
					ID:                      0,
					ParentID:                &id,
					TransactionRecurrenceID: toRecurrenceID,
					InstallmentNumber:       transaction.InstallmentNumber,
					Date:                    transaction.Date,
					Description:             transaction.Description,
					DestinationAccountID:    nil,
					UserID:                  fromUserID,
					Type:                    transactionType,
					AccountID:               fromAccountID,
					CategoryID:              transaction.CategoryID,
					Amount:                  amount,
					Tags:                    transaction.Tags,
					CreatedAt:               nil,
					UpdatedAt:               nil,
				}

				// cria uma transação na conta compartilhada do usuário conectado com o mesmo tipo da transação original
				toTransaction := domain.Transaction{
					ID:                      0,
					ParentID:                &id,
					TransactionRecurrenceID: fromRecurrenceID,
					InstallmentNumber:       transaction.InstallmentNumber,
					Date:                    transaction.Date,
					Description:             transaction.Description,
					DestinationAccountID:    nil,
					UserID:                  toUserID,
					Type:                    transaction.Type,
					AccountID:               toAccountID,
					CategoryID:              nil,
					Amount:                  amount,
					Tags:                    nil,
					CreatedAt:               nil,
					UpdatedAt:               nil,
				}

				sharedTransactions = append(sharedTransactions, fromTransaction, toTransaction)
			}
		}

		for _, transaction := range sharedTransactions {
			_, err := s.transactionRepo.Create(ctx, &transaction)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func (s *transactionService) incrementInstallmentDate(baseDate time.Time, recurrenceType domain.RecurrenceType, increment int) time.Time {
	switch recurrenceType {
	case domain.RecurrenceTypeDaily:
		return baseDate.AddDate(0, 0, increment)
	case domain.RecurrenceTypeWeekly:
		return baseDate.AddDate(0, 0, increment*7)
	case domain.RecurrenceTypeMonthly:
		return baseDate.AddDate(0, increment, 0)
	case domain.RecurrenceTypeYearly:
		return baseDate.AddDate(increment, 0, 0)
	}
	return baseDate
}

func (s *transactionService) createTags(ctx context.Context, userID int, tags []domain.Tag) pkgErrors.ServiceErrors {
	errs := make([]*pkgErrors.ServiceError, 0, len(tags))
	for i, tag := range tags {
		t, err := s.services.Tag.Create(ctx, userID, &tag)
		if err != nil {
			errs = append(errs, pkgErrors.ErrFailedToCreateTag(i))
		}

		tags[i] = *t
	}
	return pkgErrors.ServiceErrors(errs)
}

func (s *transactionService) createRecurrence(ctx context.Context, userID int, recurrenceSettings domain.RecurrenceSettings, startDate time.Time) (*domain.TransactionRecurrence, error) {
	tr := &domain.TransactionRecurrence{
		ID:           0,
		Installments: lo.FromPtr(recurrenceSettings.Repetitions),
		UserID:       userID,
	}

	if recurrenceSettings.EndDate != nil {
		var installments int

		endDate := recurrenceSettings.EndDate

		switch recurrenceSettings.Type {
		case domain.RecurrenceTypeDaily:
			installments = int(endDate.Sub(startDate).Hours() / 24)
		case domain.RecurrenceTypeWeekly:
			installments = int(endDate.Sub(startDate).Hours() / 24 / 7)
		case domain.RecurrenceTypeMonthly:
			installments = int(endDate.Sub(startDate).Hours() / 24 / 30)
		case domain.RecurrenceTypeYearly:
			installments = int(endDate.Sub(startDate).Hours() / 24 / 365)
		}

		if installments < 1 {
			installments = 1
		}

		tr.Installments = installments
	}

	if recurrence, err := s.transactionRecurRepo.Create(ctx, tr); err != nil {
		return nil, err
	} else {
		return recurrence, nil
	}
}
