//go:build integration

package service

import (
	"context"
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
	// Use chargeRepo.Create directly to bypass Create validation for test setup
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

func (s *ChargeServiceTestSuite) TestAccept_CreatesTransfers() {
	s.T().Skip("Wave 0 stub — implemented in Task 6")
}

func (s *ChargeServiceTestSuite) TestAccept_Atomic() {
	s.T().Skip("Wave 0 stub — implemented in Task 6")
}

func (s *ChargeServiceTestSuite) TestAccept_DoubleAccept() {
	s.T().Skip("Wave 0 stub — implemented in Task 6")
}

func (s *ChargeServiceTestSuite) TestAccept_Forbidden_Initiator() {
	s.T().Skip("Wave 0 stub — implemented in Task 6")
}

func (s *ChargeServiceTestSuite) TestAccept_IDOR() {
	s.T().Skip("Wave 0 stub — implemented in Task 6")
}

func (s *ChargeServiceTestSuite) TestAccept_RoleReinference_BalanceFlipped() {
	s.T().Skip("Wave 0 stub — implemented in Task 6")
}

func (s *ChargeServiceTestSuite) TestAccept_NonPending() {
	s.T().Skip("Wave 0 stub — implemented in Task 6")
}

var _ = lo.ToPtr[int]    // silence unused import until Task 6 body lands
var _ = pkgErrors.AlreadyExists // silence until Task 6
var _ = assert.NoError         // silence until Task 6
