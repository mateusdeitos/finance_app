package entity

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

// TransactionTemplatePayload is a typed JSONB column wrapper for domain.TransactionTemplatePayload.
// It implements driver.Valuer and sql.Scanner so GORM can persist the payload
// as a JSONB column without any untyped map[string]interface{} indirection.
type TransactionTemplatePayload domain.TransactionTemplatePayload

func (p TransactionTemplatePayload) Value() (driver.Value, error) {
	return json.Marshal(p)
}

func (TransactionTemplatePayload) GormDataType() string {
	return "jsonb"
}

func (p *TransactionTemplatePayload) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return fmt.Errorf("transaction_template: cannot scan %T into TransactionTemplatePayload", value)
	}
	return json.Unmarshal(bytes, p)
}

// TransactionTemplate is the GORM entity for the transaction_templates table.
// The Payload column stores the typed template payload as JSONB.
// This entity is deliberately NOT referenced by any existing financial query
// (Search, GetBalance, FindOrphanedSettlementTransactions) — isolation is a deliverable.
type TransactionTemplate struct {
	ID        int                        `gorm:"primaryKey;autoIncrement"`
	UserID    int                        `gorm:"not null;index"`
	Name      string                     `gorm:"not null"`
	Payload   TransactionTemplatePayload `gorm:"type:jsonb;not null"`
	CreatedAt *time.Time
	UpdatedAt *time.Time
}

func (TransactionTemplate) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (e *TransactionTemplate) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}

// ToDomain converts the entity to the domain model.
func (e *TransactionTemplate) ToDomain() *domain.TransactionTemplate {
	return &domain.TransactionTemplate{
		ID:        e.ID,
		UserID:    e.UserID,
		Name:      e.Name,
		Payload:   domain.TransactionTemplatePayload(e.Payload),
		CreatedAt: e.CreatedAt,
		UpdatedAt: e.UpdatedAt,
	}
}

// TransactionTemplateFromDomain converts the domain model to the entity.
func TransactionTemplateFromDomain(d *domain.TransactionTemplate) *TransactionTemplate {
	return &TransactionTemplate{
		ID:        d.ID,
		UserID:    d.UserID,
		Name:      d.Name,
		Payload:   TransactionTemplatePayload(d.Payload),
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
	}
}
