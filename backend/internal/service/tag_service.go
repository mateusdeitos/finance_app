package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
)

type tagService struct {
	tagRepo repository.TagRepository
}

func NewTagService(repos *repository.Repositories) TagService {
	return &tagService{
		tagRepo: repos.Tag,
	}
}

func (s *tagService) Create(ctx context.Context, userID int, tag *domain.Tag) (*domain.Tag, error) {
	// Check if tag with same name already exists
	existing, err := s.tagRepo.GetByName(ctx, userID, tag.Name)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing tag: %w", err)
	}
	if existing != nil {
		return existing, nil // Return existing tag
	}

	tag.UserID = userID
	return s.tagRepo.Create(ctx, tag)
}

func (s *tagService) GetByID(ctx context.Context, userID, id int) (*domain.Tag, error) {
	tag, err := s.tagRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get tag: %w", err)
	}
	if tag == nil {
		return nil, errors.New("tag not found")
	}
	if tag.UserID != userID {
		return nil, errors.New("tag does not belong to user")
	}
	return tag, nil
}

func (s *tagService) List(ctx context.Context, userID int) ([]*domain.Tag, error) {
	return s.tagRepo.GetByUserID(ctx, userID)
}

func (s *tagService) Update(ctx context.Context, userID int, tag *domain.Tag) error {
	// Verify ownership
	existing, err := s.GetByID(ctx, userID, tag.ID)
	if err != nil {
		return err
	}

	// Check if new name conflicts with another tag
	if tag.Name != existing.Name {
		conflicting, err := s.tagRepo.GetByName(ctx, userID, tag.Name)
		if err != nil {
			return fmt.Errorf("failed to check existing tag: %w", err)
		}
		if conflicting != nil && conflicting.ID != tag.ID {
			return errors.New("tag with this name already exists")
		}
	}

	tag.UserID = existing.UserID
	return s.tagRepo.Update(ctx, tag)
}

func (s *tagService) Delete(ctx context.Context, userID, id int) error {
	// Verify ownership
	_, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}

	return s.tagRepo.Delete(ctx, id)
}

