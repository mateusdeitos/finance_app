package mcp

import (
	"context"
	"errors"
	"strings"

	"github.com/finance_app/backend/internal/domain"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func (s *Server) getContext(ctx context.Context, _ *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, readScope)
	if err != nil {
		return nil, nil, err
	}
	accounts, err := s.services.Account.Search(ctx, domain.AccountSearchOptions{
		UserIDs: []int{id},
	})
	if err != nil {
		return nil, nil, err
	}
	categories, err := s.services.Category.GetTree(ctx, domain.CategorySearchOptions{
		UserIDs: []int{id},
	})
	if err != nil {
		return nil, nil, err
	}
	tags, err := s.services.Tag.Search(ctx, domain.TagSearchOptions{
		UserIDs: []int{id},
	})
	if err != nil {
		return nil, nil, err
	}
	conns, err := s.services.UserConnection.Search(ctx, domain.UserConnectionSearchOptions{
		ParticipantUserID: id,
		ConnectionStatus:  domain.UserConnectionStatusAccepted,
	})
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{
		"accounts":    accounts,
		"categories":  categories,
		"tags":        tags,
		"connections": conns,
	}, nil
}

type listInput struct {
	Month       int                      `json:"month"`
	Year        int                      `json:"year"`
	AccountIDs  []int                    `json:"account_ids,omitempty"`
	CategoryIDs []int                    `json:"category_ids,omitempty"`
	TagIDs      []int                    `json:"tag_ids,omitempty"`
	Types       []domain.TransactionType `json:"types,omitempty"`
	Limit       int                      `json:"limit,omitempty"`
	Offset      int                      `json:"offset,omitempty"`
	Description string                   `json:"description,omitempty"`
	Reviewed    *bool                    `json:"reviewed,omitempty"`
}

func (s *Server) listTransactions(ctx context.Context, _ *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, readScope)
	if err != nil {
		return nil, nil, err
	}
	if in.Limit <= 0 {
		in.Limit = 50
	}
	if in.Limit > 100 {
		in.Limit = 100
	}
	f := domain.TransactionFilter{
		AccountIDs:      in.AccountIDs,
		CategoryIDs:     in.CategoryIDs,
		TagIDs:          in.TagIDs,
		Types:           in.Types,
		Limit:           &in.Limit,
		Offset:          &in.Offset,
		WithSettlements: true,
		Reviewed:        in.Reviewed,
	}
	if in.Description != "" {
		f.Description = &domain.TextSearch{
			Query: in.Description,
		}
	}
	txs, err := s.services.Transaction.Search(ctx, id, domain.Period{
		Month: in.Month,
		Year:  in.Year,
	}, f)
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"transactions": txs}, nil
}

type idInput struct {
	TransactionID int `json:"transaction_id"`
}

func (s *Server) getTransaction(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, readScope)
	if err != nil {
		return nil, nil, err
	}
	txs, err := s.services.Transaction.Search(ctx, id, domain.Period{}, domain.TransactionFilter{
		IDs:             []int{in.TransactionID},
		WithSettlements: true,
	})
	if err != nil {
		return nil, nil, err
	}
	if len(txs) == 0 {
		return nil, nil, errors.New("transaction not found")
	}
	return nil, map[string]any{"transaction": txs[0]}, nil
}

type balanceInput struct {
	Month           int   `json:"month"`
	Year            int   `json:"year"`
	AccountIDs      []int `json:"account_ids,omitempty"`
	CategoryIDs     []int `json:"category_ids,omitempty"`
	TagIDs          []int `json:"tag_ids,omitempty"`
	Accumulated     bool  `json:"accumulated,omitempty"`
	HideSettlements bool  `json:"hide_settlements,omitempty"`
	Reviewed        *bool `json:"reviewed,omitempty"`
}

func (s *Server) getBalance(ctx context.Context, _ *mcp.CallToolRequest, in balanceInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, readScope)
	if err != nil {
		return nil, nil, err
	}
	result, err := s.services.Transaction.GetBalance(ctx, id, domain.Period{
		Month: in.Month,
		Year:  in.Year,
	}, domain.BalanceFilter{
		AccountIDs:      in.AccountIDs,
		CategoryIDs:     in.CategoryIDs,
		TagIDs:          in.TagIDs,
		Accumulated:     in.Accumulated,
		HideSettlements: in.HideSettlements,
		Reviewed:        in.Reviewed,
	})
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"balance": result}, nil
}

type suggestionsInput struct {
	Query string `json:"query"`
	Limit int    `json:"limit,omitempty"`
}

func (s *Server) suggestTransactions(ctx context.Context, _ *mcp.CallToolRequest, in suggestionsInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, readScope)
	if err != nil {
		return nil, nil, err
	}
	if strings.TrimSpace(in.Query) == "" {
		return nil, nil, errors.New("query is required")
	}
	if in.Limit <= 0 {
		in.Limit = 10
	}
	if in.Limit > 50 {
		in.Limit = 50
	}
	transactions, err := s.services.Transaction.Suggestions(ctx, id, domain.TransactionFilter{
		Description: &domain.TextSearch{
			Query: in.Query,
		},
		Limit: &in.Limit,
	})
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"transactions": transactions}, nil
}
