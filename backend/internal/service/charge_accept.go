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
	if !charge.IsParty(callerUserID) {
		return pkgErrors.Forbidden("charge")
	}

	// ---- Non-initiator rule: only the counterparty (the party who did NOT
	// create the charge) may accept it. The initiator already committed their
	// side at creation time. ----
	if callerUserID != charge.CounterpartyUserID() {
		return pkgErrors.Forbidden("only the non-initiating party can accept")
	}

	if err := s.validatePrivateAccount(ctx, req.AccountID, callerUserID); err != nil {
		return err
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

	// ---- Fill the accepter's private account on the charge from req.AccountID ----
	// The accepter is always the counterparty, so their side is the one still
	// missing an account. Fill it explicitly based on the caller's role.
	accID := req.AccountID
	if callerUserID == charge.ChargerUserID {
		charge.ChargerAccountID = &accID
	} else {
		charge.PayerAccountID = &accID
	}

	// ---- Begin atomic scope ----
	txCtx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(txCtx)

	// Resolve settlement amount.
	// Priority: accept-time override → stored arbitrary amount → live balance.
	//
	// The charge's charger/payer roles are FIXED at creation time and honored
	// as-is: the charger's connection account is debited and the payer's is
	// credited, which moves both toward zero when the roles reflect reality.
	// We do NOT re-infer/swap roles from the live balance — the single-period
	// balance can disagree with the true (accumulated) debt direction, and a
	// wrong swap would push both balances away from zero (doubling them) instead
	// of settling. If the initiator picked the wrong direction, the counterparty
	// rejects rather than silently flipping the transfer.
	var amount int64
	switch {
	case req.Amount != nil:
		amount = *req.Amount
	case charge.Amount != nil:
		amount = *charge.Amount
	default:
		period := domain.Period{Month: charge.PeriodMonth, Year: charge.PeriodYear}
		balResult, err := s.services.Transaction.GetBalance(txCtx, charge.ChargerUserID, period, domain.BalanceFilter{
			UserID:     charge.ChargerUserID,
			AccountIDs: []int{chargerConnAccountID},
		})
		if err != nil {
			return pkgErrors.Internal("failed to compute balance", err)
		}
		liveBalance := balResult.Balance
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

	// OriginalUserID for each transfer = its own owner. Each transfer is an intra-user
	// move (connection account <-> private account of the same user), so original_user_id
	// matches user_id on every leg — consistent with same-user transfers created elsewhere.
	chargerUserIDCopy := charge.ChargerUserID
	payerUserIDCopy := charge.PayerUserID

	// ---- Build charger's transfer: connection account → private account ----
	// FROM (debit): chargerConnAccountID
	// TO (credit):  chargerPrivateAccID
	chargerTransfer := &domain.Transaction{
		UserID:         charge.ChargerUserID,
		OriginalUserID: &chargerUserIDCopy,
		AccountID:      chargerConnAccountID,
		Type:           domain.TransactionTypeTransfer,
		OperationType:  domain.OperationTypeDebit,
		Amount:         amount,
		Date:           chargerDate,
		Description:    "Charge settlement",
		ChargeID:       &chargeIDCopy,
		LinkedTransactions: []domain.Transaction{
			{
				UserID:         charge.ChargerUserID,
				OriginalUserID: &chargerUserIDCopy,
				AccountID:      chargerPrivateAccID,
				Type:           domain.TransactionTypeTransfer,
				OperationType:  domain.OperationTypeCredit,
				Amount:         amount,
				Date:           chargerDate,
				Description:    "Charge settlement",
				ChargeID:       &chargeIDCopy,
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
		UserID:         charge.PayerUserID,
		OriginalUserID: &payerUserIDCopy,
		AccountID:      payerPrivateAccID,
		Type:           domain.TransactionTypeTransfer,
		OperationType:  domain.OperationTypeDebit,
		Amount:         amount,
		Date:           payerDate,
		Description:    "Charge settlement",
		ChargeID:       &chargeIDCopy,
		LinkedTransactions: []domain.Transaction{
			{
				UserID:         charge.PayerUserID,
				OriginalUserID: &payerUserIDCopy,
				AccountID:      payerConnAccountID,
				Type:           domain.TransactionTypeTransfer,
				OperationType:  domain.OperationTypeCredit,
				Amount:         amount,
				Date:           payerDate,
				Description:    "Charge settlement",
				ChargeID:       &chargeIDCopy,
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

	// NOTIF-02: notify the non-caller (the charge initiator). Use the pre-swap
	// copies (chargerUserIDCopy / payerUserIDCopy) to be robust against role swap.
	recipientID := chargerUserIDCopy
	if callerUserID == chargerUserIDCopy {
		recipientID = payerUserIDCopy
	}
	notifDescription := ""
	if charge.Description != nil {
		notifDescription = *charge.Description
	}
	//nolint:gosec,contextcheck // G118: intentional detached context — post-commit push dispatch must outlive request ctx (NOTIF-06)
	go s.services.Notification.Dispatch(context.Background(), []domain.NotificationEvent{{
		RecipientUserID: recipientID,
		ActorUserID:     callerUserID,
		Type:            domain.NotificationTypeChargeAccepted,
		EntityType:      "charge",
		EntityID:        chargeID,
		Amount:          amount,
		Description:     notifDescription,
	}})
	return nil
}
