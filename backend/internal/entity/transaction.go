package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/samber/lo"
	"gorm.io/gorm"
)

type Transaction struct {
	ID                      int
	ParentID                *int
	TransactionRecurrenceID *int
	InstallmentNumber       *int
	UserID                  int
	Type                    domain.TransactionType
	AccountID               int
	CategoryID              *int
	Amount                  int64
	Date                    time.Time
	Description             string
	DestinationAccountID    *int
	CreatedAt               *time.Time
	UpdatedAt               *time.Time
	DeletedAt               *gorm.DeletedAt
	User                    User                   `gorm:"<-:false"`
	Account                 Account                `gorm:"<-:false"`
	Category                *Category              `gorm:"<-:false"`
	DestinationAccount      *Account               `gorm:"<-:false"`
	TransactionRecurrence   *TransactionRecurrence `gorm:"<-:false"`
	Tags                    []Tag                  `gorm:"many2many:transaction_tags;joinForeignKey:transaction_id;joinReferences:tag_id;<-:create"`
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

	trans := &domain.Transaction{
		ID:                      t.ID,
		ParentID:                t.ParentID,
		TransactionRecurrenceID: t.TransactionRecurrenceID,
		InstallmentNumber:       t.InstallmentNumber,
		UserID:                  t.UserID,
		Type:                    t.Type,
		AccountID:               t.AccountID,
		CategoryID:              t.CategoryID,
		Amount:                  t.Amount,
		Date:                    t.Date,
		Description:             t.Description,
		DestinationAccountID:    t.DestinationAccountID,
		TransactionRecurrence:   transactionRecurrence,
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
		ParentID:                d.ParentID,
		TransactionRecurrenceID: d.TransactionRecurrenceID,
		InstallmentNumber:       d.InstallmentNumber,
		UserID:                  d.UserID,
		Type:                    d.Type,
		AccountID:               d.AccountID,
		CategoryID:              d.CategoryID,
		Amount:                  d.Amount,
		Date:                    d.Date,
		Description:             d.Description,
		DestinationAccountID:    d.DestinationAccountID,
		TransactionRecurrence:   TransactionRecurrenceFromDomain(d.TransactionRecurrence),
		Tags: lo.Map(d.Tags, func(tag domain.Tag, _ int) Tag {
			return *TagFromDomain(&tag)
		}),
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
		DeletedAt: deletedAt,
	}

	return t
}

type TransactionRecurrence struct {
	ID           int `gorm:"primaryKey;autoIncrement"`
	UserID       int `gorm:"not null"`
	Installments int `gorm:"not null"`
	CreatedAt    *time.Time
	UpdatedAt    *time.Time
}

func (tr *TransactionRecurrence) ToDomain() *domain.TransactionRecurrence {
	return &domain.TransactionRecurrence{
		ID:           tr.ID,
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
