package service

import (
	"context"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/suite"
)

type ImpersonationServiceTestSuite struct {
	ServiceTestSuite
}

func TestImpersonationService(t *testing.T) {
	suite.Run(t, new(ImpersonationServiceTestSuite))
}

func admin(id int) *domain.User {
	return &domain.User{ID: id, Email: "admin@financeapp.local", Name: "Admin", IsAdmin: true}
}

func regularUser(id int) *domain.User {
	return &domain.User{ID: id, Email: "user@financeapp.local", Name: "User", IsAdmin: false}
}

func (s *ImpersonationServiceTestSuite) TestStart_HappyPath() {
	ctx := context.Background()
	s.MockUserRepository.EXPECT().GetByID(ctx, 1).Return(admin(1), nil).Once()
	s.MockUserRepository.EXPECT().GetByID(ctx, 2).Return(regularUser(2), nil).Once()
	s.MockImpersonationRepository.EXPECT().Create(ctx, mock.MatchedBy(func(sess *domain.ImpersonationSession) bool {
		return sess.AdminUserID == 1 && sess.TargetUserID == 2 && sess.Reason == "debugging balance" && sess.ID != ""
	})).Return(nil).Once()

	result, err := s.Services.Impersonation.Start(ctx, 1, 2, "debugging balance", "1.2.3.4", "curl")
	s.Require().NoError(err)
	s.NotEmpty(result.Token)
	s.NotEmpty(result.SessionID)
	s.Equal(2, result.TargetUser.ID)
	s.True(result.ExpiresAt.After(time.Now()))
}

func (s *ImpersonationServiceTestSuite) TestStart_CallerNotAdmin() {
	ctx := context.Background()
	s.MockUserRepository.EXPECT().GetByID(ctx, 5).Return(regularUser(5), nil).Once()

	_, err := s.Services.Impersonation.Start(ctx, 5, 2, "reason", "", "")
	s.Equal(pkgErrors.ErrImpersonationForbidden, err)
}

func (s *ImpersonationServiceTestSuite) TestStart_EmptyReason() {
	ctx := context.Background()
	s.MockUserRepository.EXPECT().GetByID(ctx, 1).Return(admin(1), nil).Once()

	_, err := s.Services.Impersonation.Start(ctx, 1, 2, "   ", "", "")
	s.Equal(pkgErrors.ErrImpersonationReasonRequired, err)
}

func (s *ImpersonationServiceTestSuite) TestStart_TargetIsSelf() {
	ctx := context.Background()
	s.MockUserRepository.EXPECT().GetByID(ctx, 1).Return(admin(1), nil).Once()

	_, err := s.Services.Impersonation.Start(ctx, 1, 1, "reason", "", "")
	s.Equal(pkgErrors.ErrImpersonationTargetIsSelf, err)
}

func (s *ImpersonationServiceTestSuite) TestStart_TargetNotFound() {
	ctx := context.Background()
	s.MockUserRepository.EXPECT().GetByID(ctx, 1).Return(admin(1), nil).Once()
	s.MockUserRepository.EXPECT().GetByID(ctx, 99).Return(nil, nil).Once()

	_, err := s.Services.Impersonation.Start(ctx, 1, 99, "reason", "", "")
	s.Equal(pkgErrors.ErrImpersonationTargetNotFound, err)
}

func (s *ImpersonationServiceTestSuite) TestStart_TargetIsAdmin() {
	ctx := context.Background()
	s.MockUserRepository.EXPECT().GetByID(ctx, 1).Return(admin(1), nil).Once()
	s.MockUserRepository.EXPECT().GetByID(ctx, 2).Return(admin(2), nil).Once()

	_, err := s.Services.Impersonation.Start(ctx, 1, 2, "reason", "", "")
	s.Equal(pkgErrors.ErrImpersonationTargetIsAdmin, err)
}

func (s *ImpersonationServiceTestSuite) TestStop_HappyPath() {
	ctx := context.Background()
	session := &domain.ImpersonationSession{ID: "sess-1", AdminUserID: 1, TargetUserID: 2, ExpiresAt: time.Now().Add(time.Hour)}
	s.MockImpersonationRepository.EXPECT().GetByID(ctx, "sess-1").Return(session, nil).Once()
	s.MockImpersonationRepository.EXPECT().Revoke(ctx, "sess-1", mock.Anything).Return(nil).Once()

	s.NoError(s.Services.Impersonation.Stop(ctx, "sess-1", 1))
}

