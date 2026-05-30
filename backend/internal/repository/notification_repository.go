package repository

import "gorm.io/gorm"

type notificationRepository struct {
	// db is intentionally unused in Phase 22: NotificationRepository is an
	// empty interface until Phase 23 adds write methods.  The field is kept
	// so Phase 23 can add methods without re-wiring the constructor.
	db *gorm.DB
}

func NewNotificationRepository(db *gorm.DB) NotificationRepository {
	return &notificationRepository{db: db}
}

// No methods in Phase 22 — added in Phase 23 when signatures are known.
