//go:build integration

package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
)

type ChargeServiceTestSuite struct {
	ServiceTestWithDBSuite
}

func TestChargeService(t *testing.T) {
	suite.Run(t, new(ChargeServiceTestSuite))
}

// Helper: create a pending charge authored by `charger` against `payer`,
// with ChargerAccountID set (i.e. payer is the accepter).
func (s *ChargeServiceTestSuite) createPendingCharge(
	ctx context.Context,
	chargerUserID, payerUserID, chargerAccID, connectionID int,
	periodMonth, periodYear int,
	date time.Time,
) *domain.Charge {
	charge := &domain.Charge{
		ChargerUserID:    chargerUserID,
		PayerUserID:      payerUserID,
		ChargerAccountID: &chargerAccID,
		PayerAccountID:   nil,
		InitiatorUserID:  chargerUserID,
		ConnectionID:     connectionID,
		PeriodMonth:      periodMonth,
		PeriodYear:       periodYear,
		Status:           domain.ChargeStatusPending,
		Date:             &date,
	}
	created, err := s.Repos.Charge.Create(ctx, charge)
	s.Require().NoError(err)
	return created
}

// Helper: seed a transaction for a user in a given account and period.
func (s *ChargeServiceTestSuite) seedTransaction(
	ctx context.Context,
	userID, accountID int,
	amount int64,
	opType domain.OperationType,
	periodMonth, periodYear int,
) {
	date := time.Date(periodYear, time.Month(periodMonth), 15, 0, 0, 0, 0, time.UTC)
	txType := domain.TransactionTypeExpense
	if opType == domain.OperationTypeCredit {
		txType = domain.TransactionTypeIncome
	}
	tx := &domain.Transaction{
		UserID:         userID,
		OriginalUserID: &userID,
		AccountID:      accountID,
		Amount:         amount,
		Type:           txType,
		OperationType:  opType,
		Date:           date,
		Description:    "test seed",
	}
	_, err := s.Repos.Transaction.Create(ctx, tx)
	s.Require().NoError(err)
}

// Helper: count transactions in DB that have charge_id == given chargeID.
func (s *ChargeServiceTestSuite) countTransactionsByChargeID(ctx context.Context, chargeID int) int {
	// We query all transactions for the connection accounts and filter by charge_id in Go
	// since TransactionFilter doesn't have a ChargeID field.
	var count int
	err := s.DB.WithContext(ctx).
		Raw("SELECT COUNT(*) FROM transactions WHERE charge_id = ? AND deleted_at IS NULL", chargeID).
		Scan(&count).Error
	s.Require().NoError(err)
	return count
}

func (s *ChargeServiceTestSuite) TestAccept_CreatesTransfers() {
	ctx := context.Background()

	// Set up users and connection
	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	// Private accounts
	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)
	payerPrivAcc, err := s.createTestAccount(ctx, payer)
	s.Require().NoError(err)

	// Seed a credit in charger's connection account so balance > 0
	periodMonth, periodYear := 3, 2026
	// Find charger's connection account
	conn.SwapIfNeeded(charger.ID)
	chargerConnAccID := conn.FromAccountID
	s.seedTransaction(ctx, charger.ID, chargerConnAccID, 10000, domain.OperationTypeCredit, periodMonth, periodYear)

	// Create pending charge with charger's private account set
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	charge := s.createPendingCharge(ctx,
		charger.ID, payer.ID, chargerPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)

	// Accept as payer
	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, payer.ID, charge.ID, &domain.AcceptChargeRequest{
		AccountID: payerPrivAcc.ID,
		Date:      acceptDate,
	})
	s.Require().NoError(err)

	// Reload charge → status == paid
	charges, err := s.Repos.Charge.Search(ctx, domain.ChargeSearchOptions{
		UserID: charger.ID,
	})
	s.Require().NoError(err)
	var updatedCharge *domain.Charge
	for _, c := range charges {
		if c.ID == charge.ID {
			updatedCharge = c
			break
		}
	}
	s.Require().NotNil(updatedCharge)
	assert.Equal(s.T(), domain.ChargeStatusPaid, updatedCharge.Status)

	// Exactly 4 transaction rows with charge_id == charge.ID (2 main + 2 linked)
	count := s.countTransactionsByChargeID(ctx, charge.ID)
	assert.Equal(s.T(), 4, count, "expected 4 transaction rows (2 mains + 2 linked)")
}

