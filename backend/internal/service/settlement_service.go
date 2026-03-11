package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

type settlementService struct {
	settlementRepo repository.SettlementRepository
}

func NewSettlementService(repos *repository.Repositories) SettlementService {
	return &settlementService{
		settlementRepo: repos.Settlement,
	}
}

func (s *settlementService) Search(ctx context.Context, filter domain.SettlementFilter) ([]*domain.Settlement, error) {
	results, err := s.settlementRepo.Search(ctx, filter)
	if err != nil {
		return nil, pkgErrors.Internal("failed to search settlements", err)
	}
	return results, nil
}

func (s *settlementService) SearchOne(ctx context.Context, filter domain.SettlementFilter) (*domain.Settlement, error) {
	one := 1
	filter.Limit = &one
	results, err := s.settlementRepo.Search(ctx, filter)
	if err != nil {
		return nil, pkgErrors.Internal("failed to search settlement", err)
	}
	if len(results) == 0 {
		return nil, pkgErrors.NotFound("settlement")
	}
	return results[0], nil
}

func (s *settlementService) Create(ctx context.Context, settlement *domain.Settlement) (*domain.Settlement, error) {
	created, err := s.settlementRepo.Create(ctx, settlement)
	if err != nil {
		return nil, pkgErrors.Internal("failed to create settlement", err)
	}
	return created, nil
}

func (s *settlementService) Update(ctx context.Context, settlement *domain.Settlement) error {
	if err := s.settlementRepo.Update(ctx, settlement); err != nil {
		return pkgErrors.Internal("failed to update settlement", err)
	}
	return nil
}

func (s *settlementService) Delete(ctx context.Context, ids []int) error {
	if err := s.settlementRepo.Delete(ctx, ids); err != nil {
		return pkgErrors.Internal("failed to delete settlements", err)
	}
	return nil
}