func (s *ImpersonationServiceTestSuite) TestStop_WrongActor() {
	ctx := context.Background()
	session := &domain.ImpersonationSession{ID: "sess-1", AdminUserID: 1, TargetUserID: 2, ExpiresAt: time.Now().Add(time.Hour)}
	s.MockImpersonationRepository.EXPECT().GetByID(ctx, "sess-1").Return(session, nil).Once()

	err := s.Services.Impersonation.Stop(ctx, "sess-1", 999)
	s.Equal(pkgErrors.ErrImpersonationForbidden, err)
}

func (s *ImpersonationServiceTestSuite) TestStop_AlreadyRevokedIsIdempotent() {
	ctx := context.Background()
	revokedAt := time.Now().Add(-time.Minute)
	session := &domain.ImpersonationSession{ID: "sess-1", AdminUserID: 1, TargetUserID: 2, ExpiresAt: time.Now().Add(time.Hour), RevokedAt: &revokedAt}
	s.MockImpersonationRepository.EXPECT().GetByID(ctx, "sess-1").Return(session, nil).Once()

	s.NoError(s.Services.Impersonation.Stop(ctx, "sess-1", 1))
}

func (s *ImpersonationServiceTestSuite) TestStop_NotFound() {
	ctx := context.Background()
	s.MockImpersonationRepository.EXPECT().GetByID(ctx, "missing").Return(nil, nil).Once()

	err := s.Services.Impersonation.Stop(ctx, "missing", 1)
	s.Equal(pkgErrors.ErrImpersonationNotActive, err)
}

// TestValidateToken_RoundTrip proves an impersonation token authenticates as the
// target user and surfaces the acting admin as the impersonator, when the
// backing session is active.
func (s *ImpersonationServiceTestSuite) TestValidateToken_RoundTrip() {
	ctx := context.Background()
	s.MockUserRepository.EXPECT().GetByID(ctx, 1).Return(admin(1), nil).Once()
	s.MockUserRepository.EXPECT().GetByID(ctx, 2).Return(regularUser(2), nil).Twice()

	var createdSessionID string
	s.MockImpersonationRepository.EXPECT().Create(ctx, mock.Anything).RunAndReturn(func(_ context.Context, sess *domain.ImpersonationSession) error {
		createdSessionID = sess.ID
		return nil
	}).Once()

	result, err := s.Services.Impersonation.Start(ctx, 1, 2, "reason", "", "")
	s.Require().NoError(err)

	// Session is active on validation.
	s.MockImpersonationRepository.EXPECT().GetByID(ctx, mock.Anything).RunAndReturn(func(_ context.Context, id string) (*domain.ImpersonationSession, error) {
		s.Equal(createdSessionID, id)
		return &domain.ImpersonationSession{ID: id, AdminUserID: 1, TargetUserID: 2, ExpiresAt: time.Now().Add(time.Hour)}, nil
	}).Once()

	user, impersonator, err := s.Services.Auth.ValidateToken(ctx, result.Token)
	s.Require().NoError(err)
	s.Equal(2, user.ID)
	s.Require().NotNil(impersonator)
	s.Equal(1, impersonator.AdminUserID)
	s.Equal(createdSessionID, impersonator.SessionID)
}

// TestValidateToken_RevokedSessionRejected proves a token whose session has been
// revoked can no longer authenticate, even before the JWT expires.
func (s *ImpersonationServiceTestSuite) TestValidateToken_RevokedSessionRejected() {
	ctx := context.Background()
	s.MockUserRepository.EXPECT().GetByID(ctx, 1).Return(admin(1), nil).Once()
	s.MockUserRepository.EXPECT().GetByID(ctx, 2).Return(regularUser(2), nil).Once()
	s.MockImpersonationRepository.EXPECT().Create(ctx, mock.Anything).Return(nil).Once()

	result, err := s.Services.Impersonation.Start(ctx, 1, 2, "reason", "", "")
	s.Require().NoError(err)

	revokedAt := time.Now().Add(-time.Minute)
	s.MockImpersonationRepository.EXPECT().GetByID(ctx, mock.Anything).Return(&domain.ImpersonationSession{
		ID: result.SessionID, AdminUserID: 1, TargetUserID: 2, ExpiresAt: time.Now().Add(time.Hour), RevokedAt: &revokedAt,
	}, nil).Once()

	_, _, err = s.Services.Auth.ValidateToken(ctx, result.Token)
	s.Error(err)
}
