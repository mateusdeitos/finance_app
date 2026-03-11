package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
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
	// Validate and normalize tag name
	if parsed, err := s.parseTagName(tag.Name); err != nil {
		return nil, pkgErrors.Internal("failed to parse tag name", err)
	} else {
		tag.Name = parsed
	}

	// Check if tag with same name already exists
	existing, err := s.tagRepo.Search(ctx, domain.TagSearchOptions{
		UserIDs: []int{userID},
		Name:    tag.Name,
	})
	if err != nil {
		return nil, pkgErrors.Internal("failed to check existing tag", err)
	}
	if len(existing) > 0 {
		return existing[0], nil // Return existing tag
	}

	tag.UserID = userID
	created, err := s.tagRepo.Create(ctx, tag)
	if err != nil {
		return nil, pkgErrors.Internal("failed to create tag", err)
	}
	return created, nil
}

func (s *tagService) Update(ctx context.Context, userID int, tag *domain.Tag) error {
	// Validate and normalize tag name
	if parsed, err := s.parseTagName(tag.Name); err != nil {
		return pkgErrors.Internal("failed to parse tag name", err)
	} else {
		tag.Name = parsed
	}

	// Verify ownership
	existing, err := s.tagRepo.Search(ctx, domain.TagSearchOptions{
		UserIDs: []int{userID},
		IDs:     []int{tag.ID},
	})
	if err != nil {
		return pkgErrors.Internal("failed to get tag", err)
	}
	if len(existing) == 0 {
		return pkgErrors.NotFound(fmt.Sprintf("tag with ID %d not found", tag.ID))
	}

	// Check if new name conflicts with another tag
	if tag.Name != existing[0].Name {
		conflicting, err := s.tagRepo.Search(ctx, domain.TagSearchOptions{
			UserIDs: []int{userID},
			IDsNot:  []int{tag.ID},
			Name:    tag.Name,
		})
		if err != nil {
			return pkgErrors.Internal("failed to check existing tag", err)
		}
		if len(conflicting) > 0 {
			return pkgErrors.AlreadyExists("tag with this name")
		}
	}

	existing[0].Name = tag.Name
	if err := s.tagRepo.Update(ctx, existing[0]); err != nil {
		return pkgErrors.Internal("failed to update tag", err)
	}
	return nil
}

func (s *tagService) Delete(ctx context.Context, userID, id int) error {
	// Verify ownership
	existing, err := s.tagRepo.Search(ctx, domain.TagSearchOptions{
		UserIDs: []int{userID},
		IDs:     []int{id},
	})
	if err != nil {
		return pkgErrors.Internal("failed to get tag", err)
	}
	if len(existing) == 0 {
		return pkgErrors.NotFound("tag")
	}

	if err := s.tagRepo.Delete(ctx, id); err != nil {
		return pkgErrors.Internal("failed to delete tag", err)
	}
	return nil
}

func (s *tagService) Search(ctx context.Context, options domain.TagSearchOptions) ([]*domain.Tag, error) {
	tags, err := s.tagRepo.Search(ctx, options)
	if err != nil {
		return nil, pkgErrors.Internal("failed to search tags", err)
	}
	return tags, nil
}

func (s *tagService) validateTagName(name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return pkgErrors.Validation("tag name cannot be empty")
	}
	return nil
}

func (s *tagService) parseTagName(name string) (string, error) {
	if err := s.validateTagName(name); err != nil {
		return "", err
	}
	return name, nil
}