func (s *ChargeServiceTestSuite) TestAccept_SetsOriginalUserID() {
	ctx := context.Background()

	// Set up users and connection
	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	// Private accounts
	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)
	payerPrivAcc, err := s.createTestAccount(ctx, payer)
	s.Require().NoError(err)

	// Seed a credit in charger's connection account so balance > 0 (no role swap)
	periodMonth, periodYear := 3, 2026
	conn.SwapIfNeeded(charger.ID)
	chargerConnAccID := conn.FromAccountID
	s.seedTransaction(ctx, charger.ID, chargerConnAccID, 10000, domain.OperationTypeCredit, periodMonth, periodYear)

	// Create pending charge with charger's private account set, then accept as payer
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	charge := s.createPendingCharge(ctx,
		charger.ID, payer.ID, chargerPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)

	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, payer.ID, charge.ID, &domain.AcceptChargeRequest{
		AccountID: payerPrivAcc.ID,
		Date:      acceptDate,
	})
	s.Require().NoError(err)

	// Regression: every settlement transaction must carry original_user_id, equal to its
	// user_id (each transfer is an intra-user move). Charger and payer each own 2 rows.
	var rows []struct {
		UserID         int  `gorm:"column:user_id"`
		OriginalUserID *int `gorm:"column:original_user_id"`
	}
	err = s.DB.WithContext(ctx).
		Raw("SELECT user_id, original_user_id FROM transactions WHERE charge_id = ? AND deleted_at IS NULL", charge.ID).
		Scan(&rows).Error
	s.Require().NoError(err)
	s.Require().Len(rows, 4)

	ownerCount := map[int]int{}
	for _, r := range rows {
		s.Require().NotNil(r.OriginalUserID, "original_user_id must be set on charge settlement transactions")
		assert.Equal(s.T(), r.UserID, *r.OriginalUserID, "original_user_id must equal user_id for intra-user charge transfers")
		ownerCount[r.UserID]++
	}
	assert.Equal(s.T(), 2, ownerCount[charger.ID], "charger should own 2 settlement rows")
	assert.Equal(s.T(), 2, ownerCount[payer.ID], "payer should own 2 settlement rows")
}

func (s *ChargeServiceTestSuite) TestAccept_Atomic() {
	ctx := context.Background()

	// Set up users and connection
	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)

	periodMonth, periodYear := 3, 2026
	conn.SwapIfNeeded(charger.ID)
	chargerConnAccID := conn.FromAccountID
	s.seedTransaction(ctx, charger.ID, chargerConnAccID, 10000, domain.OperationTypeCredit, periodMonth, periodYear)

	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	charge := s.createPendingCharge(ctx,
		charger.ID, payer.ID, chargerPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)

	// Accept with a non-existent account ID — will cause FK error on second transfer
	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, payer.ID, charge.ID, &domain.AcceptChargeRequest{
		AccountID: 999999999, // non-existent account
		Date:      acceptDate,
	})
	s.Require().Error(err, "expected error with invalid account ID")

	// Charge status must still be pending
	reloaded, err := s.Repos.Charge.GetByID(ctx, charge.ID)
	s.Require().NoError(err)
	assert.Equal(s.T(), domain.ChargeStatusPending, reloaded.Status)

	// No transactions created with this charge_id
	count := s.countTransactionsByChargeID(ctx, charge.ID)
	assert.Equal(s.T(), 0, count, "expected 0 transactions on rollback")
}

func (s *ChargeServiceTestSuite) TestAccept_DoubleAccept() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)
	payerPrivAcc, err := s.createTestAccount(ctx, payer)
	s.Require().NoError(err)

	periodMonth, periodYear := 4, 2026
	conn.SwapIfNeeded(charger.ID)
	chargerConnAccID := conn.FromAccountID
	s.seedTransaction(ctx, charger.ID, chargerConnAccID, 5000, domain.OperationTypeCredit, periodMonth, periodYear)

	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	charge := s.createPendingCharge(ctx,
		charger.ID, payer.ID, chargerPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)

	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	acceptReq := &domain.AcceptChargeRequest{
		AccountID: payerPrivAcc.ID,
		Date:      acceptDate,
	}

	// First call: should succeed
	err = s.Services.Charge.Accept(ctx, payer.ID, charge.ID, acceptReq)
	s.Require().NoError(err, "first accept should succeed")

	// Second call: should fail (charge already paid — status check or race guard)
	err2 := s.Services.Charge.Accept(ctx, payer.ID, charge.ID, acceptReq)
	s.Require().Error(err2, "second accept should fail")

	// Only one transfer pair created (4 rows, not 8)
	count := s.countTransactionsByChargeID(ctx, charge.ID)
	assert.Equal(s.T(), 4, count, "expected exactly 4 transaction rows after double-accept")
}

