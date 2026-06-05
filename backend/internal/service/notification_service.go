package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"unicode"

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
		// Persist the description so the inbox can render it. Store nil for empty
		// descriptions to keep the column NULL rather than an empty string.
		var description *string
		if ev.Description != "" {
			d := ev.Description
			description = &d
		}
		_, err := s.notifRepo.Create(ctx, &domain.Notification{
			UserID:      ev.RecipientUserID,
			Type:        ev.Type,
			EntityType:  ev.EntityType,
			EntityID:    ev.EntityID,
			Description: description,
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

		s.pushToSubscriptions(ctx, subs, rawPayload)
	}
}

// pushTTLSeconds is the TTL the push service keeps a message queued for offline
// devices. Kept modest but above the old 30s so a briefly-locked phone (a common
// iOS case) still receives the notification when it wakes.
const pushTTLSeconds = 60

// pushResult captures the outcome of a single push send for diagnostics and for
// SendTest to report a real delivery result back to the user.
type pushResult struct {
	endpoint string
	status   int    // HTTP status from the push service (0 if the send errored before a response)
	body     string // truncated response body on non-2xx (push services return a machine-readable reason)
	err      error  // transport error, if any
}

// delivered reports whether the push service accepted the message (2xx).
func (r pushResult) delivered() bool {
	return r.err == nil && r.status >= 200 && r.status < 300
}

// webpushSubscriber normalizes the VAPID subject for webpush-go's JWT builder,
// which prepends "mailto:" to any value that does not already start with
// "https:". Passing an already "mailto:"-prefixed subject (the RFC 8292 /
// operator-friendly form, and the one our startup guard enforces) would produce
// a double "mailto:mailto:..." `sub` claim that Apple Push rejects with
// BadJwtToken — silently, since Chrome/FCM ignore `sub`. Strip a leading
// "mailto:" so webpush-go re-adds exactly one; "https:" subjects pass through
// untouched.
func webpushSubscriber(subject string) string {
	return strings.TrimPrefix(subject, "mailto:")
}

// sendOne delivers rawPayload to a single subscription and reports the outcome.
// It prunes the subscription when the push service reports it as gone (404/410)
// and logs any non-2xx status, so a misconfiguration (e.g. a VAPID subject that
// Apple Push rejects with 400/403) is visible instead of being silently dropped.
func (s *notificationService) sendOne(ctx context.Context, sub *domain.PushSubscription, rawPayload []byte) pushResult {
	resp, sendErr := s.sender.Send(rawPayload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{Auth: sub.Auth, P256dh: sub.P256dh},
	}, &webpush.Options{
		Subscriber:      webpushSubscriber(s.vapid.Subject),
		VAPIDPublicKey:  s.vapid.PublicKey,
		VAPIDPrivateKey: s.vapid.PrivateKey,
		TTL:             pushTTLSeconds,
		// User-visible notifications must reach the device even on low battery;
		// without an explicit Urgency, Apple Push may deprioritise/drop them.
		Urgency: webpush.UrgencyHigh,
	})
	if sendErr != nil {
		log.Printf("[notification] push send error endpoint=%s err=%v", sub.Endpoint, sendErr)
		return pushResult{endpoint: sub.Endpoint, err: sendErr}
	}
	if resp == nil {
		return pushResult{endpoint: sub.Endpoint}
	}
	status := resp.StatusCode
	// On any non-2xx, read a snippet of the push service's response body. Apple and
	// FCM return a machine-readable reason (e.g. {"reason":"BadJwtToken"}) that is
	// the only way to tell *why* a 403/400 happened — status alone is ambiguous.
	var reason string
	if status < 200 || status >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		reason = strings.TrimSpace(string(b))
	}
	_ = resp.Body.Close() // close immediately, not deferred — defer is function-scoped and would accumulate across loop iterations
	switch {
	case status == http.StatusNotFound || status == http.StatusGone:
		if pruneErr := s.pushSubRepo.DeleteByEndpointAdmin(ctx, sub.Endpoint); pruneErr != nil {
			log.Printf("[notification] failed to prune stale subscription endpoint=%s err=%v", sub.Endpoint, pruneErr)
		}
	case status < 200 || status >= 300:
		log.Printf("[notification] push rejected endpoint=%s status=%d reason=%q", sub.Endpoint, status, reason)
	}
	return pushResult{endpoint: sub.Endpoint, status: status, body: reason}
}

// pushToSubscriptions delivers rawPayload to each of the given subscriptions
// best-effort and returns a per-subscription outcome. Shared by Dispatch (which
// ignores the results) and SendTest (which reports them to the user).
func (s *notificationService) pushToSubscriptions(ctx context.Context, subs []*domain.PushSubscription, rawPayload []byte) []pushResult {
	results := make([]pushResult, 0, len(subs))
	for _, sub := range subs {
		results = append(results, s.sendOne(ctx, sub, rawPayload))
	}
	return results
}

