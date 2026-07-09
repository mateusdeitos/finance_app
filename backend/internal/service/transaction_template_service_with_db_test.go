package service

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/finance_app/backend/internal/domain"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/stretchr/testify/suite"
)

// TransactionTemplateServiceWithDBSuite is the testcontainers integration
// suite for the transaction-templates CRUD slice (Phase 27). It proves the
// two security-critical guarantees end to end against real PostgreSQL:
//
//   - SAFE-01: the 3-template cap is race-safe. A concurrent double-create at
//     count=2 must yield exactly one success and one failure tagged
//     pkgErrors.ErrorTagTemplateLimitReached ("TEMPLATE.LIMIT_REACHED",
//     sentinel pkgErrors.ErrTemplateLimitReached), and the final row count
//     must be exactly 3, never 4.
//   - SAFE-02: cross-user Get/Update/Delete return pkgErrors.IsNotFound
//     (404), never FORBIDDEN — ownership mismatches never leak existence.
//
// It also covers duplicate-name rejection (409, tag "TEMPLATE.DUPLICATE_NAME",
// sentinel pkgErrors.ErrTemplateDuplicateName / ErrorTagTemplateDuplicateName),
// D-03 field validation, created_at ASC ordering (TMPL-02), and the P26
// isolation guarantee (templates never leak into financial queries).
type TransactionTemplateServiceWithDBSuite struct {
	ServiceTestWithDBSuite
}

func TestTransactionTemplateServiceWithDB(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping DB integration test in short mode")
	}
	suite.Run(t, new(TransactionTemplateServiceWithDBSuite))
}

// validTemplatePayload builds a minimal payload that passes D-03 validation:
// a valid transaction type and no split rows (split validation is exercised
// by a dedicated test).
func validTemplatePayload() domain.TransactionTemplatePayload {
	return domain.TransactionTemplatePayload{Type: domain.TransactionTypeExpense, Description: "x"}
}

// ---------------------------------------------------------------------------
// SAFE-01: race-safe 3-template cap
// ---------------------------------------------------------------------------

func (s *TransactionTemplateServiceWithDBSuite) TestCreate_CapSequential() {
	ctx := context.Background()
	user, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	for i := 0; i < 3; i++ {
		_, err := s.Services.TransactionTemplate.Create(ctx, user.ID, fmt.Sprintf("seq-template-%d", i), validTemplatePayload())
		s.Require().NoError(err)
	}

	// A 4th sequential create must fail with TEMPLATE.LIMIT_REACHED (409).
	_, err = s.Services.TransactionTemplate.Create(ctx, user.ID, "seq-template-4th", validTemplatePayload())
	s.Require().Error(err)
	svcErr, ok := pkgErrors.AsServiceError(err)
	s.Require().True(ok, "expected a *ServiceError, got %T: %v", err, err)
	s.Equal(pkgErrors.ErrCodeAlreadyExists, svcErr.Code)
	s.Contains(svcErr.Tags, string(pkgErrors.ErrorTagTemplateLimitReached))

	templates, err := s.Services.TransactionTemplate.List(ctx, user.ID)
	s.Require().NoError(err)
	s.Len(templates, 3, "cap must hold at exactly 3 rows")
}

// TestCreate_CapRace_SAFE01 seeds a user with exactly 2 templates, then fires
// two concurrent Create calls (distinct names) via sync.WaitGroup. Exactly
// one must succeed and one must fail with TEMPLATE.LIMIT_REACHED; the final
// List length must be exactly 3, never 4.
//
// NOTE: each goroutine begins its own DBTransaction. The cap is guaranteed by
// the repository's single COUNT-gated conditional INSERT (Plan 01), so even
// under READ COMMITTED both cannot land a 4th row. If this test is flaky, it
// is a real bug in the cap SQL, not the test — do NOT add retries to mask it.
func (s *TransactionTemplateServiceWithDBSuite) TestCreate_CapRace_SAFE01() {
	ctx := context.Background()
	user, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	// Seed exactly 2 templates for this user.
	for i := 0; i < 2; i++ {
		_, err := s.Services.TransactionTemplate.Create(ctx, user.ID, fmt.Sprintf("race-seed-%d", i), validTemplatePayload())
		s.Require().NoError(err)
	}

	var wg sync.WaitGroup
	results := make([]error, 2)
	wg.Add(2)
	for i := 0; i < 2; i++ {
		go func(i int) {
			defer wg.Done()
			_, results[i] = s.Services.TransactionTemplate.Create(context.Background(), user.ID, fmt.Sprintf("race-%d", i), validTemplatePayload())
		}(i)
	}
	wg.Wait()

	successCount := 0
	limitReachedCount := 0
	for _, err := range results {
		if err == nil {
			successCount++
			continue
		}
		svcErr, ok := pkgErrors.AsServiceError(err)
		s.Require().True(ok, "expected a *ServiceError, got %T: %v", err, err)
		s.Contains(svcErr.Tags, string(pkgErrors.ErrorTagTemplateLimitReached))
		limitReachedCount++
	}
	s.Equal(1, successCount, "expected exactly one concurrent create to succeed")
	s.Equal(1, limitReachedCount, "expected exactly one concurrent create to hit TEMPLATE.LIMIT_REACHED")

	templates, err := s.Services.TransactionTemplate.List(ctx, user.ID)
	s.Require().NoError(err)
	s.Len(templates, 3, "final count must be exactly 3, never 4 (SAFE-01)")
}

