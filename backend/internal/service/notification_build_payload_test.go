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
		name             string
		events           []domain.NotificationEvent
		wantTitle        string
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
			name: "split_created_expense",
			events: []domain.NotificationEvent{
				{
					Type:       domain.NotificationTypeSplitCreated,
					EntityType: "transaction",
					EntityID:   3,
					Amount:     8490,
					TxKind:     string(domain.TransactionTypeExpense),
				},
			},
			wantTitle:        "Nova despesa dividida",
			wantBodyContains: actor + " dividiu uma despesa",
		},
		{
			name: "split_created_income",
			events: []domain.NotificationEvent{
				{
					Type:       domain.NotificationTypeSplitCreated,
					EntityType: "transaction",
					EntityID:   3,
					Amount:     8490,
					TxKind:     string(domain.TransactionTypeIncome),
				},
			},
			wantTitle:        "Nova receita dividida",
			wantBodyContains: actor + " dividiu uma receita",
		},
		{
			name: "split_created_coalesced_expense",
			events: []domain.NotificationEvent{
				{
					Type:       domain.NotificationTypeSplitCreated,
					EntityType: "transaction",
					EntityID:   4,
					Amount:     1000,
					TxKind:     string(domain.TransactionTypeExpense),
				},
				{
					Type:       domain.NotificationTypeSplitCreated,
					EntityType: "transaction",
					EntityID:   5,
					Amount:     2000,
					TxKind:     string(domain.TransactionTypeExpense),
				},
			},
			wantTitle:        "Nova despesa dividida",
			wantBodyContains: actor + " dividiu 2 despesas com você",
		},
		{
			name: "split_updated_expense",
			events: []domain.NotificationEvent{
				{
					Type:       domain.NotificationTypeSplitUpdated,
					EntityType: "transaction",
					EntityID:   6,
					Amount:     6000,
					TxKind:     string(domain.TransactionTypeExpense),
				},
			},
			wantTitle:        "Despesa dividida atualizada",
			wantBodyContains: actor + " atualizou uma despesa",
		},
		{
			name: "split_created_unknown_txkind_falls_back_to_transacao",
			events: []domain.NotificationEvent{
				{
					Type:       domain.NotificationTypeSplitCreated,
					EntityType: "transaction",
					EntityID:   8,
					Amount:     500,
				},
			},
			wantTitle:        "Nova transação dividida",
			wantBodyContains: actor + " dividiu uma transação",
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
// including BRL formatting of the amount and the expense/income distinction.
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

	t.Run("split_created expense body", func(t *testing.T) {
		ev := []domain.NotificationEvent{{
			Type:       domain.NotificationTypeSplitCreated,
			EntityType: "transaction",
			EntityID:   3,
			Amount:     8490, // R$ 84,90
			TxKind:     string(domain.TransactionTypeExpense),
		}}
		p := svc.buildPayload(actor, ev)
		assert.Equal(t, "Nova despesa dividida", p.Title)
		assert.Equal(t, "Vic dividiu uma despesa de R$ 84,90 com você", p.Body)
	})

	t.Run("split_created income body", func(t *testing.T) {
		ev := []domain.NotificationEvent{{
			Type:       domain.NotificationTypeSplitCreated,
			EntityType: "transaction",
			EntityID:   3,
			Amount:     8490,
			TxKind:     string(domain.TransactionTypeIncome),
		}}
		p := svc.buildPayload(actor, ev)
		assert.Equal(t, "Nova receita dividida", p.Title)
		assert.Equal(t, "Vic dividiu uma receita de R$ 84,90 com você", p.Body)
	})

	t.Run("split_created coalesced expense body includes count", func(t *testing.T) {
		ev := []domain.NotificationEvent{
			{Type: domain.NotificationTypeSplitCreated, EntityType: "transaction", EntityID: 4, TxKind: string(domain.TransactionTypeExpense)},
			{Type: domain.NotificationTypeSplitCreated, EntityType: "transaction", EntityID: 5, TxKind: string(domain.TransactionTypeExpense)},
			{Type: domain.NotificationTypeSplitCreated, EntityType: "transaction", EntityID: 6, TxKind: string(domain.TransactionTypeExpense)},
		}
		p := svc.buildPayload(actor, ev)
		assert.Equal(t, "Nova despesa dividida", p.Title)
		assert.Equal(t, "Vic dividiu 3 despesas com você", p.Body)
	})

	t.Run("split_updated expense body", func(t *testing.T) {
		ev := []domain.NotificationEvent{{
			Type:       domain.NotificationTypeSplitUpdated,
			EntityType: "transaction",
			EntityID:   7,
			Amount:     6000, // R$ 60,00
			TxKind:     string(domain.TransactionTypeExpense),
		}}
		p := svc.buildPayload(actor, ev)
		assert.Equal(t, "Despesa dividida atualizada", p.Title)
		assert.Equal(t, "Vic atualizou uma despesa dividida (R$ 60,00)", p.Body)
	})
}
