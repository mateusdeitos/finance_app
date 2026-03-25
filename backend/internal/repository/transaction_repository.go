package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
	"gorm.io/gorm"
)

type transactionRepository struct {
	db *gorm.DB
}

func NewTransactionRepository(db *gorm.DB) TransactionRepository {
	return &transactionRepository{db: db}
}

func (r *transactionRepository) Create(ctx context.Context, transaction *domain.Transaction) (*domain.Transaction, error) {
	ent := entity.TransactionFromDomain(transaction)

	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}

	return ent.ToDomain(), nil
}

func (r *transactionRepository) Update(ctx context.Context, transaction *domain.Transaction) error {
	tags := lo.Map(transaction.Tags, func(tag domain.Tag, _ int) entity.Tag {
		tag.UserID = transaction.UserID
		return *entity.TagFromDomain(&tag)
	})

	transaction.Tags = nil

	ent := entity.TransactionFromDomain(transaction)
	lts := ent.LinkedTransactions
	ent.LinkedTransactions = nil
	if err := GetTxFromContext(ctx, r.db).Save(ent).Error; err != nil {
		return err
	}

	if err := GetTxFromContext(ctx, r.db).Model(ent).Association("Tags").Replace(tags); err != nil {
		return err
	}

	for i := range lts {
		if err := GetTxFromContext(ctx, r.db).Save(&lts[i]).Error; err != nil {
			return err
		}

		if lts[i].UserID != transaction.UserID {
			continue
		}

		lts[i].Tags = tags

		if err := GetTxFromContext(ctx, r.db).Model(&lts[i]).Association("Tags").Replace(tags); err != nil {
			return err
		}
	}

	if err := GetTxFromContext(ctx, r.db).Model(ent).Association("LinkedTransactions").Replace(lts); err != nil {
		return err
	}
	return nil
}

func (r *transactionRepository) SearchOne(ctx context.Context, filter domain.TransactionFilter) (*domain.Transaction, error) {
	filter.Limit = lo.ToPtr(1)
	filter.Offset = lo.ToPtr(0)
	transactions, err := r.Search(ctx, filter)
	if err != nil {
		return nil, err
	}
	if len(transactions) == 0 {
		return nil, pkgErrors.NotFound("transaction")
	}
	return transactions[0], nil
}

func (r *transactionRepository) Search(ctx context.Context, filter domain.TransactionFilter) ([]*domain.Transaction, error) {
	var ents []entity.Transaction
	query := GetTxFromContext(ctx, r.db)

	query = query.Preload("TransactionRecurrence").Preload("LinkedTransactions").Preload("SourceTransactions").Preload("Tags").Preload("LinkedTransactions.Tags").Preload("SourceTransactions.Tags")

	if filter.WithSettlements {
		query = query.Preload("SettlementsFromSource")
	}

	if filter.UserID != nil {
		query = query.Where("transactions.user_id = ?", *filter.UserID)
	}

	if len(filter.IDs) > 0 {
		query = query.Where("id IN ?", filter.IDs)
	}

	if len(filter.IDsNotIn) > 0 {
		query = query.Where("id NOT IN ?", filter.IDsNotIn)
	}

	if filter.StartDate != nil {
		query = query.Where(filter.StartDate.ToSQL("date"))
	}

	if filter.EndDate != nil {
		query = query.Where(filter.EndDate.ToSQL("date"))
	}

	query = query.Select("transactions.*").
		Joins("JOIN accounts ON accounts.id = transactions.account_id")

	if len(filter.AccountIDs) > 0 {
		query = query.Where("accounts.id IN ?", filter.AccountIDs)
	} else {
		query = query.Where("accounts.is_active = true")
	}

	if len(filter.CategoryIDs) > 0 {
		query = query.Where("category_id IN ?", filter.CategoryIDs)
	}

	if len(filter.TagIDs) > 0 {
		query = query.Joins("JOIN transaction_tags ON transaction_tags.transaction_id = transactions.id")
		query = query.Where("transaction_tags.tag_id IN ?", filter.TagIDs)
	}

	if len(filter.RecurrenceIDs) > 0 {
		query = query.Where("transaction_recurrence_id IN ?", filter.RecurrenceIDs)
	}

	if filter.InstallmentNumber != nil {
		query = query.Where(filter.InstallmentNumber.ToSQL("installment_number"))
	}

	if filter.Description != nil {
		if filter.Description.Exact {
			query = query.Where("description = ?", filter.Description.Query)
		} else {
			query = query.Where("description % ?", filter.Description.Query)
			query = query.Order(fmt.Sprintf("description <-> '%s' DESC", filter.Description.Query))
		}
	}

	types := lo.Filter(filter.Types, func(t domain.TransactionType, _ int) bool {
		return t.IsValid()
	})

	if len(types) > 0 {
		query = query.Where("type IN ?", types)
	}

	if filter.SortBy != nil {
		query = query.Scopes(filter.SortBy.Scope())
	}

	if filter.Limit != nil {
		query = query.Limit(*filter.Limit)
	}

	if filter.Offset != nil {
		query = query.Offset(*filter.Offset)
	}

	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := lo.Map(ents, func(ent entity.Transaction, _ int) *domain.Transaction {
		return ent.ToDomain()
	})

	return result, nil
}

