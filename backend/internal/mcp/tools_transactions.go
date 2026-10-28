package mcp

import (
	"context"
	"fmt"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type transactionSplitInput struct {
	ConnectionID int     `json:"connection_id"          jsonschema:"ID of an accepted user connection"`
	Percentage   *int    `json:"percentage,omitempty"   jsonschema:"Percentage assigned to the connected user"`
	AmountCents  *int64  `json:"amount_cents,omitempty" jsonschema:"Exact amount assigned to the connected user, in cents"`
	Date         *string `json:"date,omitempty"         jsonschema:"Settlement date in YYYY-MM-DD format"`
}

type transactionTagInput struct {
	Name string `json:"name" jsonschema:"Tag name; an existing tag with the same name is reused"`
}

type createInput struct {
	TransactionType      domain.TransactionType     `json:"transaction_type"`
	AccountID            int                        `json:"account_id"`
	CategoryID           int                        `json:"category_id,omitempty"`
	AmountCents          int64                      `json:"amount_cents"`
	Date                 string                     `json:"date"                             jsonschema:"Transaction date in YYYY-MM-DD format"`
	Description          string                     `json:"description"`
	DestinationAccountID *int                       `json:"destination_account_id,omitempty"`
	Tags                 []transactionTagInput      `json:"tags,omitempty"`
	RecurrenceSettings   *domain.RecurrenceSettings `json:"recurrence_settings,omitempty"`
	SplitSettings        []transactionSplitInput    `json:"split_settings,omitempty"`
}

func (s *Server) createTransaction(ctx context.Context, _ *mcp.CallToolRequest, in createInput) (*mcp.CallToolResult, map[string]any, error) {
	userID, err := userID(ctx, writeScope)
	if err != nil {
		return nil, nil, err
	}
	date, err := parseMCPDate(in.Date)
	if err != nil {
		return nil, nil, err
	}
	splitSettings, err := domainSplitSettings(in.SplitSettings)
	if err != nil {
		return nil, nil, err
	}
	created, err := s.services.Transaction.Create(ctx, userID, &domain.TransactionCreateRequest{
		TransactionType:      in.TransactionType,
		AccountID:            in.AccountID,
		CategoryID:           in.CategoryID,
		Amount:               in.AmountCents,
		Date:                 date,
		Description:          in.Description,
		DestinationAccountID: in.DestinationAccountID,
		Tags:                 domainTags(in.Tags),
		RecurrenceSettings:   in.RecurrenceSettings,
		SplitSettings:        splitSettings,
	})
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"transaction_id": created}, nil
}

type updateInput struct {
	TransactionID        int                                   `json:"transaction_id"`
	TransactionType      *domain.TransactionType               `json:"transaction_type,omitempty"`
	AccountID            *int                                  `json:"account_id,omitempty"`
	CategoryID           *int                                  `json:"category_id,omitempty"`
	AmountCents          *int64                                `json:"amount_cents,omitempty"`
	Date                 *string                               `json:"date,omitempty"                   jsonschema:"Transaction date in YYYY-MM-DD format"`
	Description          *string                               `json:"description,omitempty"`
	DestinationAccountID *int                                  `json:"destination_account_id,omitempty"`
	Tags                 *[]transactionTagInput                `json:"tags,omitempty"`
	RecurrenceSettings   *domain.RecurrenceSettings            `json:"recurrence_settings,omitempty"`
	SplitSettings        *[]transactionSplitInput              `json:"split_settings,omitempty"`
	PropagationSettings  domain.TransactionPropagationSettings `json:"propagation_settings"`
}

func (s *Server) updateTransaction(ctx context.Context, _ *mcp.CallToolRequest, in updateInput) (*mcp.CallToolResult, map[string]any, error) {
	userID, err := userID(ctx, writeScope)
	if err != nil {
		return nil, nil, err
	}
	var date *domain.Date
	if in.Date != nil {
		parsedDate, parseErr := parseMCPDate(*in.Date)
		if parseErr != nil {
			return nil, nil, parseErr
		}
		date = &parsedDate
	}
	req := &domain.TransactionUpdateRequest{
		TransactionType:      in.TransactionType,
		AccountID:            in.AccountID,
		CategoryID:           in.CategoryID,
		Amount:               in.AmountCents,
		Date:                 date,
		Description:          in.Description,
		DestinationAccountID: in.DestinationAccountID,
		PropagationSettings:  in.PropagationSettings,
		RecurrenceSettings:   in.RecurrenceSettings,
	}
	if in.Tags != nil {
		req.Tags = domainTags(*in.Tags)
	}
	if in.SplitSettings != nil {
		splitSettings, splitErr := domainSplitSettings(*in.SplitSettings)
		if splitErr != nil {
			return nil, nil, splitErr
		}
		req.SplitSettings = splitSettings
	}
	err = s.services.Transaction.Update(ctx, in.TransactionID, userID, req)
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{
		"transaction_id": in.TransactionID,
		"updated":        true,
	}, nil
}

type deleteInput struct {
	TransactionID       int                                   `json:"transaction_id"`
	PropagationSettings domain.TransactionPropagationSettings `json:"propagation_settings"`
}

func (s *Server) deleteTransaction(ctx context.Context, _ *mcp.CallToolRequest, in deleteInput) (*mcp.CallToolResult, map[string]any, error) {
	userID, err := userID(ctx, writeScope)
	if err != nil {
		return nil, nil, err
	}
	err = s.services.Transaction.Delete(ctx, userID, in.TransactionID, in.PropagationSettings)
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{
		"transaction_id": in.TransactionID,
		"deleted":        true,
	}, nil
}

func domainTags(inputs []transactionTagInput) []domain.Tag {
	tags := make([]domain.Tag, len(inputs))
	for i, input := range inputs {
		tags[i] = domain.Tag{
			Name: input.Name,
		}
	}
	return tags
}

func parseMCPDate(raw string) (domain.Date, error) {
	parsed, err := time.Parse(time.DateOnly, raw)
	if err != nil {
		return domain.Date{}, fmt.Errorf("date must be in YYYY-MM-DD format: %w", err)
	}
	return domain.Date{
		Time: parsed,
	}, nil
}

func domainSplitSettings(inputs []transactionSplitInput) ([]domain.SplitSettings, error) {
	settings := make([]domain.SplitSettings, len(inputs))
	for i, input := range inputs {
		var date *domain.Date
		if input.Date != nil {
			parsedDate, err := parseMCPDate(*input.Date)
			if err != nil {
				return nil, fmt.Errorf("split_settings[%d].date: %w", i, err)
			}
			date = &parsedDate
		}
		settings[i] = domain.SplitSettings{
			ConnectionID: input.ConnectionID,
			Percentage:   input.Percentage,
			Amount:       input.AmountCents,
			Date:         date,
		}
	}
	return settings, nil
}
