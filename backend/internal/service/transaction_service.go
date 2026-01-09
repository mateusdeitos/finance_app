package service

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
)

type transactionService struct {
	transactionRepo      repository.TransactionRepository
	transactionRecurRepo repository.TransactionRecurrenceRepository
	accountRepo          repository.AccountRepository
	categoryRepo         repository.CategoryRepository
	tagRepo              repository.TagRepository
}

func NewTransactionService(repos *repository.Repositories) TransactionService {
	return &transactionService{
		transactionRepo:      repos.Transaction,
		transactionRecurRepo: repos.TransactionRecurrence,
		accountRepo:          repos.Account,
		categoryRepo:         repos.Category,
		tagRepo:              repos.Tag,
	}
}

func (s *transactionService) Create(ctx context.Context, userID int, transaction *domain.Transaction) (*domain.Transaction, error) {
	// Validate account belongs to user
	account, err := s.accountRepo.GetByID(ctx, transaction.AccountID)
	if err != nil {
		return nil, fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return nil, errors.New("account not found")
	}
	if account.UserID != userID {
		return nil, errors.New("account does not belong to user")
	}

	// Validate category if provided
	if transaction.CategoryID != nil {
		category, err := s.categoryRepo.GetByID(ctx, *transaction.CategoryID)
		if err != nil {
			return nil, fmt.Errorf("failed to get category: %w", err)
		}
		if category == nil {
			return nil, errors.New("category not found")
		}
		if category.UserID != userID {
			return nil, errors.New("category does not belong to user")
		}
	}

	// Validate transaction type
	if transaction.Type == domain.TransactionTypeTransfer {
		if transaction.CategoryID != nil {
			return nil, errors.New("transfer transactions cannot have category")
		}
		if transaction.DestinationAccountID == nil {
			return nil, errors.New("transfer transactions must have destination account")
		}
		// Validate destination account
		destAccount, err := s.accountRepo.GetByID(ctx, *transaction.DestinationAccountID)
		if err != nil {
			return nil, fmt.Errorf("failed to get destination account: %w", err)
		}
		if destAccount == nil {
			return nil, errors.New("destination account not found")
		}
	} else {
		if transaction.CategoryID == nil {
			return nil, errors.New("expense/income transactions must have category")
		}
	}

	// Determine transaction type from amount if not set
	if transaction.Type == "" {
		if transaction.Amount < 0 {
			transaction.Type = domain.TransactionTypeExpense
			transaction.Amount = -transaction.Amount // Store as positive
		} else {
			transaction.Type = domain.TransactionTypeIncome
		}
	}

	transaction.UserID = userID
	if transaction.GroupingDate == nil {
		groupingDate := transaction.Date
		transaction.GroupingDate = &groupingDate
	}

	return s.transactionRepo.Create(ctx, transaction)
}

func (s *transactionService) GetByID(ctx context.Context, userID, id int) (*domain.Transaction, error) {
	transaction, err := s.transactionRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}
	if transaction == nil {
		return nil, errors.New("transaction not found")
	}

	// Verify ownership
	account, err := s.accountRepo.GetByID(ctx, transaction.AccountID)
	if err != nil {
		return nil, fmt.Errorf("failed to get account: %w", err)
	}
	if account.UserID != userID {
		return nil, errors.New("transaction does not belong to user")
	}

	return transaction, nil
}

func (s *transactionService) List(ctx context.Context, userID int, filter domain.TransactionFilter, orderBy domain.TransactionOrderBy, limit, offset int) ([]*domain.Transaction, int64, error) {
	// Get user accounts
	accounts, err := s.accountRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get accounts: %w", err)
	}

	accountIDs := make([]int, len(accounts))
	for i, acc := range accounts {
		accountIDs[i] = acc.ID
	}

	// Filter by user accounts
	if len(filter.AccountIDs) > 0 {
		// Intersect with user accounts
		validAccountIDs := make([]int, 0)
		for _, id := range filter.AccountIDs {
			for _, accID := range accountIDs {
				if id == accID {
					validAccountIDs = append(validAccountIDs, id)
					break
				}
			}
		}
		filter.AccountIDs = validAccountIDs
	} else {
		filter.AccountIDs = accountIDs
	}

	filter.UserID = &userID

	return s.transactionRepo.GetByFilter(ctx, filter, orderBy, limit, offset)
}

