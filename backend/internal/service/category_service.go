package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
)

type categoryService struct {
	categoryRepo repository.CategoryRepository
}

func NewCategoryService(repos *repository.Repositories) CategoryService {
	return &categoryService{
		categoryRepo: repos.Category,
	}
}

func (s *categoryService) Create(ctx context.Context, userID int, category *domain.Category) (*domain.Category, error) {
	// Validate parent if provided
	if category.ParentID != nil {
		parent, err := s.categoryRepo.GetByID(ctx, *category.ParentID)
		if err != nil {
			return nil, fmt.Errorf("failed to get parent category: %w", err)
		}
		if parent == nil {
			return nil, errors.New("parent category not found")
		}
		if parent.UserID != userID {
			return nil, errors.New("parent category does not belong to user")
		}
	}

	category.UserID = userID
	return s.categoryRepo.Create(ctx, category)
}

func (s *categoryService) GetByID(ctx context.Context, userID, id int) (*domain.Category, error) {
	category, err := s.categoryRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get category: %w", err)
	}
	if category == nil {
		return nil, errors.New("category not found")
	}
	if category.UserID != userID {
		return nil, errors.New("category does not belong to user")
	}
	return category, nil
}

func (s *categoryService) List(ctx context.Context, userID int) ([]*domain.Category, error) {
	return s.categoryRepo.GetByUserIDWithChildren(ctx, userID)
}

func (s *categoryService) Update(ctx context.Context, userID int, category *domain.Category) error {
	// Verify ownership
	existing, err := s.GetByID(ctx, userID, category.ID)
	if err != nil {
		return err
	}

	// Validate parent if changed
	if category.ParentID != nil && (existing.ParentID == nil || *category.ParentID != *existing.ParentID) {
		parent, err := s.categoryRepo.GetByID(ctx, *category.ParentID)
		if err != nil {
			return fmt.Errorf("failed to get parent category: %w", err)
		}
		if parent == nil {
			return errors.New("parent category not found")
		}
		if parent.UserID != userID {
			return errors.New("parent category does not belong to user")
		}
		// Prevent circular reference
		if *category.ParentID == category.ID {
			return errors.New("category cannot be its own parent")
		}
	}

	category.UserID = existing.UserID
	return s.categoryRepo.Update(ctx, category)
}

func (s *categoryService) Delete(ctx context.Context, userID, id int) error {
	// Verify ownership
	_, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}

	return s.categoryRepo.Delete(ctx, id)
}

