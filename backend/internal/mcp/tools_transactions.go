package mcp

import (
	"context"
	"errors"
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

type createInput struct {
	TransactionType      domain.TransactionType     `json:"transaction_type"`
	AccountID            int                        `json:"account_id"`
	CategoryID           int                        `json:"category_id,omitempty"`
	AmountCents          int64                      `json:"amount_cents"`
	Date                 string                     `json:"date"                             jsonschema:"Transaction date in YYYY-MM-DD format"`
	Description          string                     `json:"description"`
	DestinationAccountID *int                       `json:"destination_account_id,omitempty"`
	TagIDs               []int                      `json:"tag_ids,omitempty"`
	RecurrenceSettings   *domain.RecurrenceSettings `json:"recurrence_settings,omitempty"`
	SplitSettings        []transactionSplitInput    `json:"split_settings,omitempty"`
}

func (s *Server) createTransaction(ctx context.Context, _ *mcp.CallToolRequest, in createInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, writeScope)
	if err != nil {
		return nil, nil, err
	}
	tags, err := s.tags(ctx, id, in.TagIDs)
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
	created, err := s.services.Transaction.Create(ctx, id, &domain.TransactionCreateRequest{TransactionType: in.TransactionType, AccountID: in.AccountID, CategoryID: in.CategoryID, Amount: in.AmountCents, Date: date, Description: in.Description, DestinationAccountID: in.DestinationAccountID, Tags: tags, RecurrenceSettings: in.RecurrenceSettings, SplitSettings: splitSettings})
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
	TagIDs               *[]int                                `json:"tag_ids,omitempty"`
	RecurrenceSettings   *domain.RecurrenceSettings            `json:"recurrence_settings,omitempty"`
	SplitSettings        *[]transactionSplitInput              `json:"split_settings,omitempty"`
	PropagationSettings  domain.TransactionPropagationSettings `json:"propagation_settings"`
}

func (s *Server) updateTransaction(ctx context.Context, _ *mcp.CallToolRequest, in updateInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, writeScope)
	if err != nil {
		return nil, nil, err
	}
	if !in.PropagationSettings.IsValid() {
		return nil, nil, errors.New("valid propagation_settings is required")
	}
	existingRows, err := s.services.Transaction.Search(ctx, id, domain.Period{}, domain.TransactionFilter{IDs: []int{in.TransactionID}, WithSettlements: true})
	if err != nil {
		return nil, nil, err
	}
	if len(existingRows) == 0 {
		return nil, nil, errors.New("transaction not found")
	}
	existing := existingRows[0]
	var tags []domain.Tag
	if in.TagIDs != nil {
		tags, err = s.tags(ctx, id, *in.TagIDs)
		if err != nil {
			return nil, nil, err
		}
	} else {
		tags = existing.Tags
	}
	var date *domain.Date
	if in.Date != nil {
		parsedDate, parseErr := parseMCPDate(*in.Date)
		if parseErr != nil {
			return nil, nil, parseErr
		}
		date = &parsedDate
	}
	req := &domain.TransactionUpdateRequest{TransactionType: in.TransactionType, AccountID: in.AccountID, CategoryID: in.CategoryID, Amount: in.AmountCents, Date: date, Description: in.Description, DestinationAccountID: in.DestinationAccountID, Tags: tags, PropagationSettings: in.PropagationSettings, RecurrenceSettings: in.RecurrenceSettings}
	if in.SplitSettings != nil {
		splitSettings, splitErr := domainSplitSettings(*in.SplitSettings)
		if splitErr != nil {
			return nil, nil, splitErr
		}
		req.SplitSettings = splitSettings
	} else if existing.OriginalUserID == nil || *existing.OriginalUserID == id {
		for _, linked := range existing.LinkedTransactions {
			if linked.UserID != id {
				return nil, nil, errors.New("split_settings is required when updating a shared transaction")
			}
		}
	}
	err = s.services.Transaction.Update(ctx, id, in.TransactionID, req)
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"transaction_id": in.TransactionID, "updated": true}, nil
}

type deleteInput struct {
	TransactionID       int                                   `json:"transaction_id"`
	PropagationSettings domain.TransactionPropagationSettings `json:"propagation_settings"`
}

func (s *Server) deleteTransaction(ctx context.Context, _ *mcp.CallToolRequest, in deleteInput) (*mcp.CallToolResult, map[string]any, error) {
	id, err := userID(ctx, writeScope)
	if err != nil {
		return nil, nil, err
	}
	if !in.PropagationSettings.IsValid() {
		return nil, nil, errors.New("valid propagation_settings is required")
	}
	err = s.services.Transaction.Delete(ctx, id, in.TransactionID, in.PropagationSettings)
	if err != nil {
		return nil, nil, err
	}
	return nil, map[string]any{"transaction_id": in.TransactionID, "deleted": true}, nil
}

func (s *Server) tags(ctx context.Context, userID int, ids []int) ([]domain.Tag, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	tags, err := s.services.Tag.Search(ctx, domain.TagSearchOptions{UserIDs: []int{userID}, IDs: ids})
	if err != nil {
		return nil, err
	}
	if len(tags) != len(ids) {
		return nil, errors.New("one or more tag_ids do not belong to the user")
	}
	out := make([]domain.Tag, len(tags))
	for i, t := range tags {
		out[i] = *t
	}
	return out, nil
}

func parseMCPDate(raw string) (domain.Date, error) {
	parsed, err := time.Parse(time.DateOnly, raw)
	if err != nil {
		return domain.Date{}, fmt.Errorf("date must be in YYYY-MM-DD format: %w", err)
	}
	return domain.Date{Time: parsed}, nil
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
