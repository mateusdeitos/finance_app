package repository

import (
	"context"
	"errors"

	"gorm.io/gorm"
)

type DBTransactionImpl struct {
	db *gorm.DB
}

func NewDBTransaction(db *gorm.DB) DBTransaction {
	return &DBTransactionImpl{db: db}
}

func GetTxFromContext(ctx context.Context, db *gorm.DB) *gorm.DB {
	tx, ok := ctx.Value("tx").(*gorm.DB)
	if !ok {
		return db.WithContext(ctx)
	}
	return tx
}

func (t *DBTransactionImpl) Begin(ctx context.Context) (context.Context, error) {
	tx := t.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}
	return context.WithValue(ctx, "tx", tx), nil
}

func (t *DBTransactionImpl) Commit(ctx context.Context) error {
	tx, ok := ctx.Value("tx").(*gorm.DB)
	if !ok {
		return errors.New("transaction not found")
	}
	return tx.Commit().Error
}

func (t *DBTransactionImpl) Rollback(ctx context.Context) error {
	tx, ok := ctx.Value("tx").(*gorm.DB)
	if !ok {
		return errors.New("transaction not found")
	}
	return tx.Rollback().Error
}
