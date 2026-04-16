package service

import (
	"context"
	"errors"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

// Accept settles a pending charge by atomically:
// 1. Validating caller is the non-initiating party
// 2. Re-inferring charger/payer roles from current period balance
// 3. Flipping status from pending to paid via a conditional UPDATE (race guard)
// 4. Creating both intra-account transfers (connection<->private) with charge_id set
// All DB writes happen inside a single DBTransaction.
//
// IMPORTANT: This method calls transactionRepo.Create directly — NOT transactionService.Create —
// to avoid nested DB transactions (transactionService.Create owns its own Begin/Commit scope).
//nolint:maintidx // Atomic accept with validation, role inference, race guard, and dual transfer — splitting would obscure the transaction boundary.
func (s *chargeService) Accept(ctx context.Context, callerUserID int, chargeID int, req *domain.AcceptChargeRequest) error {
	// ---- Validate request shape ----
	if req == nil {
		return pkgErrors.BadRequest("request body is required")
	}
	if req.AccountID <= 0 {
		return pkgErrors.BadRequest("account_id is required")
	}
	if req.Date.IsZero() {
		return pkgErrors.BadRequest("date is required")
	}
	if req.Amount != nil && *req.Amount <= 0 {
		return pkgErrors.BadRequest("amount must be greater than zero")
	}

	// ---- Load charge (outside tx — read-only) ----
	charge, err := s.chargeRepo.GetByID(ctx, chargeID)
	if err != nil {
		return pkgErrors.NotFound("charge")
	}

	// ---- IDOR: caller must be a party ----
	if charge.ChargerUserID != callerUserID && charge.PayerUserID != callerUserID {
		return pkgErrors.Forbidden("charge")
	}

	// ---- Non-initiator rule: caller must be the party whose account is nil on the charge ----
	// If ChargerAccountID is set and PayerAccountID is nil → charger created it → payer must accept
	// If PayerAccountID is set and ChargerAccountID is nil → payer created it → charger must accept
	var expectedAccepterID int
	switch {
	case charge.ChargerAccountID != nil && charge.PayerAccountID == nil:
		expectedAccepterID = charge.PayerUserID
	case charge.PayerAccountID != nil && charge.ChargerAccountID == nil:
		expectedAccepterID = charge.ChargerUserID
	default:
		return pkgErrors.BadRequest("charge is in an invalid state — both or neither account set")
	}
	if callerUserID != expectedAccepterID {
		return pkgErrors.Forbidden("only the non-initiating party can accept")
	}

	// ---- Status precondition ----
	if charge.Status != domain.ChargeStatusPending {
		return pkgErrors.AlreadyExists("charge")
	}
	if charge.Date == nil {
		return pkgErrors.BadRequest("charge is missing its date")
	}

	// ---- Load connection for account resolution ----
	conns, err := s.userConnectionRepo.Search(ctx, domain.UserConnectionSearchOptions{
		IDs: []int{charge.ConnectionID},
	})
	if err != nil {
		return pkgErrors.Internal("failed to load connection", err)
	}
	if len(conns) == 0 {
		return pkgErrors.NotFound("connection")
	}
	conn := conns[0]

	// SwapIfNeeded to charger's perspective → FromAccountID=charger's conn acc, ToAccountID=payer's conn acc
	// Read both into locals IMMEDIATELY (Pitfall 7 — do not call SwapIfNeeded twice on same struct).
	conn.SwapIfNeeded(charge.ChargerUserID)
	chargerConnAccountID := conn.FromAccountID
	payerConnAccountID := conn.ToAccountID

	// ---- Fill the missing private account on the charge from req.AccountID ----
	if charge.ChargerAccountID == nil {
		accID := req.AccountID
		charge.ChargerAccountID = &accID
	} else if charge.PayerAccountID == nil {
		accID := req.AccountID
		charge.PayerAccountID = &accID
	}

	// ---- Begin atomic scope ----
	txCtx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(txCtx)

	// ---- Re-infer roles by balance at accept time ----
	period := domain.Period{Month: charge.PeriodMonth, Year: charge.PeriodYear}
	balResult, err := s.services.Transaction.GetBalance(txCtx, charge.ChargerUserID, period, domain.BalanceFilter{
		UserID:     charge.ChargerUserID,
		AccountIDs: []int{chargerConnAccountID},
	})
	if err != nil {
		return pkgErrors.Internal("failed to compute balance", err)
	}

	// Decision: flipped if balance < 0 (stored charger now owes). Zero → must have amount override.
	liveBalance := balResult.Balance
	if liveBalance < 0 {
		// Swap in-memory fields on charge and persist within the same tx
		charge.ChargerUserID, charge.PayerUserID = charge.PayerUserID, charge.ChargerUserID
		charge.ChargerAccountID, charge.PayerAccountID = charge.PayerAccountID, charge.ChargerAccountID
		chargerConnAccountID, payerConnAccountID = payerConnAccountID, chargerConnAccountID
		if err := s.chargeRepo.Update(txCtx, charge); err != nil {
			return pkgErrors.Internal("failed to persist role swap", err)
		}
	}

	// Resolve settlement amount
	var amount int64
	if req.Amount != nil {
		amount = *req.Amount
	} else {
		if liveBalance == 0 {
			return pkgErrors.BadRequest("nothing to settle — balance is zero")
		}
		amount = liveBalance
		if amount < 0 {
			amount = -amount
		}
	}

	// ---- Race-guarded status UPDATE ----
	if err := s.chargeRepo.ConditionalAccept(txCtx, charge.ID); err != nil {
		if errors.Is(err, repository.ErrChargeNotPending) {
			return pkgErrors.AlreadyExists("charge")
		}
		return pkgErrors.Internal("failed to accept charge", err)
	}

	// Derived data for building transfers
	chargerPrivateAccID := *charge.ChargerAccountID
	payerPrivateAccID := *charge.PayerAccountID
	chargeIDCopy := charge.ID
	chargerDate := *charge.Date // initiator's date (stored at create time)
	payerDate := req.Date       // acceptor's date (from accept request)

	// ---- Build charger's transfer: connection account → private account ----
	// FROM (debit): chargerConnAccountID
	// TO (credit):  chargerPrivateAccID
	chargerTransfer := &domain.Transaction{
		UserID:        charge.ChargerUserID,
		AccountID:     chargerConnAccountID,
		Type:          domain.TransactionTypeTransfer,
		OperationType: domain.OperationTypeDebit,
		Amount:        amount,
		Date:          chargerDate,
		Description:   "Charge settlement",
		ChargeID:      &chargeIDCopy,
		LinkedTransactions: []domain.Transaction{
			{
				UserID:        charge.ChargerUserID,
				AccountID:     chargerPrivateAccID,
				Type:          domain.TransactionTypeTransfer,
				OperationType: domain.OperationTypeCredit,
				Amount:        amount,
				Date:          chargerDate,
				Description:   "Charge settlement",
				ChargeID:      &chargeIDCopy,
			},
		},
	}
	if _, err := s.transactionRepo.Create(txCtx, chargerTransfer); err != nil {
		return pkgErrors.Internal("failed to create charger transfer", err)
	}

	// ---- Build payer's transfer: private account → connection account ----
	// FROM (debit): payerPrivateAccID
	// TO (credit):  payerConnAccountID
	payerTransfer := &domain.Transaction{
		UserID:        charge.PayerUserID,
		AccountID:     payerPrivateAccID,
		Type:          domain.TransactionTypeTransfer,
		OperationType: domain.OperationTypeDebit,
		Amount:        amount,
		Date:          payerDate,
		Description:   "Charge settlement",
		ChargeID:      &chargeIDCopy,
		LinkedTransactions: []domain.Transaction{
			{
				UserID:        charge.PayerUserID,
				AccountID:     payerConnAccountID,
				Type:          domain.TransactionTypeTransfer,
				OperationType: domain.OperationTypeCredit,
				Amount:        amount,
				Date:          payerDate,
				Description:   "Charge settlement",
				ChargeID:      &chargeIDCopy,
			},
		},
	}
	if _, err := s.transactionRepo.Create(txCtx, payerTransfer); err != nil {
		return pkgErrors.Internal("failed to create payer transfer", err)
	}

	// ---- Commit ----
	if err := s.dbTransaction.Commit(txCtx); err != nil {
		return pkgErrors.Internal("failed to commit accept", err)
	}
	return nil
}
