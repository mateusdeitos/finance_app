package handler

import (
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
