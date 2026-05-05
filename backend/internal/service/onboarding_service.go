package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

type onboardingService struct {
	tx               repository.DBTransaction
	accountRepo      repository.AccountRepository
	categoryRepo     repository.CategoryRepository
	userSettingsRepo repository.UserSettingsRepository
}

func NewOnboardingService(repos *repository.Repositories) OnboardingService {
	return &onboardingService{
		tx:               repos.DBTransaction,
		accountRepo:      repos.Account,
		categoryRepo:     repos.Category,
		userSettingsRepo: repos.UserSettings,
	}
}

func (s *onboardingService) GetStatus(ctx context.Context, userID int) (*domain.OnboardingStatus, error) {
	settings, err := s.userSettingsRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, pkgErrors.Internal("failed to get user settings", err)
	}
	completed, _ := settings.Settings[domain.SettingKeyOnboardingCompleted].(bool)
	return &domain.OnboardingStatus{Completed: completed}, nil
}

func (s *onboardingService) Complete(ctx context.Context, userID int, req *domain.OnboardingSetupRequest) error {
	ctx, err := s.tx.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.tx.Rollback(ctx)

	for i := range req.Accounts {
		input := req.Accounts[i]
		account := &domain.Account{
			UserID:                userID,
			Name:                  input.Name,
			Description:           input.Description,
			InitialBalance:        input.InitialBalance,
			IsActive:              true,
			AvatarBackgroundColor: input.AvatarBackgroundColor,
		}
		if _, err := s.accountRepo.Create(ctx, account); err != nil {
			return pkgErrors.Internal("failed to create account", err)
		}
	}

	for i := range req.Categories {
		parent := req.Categories[i]
		parentDomain := &domain.Category{
			UserID: userID,
			Name:   parent.Name,
			Emoji:  parent.Emoji,
		}
		createdParent, err := s.categoryRepo.Create(ctx, parentDomain)
		if err != nil {
			return pkgErrors.Internal("failed to create category", err)
		}
		for j := range parent.Children {
			child := parent.Children[j]
			parentID := createdParent.ID
			childDomain := &domain.Category{
				UserID:   userID,
				Name:     child.Name,
				Emoji:    child.Emoji,
				ParentID: &parentID,
			}
			if _, err := s.categoryRepo.Create(ctx, childDomain); err != nil {
				return pkgErrors.Internal("failed to create category", err)
			}
		}
	}

	settings, err := s.userSettingsRepo.GetByUserID(ctx, userID)
	if err != nil {
		return pkgErrors.Internal("failed to get user settings", err)
	}
	if settings.Settings == nil {
		settings.Settings = make(map[string]interface{})
	}
	settings.Settings[domain.SettingKeyOnboardingCompleted] = true
	if err := s.userSettingsRepo.CreateOrUpdate(ctx, settings); err != nil {
		return pkgErrors.Internal("failed to save user settings", err)
	}

	if err := s.tx.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}
	return nil
}
