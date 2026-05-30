package service

import (
	"testing"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/stretchr/testify/assert"
)

// newTestNotificationService creates a minimal notificationService for unit testing buildPayload.
// No repos or VAPID config are needed since buildPayload is pure logic.
func newTestNotificationService() *notificationService {
	return &notificationService{
		vapid: config.VAPIDConfig{},
	}
}

func TestBuildPayload_PerTypeTitle(t *testing.T) {
	svc := newTestNotificationService()
	actor := "Vic"

	tests := []struct {
		name          string
		events        []domain.NotificationEvent
		wantTitle     string
		wantBodyContains string
	}{
		{
			name: "charge_received",
			events: []domain.NotificationEvent{
				{
					Type:        domain.NotificationTypeChargeReceived,
					EntityType:  "charge",
					EntityID:    1,
					Amount:      5000,
					Description: "Aluguel",
				},
			},
			wantTitle:        "Nova cobrança",
			wantBodyContains: actor + " te cobrou",
		},
		{
			name: "charge_accepted",
			events: []domain.NotificationEvent{
				{
					Type:       domain.NotificationTypeChargeAccepted,
					EntityType: "charge",
					EntityID:   2,
					Amount:     5000,
				},
			},
			wantTitle:        "Cobrança aceita",
			wantBodyContains: actor + " aceitou",
		},
		{
			name: "split_created_single",
			events: []domain.NotificationEvent{
				{
					Type:       domain.NotificationTypeSplitCreated,
					EntityType: "transaction",
					EntityID:   3,
					Amount:     8490,
				},
			},
			wantTitle:        "Nova transação dividida",
			wantBodyContains: actor + " adicionou uma transação dividida",
		},
		{
			name: "split_created_coalesced",
			events: []domain.NotificationEvent{
				{
					Type:       domain.NotificationTypeSplitCreated,
					EntityType: "transaction",
					EntityID:   4,
					Amount:     1000,
				},
				{
					Type:       domain.NotificationTypeSplitCreated,
					EntityType: "transaction",
					EntityID:   5,
					Amount:     2000,
				},
			},
			wantTitle:        "Nova transação dividida",
			wantBodyContains: actor + " adicionou 2 transações divididas",
		},
		{
			name: "split_updated",
			events: []domain.NotificationEvent{
				{
					Type:       domain.NotificationTypeSplitUpdated,
					EntityType: "transaction",
					EntityID:   6,
					Amount:     6000,
				},
			},
			wantTitle:        "Transação dividida atualizada",
			wantBodyContains: actor + " atualizou",
		},
		{
			name: "unknown_type_defaults_to_finance_app",
			events: []domain.NotificationEvent{
				{
					Type:       "unknown_event_type",
					EntityType: "charge",
					EntityID:   7,
				},
			},
			wantTitle:        "Finance App",
			wantBodyContains: actor + " enviou uma notificação",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload := svc.buildPayload(actor, tt.events)
			assert.Equal(t, tt.wantTitle, payload.Title, "title mismatch for type=%q", tt.events[0].Type)
			assert.Contains(t, payload.Body, tt.wantBodyContains, "body mismatch for type=%q", tt.events[0].Type)
			// Verify data fields are set from first event
			assert.Equal(t, tt.events[0].Type, payload.Data.Type)
			assert.Equal(t, tt.events[0].EntityType, payload.Data.EntityType)
			assert.Equal(t, tt.events[0].EntityID, payload.Data.EntityID)
		})
	}
}

// TestBuildPayload_BodiesVerbatim verifies the exact body format for each type,
// including BRL formatting of the amount.
func TestBuildPayload_BodiesVerbatim(t *testing.T) {
	svc := newTestNotificationService()
	actor := "Vic"

	t.Run("charge_received body includes actor, BRL amount, and description", func(t *testing.T) {
		ev := []domain.NotificationEvent{{
			Type:        domain.NotificationTypeChargeReceived,
			EntityType:  "charge",
			EntityID:    1,
			Amount:      5000, // R$ 50,00
			Description: "Aluguel",
		}}
		p := svc.buildPayload(actor, ev)
		assert.Equal(t, "Nova cobrança", p.Title)
		assert.Equal(t, "Vic te cobrou R$ 50,00: Aluguel", p.Body)
	})

	t.Run("charge_accepted body includes actor and BRL amount", func(t *testing.T) {
		ev := []domain.NotificationEvent{{
			Type:       domain.NotificationTypeChargeAccepted,
			EntityType: "charge",
			EntityID:   2,
			Amount:     5000,
		}}
		p := svc.buildPayload(actor, ev)
		assert.Equal(t, "Cobrança aceita", p.Title)
		assert.Equal(t, "Vic aceitou sua cobrança de R$ 50,00", p.Body)
	})

	t.Run("split_created single body includes actor and BRL amount", func(t *testing.T) {
		ev := []domain.NotificationEvent{{
			Type:       domain.NotificationTypeSplitCreated,
			EntityType: "transaction",
			EntityID:   3,
			Amount:     8490, // R$ 84,90
		}}
		p := svc.buildPayload(actor, ev)
		assert.Equal(t, "Nova transação dividida", p.Title)
		assert.Equal(t, "Vic adicionou uma transação dividida de R$ 84,90", p.Body)
	})

	t.Run("split_created coalesced body includes count", func(t *testing.T) {
		ev := []domain.NotificationEvent{
			{Type: domain.NotificationTypeSplitCreated, EntityType: "transaction", EntityID: 4},
			{Type: domain.NotificationTypeSplitCreated, EntityType: "transaction", EntityID: 5},
			{Type: domain.NotificationTypeSplitCreated, EntityType: "transaction", EntityID: 6},
		}
		p := svc.buildPayload(actor, ev)
		assert.Equal(t, "Nova transação dividida", p.Title)
		assert.Equal(t, "Vic adicionou 3 transações divididas", p.Body)
	})

	t.Run("split_updated body includes actor and BRL amount", func(t *testing.T) {
		ev := []domain.NotificationEvent{{
			Type:       domain.NotificationTypeSplitUpdated,
			EntityType: "transaction",
			EntityID:   7,
			Amount:     6000, // R$ 60,00
		}}
		p := svc.buildPayload(actor, ev)
		assert.Equal(t, "Transação dividida atualizada", p.Title)
		assert.Equal(t, "Vic atualizou uma transação dividida (R$ 60,00)", p.Body)
	})
}
