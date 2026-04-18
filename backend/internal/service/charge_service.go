package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

type chargeService struct {
	chargeRepo         repository.ChargeRepository
	userConnectionRepo repository.UserConnectionRepository
	transactionRepo    repository.TransactionRepository
	dbTransaction      repository.DBTransaction
	services           *Services
}

func NewChargeService(repos *repository.Repositories, services *Services) ChargeService {
	return &chargeService{
		chargeRepo:         repos.Charge,
		userConnectionRepo: repos.UserConnection,
		transactionRepo:    repos.Transaction,
		dbTransaction:      repos.DBTransaction,
		services:           services,
	}
}

func (s *chargeService) Create(ctx context.Context, callerUserID int, req *domain.CreateChargeRequest) (*domain.Charge, error) {
	// Basic validation
	if req.MyAccountID <= 0 {
		return nil, pkgErrors.BadRequest("my_account_id is required")
	}
	if req.Date.IsZero() {
		return nil, pkgErrors.BadRequest("date is required")
	}
	if req.PeriodMonth < 1 || req.PeriodMonth > 12 {
		return nil, pkgErrors.BadRequest("period_month must be 1-12")
	}
	if req.PeriodYear <= 0 {
		return nil, pkgErrors.BadRequest("period_year is required")
	}
	if req.Amount != nil && *req.Amount <= 0 {
		return nil, pkgErrors.BadRequest("amount must be greater than zero")
	}
	if req.Role != nil && !req.Role.IsValid() {
		return nil, pkgErrors.BadRequest("role must be 'charger' or 'payer'")
	}

	// Fetch connection
	conns, err := s.userConnectionRepo.Search(ctx, domain.UserConnectionSearchOptions{
		IDs: []int{req.ConnectionID},
	})
	if err != nil {
		return nil, pkgErrors.Internal("failed to fetch connection", err)
	}
	if len(conns) == 0 {
		return nil, pkgErrors.NotFound("connection")
	}
	conn := conns[0]

	if conn.ConnectionStatus != domain.UserConnectionStatusAccepted {
		return nil, pkgErrors.BadRequest("connection is not accepted")
	}

	if conn.FromUserID != callerUserID && conn.ToUserID != callerUserID {
		return nil, pkgErrors.Forbidden("caller is not a party to this connection")
	}

	// Determine other party
	var otherPartyID int
	if conn.FromUserID == callerUserID {
		otherPartyID = conn.ToUserID
	} else {
		otherPartyID = conn.FromUserID
	}

	// Resolve caller's connection account via SwapIfNeeded
	conn.SwapIfNeeded(callerUserID)
	callerConnAccountID := conn.FromAccountID

	// Infer role from balance in the charge's period
	period := domain.Period{Month: req.PeriodMonth, Year: req.PeriodYear}
	balResult, err := s.services.Transaction.GetBalance(ctx, callerUserID, period, domain.BalanceFilter{
		UserID:     callerUserID,
		AccountIDs: []int{callerConnAccountID},
	})
	if err != nil {
		return nil, pkgErrors.Internal("failed to compute balance", err)
	}

	// Role resolution — explicit role wins over balance inference.
	// When unset, fall back to balance sign; zero balance requires either a
	// role or the legacy "cannot create" error so intent stays unambiguous.
	var callerIsCharger bool
	switch {
	case req.Role != nil:
		callerIsCharger = *req.Role == domain.ChargeInitiatorRoleCharger
	case balResult.Balance > 0:
		callerIsCharger = true
	case balResult.Balance < 0:
		callerIsCharger = false
	default:
		return nil, pkgErrors.BadRequest("cannot infer role with zero balance; provide 'role'")
	}

	charge := &domain.Charge{
		ConnectionID: req.ConnectionID,
		PeriodMonth:  req.PeriodMonth,
		PeriodYear:   req.PeriodYear,
		Description:  req.Description,
		Amount:       req.Amount,
		Status:       domain.ChargeStatusPending,
		Date:         &req.Date,
	}

	myAccID := req.MyAccountID
	if callerIsCharger {
		charge.ChargerUserID = callerUserID
		charge.PayerUserID = otherPartyID
		charge.ChargerAccountID = &myAccID
	} else {
		charge.PayerUserID = callerUserID
		charge.ChargerUserID = otherPartyID
		charge.PayerAccountID = &myAccID
	}

	return s.chargeRepo.Create(ctx, charge)
}

func (s *chargeService) Cancel(ctx context.Context, callerUserID, chargeID int) error {
	charge, err := s.chargeRepo.GetByID(ctx, chargeID)
	if err != nil {
		return pkgErrors.NotFound("charge")
	}

	// IDOR: is caller a party at all?
	if charge.ChargerUserID != callerUserID && charge.PayerUserID != callerUserID {
		return pkgErrors.Forbidden("charge")
	}

	// Role check: only charger can cancel
	if charge.ChargerUserID != callerUserID {
		return pkgErrors.Forbidden("only the charger can cancel")
	}

	// Status transition validation
	if err := charge.ValidateTransition(domain.ChargeStatusCancelled); err != nil {
		return pkgErrors.BadRequest(err.Error())
	}

	charge.Status = domain.ChargeStatusCancelled
	if err := s.chargeRepo.Update(ctx, charge); err != nil {
		return pkgErrors.Internal("failed to cancel charge", err)
	}
	return nil
}

func (s *chargeService) Reject(ctx context.Context, callerUserID, chargeID int) error {
	charge, err := s.chargeRepo.GetByID(ctx, chargeID)
	if err != nil {
		return pkgErrors.NotFound("charge")
	}

	// IDOR: is caller a party at all?
	if charge.ChargerUserID != callerUserID && charge.PayerUserID != callerUserID {
		return pkgErrors.Forbidden("charge")
	}

	// Role check: only payer can reject
	if charge.PayerUserID != callerUserID {
		return pkgErrors.Forbidden("only the payer can reject")
	}

	// Status transition validation
	if err := charge.ValidateTransition(domain.ChargeStatusRejected); err != nil {
		return pkgErrors.BadRequest(err.Error())
	}

	charge.Status = domain.ChargeStatusRejected
	if err := s.chargeRepo.Update(ctx, charge); err != nil {
		return pkgErrors.Internal("failed to reject charge", err)
	}
	return nil
}

func (s *chargeService) List(ctx context.Context, options domain.ChargeSearchOptions) ([]*domain.Charge, error) {
	results, err := s.chargeRepo.Search(ctx, options)
	if err != nil {
		return nil, pkgErrors.Internal("failed to list charges", err)
	}
	return results, nil
}

func (s *chargeService) PendingCount(ctx context.Context, callerUserID int) (int64, error) {
	count, err := s.chargeRepo.Count(ctx, domain.ChargeSearchOptions{
		UserID:    callerUserID,
		Direction: "received",
		Status:    domain.ChargeStatusPending,
	})
	if err != nil {
		return 0, pkgErrors.Internal("failed to count pending charges", err)
	}
	return count, nil
}
