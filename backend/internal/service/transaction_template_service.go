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
	dbTransaction repository.DBTransaction
	templateRepo  repository.TransactionTemplateRepository
}

func NewTransactionTemplateService(repos *repository.Repositories) TransactionTemplateService {
	return &transactionTemplateService{
		dbTransaction: repos.DBTransaction,
		templateRepo:  repos.TransactionTemplate,
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

// List returns the authenticated user's templates, oldest first.
// SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req.
func (s *transactionTemplateService) List(ctx context.Context, userID int) ([]*domain.TransactionTemplate, error) {
	return s.templateRepo.ListByUserID(ctx, userID)
}

// Create validates the payload, then wraps a duplicate-name pre-check and the
// capped insert in a single DBTransaction so they stay race-consistent
// (D-05). The repository's cap sentinel is translated into the tagged 409
// the frontend reads (T-27-02).
// SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req.
func (s *transactionTemplateService) Create(ctx context.Context, userID int, name string, payload domain.TransactionTemplatePayload) (*domain.TransactionTemplate, error) {
	if err := s.validate(name, payload); err != nil {
		return nil, err
	}

	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return nil, pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	// Duplicate-name pre-check inside the same tx (D-05). The DB's
	// UNIQUE(user_id, name) constraint is the backstop under a race.
	existing, err := s.templateRepo.ListByUserID(ctx, userID)
	if err != nil {
		return nil, pkgErrors.Internal("failed to check templates", err)
	}
	for _, e := range existing {
		if strings.EqualFold(e.Name, name) {
			return nil, pkgErrors.ErrTemplateDuplicateName
		}
	}

	created, err := s.templateRepo.Create(ctx, &domain.TransactionTemplate{
		UserID:  userID,
		Name:    name,
		Payload: payload, // canonical struct persisted (D-02)
	})
	if err != nil {
		if errors.Is(err, repository.ErrTemplateLimitReached) {
			return nil, pkgErrors.ErrTemplateLimitReached
		}
		return nil, pkgErrors.Internal("failed to create template", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return nil, pkgErrors.Internal("failed to commit transaction", err)
	}
	return created, nil
}

// Update validates the payload, enforces duplicate-name against the user's
// OTHER templates, then performs a full replace (D-06). The repository scopes
// the write by (id, user_id) and returns NotFound (404) on owner mismatch —
// surfaced unchanged (SAFE-02).
// SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req.
func (s *transactionTemplateService) Update(ctx context.Context, userID, id int, name string, payload domain.TransactionTemplatePayload) error {
	if err := s.validate(name, payload); err != nil {
		return err
	}

	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	existing, err := s.templateRepo.ListByUserID(ctx, userID)
	if err != nil {
		return pkgErrors.Internal("failed to check templates", err)
	}
	for _, e := range existing {
		if e.ID != id && strings.EqualFold(e.Name, name) {
			return pkgErrors.ErrTemplateDuplicateName
		}
	}

	if err := s.templateRepo.Update(ctx, userID, &domain.TransactionTemplate{ID: id, UserID: userID, Name: name, Payload: payload}); err != nil {
		return err // repo already returns pkgErrors.NotFound (404) on owner mismatch — do NOT re-wrap
	}
	return s.dbTransaction.Commit(ctx)
}

// Delete is a thin passthrough: the repository scopes the delete by
// (id, user_id) and returns NotFound (404) on owner mismatch (SAFE-02).
// SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req.
func (s *transactionTemplateService) Delete(ctx context.Context, userID, id int) error {
	return s.templateRepo.Delete(ctx, userID, id)
}