func (s *ChargeServiceTestSuite) TestAccept_Forbidden_Initiator() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)

	periodMonth, periodYear := 5, 2026
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	// Create charge with ChargerAccountID set (charger is the initiator)
	charge := s.createPendingCharge(ctx,
		charger.ID, payer.ID, chargerPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)

	// Charger tries to accept their own charge → Forbidden
	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, charger.ID, charge.ID, &domain.AcceptChargeRequest{
		AccountID: chargerPrivAcc.ID,
		Date:      acceptDate,
	})
	s.Require().Error(err)

	var svcErr *pkgErrors.ServiceError
	if assert.ErrorAs(s.T(), err, &svcErr) {
		assert.Equal(s.T(), pkgErrors.ErrCodeForbidden, svcErr.Code)
	}
}

func (s *ChargeServiceTestSuite) TestAccept_IDOR() {
	ctx := context.Background()

	userA, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	userB, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	userC, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, userA.ID, userB.ID, 50)
	s.Require().NoError(err)

	userAPrivAcc, err := s.createTestAccount(ctx, userA)
	s.Require().NoError(err)
	userCPrivAcc, err := s.createTestAccount(ctx, userC)
	s.Require().NoError(err)

	periodMonth, periodYear := 6, 2026
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	charge := s.createPendingCharge(ctx,
		userA.ID, userB.ID, userAPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)

	// User C (unrelated) tries to accept → Forbidden
	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, userC.ID, charge.ID, &domain.AcceptChargeRequest{
		AccountID: userCPrivAcc.ID,
		Date:      acceptDate,
	})
	s.Require().Error(err)

	var svcErr *pkgErrors.ServiceError
	if assert.ErrorAs(s.T(), err, &svcErr) {
		assert.Equal(s.T(), pkgErrors.ErrCodeForbidden, svcErr.Code)
	}
}

// TestAccept_DoesNotReinferRoles is a regression test for the charge-settlement
// doubling bug. The accept flow used to re-infer the charger/payer roles from
// the charger's *single-period* connection balance and swap them when it was
// negative. That single-period balance can disagree with the true (accumulated)
// debt direction, and a wrong swap pushes both balances away from zero instead
// of settling — doubling them. The roles chosen at creation must now be honored
// verbatim, regardless of how the live balance looks at accept time.
func (s *ChargeServiceTestSuite) TestAccept_DoesNotReinferRoles() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)
	payerPrivAcc, err := s.createTestAccount(ctx, payer)
	s.Require().NoError(err)

	periodMonth, periodYear := 7, 2026
	conn.SwapIfNeeded(charger.ID)
	chargerConnAccID := conn.FromAccountID

	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	// Charge created with charger as the initiator and an explicit amount.
	charge := s.createPendingCharge(ctx,
		charger.ID, payer.ID, chargerPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)
	storedAmount := int64(10000)
	charge.Amount = &storedAmount
	s.Require().NoError(s.Repos.Charge.Update(ctx, charge))

	// Make the charger's single-period connection balance negative at accept
	// time — the exact condition that used to trigger the buggy role swap.
	s.seedTransaction(ctx, charger.ID, chargerConnAccID, 20000, domain.OperationTypeDebit, periodMonth, periodYear)

	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, payer.ID, charge.ID, &domain.AcceptChargeRequest{
		AccountID: payerPrivAcc.ID,
		Date:      acceptDate,
	})
	s.Require().NoError(err)

	reloaded, err := s.Repos.Charge.GetByID(ctx, charge.ID)
	s.Require().NoError(err)
	assert.Equal(s.T(), domain.ChargeStatusPaid, reloaded.Status)

	// Roles are preserved — NO swap.
	assert.Equal(s.T(), charger.ID, reloaded.ChargerUserID, "charger role must be preserved (no re-inference swap)")
	assert.Equal(s.T(), payer.ID, reloaded.PayerUserID, "payer role must be preserved (no re-inference swap)")

	// And the transfers honor the stored roles: charger's connection account is
	// debited, payer's is credited.
	rows := s.chargeTransactions(ctx, charge.ID)
	s.Require().Len(rows, 4)
	s.True(hasChargeTx(rows, charger.ID, chargerConnAccID, domain.OperationTypeDebit), "charger conn account debited")
}

