package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	apperrors "github.com/finance_app/backend/pkg/errors"
)

type userService struct {
	userRepo repository.UserRepository
}

func NewUserService(repos *repository.Repositories) UserService {
	return &userService{
		userRepo: repos.User,
	}
}

func (s *userService) GetByExternalID(ctx context.Context, externalID string) (*domain.User, error) {
	user, err := s.userRepo.GetByExternalID(ctx, externalID)
	if err != nil {
		return nil, apperrors.Internal("failed to get user by external id", err)
	}
	if user == nil {
		return nil, apperrors.NotFound("user")
	}
	return user, nil
}
