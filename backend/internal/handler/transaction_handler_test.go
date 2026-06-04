package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/mocks"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// setupTransactionHandlerTest is shared across transaction handler tests.
func setupTransactionHandlerTest(t *testing.T) (*echo.Echo, *mocks.MockTransactionService, *TransactionHandler) {
	t.Helper()
	mockSvc := mocks.NewMockTransactionService(t)
	services := &service.Services{Transaction: mockSvc}
	h := NewTransactionHandler(services)
	e := echo.New()
	return e, mockSvc, h
}

// TestTransactionHandler_ListByIDs_Empty verifies that an empty id[] returns
// 200 with an empty JSON array and does NOT call the service (short-circuit).
func TestTransactionHandler_ListByIDs_Empty(t *testing.T) {
	e, mockSvc, h := setupTransactionHandlerTest(t)
	// No mock expectations — service must NOT be called for empty ids
	_ = mockSvc

	req := httptest.NewRequestWithContext(
		appcontext.WithUserID(t.Context(), 42),
		http.MethodGet,
		"/api/transactions/by-ids",
		nil,
	)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.ListByIDs(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	var result []domain.Transaction
	assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
	assert.Empty(t, result, "empty id[] must return [] not null or error")
	mockSvc.AssertNotCalled(t, "Search")
}

// TestTransactionHandler_ListByIDs_IDsFilter verifies that:
// 1. id[] query params bind into filter.IDs
// 2. filter.UserID is set to the caller's ID (IDOR scope)
// 3. filter.WithSettlements is true
// 4. service is called with Period{Month:0, Year:0}
func TestTransactionHandler_ListByIDs_IDsFilter(t *testing.T) {
	e, mockSvc, h := setupTransactionHandlerTest(t)

	const callerUserID = 42
	expectedIDs := []int{5, 9}

	mockSvc.EXPECT().
		Search(
			mock.Anything,
			callerUserID,
			mock.MatchedBy(func(p domain.Period) bool {
				return p.Month == 0 && p.Year == 0
			}),
			mock.MatchedBy(func(f domain.TransactionFilter) bool {
				if f.UserID == nil || *f.UserID != callerUserID {
					return false
				}
				if !f.WithSettlements {
					return false
				}
				if len(f.IDs) != len(expectedIDs) {
					return false
				}
				for i, id := range f.IDs {
					if id != expectedIDs[i] {
						return false
					}
				}
				return true
			}),
		).
		Return([]*domain.Transaction{{ID: 5}, {ID: 9}}, nil).
		Once()

	req := httptest.NewRequestWithContext(
		appcontext.WithUserID(t.Context(), callerUserID),
		http.MethodGet,
		"/api/transactions/by-ids?id[]=5&id[]=9",
		nil,
	)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.ListByIDs(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

// TestTransactionHandler_ListByIDs_RouteResolution verifies that a request to
// GET /api/transactions/by-ids routes to ListByIDs, NOT to GetByID with
// id="by-ids" (route-ordering pitfall).
func TestTransactionHandler_ListByIDs_RouteResolution(t *testing.T) {
	e, mockSvc, h := setupTransactionHandlerTest(t)

	// The route must be registered before /:id so "by-ids" is not parsed as a param.
	// We replicate the production route registration here.
	g := e.Group("/transactions")
	g.GET("/by-ids", h.ListByIDs)
	g.GET("/:id", h.GetByID)

	// Empty id[] → short-circuit before service, so no mock expectation needed
	_ = mockSvc

	req := httptest.NewRequestWithContext(
		appcontext.WithUserID(t.Context(), 1),
		http.MethodGet,
		"/transactions/by-ids",
		nil,
	)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	// If routing went to GetByID with id="by-ids", Atoi would fail and return 400.
	// ListByIDs with empty id[] returns 200. So 200 confirms the correct route.
	assert.Equal(t, http.StatusOK, rec.Code, "GET /by-ids must route to ListByIDs not GetByID")
	mockSvc.AssertNotCalled(t, "Search")
}

// TestTransactionHandler_GetByID_PreloadsSettlements pins down that GET
// /api/transactions/:id passes WithSettlements=true down to the service so the
// update drawer (which renders the split-row date inputs from
// settlements_from_source) gets a fully-hydrated transaction.
func TestTransactionHandler_GetByID_PreloadsSettlements(t *testing.T) {
	mockSvc := mocks.NewMockTransactionService(t)
	services := &service.Services{Transaction: mockSvc}
	h := NewTransactionHandler(services)
	e := echo.New()

	mockSvc.EXPECT().
		Search(mock.Anything, 42, mock.Anything, mock.MatchedBy(func(f domain.TransactionFilter) bool {
			return f.WithSettlements && len(f.IDs) == 1 && f.IDs[0] == 7
		})).
		Return([]*domain.Transaction{{ID: 7}}, nil).
		Once()

	req := httptest.NewRequestWithContext(
		appcontext.WithUserID(t.Context(), 42),
		http.MethodGet,
		"/api/transactions/7",
		nil,
	)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/transactions/:id")
	c.SetParamNames("id")
	c.SetParamValues("7")

	err := h.GetByID(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}
