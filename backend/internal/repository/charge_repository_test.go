package repository

import (
	"context"
	"fmt"
	"math/rand/v2"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/pkg/tests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestChargeRepository_Search_IDsFilter is a Docker-gated integration test.
// It verifies that the `id IN` clause respects the IDOR owner-WHERE — IDs
// belonging to another user are filtered out, not returned.
//
// Gate: requires a running PostgreSQL container (testcontainers).
// Skip with -short flag (no Docker): go test -short ./internal/repository/...
func TestChargeRepository_Search_IDsFilter(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test: requires Docker / testcontainers")
	}

	db, err := tests.NewTestDatabase(context.Background())
	require.NoError(t, err)

	userRepo := NewUserRepository(db.Db)
	chargeRepo := NewChargeRepository(db.Db)
	connRepo := NewUserConnectionRepository(db.Db)
	accountRepo := NewAccountRepository(db.Db)

	// Create two distinct users with random emails to avoid uniqueness collisions
	suffix := rand.IntN(1_000_000) //nolint:gosec // test-only non-crypto random for unique fixture suffixes
	userA, err := userRepo.Create(context.Background(), &domain.User{
		Name:     fmt.Sprintf("UserA-%d", suffix),
		Email:    fmt.Sprintf("userA-%d@charge-ids-test.example.com", suffix),
		Password: "hashed",
	})
	require.NoError(t, err)

	userB, err := userRepo.Create(context.Background(), &domain.User{
		Name:     fmt.Sprintf("UserB-%d", suffix),
		Email:    fmt.Sprintf("userB-%d@charge-ids-test.example.com", suffix),
		Password: "hashed",
	})
	require.NoError(t, err)

	// user_connections.from_account_id / to_account_id are NOT NULL FKs to
	// accounts(id), so each side needs a real account before the connection.
	accountA, err := accountRepo.Create(context.Background(), &domain.Account{
		Name:     fmt.Sprintf("AccountA-%d", suffix),
		UserID:   userA.ID,
		IsActive: true,
	})
	require.NoError(t, err)

	accountB, err := accountRepo.Create(context.Background(), &domain.Account{
		Name:     fmt.Sprintf("AccountB-%d", suffix),
		UserID:   userB.ID,
		IsActive: true,
	})
	require.NoError(t, err)

	// Create a connection between A and B so charges can reference it
	conn, err := connRepo.Create(context.Background(), &domain.UserConnection{
		FromUserID:       userA.ID,
		FromAccountID:    accountA.ID,
		ToUserID:         userB.ID,
		ToAccountID:      accountB.ID,
		ConnectionStatus: domain.UserConnectionStatusPending,
	})
	require.NoError(t, err)

	now := time.Now().UTC()
	periodMonth := int(now.Month())
	periodYear := now.Year()

	// Seed two charges owned by userA (as charger)
	chargeA1, err := chargeRepo.Create(context.Background(), &domain.Charge{
		ChargerUserID: userA.ID,
		PayerUserID:   userB.ID,
		ConnectionID:  conn.ID,
		PeriodMonth:   periodMonth,
		PeriodYear:    periodYear,
		Status:        domain.ChargeStatusPending,
		Date:          &now,
	})
	require.NoError(t, err)

	chargeA2, err := chargeRepo.Create(context.Background(), &domain.Charge{
		ChargerUserID: userA.ID,
		PayerUserID:   userB.ID,
		ConnectionID:  conn.ID,
		PeriodMonth:   periodMonth,
		PeriodYear:    periodYear,
		Status:        domain.ChargeStatusPending,
		Date:          &now,
	})
	require.NoError(t, err)

	// Seed one charge owned by userB (as charger) — userA is only the payer
	chargeB1, err := chargeRepo.Create(context.Background(), &domain.Charge{
		ChargerUserID: userB.ID,
		PayerUserID:   userA.ID,
		ConnectionID:  conn.ID,
		PeriodMonth:   periodMonth,
		PeriodYear:    periodYear,
		Status:        domain.ChargeStatusPending,
		Date:          &now,
	})
	require.NoError(t, err)

	// Query with all three IDs but scoped to userA as charger (Direction="sent")
	// chargeB1 is owned by userB as charger, so it must be absent.
	results, err := chargeRepo.Search(context.Background(), domain.ChargeSearchOptions{
		UserID:    userA.ID,
		Direction: "sent",
		IDs:       []int{chargeA1.ID, chargeA2.ID, chargeB1.ID},
	})
	require.NoError(t, err)

	resultIDs := make([]int, len(results))
	for i, c := range results {
		resultIDs[i] = c.ID
	}

	assert.Len(t, results, 2, "expected only userA's 2 charges, got IDs: %v", resultIDs)
	assert.Contains(t, resultIDs, chargeA1.ID)
	assert.Contains(t, resultIDs, chargeA2.ID)
	assert.NotContains(t, resultIDs, chargeB1.ID, "userB-owned charge must not leak to userA's query")
}
