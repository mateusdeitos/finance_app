package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

// PushSender abstracts webpush.SendNotification for testing.
type PushSender interface {
	Send(payload []byte, sub *webpush.Subscription, opts *webpush.Options) (*http.Response, error)
}

type webPushSender struct{}

func (w *webPushSender) Send(payload []byte, sub *webpush.Subscription, opts *webpush.Options) (*http.Response, error) {
	return webpush.SendNotification(payload, sub, opts)
}

type notificationService struct {
	notifRepo   repository.NotificationRepository
	pushSubRepo repository.PushSubscriptionRepository
	userRepo    repository.UserRepository
	vapid       config.VAPIDConfig
	sender      PushSender // injectable for testing
}

func NewNotificationService(repos *repository.Repositories, cfg *config.Config) NotificationService {
	return &notificationService{
		notifRepo:   repos.Notification,
		pushSubRepo: repos.PushSubscription,
		userRepo:    repos.User,
		vapid:       cfg.VAPID,
		sender:      &webPushSender{},
	}
}

func (s *notificationService) Dispatch(ctx context.Context, events []domain.NotificationEvent) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[notification] dispatch panic: %v", r)
		}
	}()

	if len(events) == 0 {
		return
	}

	// 1. Persist all inbox rows first (always — even if no subscriptions exist).
	for _, ev := range events {
		_, err := s.notifRepo.Create(ctx, &domain.Notification{
			UserID:     ev.RecipientUserID,
			Type:       ev.Type,
			EntityType: ev.EntityType,
			EntityID:   ev.EntityID,
		})
		if err != nil {
			log.Printf("[notification] failed to persist row: %v", err)
			// best-effort; continue other rows
		}
	}

	// 2. Resolve actor display name once (all events share the same actor).
	actorName := "Parceiro"
	if actor, err := s.userRepo.GetByID(ctx, events[0].ActorUserID); err == nil && actor != nil {
		actorName = actor.Name
	}

	// 3. Group by (recipientUserID, type) for push coalescing (D-08).
	type groupKey struct {
		RecipientUserID int
		Type            string
	}
	groups := make(map[groupKey][]domain.NotificationEvent)
	for _, ev := range events {
		k := groupKey{ev.RecipientUserID, ev.Type}
		groups[k] = append(groups[k], ev)
	}

	// 4. Send one push per group.
	for key, evGroup := range groups {
		subs, err := s.pushSubRepo.ListByUserID(ctx, key.RecipientUserID)
		if err != nil || len(subs) == 0 {
			continue // no subscriptions — inbox row already persisted; skip push
		}

		payload := s.buildPayload(actorName, evGroup)
		rawPayload, err := json.Marshal(payload)
		if err != nil {
			log.Printf("[notification] failed to marshal push payload: %v", err)
			continue
		}

		for _, sub := range subs {
			resp, sendErr := s.sender.Send(rawPayload, &webpush.Subscription{
				Endpoint: sub.Endpoint,
				Keys:     webpush.Keys{Auth: sub.Auth, P256dh: sub.P256dh},
			}, &webpush.Options{
				Subscriber:      s.vapid.Subject,
				VAPIDPublicKey:  s.vapid.PublicKey,
				VAPIDPrivateKey: s.vapid.PrivateKey,
				TTL:             30,
			})
			if sendErr != nil {
				log.Printf("[notification] push send error endpoint=%s err=%v", sub.Endpoint, sendErr)
				continue
			}
			if resp != nil {
				defer resp.Body.Close()
				if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
					if pruneErr := s.pushSubRepo.DeleteByEndpointAdmin(ctx, sub.Endpoint); pruneErr != nil {
						log.Printf("[notification] failed to prune stale subscription endpoint=%s err=%v", sub.Endpoint, pruneErr)
					}
				}
			}
		}
	}
}

// pushPayload is the JSON structure sent to the browser push service.
type pushPayload struct {
	Title string          `json:"title"`
	Body  string          `json:"body"`
	Data  pushPayloadData `json:"data"`
}

type pushPayloadData struct {
	Type       string `json:"type"`
	EntityType string `json:"entity_type"`
	EntityID   int    `json:"entity_id"`
}

func (s *notificationService) buildPayload(actorName string, evGroup []domain.NotificationEvent) pushPayload {
	first := evGroup[0]
	var body string
	switch {
	case len(evGroup) > 1 && first.Type == domain.NotificationTypeSplitCreated:
		body = fmt.Sprintf("%s adicionou %d transações divididas", actorName, len(evGroup))
	case first.Type == domain.NotificationTypeChargeReceived:
		body = fmt.Sprintf("%s te cobrou %s: %s", actorName, formatBRL(first.Amount), first.Description)
	case first.Type == domain.NotificationTypeChargeAccepted:
		body = fmt.Sprintf("%s aceitou sua cobrança de %s", actorName, formatBRL(first.Amount))
	case first.Type == domain.NotificationTypeSplitCreated:
		body = fmt.Sprintf("%s adicionou uma transação dividida de %s", actorName, formatBRL(first.Amount))
	case first.Type == domain.NotificationTypeSplitUpdated:
		body = fmt.Sprintf("%s atualizou uma transação dividida (%s)", actorName, formatBRL(first.Amount))
	default:
		body = fmt.Sprintf("%s enviou uma notificação", actorName)
	}
	return pushPayload{
		Title: "Finance App",
		Body:  body,
		Data: pushPayloadData{
			Type:       first.Type,
			EntityType: first.EntityType,
			EntityID:   first.EntityID,
		},
	}
}

// formatBRL converts cents int64 to "R$ 1.234,56" (pt-BR).
func formatBRL(cents int64) string {
	sign := ""
	if cents < 0 {
		sign = "-"
		cents = -cents
	}
	reais := cents / 100
	centavos := cents % 100
	reaisStr := fmt.Sprintf("%d", reais)
	n := len(reaisStr)
	var result []byte
	for i, c := range reaisStr {
		if i > 0 && (n-i)%3 == 0 {
			result = append(result, '.')
		}
		result = append(result, byte(c))
	}
	return fmt.Sprintf("%sR$ %s,%02d", sign, string(result), centavos)
}

func (s *notificationService) List(ctx context.Context, userID int, filter domain.NotificationFilter) (*domain.NotificationListResult, error) {
	filter.UserID = userID // IDOR: always override with authenticated userID
	result, err := s.notifRepo.List(ctx, filter)
	if err != nil {
		return nil, pkgErrors.Internal("failed to list notifications", err)
	}
	return result, nil
}

func (s *notificationService) UnreadCount(ctx context.Context, userID int) (int64, error) {
	count, err := s.notifRepo.UnreadCount(ctx, userID)
	if err != nil {
		return 0, pkgErrors.Internal("failed to count unread notifications", err)
	}
	return count, nil
}

func (s *notificationService) MarkRead(ctx context.Context, userID, notificationID int) error {
	return s.notifRepo.MarkRead(ctx, userID, notificationID)
}

func (s *notificationService) MarkAllRead(ctx context.Context, userID int) error {
	return s.notifRepo.MarkAllRead(ctx, userID)
}