func (r *transactionRepository) Delete(ctx context.Context, ids []int) error {
	err := GetTxFromContext(ctx, r.db).Where("id IN ?", ids).Delete(&entity.Transaction{}).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	return nil
}

func (r *transactionRepository) GetSourceTransactionIDs(ctx context.Context, linkedTransactionID int) ([]int, error) {
	var ids []int
	err := GetTxFromContext(ctx, r.db).Table("linked_transactions").
		Where("linked_transaction_id = ?", linkedTransactionID).
		Pluck("transaction_id", &ids).Error
	return ids, err
}

func (r *transactionRepository) GetBalance(ctx context.Context, filter domain.BalanceFilter) (*domain.BalanceResult, error) {
	endDate := filter.Period.EndDate()
	var args []interface{}

	// Transactions leg
	txSQL := `SELECT CASE WHEN operation_type = 'credit' THEN amount ELSE -amount END AS amount
		FROM transactions
		WHERE deleted_at IS NULL AND user_id = ? AND date <= ?`
	args = append(args, filter.UserID, endDate)

	if !filter.Accumulated {
		startDate := filter.Period.StartDate()
		txSQL += " AND date >= ?"
		args = append(args, startDate)
	}

	if len(filter.AccountIDs) > 0 {
		txSQL += " AND account_id IN ?"
		args = append(args, filter.AccountIDs)
	}
	if len(filter.CategoryIDs) > 0 {
		txSQL += " AND category_id IN ?"
		args = append(args, filter.CategoryIDs)
	}
	if len(filter.TagIDs) > 0 {
		txSQL += " AND EXISTS (SELECT 1 FROM transaction_tags WHERE transaction_id = transactions.id AND tag_id IN ?)"
		args = append(args, filter.TagIDs)
	}

	// Settlements leg — filtered by account_id only (no category/tag columns on settlements)
	settlementSQL := `SELECT CASE WHEN s.type = 'credit' THEN s.amount ELSE -s.amount END AS amount
		FROM settlements s
		JOIN transactions t ON t.id = s.source_transaction_id
		WHERE s.user_id = ? AND t.date <= ?`
	args = append(args, filter.UserID, endDate)

	if !filter.Accumulated {
		startDate := filter.Period.StartDate()
		settlementSQL += " AND t.date >= ?"
		args = append(args, startDate)
	}

	if len(filter.AccountIDs) > 0 {
		settlementSQL += " AND s.account_id IN ?"
		args = append(args, filter.AccountIDs)
	}

	var combined string
	if filter.Accumulated {
		initialBalanceSQL := `SELECT initial_balance AS amount FROM accounts WHERE user_id = ?`
		args = append(args, filter.UserID)
		if len(filter.AccountIDs) > 0 {
			initialBalanceSQL += " AND id IN ?"
			args = append(args, filter.AccountIDs)
		}
		combined = fmt.Sprintf(
			"SELECT COALESCE(SUM(amount), 0) FROM ((%s) UNION ALL (%s) UNION ALL (%s)) combined",
			txSQL, settlementSQL, initialBalanceSQL,
		)
	} else {
		combined = fmt.Sprintf(
			"SELECT COALESCE(SUM(amount), 0) FROM ((%s) UNION ALL (%s)) combined",
			txSQL, settlementSQL,
		)
	}

	var balance int64
	if err := GetTxFromContext(ctx, r.db).Raw(combined, args...).Scan(&balance).Error; err != nil {
		return nil, err
	}

	return &domain.BalanceResult{Balance: balance}, nil
}

func (r *transactionRepository) GetGroupedByRecurrences(ctx context.Context, userID *int, recurrenceIDs []int) (map[int][]*domain.Transaction, error) {
	var ents []entity.Transaction
	query := GetTxFromContext(ctx, r.db)

	if len(recurrenceIDs) == 0 {
		return nil, errors.New("recurrence IDs are required")
	}

	if userID != nil {
		query = query.Where("user_id = ?", userID)
	}

	query = query.Where("transaction_recurrence_id IN ?", recurrenceIDs)

	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}

	result := lo.GroupByMap(ents, func(ent entity.Transaction) (int, *domain.Transaction) {
		return lo.FromPtr(ent.TransactionRecurrenceID), ent.ToDomain()
	})

	for _, recurrenceID := range recurrenceIDs {
		if _, ok := result[recurrenceID]; !ok {
			result[recurrenceID] = []*domain.Transaction{}
		}
	}

	return result, nil
}
