package service

import (
	"context"
	"errors"
	"strings"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

// maxTemplateNameLength is a sane cap for the template name, following the
// existing string-field conventions elsewhere in the service layer (D-03).
const maxTemplateNameLength = 100

type transactionTemplateService struct {
	templateRepo repository.TransactionTemplateRepository
}

func NewTransactionTemplateService(repos *repository.Repositories) TransactionTemplateService {
	return &transactionTemplateService{
		templateRepo: repos.TransactionTemplate,
	}
}

// validate enforces the D-03 shape rules before any write: name non-empty
// (+ max length), a valid transaction type, and internally-consistent split
// rows (percentage XOR fixed-amount). It deliberately does NOT check
// cross-row percentage sums or referential existence of account/category/tag
// ids — those are out of scope for this phase (D-03).
func (s *transactionTemplateService) validate(name string, payload domain.TransactionTemplatePayload) error {
	if strings.TrimSpace(name) == "" {
		return pkgErrors.ErrTemplateNameRequired
	}
	if len(name) > maxTemplateNameLength {
		return pkgErrors.ErrTemplateNameRequired
	}
	if !payload.Type.IsValid() {
		return pkgErrors.ErrTemplateInvalidType
	}
	for i, splitSetting := range payload.SplitSettings {
		if splitSetting.Percentage == nil && splitSetting.Amount == nil {
			return pkgErrors.ErrSplitSettingPercentageOrAmountIsRequired(i)
		}
		if splitSetting.Percentage != nil && splitSetting.Amount != nil {
			return pkgErrors.ErrSplitSettingPercentageAndAmountCannotBeUsedTogether(i)
		}
		if splitSetting.Percentage != nil && (*splitSetting.Percentage < 1 || *splitSetting.Percentage > 100) {
			return pkgErrors.ErrSplitSettingPercentageMustBeBetween1And100(i)
		}
	}
	return nil
}

// List returns the authenticated user's templates with most recently used first.
// SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req.
func (s *transactionTemplateService) List(ctx context.Context, userID int) ([]*domain.TransactionTemplate, error) {
	return s.templateRepo.ListByUserID(ctx, userID)
}

// Create validates the payload. The database's case-insensitive unique index
// is the concurrency-safe source of truth for duplicate names (D-05).
// SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req.
func (s *transactionTemplateService) Create(ctx context.Context, userID int, name string, payload domain.TransactionTemplatePayload) (*domain.TransactionTemplate, error) {
	if err := s.validate(name, payload); err != nil {
		return nil, err
	}

	created, err := s.templateRepo.Create(ctx, &domain.TransactionTemplate{
		UserID:  userID,
		Name:    name,
		Payload: payload, // canonical struct persisted (D-02)
	})
	if err != nil {
		if errors.Is(err, repository.ErrTemplateDuplicateName) {
			return nil, pkgErrors.ErrTemplateDuplicateName
		}
		return nil, pkgErrors.Internal("failed to create template", err)
	}

	return created, nil
}

// Update validates the payload then performs a full replace (D-06). The
// database unique index handles concurrent duplicate names. The repository
// scopes the write by (id, user_id) and returns NotFound (404) on owner mismatch.
// SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req.
func (s *transactionTemplateService) Update(ctx context.Context, userID, id int, name string, payload domain.TransactionTemplatePayload) error {
	if err := s.validate(name, payload); err != nil {
		return err
	}

	if err := s.templateRepo.Update(ctx, userID, &domain.TransactionTemplate{ID: id, UserID: userID, Name: name, Payload: payload}); err != nil {
		if errors.Is(err, repository.ErrTemplateDuplicateName) {
			return pkgErrors.ErrTemplateDuplicateName
		}
		return err // repo already returns pkgErrors.NotFound (404) on owner mismatch — do NOT re-wrap
	}
	return nil
}

// Delete is a thin passthrough: the repository scopes the delete by
// (id, user_id) and returns NotFound (404) on owner mismatch (SAFE-02).
// SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req.
func (s *transactionTemplateService) Delete(ctx context.Context, userID, id int) error {
	return s.templateRepo.Delete(ctx, userID, id)
}

// MarkUsed records that a caller applied one of their templates. The repository
// scopes the update by (id, user_id), preserving the same IDOR protection as CRUD.
func (s *transactionTemplateService) MarkUsed(ctx context.Context, userID, id int) error {
	return s.templateRepo.MarkUsed(ctx, userID, id)
}
