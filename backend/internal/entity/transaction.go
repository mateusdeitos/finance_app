package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
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
	User                    User      `gorm:"<-:false"`
	Account                 Account   `gorm:"<-:false"`
	Category                *Category `gorm:"<-:false"`
	DestinationAccount      *Account  `gorm:"<-:false"`
	Tags                    []Tag     `gorm:"many2many:transaction_tags;joinForeignKey:transaction_id;joinReferences:tag_id;<-:false"`
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
		CreatedAt:               t.CreatedAt,
		UpdatedAt:               t.UpdatedAt,
	}

	if len(t.Tags) > 0 {
		trans.Tags = make([]domain.Tag, len(t.Tags))
		for i, tag := range t.Tags {
			trans.Tags[i] = *tag.ToDomain()
		}
	}

	return trans
}

func TransactionFromDomain(d *domain.Transaction) *Transaction {
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
		CreatedAt:               d.CreatedAt,
		UpdatedAt:               d.UpdatedAt,
	}

	if len(d.Tags) > 0 {
		t.Tags = make([]Tag, len(d.Tags))
		for i, tag := range d.Tags {
			t.Tags[i] = *TagFromDomain(&tag)
		}
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