// SendTest delivers a sample push notification to every push subscription the
// authenticated user owns, so they can preview how a real notification renders
// on their device. It is display-only: no inbox row is persisted. Returns a
// tagged validation error (NOTIFICATION.NO_ACTIVE_PUSH_SUBSCRIPTION) when the
// user has not enabled push on any device, so the frontend can prompt them.
func (s *notificationService) SendTest(ctx context.Context, userID int) error {
	subs, err := s.pushSubRepo.ListByUserID(ctx, userID)
	if err != nil {
		return pkgErrors.Internal("failed to list push subscriptions", err)
	}
	if len(subs) == 0 {
		return pkgErrors.ErrNoActivePushSubscription
	}

	payload := pushPayload{
		Title: "Notificação de teste",
		Body:  "Tudo certo! É assim que as notificações vão aparecer no seu dispositivo. 🎉",
		Data: pushPayloadData{
			Type:       "test",
			EntityType: "transaction",
			EntityID:   0,
		},
	}
	rawPayload, err := json.Marshal(payload)
	if err != nil {
		return pkgErrors.Internal("failed to marshal test notification payload", err)
	}

	// Unlike Dispatch (best-effort), SendTest is a diagnostic: surface whether the
	// push service actually accepted the message so the user isn't told "sent" when
	// Apple/FCM rejected it. Report the last non-2xx upstream status to aid debugging.
	results := s.pushToSubscriptions(ctx, subs, rawPayload)
	delivered := 0
	lastStatus := 0
	lastReason := ""
	for _, r := range results {
		if r.delivered() {
			delivered++
		} else if r.status != 0 {
			lastStatus = r.status
			lastReason = r.body
		}
	}
	if delivered == 0 {
		return pkgErrors.ErrPushDeliveryFailed(lastStatus, lastReason)
	}
	return nil
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

	// splitKind returns the gendered pt-BR noun for the split's transaction type
	// so the copy distinguishes a shared expense from a shared income. Falls back
	// to the generic "transação" when TxKind is unknown.
	splitNoun := "transação"
	switch first.TxKind {
	case string(domain.TransactionTypeExpense):
		splitNoun = "despesa"
	case string(domain.TransactionTypeIncome):
		splitNoun = "receita"
	}

	var body string
	switch {
	case len(evGroup) > 1 && first.Type == domain.NotificationTypeSplitCreated:
		body = fmt.Sprintf("%s dividiu %d %ss com você", actorName, len(evGroup), splitNoun)
	case first.Type == domain.NotificationTypeChargeReceived:
		body = fmt.Sprintf("%s te cobrou %s: %s", actorName, formatBRL(first.Amount), first.Description)
	case first.Type == domain.NotificationTypeChargeAccepted:
		body = fmt.Sprintf("%s aceitou sua cobrança de %s", actorName, formatBRL(first.Amount))
	case first.Type == domain.NotificationTypeSplitCreated:
		body = fmt.Sprintf("%s dividiu uma %s de %s com você", actorName, splitNoun, formatBRL(first.Amount))
	case first.Type == domain.NotificationTypeSplitUpdated:
		body = fmt.Sprintf("%s atualizou uma %s dividida (%s)", actorName, splitNoun, formatBRL(first.Amount))
	case first.Type == domain.NotificationTypeTransferReceived:
		body = fmt.Sprintf("%s te transferiu %s", actorName, formatBRL(first.Amount))
	default:
		body = actorName + " enviou uma notificação"
	}

	// Per-type Portuguese title (D-24-2). The coalesced split_created case shares the same title.
	var title string
	switch first.Type {
	case domain.NotificationTypeChargeReceived:
		title = "Nova cobrança"
	case domain.NotificationTypeChargeAccepted:
		title = "Cobrança aceita"
	case domain.NotificationTypeSplitCreated:
		title = fmt.Sprintf("Nova %s dividida", splitNoun)
	case domain.NotificationTypeSplitUpdated:
		title = capitalize(splitNoun) + " dividida atualizada"
	case domain.NotificationTypeTransferReceived:
		title = "Nova transferência"
	default:
		title = "Finance App"
	}

	return pushPayload{
		Title: title,
		Body:  body,
		Data: pushPayloadData{
			Type:       first.Type,
			EntityType: first.EntityType,
			EntityID:   first.EntityID,
		},
	}
}

// capitalize upper-cases the first rune of s (used for sentence-start nouns
// like "Despesa"/"Receita" in notification titles).
func capitalize(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	r[0] = unicode.ToUpper(r[0])
	return string(r)
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
	reaisStr := strconv.FormatInt(reais, 10)
	n := len(reaisStr)
	var result []byte
	// reaisStr is a base-10 integer string, so every element is an ASCII
	// digit — index by byte (no rune→byte conversion, avoids gosec G115).
	for i := range n {
		if i > 0 && (n-i)%3 == 0 {
			result = append(result, '.')
		}
		result = append(result, reaisStr[i])
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
	if err := s.notifRepo.MarkAllRead(ctx, userID); err != nil {
		return pkgErrors.Internal("failed to mark all notifications as read", err)
	}
	return nil
}

func (s *notificationService) Delete(ctx context.Context, userID, notificationID int) error {
	return s.notifRepo.Delete(ctx, userID, notificationID)
}

func (s *notificationService) DeleteAllRead(ctx context.Context, userID int) error {
	if err := s.notifRepo.DeleteAllRead(ctx, userID); err != nil {
		return pkgErrors.Internal("failed to delete read notifications", err)
	}
	return nil
}
