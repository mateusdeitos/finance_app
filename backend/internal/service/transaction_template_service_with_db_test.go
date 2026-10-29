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
//   - SAFE-02: cross-user Update/Delete/MarkUsed return pkgErrors.IsNotFound
//     (404), never FORBIDDEN — ownership mismatches never leak existence.
//
// It also covers duplicate-name rejection (409, tag "TEMPLATE.DUPLICATE_NAME",
// sentinel pkgErrors.ErrTemplateDuplicateName / ErrorTagTemplateDuplicateName),
// D-03 field validation, created_at ASC ordering (TMPL-02), and the P26
// recency ordering, and the P26 isolation guarantee (templates never leak into
// financial queries).
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
// Templates are intentionally unlimited.
// ---------------------------------------------------------------------------

func (s *TransactionTemplateServiceWithDBSuite) TestCreate_AllowsMoreThanThreeTemplates() {
	ctx := context.Background()
	user, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	for i := range 5 {
		_, err := s.Services.TransactionTemplate.Create(ctx, user.ID, fmt.Sprintf("seq-template-%d", i), validTemplatePayload())
		s.Require().NoError(err)
	}

	templates, err := s.Services.TransactionTemplate.List(ctx, user.ID)
	s.Require().NoError(err)
	s.Len(templates, 5)
}

// ---------------------------------------------------------------------------
// SAFE-02: IDOR — 404, never 403
// ---------------------------------------------------------------------------

func (s *TransactionTemplateServiceWithDBSuite) TestIDOR_UpdateDeleteMarkUsed_SAFE02() {
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

	// User B cannot alter the recency of user A's template either.
	markUsedErr := s.Services.TransactionTemplate.MarkUsed(ctx, userB.ID, tmpl.ID)
	s.Require().Error(markUsedErr)
	s.True(pkgErrors.IsNotFound(markUsedErr), "expected NotFound (404), got: %v", markUsedErr)

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

func (s *TransactionTemplateServiceWithDBSuite) TestCreate_CaseInsensitiveDuplicateRace() {
	ctx := context.Background()
	user, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	names := []string{"Groceries", "groceries"}
	results := make([]error, len(names))
	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(len(names))
	for i, name := range names {
		go func(i int, name string) {
			defer wg.Done()
			<-start
			_, results[i] = s.Services.TransactionTemplate.Create(context.Background(), user.ID, name, validTemplatePayload())
		}(i, name)
	}
	close(start)
	wg.Wait()

	successes := 0
	duplicates := 0
	for _, result := range results {
		if result == nil {
			successes++
			continue
		}
		svcErr, ok := pkgErrors.AsServiceError(result)
		s.Require().True(ok, "expected a *ServiceError, got %T: %v", result, result)
		s.Contains(svcErr.Tags, string(pkgErrors.ErrorTagTemplateDuplicateName))
		duplicates++
	}
	s.Equal(1, successes)
	s.Equal(1, duplicates)

	templates, err := s.Services.TransactionTemplate.List(ctx, user.ID)
	s.Require().NoError(err)
	s.Len(templates, 1, "case-insensitive names must remain unique under concurrent writes")
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
		payload.SplitSettings = []domain.TransactionTemplateSplitSetting{
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
// TMPL-02: List ordering by most recent use
// ---------------------------------------------------------------------------

func (s *TransactionTemplateServiceWithDBSuite) TestList_OrderingByLastUsedAt() {
	ctx := context.Background()
	user, err := s.createTestUser(ctx)
	s.Require().NoError(err)

	names := []string{"order-first", "order-second", "order-third"}
	created := make([]*domain.TransactionTemplate, 0, len(names))
	for _, name := range names {
		template, err := s.Services.TransactionTemplate.Create(ctx, user.ID, name, validTemplatePayload())
		s.Require().NoError(err)
		created = append(created, template)
	}
	s.Require().NoError(s.Services.TransactionTemplate.MarkUsed(ctx, user.ID, created[0].ID))
	time.Sleep(time.Millisecond)
	s.Require().NoError(s.Services.TransactionTemplate.MarkUsed(ctx, user.ID, created[2].ID))

	templates, err := s.Services.TransactionTemplate.List(ctx, user.ID)
	s.Require().NoError(err)
	s.Require().Len(templates, 3)

	gotNames := make([]string, len(templates))
	for i, t := range templates {
		gotNames[i] = t.Name
	}
	s.Equal([]string{"order-third", "order-first", "order-second"}, gotNames)
	s.Require().NotNil(templates[0].LastUsedAt)
	s.Require().NotNil(templates[1].LastUsedAt)
	s.Nil(templates[2].LastUsedAt)
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

	// Create several templates for this user.
	for i := range 5 {
		_, err := s.Services.TransactionTemplate.Create(ctx, user.ID, fmt.Sprintf("isolation-template-%d", i), validTemplatePayload())
		s.Require().NoError(err)
	}

	after, err := s.Repos.Transaction.Search(ctx, domain.TransactionFilter{UserID: &uid})
	s.Require().NoError(err)

	s.Equal(len(before), len(after), "creating templates must not perturb Transaction.Search results (P26 isolation)")
}