// TestCreate_ArbitraryAmount_ZeroBalance verifies that a caller can create a charge
// with an explicit amount even when their connection-account balance is zero.
// The caller is treated as the charger (since they initiated).
func (s *ChargeServiceTestSuite) TestCreate_ArbitraryAmount_ZeroBalance() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)

	periodMonth, periodYear := 9, 2026
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)

	amount := int64(7500)
	chargerRole := domain.ChargeInitiatorRoleCharger
	created, err := s.Services.Charge.Create(ctx, charger.ID, &domain.CreateChargeRequest{
		ConnectionID: conn.ID,
		MyAccountID:  chargerPrivAcc.ID,
		PeriodMonth:  periodMonth,
		PeriodYear:   periodYear,
		Amount:       &amount,
		Role:         &chargerRole,
		Date:         chargeDate,
	})
	s.Require().NoError(err)
	s.Require().NotNil(created.Amount)
	assert.Equal(s.T(), amount, *created.Amount)
	assert.Equal(s.T(), charger.ID, created.ChargerUserID)
	assert.Equal(s.T(), payer.ID, created.PayerUserID)
	assert.Equal(s.T(), charger.ID, created.InitiatorUserID, "creator is the initiator")
	s.Require().NotNil(created.ChargerAccountID)
	assert.Equal(s.T(), chargerPrivAcc.ID, *created.ChargerAccountID)
	assert.Nil(s.T(), created.PayerAccountID)
}

// TestCreate_PayerRole_ZeroBalance verifies that the caller can create a
// charge where they are the payer ("I owe you X"), not the charger, when
// the shared-account balance is zero.
func (s *ChargeServiceTestSuite) TestCreate_PayerRole_ZeroBalance() {
	ctx := context.Background()

	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, payer.ID, charger.ID, 50)
	s.Require().NoError(err)

	payerPrivAcc, err := s.createTestAccount(ctx, payer)
	s.Require().NoError(err)

	periodMonth, periodYear := 2, 2027
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)

	amount := int64(2200)
	payerRole := domain.ChargeInitiatorRolePayer
	created, err := s.Services.Charge.Create(ctx, payer.ID, &domain.CreateChargeRequest{
		ConnectionID: conn.ID,
		MyAccountID:  payerPrivAcc.ID,
		PeriodMonth:  periodMonth,
		PeriodYear:   periodYear,
		Amount:       &amount,
		Role:         &payerRole,
		Date:         chargeDate,
	})
	s.Require().NoError(err)
	assert.Equal(s.T(), payer.ID, created.PayerUserID)
	assert.Equal(s.T(), charger.ID, created.ChargerUserID)
	assert.Equal(s.T(), payer.ID, created.InitiatorUserID, "payer is the initiator here")
	s.Require().NotNil(created.PayerAccountID)
	assert.Equal(s.T(), payerPrivAcc.ID, *created.PayerAccountID)
	assert.Nil(s.T(), created.ChargerAccountID)
}

// TestCreate_MissingRole rejects charge creation without an explicit role.
func (s *ChargeServiceTestSuite) TestCreate_MissingRole() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)

	periodMonth, periodYear := 10, 2026
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)

	_, err = s.Services.Charge.Create(ctx, charger.ID, &domain.CreateChargeRequest{
		ConnectionID: conn.ID,
		MyAccountID:  chargerPrivAcc.ID,
		PeriodMonth:  periodMonth,
		PeriodYear:   periodYear,
		Date:         chargeDate,
	})
	s.Require().Error(err)

	var svcErr *pkgErrors.ServiceError
	if assert.ErrorAs(s.T(), err, &svcErr) {
		assert.Equal(s.T(), pkgErrors.ErrCodeBadRequest, svcErr.Code)
		assert.Contains(s.T(), svcErr.Message, "role")
	}
}

