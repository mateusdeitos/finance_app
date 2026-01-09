package service

import (
	"context"
	"fmt"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

type categoryService struct {
	dbTransaction repository.DBTransaction
	categoryRepo  repository.CategoryRepository
}

func NewCategoryService(repos *repository.Repositories) CategoryService {
	return &categoryService{
		dbTransaction: repos.DBTransaction,
		categoryRepo:  repos.Category,
	}
}

func (s *categoryService) Create(ctx context.Context, userID int, category *domain.Category) (*domain.Category, error) {
	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return nil, pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	// Validate parent if provided
	if category.ParentID != nil {
		_, err := s.GetByID(ctx, userID, *category.ParentID)
		if err != nil {
			return nil, fmt.Errorf("failed to get parent category: %w", err)
		}
	}

	category.UserID = userID

	created, err := s.categoryRepo.Create(ctx, category)
	if err != nil {
		return nil, pkgErrors.Internal("failed to create category", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return nil, pkgErrors.Internal("failed to commit transaction", err)
	}

	return created, nil
}

func (s *categoryService) GetByID(ctx context.Context, userID, id int) (domain.Category, error) {
	categories, err := s.categoryRepo.Search(ctx, domain.CategorySearchOptions{
		UserIDs: []int{userID},
		IDs:     []int{id},
	})
	if err != nil {
		return domain.Category{}, pkgErrors.Internal("failed to get category", err)
	}
	if len(categories) == 0 {
		return domain.Category{}, pkgErrors.NotFound("category")
	}
	return *categories[0], nil
}

func (s *categoryService) Search(ctx context.Context, options domain.CategorySearchOptions) ([]*domain.Category, error) {
	categories, err := s.categoryRepo.Search(ctx, options)
	if err != nil {
		return nil, pkgErrors.Internal("failed to get categories", err)
	}

	root := make(map[int]*domain.Category, len(categories))

	// os 2 loops são intencionais, para garantir que caso a ordenação da query mude, o resultado ainda será correto
	for _, category := range categories {
		if category.ParentID == nil {
			root[category.ID] = category
			continue
		}
	}

	for _, category := range categories {
		if category.ParentID == nil {
			continue
		}

		if _, ok := root[*category.ParentID]; !ok {
			return nil, pkgErrors.NotFound(fmt.Sprintf("parent category %d", *category.ParentID))
		}

		root[*category.ParentID].Children = append(root[*category.ParentID].Children, *category)
	}

	return lo.Values(root), nil
}

func (s *categoryService) Update(ctx context.Context, userID int, category *domain.Category) error {
	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	// Verify ownership
	existing, err := s.GetByID(ctx, userID, category.ID)
	if err != nil {
		return err
	}

	// Validate parent if changed
	if lo.FromPtr(category.ParentID) != lo.FromPtr(existing.ParentID) && category.ParentID != nil {
		_, err := s.GetByID(ctx, userID, *category.ParentID)
		if err != nil {
			return pkgErrors.Internal("failed to get parent category", err)
		}

		// Prevent circular reference
		if *category.ParentID == category.ID {
			return pkgErrors.BadRequest("category cannot be its own parent")
		}
	}

	existing.Name = category.Name
	existing.ParentID = category.ParentID
	if err := s.categoryRepo.Update(ctx, &existing); err != nil {
		return pkgErrors.Internal("failed to update category", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}

	return nil
}

func (s *categoryService) Delete(ctx context.Context, userID, id int) error {
	// Verify ownership
	_, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}

	return s.categoryRepo.Delete(ctx, id)
}
