package handler

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/mocks"
	"github.com/finance_app/backend/pkg/appcontext"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

const testAcceptBody = `{"account_id":5,"date":"2026-04-01T00:00:00Z"}`

func setupChargeHandlerTest(t *testing.T) (*echo.Echo, *mocks.MockChargeService, *ChargeHandler) {
	t.Helper()
	mockSvc := mocks.NewMockChargeService(t)
	services := &service.Services{Charge: mockSvc}
	h := NewChargeHandler(services)
	e := echo.New()
	return e, mockSvc, h
}

func injectUserCtx(req *http.Request, userID int) *http.Request {
	ctx := appcontext.WithUserID(req.Context(), userID)
	return req.WithContext(ctx)
}

func TestChargeHandler_Accept_Success(t *testing.T) {
	e, mockSvc, h := setupChargeHandlerTest(t)
	mockSvc.EXPECT().Accept(mock.Anything, 42, 7, mock.AnythingOfType("*domain.AcceptChargeRequest")).Return(nil).Once()

	body := `{"account_id":5,"amount":12000,"date":"2026-04-01T00:00:00Z"}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/charges/7/accept", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/api/charges/:id/accept")
	c.SetParamNames("id")
	c.SetParamValues("7")

	err := h.Accept(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestChargeHandler_Accept_Forbidden(t *testing.T) {
	e, mockSvc, h := setupChargeHandlerTest(t)
	mockSvc.EXPECT().Accept(mock.Anything, 42, 7, mock.Anything).Return(pkgErrors.Forbidden("charge")).Once()

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/charges/7/accept", bytes.NewBufferString(testAcceptBody)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("7")

	err := h.Accept(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.True(t, errors.As(err, &httpErr))
	assert.Equal(t, http.StatusForbidden, httpErr.Code)
}

func TestChargeHandler_Accept_Conflict(t *testing.T) {
	e, mockSvc, h := setupChargeHandlerTest(t)
	mockSvc.EXPECT().Accept(mock.Anything, 42, 7, mock.Anything).Return(pkgErrors.AlreadyExists("charge")).Once()

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/charges/7/accept", bytes.NewBufferString(testAcceptBody)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("7")

	err := h.Accept(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.True(t, errors.As(err, &httpErr))
	assert.Equal(t, http.StatusConflict, httpErr.Code)
}

func TestChargeHandler_Accept_BadID(t *testing.T) {
	_, _, h := setupChargeHandlerTest(t)
	e := echo.New()

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/charges/abc/accept", bytes.NewBufferString(testAcceptBody)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("abc")

	err := h.Accept(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.True(t, errors.As(err, &httpErr))
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
}

func TestChargeHandler_Accept_BadJSON(t *testing.T) {
	e, mockSvc, h := setupChargeHandlerTest(t)
	// No mock expectations — service should NOT be called

	body := `{not-valid-json}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/charges/7/accept", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("7")

	err := h.Accept(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.True(t, errors.As(err, &httpErr))
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
	mockSvc.AssertNotCalled(t, "Accept")
}

// compile-time guard: ensure domain import is used
var _ = domain.AcceptChargeRequest{}