// TestCreate_InvalidAmount rejects non-positive arbitrary amounts.
func (s *ChargeServiceTestSuite) TestCreate_InvalidAmount() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)

	periodMonth, periodYear := 11, 2026
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)

	badAmount := int64(0)
	chargerRole := domain.ChargeInitiatorRoleCharger
	_, err = s.Services.Charge.Create(ctx, charger.ID, &domain.CreateChargeRequest{
		ConnectionID: conn.ID,
		MyAccountID:  chargerPrivAcc.ID,
		PeriodMonth:  periodMonth,
		PeriodYear:   periodYear,
		Amount:       &badAmount,
		Role:         &chargerRole,
		Date:         chargeDate,
	})
	s.Require().Error(err)
}

// TestCreate_RejectsConnectionAccount guards against using a shared connection
// account as the initiator's account — charges must settle into private accounts.
func (s *ChargeServiceTestSuite) TestCreate_RejectsConnectionAccount() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	// Use the charger's connection account — this is the shared ledger, not private.
	conn.SwapIfNeeded(charger.ID)
	chargerConnAccID := conn.FromAccountID

	periodMonth, periodYear := 1, 2027
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)

	amount := int64(1000)
	chargerRole := domain.ChargeInitiatorRoleCharger
	_, err = s.Services.Charge.Create(ctx, charger.ID, &domain.CreateChargeRequest{
		ConnectionID: conn.ID,
		MyAccountID:  chargerConnAccID,
		PeriodMonth:  periodMonth,
		PeriodYear:   periodYear,
		Amount:       &amount,
		Role:         &chargerRole,
		Date:         chargeDate,
	})
	s.Require().Error(err)
	var svcErr *pkgErrors.ServiceError
	if assert.ErrorAs(s.T(), err, &svcErr) {
		assert.Equal(s.T(), pkgErrors.ErrCodeBadRequest, svcErr.Code)
		assert.Contains(s.T(), svcErr.Message, "connection")
	}
}

// TestAccept_RejectsConnectionAccount guards the same invariant at accept time.
func (s *ChargeServiceTestSuite) TestAccept_RejectsConnectionAccount() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)

	// Create a valid pending charge (charger is initiator).
	periodMonth, periodYear := 2, 2028
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	charge := s.createPendingCharge(ctx,
		charger.ID, payer.ID, chargerPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)

	// Payer tries to accept with THEIR connection account — must be rejected.
	conn.SwapIfNeeded(payer.ID)
	payerConnAccID := conn.FromAccountID

	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, payer.ID, charge.ID, &domain.AcceptChargeRequest{
		AccountID: payerConnAccID,
		Date:      acceptDate,
	})
	s.Require().Error(err)
	var svcErr *pkgErrors.ServiceError
	if assert.ErrorAs(s.T(), err, &svcErr) {
		assert.Equal(s.T(), pkgErrors.ErrCodeBadRequest, svcErr.Code)
		assert.Contains(s.T(), svcErr.Message, "connection")
	}
}

// TestAccept_UsesStoredAmount verifies that a charge created with an arbitrary
// amount settles for that stored amount when the accepter does not override it.
func (s *ChargeServiceTestSuite) TestAccept_UsesStoredAmount() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)
	payerPrivAcc, err := s.createTestAccount(ctx, payer)
	s.Require().NoError(err)

	periodMonth, periodYear := 12, 2026
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)

	// Create via service with arbitrary amount + zero balance + explicit charger role.
	amount := int64(4200)
	chargerRole := domain.ChargeInitiatorRoleCharger
	created, err := s.Services.Charge.Create(ctx, charger.ID, &domain.CreateChargeRequest{
		ConnectionID: conn.ID,
		MyAccountID:  chargerPrivAcc.ID,
		PeriodMonth:  periodMonth,
		PeriodYear:   periodYear,
		Amount:       &amount,
		Role:         &chargerRole,
		Date:         chargeDate,
	})
	s.Require().NoError(err)

	// Accept as payer without an amount override — stored amount should be used.
	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, payer.ID, created.ID, &domain.AcceptChargeRequest{
		AccountID: payerPrivAcc.ID,
		Date:      acceptDate,
	})
	s.Require().NoError(err)

	// 4 transaction rows were created (2 mains + 2 linked) — confirm each has amount = 4200.
	var amounts []int64
	err = s.DB.WithContext(ctx).
		Raw("SELECT amount FROM transactions WHERE charge_id = ? AND deleted_at IS NULL", created.ID).
		Scan(&amounts).Error
	s.Require().NoError(err)
	assert.Len(s.T(), amounts, 4)
	for _, a := range amounts {
		assert.Equal(s.T(), amount, a)
	}
}

