package service

import (
	"context"
	"strings"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	apperrors "github.com/finance_app/backend/pkg/errors"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type impersonationService struct {
	userRepo          repository.UserRepository
	impersonationRepo repository.ImpersonationRepository
	config            *config.Config
}

func NewImpersonationService(repos *repository.Repositories, cfg *config.Config) ImpersonationService {
	return &impersonationService{
		userRepo:          repos.User,
		impersonationRepo: repos.Impersonation,
		config:            cfg,
	}
}

func (s *impersonationService) Start(ctx context.Context, adminUserID, targetUserID int, reason, ipAddress, userAgent string) (*domain.StartImpersonationResult, error) {
	admin, err := s.userRepo.GetByID(ctx, adminUserID)
	if err != nil {
		return nil, apperrors.Internal("failed to load admin user", err)
	}
	if admin == nil || !admin.IsAdmin {
		return nil, apperrors.ErrImpersonationForbidden
	}

	reason = strings.TrimSpace(reason)
	if reason == "" {
		return nil, apperrors.ErrImpersonationReasonRequired
	}

	if targetUserID == adminUserID {
		return nil, apperrors.ErrImpersonationTargetIsSelf
	}

	target, err := s.userRepo.GetByID(ctx, targetUserID)
	if err != nil {
		return nil, apperrors.Internal("failed to load target user", err)
	}
	if target == nil {
		return nil, apperrors.ErrImpersonationTargetNotFound
	}
	if target.IsAdmin {
		return nil, apperrors.ErrImpersonationTargetIsAdmin
	}

	now := time.Now()
	session := &domain.ImpersonationSession{
		ID:           uuid.New().String(),
		AdminUserID:  admin.ID,
		TargetUserID: target.ID,
		Reason:       reason,
		IPAddress:    ipAddress,
		UserAgent:    userAgent,
		CreatedAt:    now,
		ExpiresAt:    now.Add(s.config.Impersonation.TokenTTL()),
	}
	if err := s.impersonationRepo.Create(ctx, session); err != nil {
		return nil, apperrors.Internal("failed to record impersonation session", err)
	}

	token, err := s.generateImpersonationToken(admin, target, session)
	if err != nil {
		return nil, apperrors.Internal("failed to generate impersonation token", err)
	}

	return &domain.StartImpersonationResult{
		Token:      token,
		SessionID:  session.ID,
		ExpiresAt:  session.ExpiresAt,
		TargetUser: target,
	}, nil
}

func (s *impersonationService) Stop(ctx context.Context, sessionID string, actorAdminID int) error {
	session, err := s.impersonationRepo.GetByID(ctx, sessionID)
	if err != nil {
		return apperrors.Internal("failed to load impersonation session", err)
	}
	if session == nil {
		return apperrors.ErrImpersonationNotActive
	}
	// Only the admin who opened the session may close it.
	if session.AdminUserID != actorAdminID {
		return apperrors.ErrImpersonationForbidden
	}
	if session.RevokedAt != nil {
		return nil // idempotent
	}
	if err := s.impersonationRepo.Revoke(ctx, sessionID, time.Now()); err != nil {
		return apperrors.Internal("failed to revoke impersonation session", err)
	}
	return nil
}

func (s *impersonationService) SearchUsers(ctx context.Context, query string, limit int) ([]*domain.User, error) {
	users, err := s.userRepo.Search(ctx, query, limit)
	if err != nil {
		return nil, apperrors.Internal("failed to search users", err)
	}
	return users, nil
}

// generateImpersonationToken mints a JWT that authenticates as the target user
// (user_id = target) but embeds the acting admin under the RFC 7519 `act`
// (actor) claim and the session id as `jti`, so downstream auth can attribute
// and revoke the session.
func (s *impersonationService) generateImpersonationToken(admin, target *domain.User, session *domain.ImpersonationSession) (string, error) {
	claims := jwt.MapClaims{
		"user_id": target.ID,
		"email":   target.Email,
		"jti":     session.ID,
		"act": map[string]interface{}{
			"sub":   admin.ID,
			"email": admin.Email,
		},
		"exp": session.ExpiresAt.Unix(),
		"iat": session.CreatedAt.Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.config.JWT.Secret))
}