// ---------------------------------------------------------------------------
// SAFE-02: IDOR — 404, never 403
// ---------------------------------------------------------------------------

func (s *TransactionTemplateServiceWithDBSuite) TestIDOR_UpdateDelete_SAFE02() {
	ctx := context.Background()
	userA, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	userB, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	tmpl, err := s.Services.TransactionTemplate.Create(ctx, userA.ID, "idor-template", validTemplatePayload())
	s.Require().NoError(err)

	// User B attempts to Update user A's template -> NotFound, never Forbidden.
	updateErr := s.Services.TransactionTemplate.Update(ctx, userB.ID, tmpl.ID, "hijacked", validTemplatePayload())
	s.Require().Error(updateErr)
	s.True(pkgErrors.IsNotFound(updateErr), "expected NotFound (404), got: %v", updateErr)
	if svcErr, ok := pkgErrors.AsServiceError(updateErr); ok {
		s.NotEqual(pkgErrors.ErrCodeForbidden, svcErr.Code, "IDOR must surface as 404, never 403")
	}

	// User B attempts to Delete user A's template -> NotFound, never Forbidden.
	deleteErr := s.Services.TransactionTemplate.Delete(ctx, userB.ID, tmpl.ID)
	s.Require().Error(deleteErr)
	s.True(pkgErrors.IsNotFound(deleteErr), "expected NotFound (404), got: %v", deleteErr)
	if svcErr, ok := pkgErrors.AsServiceError(deleteErr); ok {
		s.NotEqual(pkgErrors.ErrCodeForbidden, svcErr.Code, "IDOR must surface as 404, never 403")
	}

	// User B's List must not contain user A's template.
	bList, err := s.Services.TransactionTemplate.List(ctx, userB.ID)
	s.Require().NoError(err)
	for _, t := range bList {
		s.NotEqual(tmpl.ID, t.ID, "userB's list must never contain userA's template")
	}

	// User A's template must be untouched by userB's failed attempts.
	aList, err := s.Services.TransactionTemplate.List(ctx, userA.ID)
	s.Require().NoError(err)
	s.Require().Len(aList, 1)
	s.Equal("idor-template", aList[0].Name)
}

// ---------------------------------------------------------------------------
// D-05: duplicate name (409, case-insensitive)
// ---------------------------------------------------------------------------

func (s *TransactionTemplateServiceWithDBSuite) TestCreate_DuplicateName() {
	ctx := context.Background()
	user, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	_, err = s.Services.TransactionTemplate.Create(ctx, user.ID, "Groceries", validTemplatePayload())
	s.Require().NoError(err)

	// Exact duplicate.
	_, err = s.Services.TransactionTemplate.Create(ctx, user.ID, "Groceries", validTemplatePayload())
	s.Require().Error(err)
	svcErr, ok := pkgErrors.AsServiceError(err)
	s.Require().True(ok, "expected a *ServiceError, got %T: %v", err, err)
	s.Equal(pkgErrors.ErrCodeAlreadyExists, svcErr.Code)
	s.Contains(svcErr.Tags, string(pkgErrors.ErrorTagTemplateDuplicateName))

	// Case-insensitive duplicate.
	_, err = s.Services.TransactionTemplate.Create(ctx, user.ID, "groceries", validTemplatePayload())
	s.Require().Error(err)
	svcErr, ok = pkgErrors.AsServiceError(err)
	s.Require().True(ok, "expected a *ServiceError, got %T: %v", err, err)
	s.Contains(svcErr.Tags, string(pkgErrors.ErrorTagTemplateDuplicateName))
}

// ---------------------------------------------------------------------------
// D-03: field + split-row validation
// ---------------------------------------------------------------------------