func (s *ChargeServiceTestSuite) TestAccept_NonPending() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)
	payerPrivAcc, err := s.createTestAccount(ctx, payer)
	s.Require().NoError(err)

	periodMonth, periodYear := 8, 2026
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	charge := s.createPendingCharge(ctx,
		charger.ID, payer.ID, chargerPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)

	// Set charge to cancelled directly
	charge.Status = domain.ChargeStatusCancelled
	err = s.Repos.Charge.Update(ctx, charge)
	s.Require().NoError(err)

	// Try to accept → should fail
	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, payer.ID, charge.ID, &domain.AcceptChargeRequest{
		AccountID: payerPrivAcc.ID,
		Date:      acceptDate,
	})
	s.Require().Error(err, "accept on cancelled charge should fail")
}

// chargeTxRow is a lightweight projection of a settlement transaction used to
// assert the shape of the transfers created when a charge is accepted.
type chargeTxRow struct {
	UserID         int    `gorm:"column:user_id"`
	OriginalUserID *int   `gorm:"column:original_user_id"`
	AccountID      int    `gorm:"column:account_id"`
	OperationType  string `gorm:"column:operation_type"`
	Amount         int64  `gorm:"column:amount"`
	Type           string `gorm:"column:type"`
}

func (s *ChargeServiceTestSuite) chargeTransactions(ctx context.Context, chargeID int) []chargeTxRow {
	var rows []chargeTxRow
	err := s.DB.WithContext(ctx).
		Raw("SELECT user_id, original_user_id, account_id, operation_type, amount, type FROM transactions WHERE charge_id = ? AND deleted_at IS NULL", chargeID).
		Scan(&rows).Error
	s.Require().NoError(err)
	return rows
}

func hasChargeTx(rows []chargeTxRow, userID, accountID int, op domain.OperationType) bool {
	for _, r := range rows {
		if r.UserID == userID && r.AccountID == accountID && r.OperationType == string(op) {
			return true
		}
	}
	return false
}

func (s *ChargeServiceTestSuite) accountBalance(ctx context.Context, userID, accountID, periodMonth, periodYear int) int64 {
	res, err := s.Services.Transaction.GetBalance(ctx, userID, domain.Period{Month: periodMonth, Year: periodYear}, domain.BalanceFilter{
		AccountIDs: []int{accountID},
	})
	s.Require().NoError(err)
	return res.Balance
}

