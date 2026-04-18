package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
	"gorm.io/gorm"
)

// orphanedSettlementSyntheticIDOffset ensures synthetic IDs produced by
// FindOrphanedSettlementTransactions don't collide with real transaction IDs.
// Synthetic IDs are computed as -(settlement.id + offset); the negative value
// also signals to API consumers that the row is read-only.
const orphanedSettlementSyntheticIDOffset = 1000000

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
		// Preload ALL settlements attached to returned source transactions,
		// regardless of the settlement's own account_id. The listing view
		// displays settlements inline under their source transaction even
		// when the active filter doesn't target the settlement's account —
		// it provides context about the split. The frontend is responsible
		// for excluding out-of-scope settlements from the group net total so
		// the displayed sum stays consistent with GetBalance (whose settlements
		// leg is filtered by s.account_id). Double-counting in the combined-
		// filter case is still prevented by FindOrphanedSettlementTransactions
		// via its `t.account_id NOT IN filter` guard.
		query = query.Preload("SettlementsFromSource")
	}

	if filter.UserID != nil {
		query = query.Where("transactions.user_id = ?", *filter.UserID)
	}

	if len(filter.IDs) > 0 {
		query = query.Where("transactions.id IN ?", filter.IDs)
	}

	if len(filter.IDsNotIn) > 0 {
		query = query.Where("transactions.id NOT IN ?", filter.IDsNotIn)
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
			query = query.Where("transactions.description = ?", filter.Description.Query)
		} else {
			query = query.Where("transactions.description % ?", filter.Description.Query)
			query = query.Order(fmt.Sprintf("transactions.description <-> '%s' DESC", filter.Description.Query))
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

// FindOrphanedSettlementTransactions returns synthetic Transaction entries
// that represent settlements bound to one of filter.AccountIDs whose source
// transaction lives on a different (non-filtered) account. This surfaces
// shared-account settlement rows in a list view without double-counting the
// source transaction (which is not on the filtered account and therefore
// shouldn't contribute to its balance).
//
// Each returned Transaction has:
//   - ID: a negative sentinel computed from the settlement id (not a real row)
//   - OriginSettlementID: set to the backing settlement id
//   - SourceTransactionID: set to the backing settlement's source transaction
//     id so the frontend can fetch the full transaction for editing
//   - Amount, AccountID: from the settlement
//   - OperationType / Type: derived from SettlementType (credit -> income,
//     debit -> expense)
//   - Date, Description, CategoryID, OriginalUserID: inherited from the
//     source transaction for display + grouping purposes
//   - SettlementsFromSource: empty (the row *is* the settlement; the frontend
//     should not render a nested SettlementRow beneath it)
//
// A settlement whose source transaction's own account_id IS in
// filter.AccountIDs is intentionally excluded: that source transaction is
// already in the Search result with the settlement preloaded alongside it,
// and including it here as well would double-count.
func (r *transactionRepository) FindOrphanedSettlementTransactions(ctx context.Context, filter domain.TransactionFilter) ([]*domain.Transaction, error) {
	if filter.UserID == nil || len(filter.AccountIDs) == 0 {
		return nil, nil
	}

	type row struct {
		SettlementID        int            `gorm:"column:settlement_id"`
		SettlementType      string         `gorm:"column:settlement_type"`
		UserID              int            `gorm:"column:user_id"`
		OriginalUserID      *int           `gorm:"column:original_user_id"`
		AccountID           int            `gorm:"column:account_id"`
		CategoryID          *int           `gorm:"column:category_id"`
		Amount              int64          `gorm:"column:amount"`
		Date                time.Time      `gorm:"column:date"`
		Description         string         `gorm:"column:description"`
		SourceTransactionID int            `gorm:"column:source_transaction_id"`
		CreatedAt           *time.Time     `gorm:"column:created_at"`
		UpdatedAt           *time.Time     `gorm:"column:updated_at"`
		_                   gorm.DeletedAt `gorm:"-"`
		_                   struct{}       `gorm:"-"`
	}

	var rows []row
	query := GetTxFromContext(ctx, r.db).
		Table("settlements s").
		Select(`s.id AS settlement_id,
			s.type AS settlement_type,
			s.user_id AS user_id,
			t.original_user_id AS original_user_id,
			s.account_id AS account_id,
			t.category_id AS category_id,
			s.amount AS amount,
			t.date AS date,
			t.description AS description,
			s.source_transaction_id AS source_transaction_id,
			s.created_at AS created_at,
			s.updated_at AS updated_at`).
		Joins("JOIN transactions t ON t.id = s.source_transaction_id").
		Where("t.deleted_at IS NULL").
		Where("s.user_id = ?", *filter.UserID).
		Where("s.account_id IN ?", filter.AccountIDs).
		Where("t.account_id NOT IN ?", filter.AccountIDs)

	if filter.StartDate != nil && filter.StartDate.IsValid() {
		query = query.Where(filter.StartDate.ToSQL("t.date"))
	}
	if filter.EndDate != nil && filter.EndDate.IsValid() {
		query = query.Where(filter.EndDate.ToSQL("t.date"))
	}

	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]*domain.Transaction, 0, len(rows))
	for _, r := range rows {
		settlementType := domain.SettlementType(r.SettlementType)
		var (
			opType  domain.OperationType
			txType  domain.TransactionType
		)
		if settlementType == domain.SettlementTypeCredit {
			opType = domain.OperationTypeCredit
			txType = domain.TransactionTypeIncome
		} else {
			opType = domain.OperationTypeDebit
			txType = domain.TransactionTypeExpense
		}

		settlementID := r.SettlementID
		sourceTxID := r.SourceTransactionID
		result = append(result, &domain.Transaction{
			ID:                  -(settlementID + orphanedSettlementSyntheticIDOffset),
			OriginSettlementID:  &settlementID,
			SourceTransactionID: &sourceTxID,
			UserID:              r.UserID,
			OriginalUserID:      r.OriginalUserID,
			Type:                txType,
			OperationType:       opType,
			AccountID:           r.AccountID,
			CategoryID:          r.CategoryID,
			Amount:              r.Amount,
			Date:                r.Date,
			Description:         r.Description,
			CreatedAt:           r.CreatedAt,
			UpdatedAt:           r.UpdatedAt,
		})
	}

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

func (r *transactionRepository) NullifyCategory(ctx context.Context, categoryID int) error {
	return GetTxFromContext(ctx, r.db).
		Model(&entity.Transaction{}).
		Where("category_id = ?", categoryID).
		Update("category_id", nil).Error
}

func (r *transactionRepository) ReassignCategory(ctx context.Context, fromID, toID int) error {
	return GetTxFromContext(ctx, r.db).
		Model(&entity.Transaction{}).
		Where("category_id = ?", fromID).
		Update("category_id", toID).Error
}
