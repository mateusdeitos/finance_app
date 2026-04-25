package service

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

func (s *transactionService) Create(ctx context.Context, userID int, transaction *domain.TransactionCreateRequest) (int, error) {
	errs := s.validateCreateTransactionRequest(transaction)
	if len(errs) > 0 {
		return 0, pkgErrors.ServiceErrors(errs)
	}

	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return 0, pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	_, err = s.services.Account.GetByID(ctx, userID, transaction.AccountID)
	if err != nil {
		return 0, err
	}

	if transaction.CategoryID > 0 {
		_, err = s.services.Category.GetByID(ctx, userID, transaction.CategoryID)
		if err != nil {
			return 0, err
		}
	}

	id, err := s.createTransactions(ctx, userID, transaction)
	if err != nil {
		return 0, err
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return 0, pkgErrors.Internal("failed to commit transaction", err)
	}

	return id, nil
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
		if rErrs := s.validateRecurrenceSettings(transaction.RecurrenceSettings); len(rErrs) > 0 {
			errs = append(errs, rErrs...)
		}
	}

	if transaction.TransactionType == domain.TransactionTypeTransfer {
		if transaction.DestinationAccountID == nil {
			errs = append(errs, pkgErrors.ErrMissingDestinationAccount)
		}

		if len(transaction.SplitSettings) > 0 {
			errs = append(errs, pkgErrors.ErrSplitSettingsNotAllowedForTransfer)
		}
	}

	if len(transaction.SplitSettings) > 0 {
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

func (s *transactionService) validateRecurrenceSettings(
	recurrenceSettings *domain.RecurrenceSettings,
) []*pkgErrors.ServiceError {
	errs := []*pkgErrors.ServiceError{}

	if recurrenceSettings == nil {
		return errs
	}

	if !recurrenceSettings.Type.IsValid() {
		errs = append(errs, pkgErrors.ErrInvalidRecurrenceType(recurrenceSettings.Type))
	}

	if recurrenceSettings.CurrentInstallment < 1 {
		errs = append(errs, pkgErrors.ErrRecurrenceCurrentInstallmentMustBeAtLeastOne)
	}

	if recurrenceSettings.TotalInstallments < recurrenceSettings.CurrentInstallment {
		errs = append(errs, pkgErrors.ErrRecurrenceTotalInstallmentsMustBeGreaterOrEqualToCurrent)
	}

	if recurrenceSettings.TotalInstallments > 1000 {
		errs = append(errs, pkgErrors.ErrRecurrenceTotalInstallmentsMustBeLessThanOrEqualTo(1000))
	}

	return errs
}

func (s *transactionService) createTransactions(ctx context.Context, userID int, req *domain.TransactionCreateRequest) (int, error) {
	transactions := []domain.Transaction{}

	errs := s.createTags(ctx, userID, req.Tags)
	if len(errs) > 0 {
		return 0, pkgErrors.ServiceErrors(errs)
	}

	hasRecurrence := req.RecurrenceSettings != nil

	if err := s.injectUserConnectionsOnSplitSettings(ctx, userID, req.SplitSettings); err != nil {
		return 0, err
	}

	// transfer ou expense = debit
	// income = credit
	operationType := domain.OperationTypeDebit
	if req.TransactionType == domain.TransactionTypeIncome {
		operationType = domain.OperationTypeCredit
	}

	if hasRecurrence {
		recurrence, err := s.createRecurrence(ctx, userID, *req.RecurrenceSettings)
		if err != nil {
			return 0, err
		}

		for i := req.RecurrenceSettings.CurrentInstallment; i <= recurrence.Installments; i++ {
			transactions = append(transactions, domain.Transaction{
				ID:                      0,
				TransactionRecurrenceID: &recurrence.ID,
				InstallmentNumber:       &i,
				Date:                    s.incrementInstallmentDate(req.Date, lo.FromPtr(req.RecurrenceSettings).Type, i-req.RecurrenceSettings.CurrentInstallment),
				Description:             req.Description,
				UserID:                  userID,
				OriginalUserID:          &userID,
				Type:                    req.TransactionType,
				OperationType:           operationType,
				AccountID:               req.AccountID,
				CategoryID:              lo.Ternary(req.TransactionType == domain.TransactionTypeTransfer, nil, &req.CategoryID),
				Amount:                  req.Amount,
				Tags:                    req.Tags,
				ChargeID:                req.ChargeID,
			})
		}
	} else {
		transactions = append(transactions, domain.Transaction{
			ID:                      0,
			TransactionRecurrenceID: nil,
			InstallmentNumber:       nil,
			Date:                    req.Date,
			Description:             req.Description,
			UserID:                  userID,
			OriginalUserID:          &userID,
			Type:                    req.TransactionType,
			OperationType:           operationType,
			AccountID:               req.AccountID,
			CategoryID:              lo.Ternary(req.TransactionType == domain.TransactionTypeTransfer, nil, &req.CategoryID),
			Amount:                  req.Amount,
			Tags:                    req.Tags,
			ChargeID:                req.ChargeID,
		})
	}

	firstID := 0
	for i := range transactions {
		tr := &transactions[i]
		if err := s.injectLinkedTransactions(ctx, userID, tr, req, req.SplitSettings, req.RecurrenceSettings); err != nil {
			return 0, err
		}

		t, err := s.transactionRepo.Create(ctx, &transactions[i])
		if err != nil {
			return 0, err
		}

		transactions[i].ID = t.ID
		transactions[i].CreatedAt = t.CreatedAt
		transactions[i].UpdatedAt = t.UpdatedAt

		if i == 0 {
			firstID = t.ID
		}

		if req.TransactionType != domain.TransactionTypeTransfer && len(req.SplitSettings) > 0 {
			if err := s.createSettlementsForSplit(ctx, userID, t, req.TransactionType, req.SplitSettings); err != nil {
				return 0, err
			}
		}
	}

	return firstID, nil
}

func (s *transactionService) createSettlementsForSplit(ctx context.Context, userID int, authorTransaction *domain.Transaction, transactionType domain.TransactionType, splitSettings []domain.SplitSettings) error {
	settlementType := domain.SettlementTypeCredit
	if transactionType == domain.TransactionTypeIncome {
		settlementType = domain.SettlementTypeDebit
	}

	// Map counterpart's connection account ID → author's connection account ID.
	// After SwapIfNeeded, FromAccountID is the author's and ToAccountID is the counterpart's.
	// The linked transaction's AccountID is set to connection.ToAccountID in injectLinkedTransactions.
	connAccountByToAccount := make(map[int]int, len(splitSettings))
	for _, ss := range splitSettings {
		if ss.UserConnection != nil {
			connAccountByToAccount[ss.UserConnection.ToAccountID] = ss.UserConnection.FromAccountID
		}
	}

	for _, lt := range authorTransaction.LinkedTransactions {
		// Skip linked transactions belonging to the same user (e.g. the from-side
		// of a split on the author's connection account). Settlements only track
		// debts between different users.
		if lt.UserID == userID {
			continue
		}

		accountID := authorTransaction.AccountID
		if connAccount, ok := connAccountByToAccount[lt.AccountID]; ok {
			accountID = connAccount
		}

		_, err := s.services.Settlement.Create(ctx, &domain.Settlement{
			UserID:              userID,
			Amount:              lt.Amount,
			Type:                settlementType,
			AccountID:           accountID,
			SourceTransactionID: authorTransaction.ID,
			ParentTransactionID: lt.ID,
		})
		if err != nil {
			return err
		}
	}

	return nil
}

func (s *transactionService) injectUserConnectionsOnSplitSettings(ctx context.Context, userID int, splitSettings []domain.SplitSettings) error {
	if len(splitSettings) == 0 {
		return nil
	}

	connIDs := lo.FilterMap(splitSettings, func(splitSetting domain.SplitSettings, _ int) (int, bool) {
		return splitSetting.ConnectionID, splitSetting.ConnectionID > 0
	})

	conns, err := s.services.UserConnection.Search(ctx, domain.UserConnectionSearchOptions{
		IDs: connIDs,
		SortBy: &domain.SortBy{
			Field: "id",
			Order: domain.SortOrderAsc,
		},
	})
	if err != nil {
		return err
	}

	slices.SortFunc(splitSettings, func(a, b domain.SplitSettings) int {
		return a.ConnectionID - b.ConnectionID
	})

	for i := range splitSettings {
		conn := conns[i]
		conn.SwapIfNeeded(userID)
		splitSettings[i].UserConnection = conn
	}

	return nil
}

func (s *transactionService) injectLinkedTransactions(
	ctx context.Context,
	userID int,
	transaction *domain.Transaction,
	req *domain.TransactionCreateRequest,
	splitSettings []domain.SplitSettings,
	recurrenceSettings *domain.RecurrenceSettings) error {

	hasRecurrence := recurrenceSettings != nil

	var connectionIDs []int

	if req.TransactionType != domain.TransactionTypeTransfer && len(splitSettings) == 0 {
		return nil
	}

	if req.TransactionType == domain.TransactionTypeTransfer {
		conn, err := s.getConnectionFromDestinationAccountID(ctx, userID, *req.DestinationAccountID)
		if err != nil {
			return err
		}

		// se a transferencia for entre usuários, sobrescreve o splitSettings com o connectionID e 100% de split para criar a transação de transferência
		if conn != nil {
			connectionIDs = []int{conn.ID}
			conn.SwapIfNeeded(userID)

			// seta um splitSettings 'fake' para que o restante do código funcione normalmente
			splitSettings = []domain.SplitSettings{
				{
					ConnectionID:   conn.ID,
					UserConnection: conn,
					Percentage:     lo.ToPtr(100),
				},
			}

		} else {
			// transferência entre contas do mesmo usuário
			var recurrenceID *int
			if hasRecurrence {
				r, err := s.createRecurrence(ctx, userID, *recurrenceSettings)
				if err != nil {
					return err
				}
				recurrenceID = &r.ID
			}

			transaction.LinkedTransactions = append(transaction.LinkedTransactions, domain.Transaction{
				ID:                      0,
				TransactionRecurrenceID: recurrenceID,
				InstallmentNumber:       transaction.InstallmentNumber,
				Date:                    transaction.Date,
				Description:             transaction.Description,
				UserID:                  userID,
				OriginalUserID:          &userID,
				Type:                    domain.TransactionTypeTransfer,
				OperationType:           transaction.OperationType.Invert(),
				AccountID:               *req.DestinationAccountID,
				CategoryID:              nil,
				Amount:                  transaction.Amount,
				Tags:                    transaction.Tags,
				ChargeID:                transaction.ChargeID,
			})

			return nil
		}

	} else {
		connectionIDs = lo.Map(splitSettings, func(splitSetting domain.SplitSettings, _ int) int {
			return splitSetting.ConnectionID
		})
	}

	if len(connectionIDs) == 0 {
		return nil
	}

	for i, splitSetting := range splitSettings {
		connection := splitSetting.UserConnection
		if connection == nil {
			return pkgErrors.ErrSplitSettingInvalidConnectionID(i)
		}

		if connection.FromUserID != userID && connection.ToUserID != userID {
			return pkgErrors.ErrSplitSettingInvalidConnectionID(i).AddTag("user_id_not_in_connection")
		}

		amount := s.calculateAmount(transaction.Amount, splitSetting)

		// Cross-user transfers create a fromTransaction on the author's shared account
		// (credit mirror of the debit on the private account). Shared expenses/income
		// do NOT get a fromTransaction — a settlement handles the author's shared account.
		if req.TransactionType == domain.TransactionTypeTransfer {
			fromTransaction := domain.Transaction{
				ID:                0,
				InstallmentNumber: transaction.InstallmentNumber,
				Date:              transaction.Date,
				Description:       transaction.Description,
				UserID:            connection.FromUserID,
				OriginalUserID:    &userID,
				Type:              transaction.Type,
				OperationType:     transaction.OperationType.Invert(),
				AccountID:         connection.FromAccountID,
				CategoryID:        nil,
				Amount:            amount,
				Tags:              nil,
				CreatedAt:         nil,
				UpdatedAt:         nil,
				ChargeID:          transaction.ChargeID,
			}
			transaction.LinkedTransactions = append(transaction.LinkedTransactions, fromTransaction)
		}

		toTransaction := domain.Transaction{
			ID:                0,
			InstallmentNumber: transaction.InstallmentNumber,
			Date:              transaction.Date,
			Description:       transaction.Description,
			UserID:            connection.ToUserID,
			OriginalUserID:    &userID,
			Type:              transaction.Type,
			OperationType:     lo.Ternary(req.TransactionType == domain.TransactionTypeTransfer, transaction.OperationType.Invert(), transaction.OperationType),
			AccountID:         connection.ToAccountID,
			CategoryID:        nil,
			Amount:            amount,
			Tags:              nil,
			CreatedAt:         nil,
			UpdatedAt:         nil,
			ChargeID:          transaction.ChargeID,
		}

		if hasRecurrence {
			r, err := s.createRecurrence(ctx, connection.ToUserID, *recurrenceSettings)
			if err != nil {
				return err
			}
			toTransaction.TransactionRecurrenceID = &r.ID
		}

		transaction.LinkedTransactions = append(transaction.LinkedTransactions, toTransaction)
	}

	return nil
}

func (s *transactionService) getConnectionFromDestinationAccountID(ctx context.Context, userID, destinationAccountID int) (*domain.UserConnection, error) {
	conn, err := s.services.UserConnection.SearchOne(ctx, domain.UserConnectionSearchOptions{
		AccountIDs: []int{destinationAccountID},
	})
	if err != nil {
		// A regular (non-connection) account has no user_connection record.
		// This is the same-user transfer case — return nil so the caller
		// falls back to the single-credit-side same-user path.
		if pkgErrors.IsNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	conn.SwapIfNeeded(userID)

	return conn, nil
}

func (s *transactionService) calculateAmount(amount int64, splitSetting domain.SplitSettings) int64 {
	if splitSetting.Percentage != nil {
		return int64(float64(amount) * float64(*splitSetting.Percentage) / 100)
	} else if splitSetting.Amount != nil {
		return *splitSetting.Amount
	}
	return amount
}

func (s *transactionService) incrementInstallmentDate(baseDate time.Time, recurrenceType domain.RecurrenceType, increment int) time.Time {
	switch recurrenceType {
	case domain.RecurrenceTypeDaily:
		return baseDate.AddDate(0, 0, increment)
	case domain.RecurrenceTypeWeekly:
		return baseDate.AddDate(0, 0, increment*7)
	case domain.RecurrenceTypeMonthly:
		return clampToEndOfMonth(baseDate, baseDate.Year(), baseDate.Month()+time.Month(increment))
	case domain.RecurrenceTypeYearly:
		return clampToEndOfMonth(baseDate, baseDate.Year()+increment, baseDate.Month())
	}
	return baseDate
}

// clampToEndOfMonth builds a date in the target year/month using the original day from
// baseDate, clamping it to the last day of the target month when needed.
// This prevents Go's AddDate overflow behaviour (e.g. Jan 31 + 1 month → Mar 3 instead of Feb 28).
func clampToEndOfMonth(baseDate time.Time, targetYear int, targetMonth time.Month) time.Time {
	// Normalise month (handles values outside 1–12 produced by arithmetic)
	normalised := time.Date(targetYear, targetMonth, 1, 0, 0, 0, 0, baseDate.Location())
	// Last day of the normalised month: day 0 of the following month
	lastDay := time.Date(normalised.Year(), normalised.Month()+1, 0, 0, 0, 0, 0, baseDate.Location()).Day()
	day := min(baseDate.Day(), lastDay)
	return time.Date(normalised.Year(), normalised.Month(), day,
		baseDate.Hour(), baseDate.Minute(), baseDate.Second(), baseDate.Nanosecond(), baseDate.Location())
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

func (s *transactionService) createRecurrence(ctx context.Context, userID int, recurrenceSettings domain.RecurrenceSettings) (*domain.TransactionRecurrence, error) {
	tr := domain.RecurrenceFromSettings(recurrenceSettings, userID)

	if recurrence, err := s.transactionRecurRepo.Create(ctx, tr); err != nil {
		return nil, err
	} else {
		return recurrence, nil
	}
}
