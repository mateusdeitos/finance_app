package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/samber/lo"
)

type categoryService struct {
	dbTransaction   repository.DBTransaction
	categoryRepo    repository.CategoryRepository
	transactionRepo repository.TransactionRepository
}

func NewCategoryService(repos *repository.Repositories) CategoryService {
	return &categoryService{
		dbTransaction:   repos.DBTransaction,
		categoryRepo:    repos.Category,
		transactionRepo: repos.Transaction,
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

	// Sibling uniqueness check
	if err := s.checkSiblingUniqueness(ctx, userID, category.ParentID, category.Name, 0); err != nil {
		return nil, err
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
	return s.categoryRepo.Search(ctx, options)
}

func (s *categoryService) GetTree(ctx context.Context, options domain.CategorySearchOptions) ([]*domain.Category, error) {
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

	// Sibling uniqueness check (exclude current category from check)
	parentID := category.ParentID
	if parentID == nil {
		parentID = existing.ParentID
	}
	if err := s.checkSiblingUniqueness(ctx, userID, parentID, category.Name, category.ID); err != nil {
		return err
	}

	existing.Name = category.Name
	existing.Emoji = category.Emoji
	existing.ParentID = category.ParentID
	if err := s.categoryRepo.Update(ctx, &existing); err != nil {
		return pkgErrors.Internal("failed to update category", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}

	return nil
}

func (s *categoryService) Delete(ctx context.Context, userID, id int, req domain.DeleteCategoryRequest) error {
	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	// Verify ownership
	_, err = s.GetByID(ctx, userID, id)
	if err != nil {
		return err
	}

	// Validate replacement category if provided
	if req.ReplaceWithID != nil {
		if *req.ReplaceWithID == id {
			return pkgErrors.NewWithTag(
				pkgErrors.ErrCodeValidation,
				[]string{string(pkgErrors.ErrorTagInvalidReplacementCategory)},
				"replacement category must be different from the category being deleted",
			)
		}
		_, err := s.GetByID(ctx, userID, *req.ReplaceWithID)
		if err != nil {
			return pkgErrors.NewWithTag(
				pkgErrors.ErrCodeValidation,
				[]string{string(pkgErrors.ErrorTagInvalidReplacementCategory)},
				"replacement category not found",
			)
		}
	}

	// Reassign or nullify transactions
	if req.ReplaceWithID != nil {
		if err := s.transactionRepo.ReassignCategory(ctx, id, *req.ReplaceWithID); err != nil {
			return pkgErrors.Internal("failed to reassign transactions", err)
		}
	} else {
		if err := s.transactionRepo.NullifyCategory(ctx, id); err != nil {
			return pkgErrors.Internal("failed to nullify transactions", err)
		}
	}

	if err := s.categoryRepo.Delete(ctx, id); err != nil {
		return pkgErrors.Internal("failed to delete category", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return pkgErrors.Internal("failed to commit transaction", err)
	}

	return nil
}

// checkSiblingUniqueness returns an error if a sibling with the same trimmed, case-insensitive name exists.
// excludeID = 0 means no exclusion (create case); pass the category's own ID for update.
func (s *categoryService) checkSiblingUniqueness(ctx context.Context, userID int, parentID *int, name string, excludeID int) error {
	trimmed := strings.TrimSpace(name)
	opts := domain.CategorySearchOptions{
		UserIDs: []int{userID},
		Name:    &trimmed,
		Limit:   1,
	}
	if parentID != nil {
		opts.ParentID = parentID
	} else {
		opts.OnlyRootLevel = true
	}
	if excludeID != 0 {
		opts.ExcludeIDs = []int{excludeID}
	}
	siblings, err := s.categoryRepo.Search(ctx, opts)
	if err != nil {
		return pkgErrors.Internal("failed to check sibling categories", err)
	}

	if len(siblings) > 0 {
		return pkgErrors.NewWithTag(
			pkgErrors.ErrCodeValidation,
			[]string{string(pkgErrors.ErrorTagDuplicateCategoryName)},
			"a category with this name already exists at this level",
		)
	}
	return nil
}
