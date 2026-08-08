package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/mocks"
	"github.com/finance_app/backend/pkg/appcontext"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// TestSettlementHandler_BulkReview verifies the review payload binds into
// ids + reviewed, the caller's user id is passed through, and a 204 is returned.
func TestSettlementHandler_BulkReview(t *testing.T) {
	mockSvc := mocks.NewMockSettlementService(t)
	services := &service.Services{Settlement: mockSvc}
	h := NewSettlementHandler(services)
	e := echo.New()

	const callerUserID = 42

	mockSvc.EXPECT().
		BulkReview(mock.Anything, callerUserID, []int{3, 8}, true).
		Return(nil).
		Once()

	req := httptest.NewRequestWithContext(
		appcontext.WithUserID(t.Context(), callerUserID),
		http.MethodPatch,
		"/api/settlements/review",
		strings.NewReader(`{"ids":[3,8],"reviewed":true}`),
	)
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.BulkReview(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}
