package service

import (
	"context"
	"net/url"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

type pushSubscriptionService struct {
	pushSubRepo repository.PushSubscriptionRepository
	cfg         config.VAPIDConfig // wired now; used by Phase 23 SendNotification
}

func NewPushSubscriptionService(repos *repository.Repositories, cfg *config.Config) PushSubscriptionService {
	return &pushSubscriptionService{
		pushSubRepo: repos.PushSubscription,
		cfg:         cfg.VAPID,
	}
}

// validateEndpoint checks that the endpoint is a well-formed HTTPS URL with a
// non-empty host.  This guards against SSRF at data-ingestion time: Phase 23
// will issue HTTP requests to stored endpoints, so only https:// URLs with a
// real host are accepted here.
//
// NOTE (Phase 23): delivery-time allowlisting (blocking private/link-local IP
// ranges) should be added in Phase 23 when the send path is implemented.
func validateEndpoint(endpoint string) error {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return pkgErrors.BadRequest("endpoint must be a valid HTTPS URL")
	}
	return nil
}

// Subscribe registers (or re-registers) a push subscription for the authenticated user.
// SECURITY (T-22-IDOR): userID is the function argument from auth context — NEVER read from req.
func (s *pushSubscriptionService) Subscribe(ctx context.Context, userID int, req *domain.SubscribePushRequest) error {
	if req.Endpoint == "" {
		return pkgErrors.BadRequest("endpoint is required")
	}
	if err := validateEndpoint(req.Endpoint); err != nil {
		return err
	}
	if req.Keys.P256dh == "" {
		return pkgErrors.BadRequest("keys.p256dh is required")
	}
	if req.Keys.Auth == "" {
		return pkgErrors.BadRequest("keys.auth is required")
	}
	return s.pushSubRepo.Upsert(ctx, &domain.PushSubscription{
		UserID:   userID,
		Endpoint: req.Endpoint,
		P256dh:   req.Keys.P256dh,
		Auth:     req.Keys.Auth,
	})
}

// Unsubscribe removes the authenticated user's subscription for the given endpoint.
// Idempotent — returns nil if no row exists.
func (s *pushSubscriptionService) Unsubscribe(ctx context.Context, userID int, endpoint string) error {
	return s.pushSubRepo.DeleteByEndpoint(ctx, userID, endpoint)
}

// Status reports whether the authenticated user has an active subscription for the given endpoint.
func (s *pushSubscriptionService) Status(ctx context.Context, userID int, endpoint string) (*domain.PushSubscriptionStatusResponse, error) {
	exists, err := s.pushSubRepo.ExistsForUser(ctx, userID, endpoint)
	if err != nil {
		return nil, pkgErrors.Internal("failed to check subscription status", err)
	}
	return &domain.PushSubscriptionStatusResponse{Subscribed: exists}, nil
}