func (s *transactionService) GetGrouped(ctx context.Context, userID int, filter domain.TransactionFilter, groupBy domain.TransactionGroupBy) (map[string][]*domain.Transaction, error) {
	// Get user accounts
	accounts, err := s.accountRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get accounts: %w", err)
	}

	accountIDs := make([]int, len(accounts))
	for i, acc := range accounts {
		accountIDs[i] = acc.ID
	}

	if len(filter.AccountIDs) > 0 {
		validAccountIDs := make([]int, 0)
		for _, id := range filter.AccountIDs {
			for _, accID := range accountIDs {
				if id == accID {
					validAccountIDs = append(validAccountIDs, id)
					break
				}
			}
		}
		filter.AccountIDs = validAccountIDs
	} else {
		filter.AccountIDs = accountIDs
	}

	filter.UserID = &userID

	return s.transactionRepo.GetGrouped(ctx, filter, groupBy)
}

func (s *transactionService) Update(ctx context.Context, userID int, transaction *domain.Transaction) error {
	// Verify ownership
	existing, err := s.GetByID(ctx, userID, transaction.ID)
	if err != nil {
		return err
	}

	transaction.UserID = existing.UserID

	// Validate account if changed
	if transaction.AccountID != existing.AccountID {
		account, err := s.accountRepo.GetByID(ctx, transaction.AccountID)
		if err != nil {
			return fmt.Errorf("failed to get account: %w", err)
		}
		if account == nil {
			return errors.New("account not found")
		}
		if account.UserID != userID {
			return errors.New("account does not belong to user")
		}
	}

	return s.transactionRepo.Update(ctx, transaction)
}

func (s *transactionService) BulkUpdate(ctx context.Context, userID int, updates domain.BulkUpdateTransaction) error {
	// Verify all transactions belong to user
	for _, id := range updates.IDs {
		_, err := s.GetByID(ctx, userID, id)
		if err != nil {
			return fmt.Errorf("transaction %d: %w", id, err)
		}
	}

	return s.transactionRepo.BulkUpdate(ctx, updates)
}

func (s *transactionService) Delete(ctx context.Context, userID, id int) error {
	// Verify ownership
	_, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}

	return s.transactionRepo.Delete(ctx, id)
}

func (s *transactionService) ImportCSV(ctx context.Context, userID int, reader io.Reader) ([]*domain.Transaction, error) {
	csvReader := csv.NewReader(reader)
	records, err := csvReader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV: %w", err)
	}

	if len(records) < 2 {
		return nil, errors.New("CSV must have at least a header and one data row")
	}

	transactions := make([]*domain.Transaction, 0)

	// Parse header (assuming format: date,description,amount,category,account)
	header := records[0]
	dateIdx, descIdx, amountIdx, categoryIdx, accountIdx := -1, -1, -1, -1, -1

	for i, col := range header {
		switch col {
		case "date", "Date":
			dateIdx = i
		case "description", "Description":
			descIdx = i
		case "amount", "Amount":
			amountIdx = i
		case "category", "Category":
			categoryIdx = i
		case "account", "Account":
			accountIdx = i
		}
	}

	if dateIdx == -1 || descIdx == -1 || amountIdx == -1 {
		return nil, errors.New("CSV must have date, description, and amount columns")
	}

	// Get default account if account column not found
	var defaultAccount *domain.Account
	if accountIdx == -1 {
		accounts, err := s.accountRepo.GetByUserID(ctx, userID)
		if err != nil {
			return nil, fmt.Errorf("failed to get accounts: %w", err)
		}
		if len(accounts) == 0 {
			return nil, errors.New("no accounts found, please create an account first")
		}
		defaultAccount = accounts[0]
	}

	// Parse rows
	for i := 1; i < len(records); i++ {
		row := records[i]
		if len(row) <= dateIdx || len(row) <= descIdx || len(row) <= amountIdx {
			continue
		}

		// Parse date
		date, err := time.Parse("2006-01-02", row[dateIdx])
		if err != nil {
			// Try other formats
			date, err = time.Parse("01/02/2006", row[dateIdx])
			if err != nil {
				continue // Skip invalid rows
			}
		}

		// Parse amount
		amountStr := row[amountIdx]
		amount, err := strconv.ParseFloat(amountStr, 64)
		if err != nil {
			continue
		}
		amountCents := int64(amount * 100)

		// Determine type
		var transType domain.TransactionType
		if amountCents < 0 {
			transType = domain.TransactionTypeExpense
			amountCents = -amountCents
		} else {
			transType = domain.TransactionTypeIncome
		}

		now := time.Now()
		transaction := &domain.Transaction{
			UserID:      userID,
			Type:        transType,
			Amount:      amountCents,
			Date:        date,
			Description: row[descIdx],
			CreatedAt:   &now,
			UpdatedAt:   &now,
		}

		// Set account
		if accountIdx != -1 && len(row) > accountIdx {
			accountName := row[accountIdx]
			accounts, err := s.accountRepo.GetByUserID(ctx, userID)
			if err == nil {
				for _, acc := range accounts {
					if acc.Name == accountName {
						transaction.AccountID = acc.ID
						break
					}
				}
			}
		}
		if transaction.AccountID == 0 && defaultAccount != nil {
			transaction.AccountID = defaultAccount.ID
		}

		// Set category if provided
		if categoryIdx != -1 && len(row) > categoryIdx {
			categoryName := row[categoryIdx]
			if categoryName != "" {
				categories, err := s.categoryRepo.GetByUserID(ctx, userID)
				if err == nil {
					for _, cat := range categories {
						if cat.Name == categoryName {
							transaction.CategoryID = &cat.ID
							break
						}
					}
				}
			}
		}

		// Create transaction
		created, err := s.transactionRepo.Create(ctx, transaction)
		if err != nil {
			continue // Skip failed transactions
		}

		transactions = append(transactions, created)
	}

	return transactions, nil
}

