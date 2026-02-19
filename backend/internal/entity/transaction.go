package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/samber/lo"
	"gorm.io/gorm"
)

type Transaction struct {
	ID                      int
	TransactionRecurrenceID *int
	InstallmentNumber       *int
	UserID                  int
	OriginalUserID          *int
	Type                    domain.TransactionType
	OperationType           domain.OperationType
	AccountID               int
	CategoryID              *int
	Amount                  int64
	Date                    time.Time
	Description             string
	CreatedAt               *time.Time
	UpdatedAt               *time.Time
	DeletedAt               *gorm.DeletedAt
	User                    User                   `gorm:"<-:false"`
	Account                 Account                `gorm:"<-:false"`
	Category                *Category              `gorm:"<-:false"`
	TransactionRecurrence   *TransactionRecurrence `gorm:"<-:false"`
	Tags                    []Tag                  `gorm:"many2many:transaction_tags;joinForeignKey:transaction_id;joinReferences:tag_id"`
	LinkedTransactions      []Transaction          `gorm:"many2many:linked_transactions;joinForeignKey:transaction_id;joinReferences:linked_transaction_id"`
}

func (Transaction) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (t *Transaction) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}

func (t *Transaction) ToDomain() *domain.Transaction {
	var transactionRecurrence *domain.TransactionRecurrence
	if t.TransactionRecurrence != nil {
		transactionRecurrence = t.TransactionRecurrence.ToDomain()
	}

	var deletedAt *time.Time
	if t.DeletedAt != nil {
		deletedAt = &t.DeletedAt.Time
	}

	var linkedTransactions []domain.Transaction
	if len(t.LinkedTransactions) > 0 {
		linkedTransactions = lo.Map(t.LinkedTransactions, func(lt Transaction, _ int) domain.Transaction {
			return *lt.ToDomain()
		})
	}

	trans := &domain.Transaction{
		ID:                      t.ID,
		TransactionRecurrenceID: t.TransactionRecurrenceID,
		InstallmentNumber:       t.InstallmentNumber,
		UserID:                  t.UserID,
		OriginalUserID:          t.OriginalUserID,
		Type:                    t.Type,
		OperationType:           t.OperationType,
		AccountID:               t.AccountID,
		CategoryID:              t.CategoryID,
		Amount:                  t.Amount,
		Date:                    t.Date,
		Description:             t.Description,
		TransactionRecurrence:   transactionRecurrence,
		LinkedTransactions:      linkedTransactions,
		Tags: lo.Map(t.Tags, func(tag Tag, _ int) domain.Tag {
			return *tag.ToDomain()
		}),
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
		DeletedAt: deletedAt,
	}

	return trans
}

func TransactionFromDomain(d *domain.Transaction) *Transaction {
	var deletedAt *gorm.DeletedAt
	if d.DeletedAt != nil {
		deletedAt = &gorm.DeletedAt{Time: *d.DeletedAt}
	}

	t := &Transaction{
		ID:                      d.ID,
		TransactionRecurrenceID: d.TransactionRecurrenceID,
		InstallmentNumber:       d.InstallmentNumber,
		UserID:                  d.UserID,
		OriginalUserID:          d.OriginalUserID,
		Type:                    d.Type,
		OperationType:           d.OperationType,
		AccountID:               d.AccountID,
		CategoryID:              d.CategoryID,
		Amount:                  d.Amount,
		Date:                    d.Date,
		Description:             d.Description,
		TransactionRecurrence:   TransactionRecurrenceFromDomain(d.TransactionRecurrence),
		Tags: lo.Map(d.Tags, func(tag domain.Tag, _ int) Tag {
			return *TagFromDomain(&tag)
		}),
		LinkedTransactions: lo.Map(d.LinkedTransactions, func(lt domain.Transaction, _ int) Transaction {
			return *TransactionFromDomain(&lt)
		}),
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
		DeletedAt: deletedAt,
	}

	return t
}

type TransactionRecurrence struct {
	ID           int                   `gorm:"primaryKey;autoIncrement"`
	Type         domain.RecurrenceType `gorm:"not null"`
	UserID       int                   `gorm:"not null"`
	Installments int                   `gorm:"not null"`
	CreatedAt    *time.Time
	UpdatedAt    *time.Time
}

func (tr *TransactionRecurrence) ToDomain() *domain.TransactionRecurrence {
	return &domain.TransactionRecurrence{
		ID:           tr.ID,
		Type:         tr.Type,
		UserID:       tr.UserID,
		Installments: tr.Installments,
		CreatedAt:    tr.CreatedAt,
		UpdatedAt:    tr.UpdatedAt,
	}
}

func TransactionRecurrenceFromDomain(d *domain.TransactionRecurrence) *TransactionRecurrence {
	if d == nil {
		return nil
	}

	return &TransactionRecurrence{
		ID:           d.ID,
		Type:         d.Type,
		UserID:       d.UserID,
		Installments: d.Installments,
		CreatedAt:    d.CreatedAt,
		UpdatedAt:    d.UpdatedAt,
	}
}

func (TransactionRecurrence) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (c *TransactionRecurrence) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}
