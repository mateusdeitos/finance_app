package entity

import (
	"time"

	"github.com/finance_app/backend/internal/domain"
)

type Transaction struct {
	ID                   int
	UserID               int
	Type                 domain.TransactionType
	AccountID            int
	CategoryID           *int
	Amount               int64
	Date                 time.Time
	GroupingDate         *time.Time
	Description          string
	DestinationAccountID *int
	SplitPercentage      *int
	CreatedAt            *time.Time
	UpdatedAt            *time.Time
	User                 User
	Account              Account
	Category             *Category
	DestinationAccount   *Account
	Tags                 []Tag
}

func (t *Transaction) ToDomain() *domain.Transaction {
	trans := &domain.Transaction{
		ID:                   t.ID,
		UserID:               t.UserID,
		Type:                 t.Type,
		AccountID:            t.AccountID,
		CategoryID:           t.CategoryID,
		Amount:               t.Amount,
		Date:                 t.Date,
		GroupingDate:         t.GroupingDate,
		Description:          t.Description,
		DestinationAccountID: t.DestinationAccountID,
		SplitPercentage:      t.SplitPercentage,
		CreatedAt:            t.CreatedAt,
		UpdatedAt:            t.UpdatedAt,
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
		ID:                   d.ID,
		UserID:               d.UserID,
		Type:                 d.Type,
		AccountID:            d.AccountID,
		CategoryID:           d.CategoryID,
		Amount:               d.Amount,
		Date:                 d.Date,
		GroupingDate:         d.GroupingDate,
		Description:          d.Description,
		DestinationAccountID: d.DestinationAccountID,
		SplitPercentage:      d.SplitPercentage,
		CreatedAt:            d.CreatedAt,
		UpdatedAt:            d.UpdatedAt,
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
	ID            int `gorm:"primaryKey;autoIncrement"`
	TransactionID int `gorm:"not null;index:idx_transaction_recurrence"`
	Index         int `gorm:"type:smallint;not null;index:idx_transaction_recurrence"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
	Transaction   Transaction `gorm:"foreignKey:TransactionID;references:ID"`
}

func (tr *TransactionRecurrence) ToDomain() *domain.TransactionRecurrence {
	return &domain.TransactionRecurrence{
		ID:            tr.ID,
		TransactionID: tr.TransactionID,
		Index:         tr.Index,
		CreatedAt:     tr.CreatedAt,
		UpdatedAt:     tr.UpdatedAt,
	}
}

func TransactionRecurrenceFromDomain(d *domain.TransactionRecurrence) *TransactionRecurrence {
	return &TransactionRecurrence{
		ID:            d.ID,
		TransactionID: d.TransactionID,
		Index:         d.Index,
		CreatedAt:     d.CreatedAt,
		UpdatedAt:     d.UpdatedAt,
	}
}