func (s *transactionService) SuggestCategory(ctx context.Context, userID int, description string) (*domain.Category, error) {
	// Get past transactions with similar description
	transactions, err := s.transactionRepo.GetByDescription(ctx, userID, description, 10)
	if err != nil {
		return nil, fmt.Errorf("failed to get transactions: %w", err)
	}

	// Count category occurrences
	categoryCount := make(map[int]int)
	for _, t := range transactions {
		if t.CategoryID != nil {
			categoryCount[*t.CategoryID]++
		}
	}

	// Find most common category
	var mostCommonCategoryID int
	maxCount := 0
	for catID, count := range categoryCount {
		if count > maxCount {
			maxCount = count
			mostCommonCategoryID = catID
		}
	}

	if mostCommonCategoryID == 0 {
		return nil, nil // No suggestion
	}

	category, err := s.categoryRepo.GetByID(ctx, mostCommonCategoryID)
	if err != nil {
		return nil, fmt.Errorf("failed to get category: %w", err)
	}

	return category, nil
}

func (s *transactionService) CreateRecurring(ctx context.Context, userID int, transaction *domain.Transaction, config domain.TransactionRecurrenceConfig) ([]*domain.Transaction, error) {
	// Create base transaction
	baseTransaction, err := s.Create(ctx, userID, transaction)
	if err != nil {
		return nil, err
	}

	transactions := []*domain.Transaction{baseTransaction}

	// Calculate repetitions
	repetitions := 10 * 365 // Default for indefinite (10 years)
	if config.Repetitions != nil {
		repetitions = *config.Repetitions
	}

	// Generate recurring transactions
	currentDate := config.StartDate
	for i := 1; i < repetitions; i++ {
		var nextDate time.Time
		switch config.Type {
		case domain.RecurrenceTypeDaily:
			nextDate = currentDate.AddDate(0, 0, 1)
		case domain.RecurrenceTypeWeekly:
			nextDate = currentDate.AddDate(0, 0, 7)
		case domain.RecurrenceTypeMonthly:
			nextDate = currentDate.AddDate(0, 1, 0)
		case domain.RecurrenceTypeYearly:
			nextDate = currentDate.AddDate(1, 0, 0)
		default:
			return nil, errors.New("invalid recurrence type")
		}

		recurringTransaction := *baseTransaction
		recurringTransaction.ID = 0
		recurringTransaction.Date = nextDate
		if recurringTransaction.GroupingDate != nil {
			groupingDate := nextDate
			recurringTransaction.GroupingDate = &groupingDate
		}
		now := time.Now()
		recurringTransaction.CreatedAt = &now
		recurringTransaction.UpdatedAt = &now

		created, err := s.transactionRepo.Create(ctx, &recurringTransaction)
		if err != nil {
			return transactions, fmt.Errorf("failed to create recurring transaction: %w", err)
		}

		// Create recurrence record
		recurrence := &domain.TransactionRecurrence{
			TransactionID: created.ID,
			Index:         i,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}
		if err := s.transactionRecurRepo.Create(ctx, recurrence); err != nil {
			return transactions, fmt.Errorf("failed to create recurrence record: %w", err)
		}

		transactions = append(transactions, created)
		currentDate = nextDate
	}

	return transactions, nil
}