// TestAccept_RoleAndConnectionOrientation exercises charge create + accept across
// the full matrix of {connection side} x {initiator role}. The connection has a
// fixed orientation (from_user / to_user); each case verifies that whoever the
// charger/payer turn out to be, every settlement transfer lands on that user's own
// connection and private accounts, carries original_user_id == user_id, and levels
// both connection-account balances to zero.
//
// The 4 cases below cover all the requested scenarios:
//   - from_user cria como charger  / to_user aceita como payer
//   - from_user cria como payer    / to_user aceita como charger
//   - to_user   cria como charger  / from_user aceita como payer
//   - to_user   cria como payer    / from_user aceita como charger
func (s *ChargeServiceTestSuite) TestAccept_RoleAndConnectionOrientation() {
	const amount int64 = 5000
	periodMonth, periodYear := 4, 2026
	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)

	cases := []struct {
		name          string
		creatorIsFrom bool
		creatorRole   domain.ChargeInitiatorRole
	}{
		{"from_user cria como charger / to_user aceita como payer", true, domain.ChargeInitiatorRoleCharger},
		{"from_user cria como payer / to_user aceita como charger", true, domain.ChargeInitiatorRolePayer},
		{"to_user cria como charger / from_user aceita como payer", false, domain.ChargeInitiatorRoleCharger},
		{"to_user cria como payer / from_user aceita como charger", false, domain.ChargeInitiatorRolePayer},
	}

	for _, tc := range cases {
		s.Run(tc.name, func() {
			ctx := context.Background()

			userFrom, err := s.createTestUser(ctx)
			s.Require().NoError(err)
			userTo, err := s.createTestUser(ctx)
			s.Require().NoError(err)

			conn, err := s.createAcceptedTestUserConnection(ctx, userFrom.ID, userTo.ID, 50)
			s.Require().NoError(err)

			fromPriv, err := s.createTestAccount(ctx, userFrom)
			s.Require().NoError(err)
			toPriv, err := s.createTestAccount(ctx, userTo)
			s.Require().NoError(err)

			// Resolve creator / accepter and their private accounts.
			creator, accepter := userFrom, userTo
			creatorPriv, accepterPriv := fromPriv, toPriv
			if !tc.creatorIsFrom {
				creator, accepter = userTo, userFrom
				creatorPriv, accepterPriv = toPriv, fromPriv
			}

			// Resolve charger / payer from the initiator role.
			var charger, payer *domain.User
			var chargerPriv, payerPriv *domain.Account
			if tc.creatorRole == domain.ChargeInitiatorRoleCharger {
				charger, chargerPriv = creator, creatorPriv
				payer, payerPriv = accepter, accepterPriv
			} else {
				payer, payerPriv = creator, creatorPriv
				charger, chargerPriv = accepter, accepterPriv
			}

			// Each user's connection-account side (from_account belongs to userFrom).
			chargerConnAcc := conn.FromAccountID
			if charger.ID == userTo.ID {
				chargerConnAcc = conn.ToAccountID
			}
			payerConnAcc := conn.FromAccountID
			if payer.ID == userTo.ID {
				payerConnAcc = conn.ToAccountID
			}

			// Seed connection balances: charger is owed (+amount), payer owes (-amount).
			// Keeping the charger's connection balance >= 0 also avoids the accept-time
			// role swap, so the stored charger/payer roles stay deterministic.
			s.seedTransaction(ctx, charger.ID, chargerConnAcc, amount, domain.OperationTypeCredit, periodMonth, periodYear)
			s.seedTransaction(ctx, payer.ID, payerConnAcc, amount, domain.OperationTypeDebit, periodMonth, periodYear)

			// ---- Create ----
			role := tc.creatorRole
			amt := amount
			created, err := s.Services.Charge.Create(ctx, creator.ID, &domain.CreateChargeRequest{
				ConnectionID: conn.ID,
				MyAccountID:  creatorPriv.ID,
				PeriodMonth:  periodMonth,
				PeriodYear:   periodYear,
				Amount:       &amt,
				Role:         &role,
				Date:         chargeDate,
			})
			s.Require().NoError(err)

			s.Equal(charger.ID, created.ChargerUserID, "charger user")
			s.Equal(payer.ID, created.PayerUserID, "payer user")
			s.Equal(domain.ChargeStatusPending, created.Status)
			if tc.creatorRole == domain.ChargeInitiatorRoleCharger {
				s.Require().NotNil(created.ChargerAccountID)
				s.Equal(creatorPriv.ID, *created.ChargerAccountID)
				s.Nil(created.PayerAccountID, "payer account filled only on accept")
			} else {
				s.Require().NotNil(created.PayerAccountID)
				s.Equal(creatorPriv.ID, *created.PayerAccountID)
				s.Nil(created.ChargerAccountID, "charger account filled only on accept")
			}

			// ---- Accept (by the non-initiating party) ----
			err = s.Services.Charge.Accept(ctx, accepter.ID, created.ID, &domain.AcceptChargeRequest{
				AccountID: accepterPriv.ID,
				Date:      acceptDate,
			})
			s.Require().NoError(err)

			// ---- Assert the 4 settlement transfers ----
			rows := s.chargeTransactions(ctx, created.ID)
			s.Require().Len(rows, 4, "expected 4 settlement rows")
			for _, r := range rows {
				s.Require().NotNil(r.OriginalUserID, "original_user_id must be set")
				s.Equal(r.UserID, *r.OriginalUserID, "original_user_id == user_id")
				s.Equal(string(domain.TransactionTypeTransfer), r.Type)
				s.Equal(amount, r.Amount)
			}
			// Charger: connection account debited, private account credited.
			s.True(hasChargeTx(rows, charger.ID, chargerConnAcc, domain.OperationTypeDebit), "charger conn debit")
			s.True(hasChargeTx(rows, charger.ID, chargerPriv.ID, domain.OperationTypeCredit), "charger private credit")
			// Payer: private account debited, connection account credited.
			s.True(hasChargeTx(rows, payer.ID, payerPriv.ID, domain.OperationTypeDebit), "payer private debit")
			s.True(hasChargeTx(rows, payer.ID, payerConnAcc, domain.OperationTypeCredit), "payer conn credit")

			// ---- Assert balances leveled out ----
			s.Equal(int64(0), s.accountBalance(ctx, charger.ID, chargerConnAcc, periodMonth, periodYear), "charger conn balance zeroed")
			s.Equal(amount, s.accountBalance(ctx, charger.ID, chargerPriv.ID, periodMonth, periodYear), "charger received into private")
			s.Equal(int64(0), s.accountBalance(ctx, payer.ID, payerConnAcc, periodMonth, periodYear), "payer conn balance zeroed")
			s.Equal(-amount, s.accountBalance(ctx, payer.ID, payerPriv.ID, periodMonth, periodYear), "payer paid from private")
		})
	}
}

