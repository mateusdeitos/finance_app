//go:build integration

package service

import (
	"context"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
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
		UserID:        userID,
		OriginalUserID: &userID,
		AccountID:     accountID,
		Amount:        amount,
		Type:          txType,
		OperationType: opType,
		Date:          date,
		Description:   "test seed",
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

func (s *ChargeServiceTestSuite) TestAccept_RoleReinference_BalanceFlipped() {
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
	payerConnAccID := conn.ToAccountID

	// Seed credit in charger's conn account initially (balance > 0 for charger)
	s.seedTransaction(ctx, charger.ID, chargerConnAccID, 10000, domain.OperationTypeCredit, periodMonth, periodYear)

	chargeDate := time.Date(periodYear, time.Month(periodMonth), 1, 0, 0, 0, 0, time.UTC)
	// Charge created: charger has positive balance → charger is charger
	charge := s.createPendingCharge(ctx,
		charger.ID, payer.ID, chargerPrivAcc.ID, conn.ID,
		periodMonth, periodYear, chargeDate,
	)

	// After creation, flip balance: add a large debit to charger's conn account
	// so that charger's balance goes negative (charger now owes)
	s.seedTransaction(ctx, charger.ID, chargerConnAccID, 20000, domain.OperationTypeDebit, periodMonth, periodYear)

	// Also seed the payer's side so we have conn acc for payer
	_ = payerConnAccID // used implicitly via swap
	_ = payerPrivAcc

	// Accept as original payer (payer.ID has no account set on charge)
	acceptDate := time.Date(periodYear, time.Month(periodMonth), 2, 0, 0, 0, 0, time.UTC)
	err = s.Services.Charge.Accept(ctx, payer.ID, charge.ID, &domain.AcceptChargeRequest{
		AccountID: payerPrivAcc.ID,
		Date:      acceptDate,
	})
	s.Require().NoError(err)

	// Reload charge: roles should have been swapped
	reloaded, err := s.Repos.Charge.GetByID(ctx, charge.ID)
	s.Require().NoError(err)
	assert.Equal(s.T(), domain.ChargeStatusPaid, reloaded.Status)

	// After swap: original charger is now PayerUserID, original payer is ChargerUserID
	assert.Equal(s.T(), payer.ID, reloaded.ChargerUserID, "original payer should now be charger after balance flip")
	assert.Equal(s.T(), charger.ID, reloaded.PayerUserID, "original charger should now be payer after balance flip")
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
	created, err := s.Services.Charge.Create(ctx, charger.ID, &domain.CreateChargeRequest{
		ConnectionID: conn.ID,
		MyAccountID:  chargerPrivAcc.ID,
		PeriodMonth:  periodMonth,
		PeriodYear:   periodYear,
		Amount:       &amount,
		Date:         chargeDate,
	})
	s.Require().NoError(err)
	s.Require().NotNil(created.Amount)
	assert.Equal(s.T(), amount, *created.Amount)
	assert.Equal(s.T(), charger.ID, created.ChargerUserID)
	assert.Equal(s.T(), payer.ID, created.PayerUserID)
	s.Require().NotNil(created.ChargerAccountID)
	assert.Equal(s.T(), chargerPrivAcc.ID, *created.ChargerAccountID)
	assert.Nil(s.T(), created.PayerAccountID)
}

// TestCreate_ZeroBalance_NoAmount preserves the existing behavior: if the balance
// is zero and no arbitrary amount is provided, creation fails.
func (s *ChargeServiceTestSuite) TestCreate_ZeroBalance_NoAmount() {
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
	_, err = s.Services.Charge.Create(ctx, charger.ID, &domain.CreateChargeRequest{
		ConnectionID: conn.ID,
		MyAccountID:  chargerPrivAcc.ID,
		PeriodMonth:  periodMonth,
		PeriodYear:   periodYear,
		Amount:       &badAmount,
		Date:         chargeDate,
	})
	s.Require().Error(err)
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

	// Create via service with arbitrary amount + zero balance → caller becomes charger.
	amount := int64(4200)
	created, err := s.Services.Charge.Create(ctx, charger.ID, &domain.CreateChargeRequest{
		ConnectionID: conn.ID,
		MyAccountID:  chargerPrivAcc.ID,
		PeriodMonth:  periodMonth,
		PeriodYear:   periodYear,
		Amount:       &amount,
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