func (s *TransactionTemplateServiceWithDBSuite) TestCreate_Validation() {
	ctx := context.Background()
	user, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	s.Run("empty name", func() {
		_, err := s.Services.TransactionTemplate.Create(ctx, user.ID, "", validTemplatePayload())
		s.Require().Error(err)
		svcErr, ok := pkgErrors.AsServiceError(err)
		s.Require().True(ok, "expected a *ServiceError, got %T: %v", err, err)
		s.Contains(svcErr.Tags, string(pkgErrors.ErrorTagTemplateNameRequired))
	})

	s.Run("invalid type", func() {
		payload := validTemplatePayload()
		payload.Type = domain.TransactionType("bogus")
		_, err := s.Services.TransactionTemplate.Create(ctx, user.ID, "validation-invalid-type", payload)
		s.Require().Error(err)
		svcErr, ok := pkgErrors.AsServiceError(err)
		s.Require().True(ok, "expected a *ServiceError, got %T: %v", err, err)
		s.Contains(svcErr.Tags, string(pkgErrors.ErrorTagTemplateInvalidType))
	})

	s.Run("split row percentage and amount both set", func() {
		payload := validTemplatePayload()
		pct := 50
		amt := int64(1000)
		payload.SplitSettings = []domain.SplitSettings{
			{ConnectionID: 1, Percentage: &pct, Amount: &amt},
		}
		_, err := s.Services.TransactionTemplate.Create(ctx, user.ID, "validation-split-xor", payload)
		s.Require().Error(err)
		svcErr, ok := pkgErrors.AsServiceError(err)
		s.Require().True(ok, "expected a *ServiceError, got %T: %v", err, err)
		s.Contains(svcErr.Tags, string(pkgErrors.ErrorTagSplitSettingPercentageAndAmountCannotBeUsedTogether))
	})
}

// ---------------------------------------------------------------------------
// TMPL-02: List ordering (created_at ASC)
// ---------------------------------------------------------------------------

func (s *TransactionTemplateServiceWithDBSuite) TestList_OrderingCreatedAtASC() {
	ctx := context.Background()
	user, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	names := []string{"order-first", "order-second", "order-third"}
	for _, name := range names {
		_, err := s.Services.TransactionTemplate.Create(ctx, user.ID, name, validTemplatePayload())
		s.Require().NoError(err)
	}

	templates, err := s.Services.TransactionTemplate.List(ctx, user.ID)
	s.Require().NoError(err)
	s.Require().Len(templates, 3)

	gotNames := make([]string, len(templates))
	for i, t := range templates {
		gotNames[i] = t.Name
	}
	s.Equal(names, gotNames, "List must return templates created_at ASC (oldest first)")

	for i := 1; i < len(templates); i++ {
		s.Require().NotNil(templates[i-1].CreatedAt)
		s.Require().NotNil(templates[i].CreatedAt)
		s.False(templates[i].CreatedAt.Before(*templates[i-1].CreatedAt), "created_at must be non-decreasing (ASC order)")
	}
}

// ---------------------------------------------------------------------------
// P26: isolation — templates never leak into financial queries
// ---------------------------------------------------------------------------

func (s *TransactionTemplateServiceWithDBSuite) TestIsolation_P26_TemplatesDoNotLeakIntoFinancialQueries() {
	ctx := context.Background()
	user, err := s.createTestUser(ctx)
	s.Require().NoError(err)
	account, err := s.createTestAccount(ctx, user)
	s.Require().NoError(err)

	// Seed one real transaction so the financial query has a non-trivial baseline.
	_, err = s.Repos.Transaction.Create(ctx, &domain.Transaction{
		UserID:         user.ID,
		OriginalUserID: &user.ID,
		AccountID:      account.ID,
		Amount:         1000,
		Type:           domain.TransactionTypeExpense,
		OperationType:  domain.OperationTypeDebit,
		Date:           time.Now().UTC(),
		Description:    "isolation baseline",
	})
	s.Require().NoError(err)

	uid := user.ID
	before, err := s.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &uid})
	s.Require().NoError(err)

	// Create up to the 3-template cap for this user.
	for i := 0; i < 3; i++ {
		_, err := s.Services.TransactionTemplate.Create(ctx, user.ID, fmt.Sprintf("isolation-template-%d", i), validTemplatePayload())
		s.Require().NoError(err)
	}

	after, err := s.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &uid})
	s.Require().NoError(err)

	s.Equal(len(before), len(after), "creating templates must not perturb Transaction.Search results (P26 isolation)")
}
