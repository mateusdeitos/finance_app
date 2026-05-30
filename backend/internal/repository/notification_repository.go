package repository

import "gorm.io/gorm"

type notificationRepository struct {
	db *gorm.DB
}

func NewNotificationRepository(db *gorm.DB) NotificationRepository {
	return &notificationRepository{db: db}
}

// No methods in Phase 22 — added in Phase 23 when signatures are known.
