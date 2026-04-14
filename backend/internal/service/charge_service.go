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
}

func NewChargeService(repos *repository.Repositories) ChargeService {
	return &chargeService{
		chargeRepo:         repos.Charge,
		userConnectionRepo: repos.UserConnection,
	}
}

func (s *chargeService) Create(ctx context.Context, callerUserID int, req *domain.CreateChargeRequest) (*domain.Charge, error) {
	// Validate role
	if req.Role != "charger" && req.Role != "payer" {
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

	// Validate connection is accepted
	if conn.ConnectionStatus != domain.UserConnectionStatusAccepted {
		return nil, pkgErrors.BadRequest("connection is not accepted")
	}

	// Validate caller is a party to the connection
	if conn.FromUserID != callerUserID && conn.ToUserID != callerUserID {
		return nil, pkgErrors.Forbidden("caller is not a party to this connection")
	}

	// Resolve the other party
	var otherPartyID int
	if conn.FromUserID == callerUserID {
		otherPartyID = conn.ToUserID
	} else {
		otherPartyID = conn.FromUserID
	}

	// Build charge based on caller's declared role
	charge := &domain.Charge{
		ConnectionID: req.ConnectionID,
		PeriodMonth:  req.PeriodMonth,
		PeriodYear:   req.PeriodYear,
		Description:  req.Description,
		Status:       domain.ChargeStatusPending,
	}

	if req.Role == "charger" {
		charge.ChargerUserID = callerUserID
		charge.PayerUserID = otherPartyID
		charge.ChargerAccountID = req.MyAccountID
	} else { // "payer"
		charge.PayerUserID = callerUserID
		charge.ChargerUserID = otherPartyID
		charge.PayerAccountID = req.MyAccountID
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
