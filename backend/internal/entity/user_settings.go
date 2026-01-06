package entity

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"gorm.io/gorm"
)

type JSONB map[string]interface{}

func (j JSONB) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}

func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}

	return json.Unmarshal(bytes, j)
}

type UserSettings struct {
	UserID    int
	Settings  JSONB
	CreatedAt *time.Time
	UpdatedAt *time.Time
	User      User
}

func (us *UserSettings) ToDomain() *domain.UserSettings {
	settings := make(map[string]interface{})
	if us.Settings != nil {
		for k, v := range us.Settings {
			settings[k] = v
		}
	}

	return &domain.UserSettings{
		UserID:    us.UserID,
		Settings:  settings,
		CreatedAt: us.CreatedAt,
		UpdatedAt: us.UpdatedAt,
	}
}

func UserSettingsFromDomain(d *domain.UserSettings) *UserSettings {
	jsonb := make(JSONB)
	if d.Settings != nil {
		for k, v := range d.Settings {
			jsonb[k] = v
		}
	}

	return &UserSettings{
		UserID:    d.UserID,
		Settings:  jsonb,
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
	}
}

func (UserSettings) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	tx.Statement.SetColumn("created_at", now)
	tx.Statement.SetColumn("updated_at", now)
	return nil
}

func (us *UserSettings) BeforeUpdate(tx *gorm.DB) error {
	tx.Statement.SetColumn("updated_at", time.Now())
	return nil
}
