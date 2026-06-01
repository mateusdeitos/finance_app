package repository

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"gorm.io/gorm"
)

type notificationRepository struct {
	db *gorm.DB
}

func NewNotificationRepository(db *gorm.DB) NotificationRepository {
	return &notificationRepository{db: db}
}

// notificationCursor lives in the repository package (opaque to all callers above).
type notificationCursor struct {
	CreatedAt time.Time `json:"ca"`
	ID        int       `json:"id"`
}

func encodeCursor(createdAt time.Time, id int) (string, error) {
	raw, err := json.Marshal(notificationCursor{CreatedAt: createdAt, ID: id})
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func decodeCursor(token string) (*notificationCursor, error) {
	b, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return nil, err
	}
	var c notificationCursor
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *notificationRepository) Create(ctx context.Context, n *domain.Notification) (*domain.Notification, error) {
	ent := entity.NotificationFromDomain(n)
	if err := GetTxFromContext(ctx, r.db).Create(ent).Error; err != nil {
		return nil, err
	}
	return ent.ToDomain(), nil
}

func (r *notificationRepository) List(ctx context.Context, filter domain.NotificationFilter) (*domain.NotificationListResult, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	query := GetTxFromContext(ctx, r.db).
		Model(&entity.Notification{}).
		Where("user_id = ?", filter.UserID).
		Order("created_at DESC, id DESC").
		Limit(limit + 1) // fetch one extra to detect hasMore
	if filter.Cursor != "" {
		cur, err := decodeCursor(filter.Cursor)
		if err != nil {
			// T-23-03: malformed cursor → 400 (never 500, never leaks internals)
			return nil, pkgErrors.BadRequest("invalid cursor")
		}
		query = query.Where("(created_at, id) < (?, ?)", cur.CreatedAt, cur.ID)
	}
	var ents []entity.Notification
	if err := query.Find(&ents).Error; err != nil {
		return nil, err
	}
	hasMore := len(ents) > limit
	if hasMore {
		ents = ents[:limit]
	}
	items := make([]*domain.Notification, len(ents))
	for i := range ents {
		e := ents[i]
		items[i] = e.ToDomain()
	}
	var nextCursor string
	if hasMore && len(ents) > 0 {
		last := ents[len(ents)-1]
		var encErr error
		nextCursor, encErr = encodeCursor(*last.CreatedAt, last.ID)
		if encErr != nil {
			return nil, encErr
		}
	}
	return &domain.NotificationListResult{Items: items, NextCursor: nextCursor, HasMore: hasMore}, nil
}

func (r *notificationRepository) UnreadCount(ctx context.Context, userID int) (int64, error) {
	var count int64
	err := GetTxFromContext(ctx, r.db).
		Model(&entity.Notification{}).
		Where("user_id = ? AND read = false", userID).
		Count(&count).Error
	return count, err
}

func (r *notificationRepository) MarkRead(ctx context.Context, userID, notificationID int) error {
	result := GetTxFromContext(ctx, r.db).
		Model(&entity.Notification{}).
		Where("id = ? AND user_id = ?", notificationID, userID).
		Update("read", true)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return pkgErrors.NotFound("notification")
	}
	return nil
}

func (r *notificationRepository) MarkAllRead(ctx context.Context, userID int) error {
	return GetTxFromContext(ctx, r.db).
		Model(&entity.Notification{}).
		Where("user_id = ? AND read = false", userID).
		Update("read", true).Error
}

func (r *notificationRepository) Delete(ctx context.Context, userID, notificationID int) error {
	result := GetTxFromContext(ctx, r.db).
		Where("id = ? AND user_id = ?", notificationID, userID).
		Delete(&entity.Notification{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return pkgErrors.NotFound("notification")
	}
	return nil
}

func (r *notificationRepository) DeleteAllRead(ctx context.Context, userID int) error {
	return GetTxFromContext(ctx, r.db).
		Where("user_id = ? AND read = true", userID).
		Delete(&entity.Notification{}).Error
}