// getChargerMainTransferID returns the id of the charger's main (debit) transfer
// leg created by accepting a charge.
func (s *ChargeServiceTestSuite) getChargerMainTransferID(ctx context.Context, chargeID, chargerUserID int) int {
	var id int
	err := s.DB.WithContext(ctx).
		Raw("SELECT id FROM transactions WHERE charge_id = ? AND user_id = ? AND operation_type = 'debit' AND deleted_at IS NULL",
			chargeID, chargerUserID).
		Scan(&id).Error
	s.Require().NoError(err)
	s.Require().NotZero(id, "expected charger's main transfer leg")
	return id
}

// A transfer generated by accepting a charge is structurally bound to the charge:
// its type cannot change and it cannot be made recurring. Both must be rejected.
func (s *ChargeServiceTestSuite) TestUpdate_ChargeTransferRejectsTypeAndRecurrenceChanges() {
	ctx := context.Background()

	charger, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	payer, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	conn, err := s.createAcceptedTestUserConnection(ctx, charger.ID, payer.ID, 50)
	s.Require().NoError(err)

	chargerPrivAcc, err := s.createTestAccount(ctx, charger)
	s.Require().NoError(err)
	payerPrivAcc, err := s.createTestAccount(ctx, payer)
	s.Require().NoError(err)

	periodMonth, periodYear := 4, 2026
	conn.SwapIfNeeded(charger.ID)
	chargerConnAccID := conn.FromAccountID
	s.seedTransaction(ctx, charger.ID, chargerConnAccID, 10000, domain.OperationTypeCredit, periodMonth, periodYear)

	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	charge := s.createPendingCharge(ctx,
		charger.ID, payer.ID, chargerPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)

	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, payer.ID, charge.ID, &domain.AcceptChargeRequest{
		AccountID: payerPrivAcc.ID,
		Date:      acceptDate,
	})
	s.Require().NoError(err)

	transferID := s.getChargerMainTransferID(ctx, charge.ID, charger.ID)

	hasTag := func(err error, tag pkgErrors.ErrorTag) bool {
		var serviceErrs pkgErrors.ServiceErrors
		if !errors.As(err, &serviceErrs) {
			return false
		}
		return lo.SomeBy(serviceErrs, func(e *pkgErrors.ServiceError) bool {
			return lo.Contains(e.Tags, string(tag))
		})
	}

	s.Run("type change is rejected", func() {
		err := s.Services.Transaction.Update(ctx, transferID, charger.ID, &domain.TransactionUpdateRequest{
			TransactionType:     lo.ToPtr(domain.TransactionTypeExpense),
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		})
		s.Require().Error(err)
		s.Assert().True(hasTag(err, pkgErrors.ErrorTagChargeTransactionTypeCannotChange),
			"expected ErrorTagChargeTransactionTypeCannotChange")
	})

	s.Run("adding recurrence is rejected", func() {
		err := s.Services.Transaction.Update(ctx, transferID, charger.ID, &domain.TransactionUpdateRequest{
			RecurrenceSettings: &domain.RecurrenceSettings{
				Type:               domain.RecurrenceTypeMonthly,
				CurrentInstallment: 1,
				TotalInstallments:  3,
			},
			PropagationSettings: domain.TransactionPropagationSettingsCurrent,
		})
		s.Require().Error(err)
		s.Assert().True(hasTag(err, pkgErrors.ErrorTagChargeTransactionRecurrenceNotAllowed),
			"expected ErrorTagChargeTransactionRecurrenceNotAllowed")
	})
}
