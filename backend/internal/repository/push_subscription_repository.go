package repository

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"gorm.io/gorm"
)

type pushSubscriptionRepository struct {
	db *gorm.DB
}

func NewPushSubscriptionRepository(db *gorm.DB) PushSubscriptionRepository {
	return &pushSubscriptionRepository{db: db}
}

// Upsert inserts a push subscription or updates it when the same endpoint
// already exists (ON CONFLICT on the endpoint UNIQUE constraint). This is
// race-safe because it is a single atomic SQL statement.
//
// DESIGN NOTE — endpoint uniqueness and ownership transfer:
// The endpoint column is globally unique (not per-user). On conflict the row,
// including user_id, is reassigned to the latest subscriber. This intentionally
// supports shared-device re-registration (e.g. partners sharing one browser):
// when the same browser re-registers after a service-worker update, the
// subscription is transferred to whichever user is currently logged in.
// The push endpoint is an unguessable per-browser secret that is never
// returned by any GET API, so cross-user takeover requires the attacker to
// already possess that secret. See research pitfall 1 in 22-RESEARCH.md.
//
// created_at is intentionally NOT updated on conflict — it records when the
// subscription was first established. If a last-seen timestamp is needed for
// Phase 23 pruning, add a separate updated_at column.
func (r *pushSubscriptionRepository) Upsert(ctx context.Context, sub *domain.PushSubscription) error {
	ent := entity.PushSubscriptionFromDomain(sub)
	result := GetTxFromContext(ctx, r.db).Exec(`
		INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
		VALUES (?, ?, ?, ?, NOW())
		ON CONFLICT (endpoint) DO UPDATE
			SET user_id = EXCLUDED.user_id,
			    p256dh  = EXCLUDED.p256dh,
			    auth    = EXCLUDED.auth
			-- created_at intentionally omitted: preserve original timestamp
	`, ent.UserID, ent.Endpoint, ent.P256dh, ent.Auth)
	return result.Error
}

// DeleteByEndpoint removes the subscription matching user_id AND endpoint.
// SECURITY (T-22-IDOR): the user_id scope prevents a user from deleting
// another user's subscription via a known endpoint string.
func (r *pushSubscriptionRepository) DeleteByEndpoint(ctx context.Context, userID int, endpoint string) error {
	return GetTxFromContext(ctx, r.db).
		Where("user_id = ? AND endpoint = ?", userID, endpoint).
		Delete(&entity.PushSubscription{}).Error
}

// DeleteByEndpointAdmin removes the subscription matching endpoint with no
// user_id check. This is intentionally unscoped: it is only called by
// internal server-side pruning logic after a 404/410 push-service response
// (Phase 23). It must never be exposed via a client-facing HTTP handler.
func (r *pushSubscriptionRepository) DeleteByEndpointAdmin(ctx context.Context, endpoint string) error {
	return GetTxFromContext(ctx, r.db).
		Where("endpoint = ?", endpoint).
		Delete(&entity.PushSubscription{}).Error
}

// ExistsForUser reports whether the authenticated user has an active
// subscription for the given endpoint. Scoped with user_id + endpoint
// (IDOR guard: a user cannot query another user's subscription).
func (r *pushSubscriptionRepository) ExistsForUser(ctx context.Context, userID int, endpoint string) (bool, error) {
	var count int64
	err := GetTxFromContext(ctx, r.db).
		Model(&entity.PushSubscription{}).
		Where("user_id = ? AND endpoint = ?", userID, endpoint).
		Count(&count).Error
	return count > 0, err
}

// ListByUserID returns all active push subscriptions for a user.
// Called by the notification dispatch goroutine — no IDOR guard needed (internal).
func (r *pushSubscriptionRepository) ListByUserID(ctx context.Context, userID int) ([]*domain.PushSubscription, error) {
	var ents []entity.PushSubscription
	if err := GetTxFromContext(ctx, r.db).
		Where("user_id = ?", userID).
		Find(&ents).Error; err != nil {
		return nil, err
	}
	result := make([]*domain.PushSubscription, len(ents))
	for i := range ents {
		e := ents[i]
		result[i] = e.ToDomain()
	}
	return result, nil
}
