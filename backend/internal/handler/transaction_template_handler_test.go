package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/service"
	"github.com/finance_app/backend/mocks"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func setupTemplateHandlerTest(t *testing.T) (*echo.Echo, *mocks.MockTransactionTemplateService, *TransactionTemplateHandler) {
	t.Helper()
	mockSvc := mocks.NewMockTransactionTemplateService(t)
	services := &service.Services{TransactionTemplate: mockSvc}
	h := NewTransactionTemplateHandler(services)
	e := echo.New()
	return e, mockSvc, h
}

func TestTransactionTemplateHandler_List_Success(t *testing.T) {
	e, mockSvc, h := setupTemplateHandlerTest(t)
	templates := []*domain.TransactionTemplate{
		{ID: 1, UserID: 42, Name: "Groceries"},
		{ID: 2, UserID: 42, Name: "Rent"},
	}
	mockSvc.EXPECT().List(mock.Anything, 42).Return(templates, nil).Once()

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/transaction-templates", nil), 42)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.List(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp []*domain.TransactionTemplate
	assert.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.Len(t, resp, 2)
}

func TestTransactionTemplateHandler_List_ServiceError(t *testing.T) {
	e, mockSvc, h := setupTemplateHandlerTest(t)
	mockSvc.EXPECT().List(mock.Anything, 42).Return(nil, pkgErrors.Internal("boom", nil)).Once()

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/transaction-templates", nil), 42)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.List(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.ErrorAs(t, err, &httpErr)
	assert.Equal(t, http.StatusInternalServerError, httpErr.Code)
}

func TestTransactionTemplateHandler_Create_Success_UsesContextUserID(t *testing.T) {
	e, mockSvc, h := setupTemplateHandlerTest(t)
	// SECURITY (IDOR): body carries a different "user_id" (an unknown key on the
	// DTO); the handler must still call the service with the CONTEXT userID (42),
	// never a value read from the request body.
	mockSvc.EXPECT().
		Create(mock.Anything, 42, "Groceries", domain.TransactionTemplatePayload{
			Type:        domain.TransactionTypeExpense,
			Description: "Weekly groceries",
		}).
		Return(&domain.TransactionTemplate{ID: 1, UserID: 42, Name: "Groceries"}, nil).
		Once()

	body := `{"user_id":999,"name":"Groceries","payload":{"type":"expense","description":"Weekly groceries"}}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/transaction-templates", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Create(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)

	var resp domain.TransactionTemplate
	assert.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.Equal(t, 42, resp.UserID)
}

func TestTransactionTemplateHandler_Create_BadBody(t *testing.T) {
	e, _, h := setupTemplateHandlerTest(t)

	body := `{not-valid-json}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/transaction-templates", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Create(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.ErrorAs(t, err, &httpErr)
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
}

func TestTransactionTemplateHandler_Create_LimitReached(t *testing.T) {
	e, mockSvc, h := setupTemplateHandlerTest(t)
	mockSvc.EXPECT().
		Create(mock.Anything, 42, "Groceries", mock.AnythingOfType("domain.TransactionTemplatePayload")).
		Return(nil, pkgErrors.ErrTemplateLimitReached).
		Once()

	body := `{"name":"Groceries","payload":{"type":"expense"}}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/transaction-templates", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Create(c)
	assert.Error(t, err)

	var taggedErr *pkgErrors.TaggedHTTPError
	assert.ErrorAs(t, err, &taggedErr)
	assert.Equal(t, http.StatusConflict, taggedErr.Code)
	assert.Contains(t, taggedErr.Tags, string(pkgErrors.ErrorTagTemplateLimitReached))
}

func TestTransactionTemplateHandler_Update_InvalidID(t *testing.T) {
	e, mockSvc, h := setupTemplateHandlerTest(t)
	// Update must NOT be called on the mock — no .EXPECT() set up here, so any
	// unexpected call would fail the mock's assertion in t.Cleanup.
	_ = mockSvc

	body := `{"name":"Rent","payload":{"type":"expense"}}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPut, "/api/transaction-templates/abc", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("abc")

	err := h.Update(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.ErrorAs(t, err, &httpErr)
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
}

func TestTransactionTemplateHandler_Update_OwnerMismatch_NotFound(t *testing.T) {
	e, mockSvc, h := setupTemplateHandlerTest(t)
	mockSvc.EXPECT().
		Update(mock.Anything, 42, 7, "Rent", mock.AnythingOfType("domain.TransactionTemplatePayload")).
		Return(pkgErrors.NotFound("transaction template")).
		Once()

	body := `{"name":"Rent","payload":{"type":"expense"}}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPut, "/api/transaction-templates/7", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("7")

	err := h.Update(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.ErrorAs(t, err, &httpErr)
	assert.Equal(t, http.StatusNotFound, httpErr.Code)
}

func TestTransactionTemplateHandler_Update_Success(t *testing.T) {
	e, mockSvc, h := setupTemplateHandlerTest(t)
	mockSvc.EXPECT().
		Update(mock.Anything, 42, 7, "Rent", mock.AnythingOfType("domain.TransactionTemplatePayload")).
		Return(nil).
		Once()

	body := `{"name":"Rent","payload":{"type":"expense"}}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPut, "/api/transaction-templates/7", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("7")

	err := h.Update(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestTransactionTemplateHandler_Delete_NotFound(t *testing.T) {
	e, mockSvc, h := setupTemplateHandlerTest(t)
	mockSvc.EXPECT().Delete(mock.Anything, 42, 7).Return(pkgErrors.NotFound("transaction template")).Once()

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodDelete, "/api/transaction-templates/7", nil), 42)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("7")

	err := h.Delete(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.ErrorAs(t, err, &httpErr)
	assert.Equal(t, http.StatusNotFound, httpErr.Code)
}

func TestTransactionTemplateHandler_Delete_Success(t *testing.T) {
	e, mockSvc, h := setupTemplateHandlerTest(t)
	mockSvc.EXPECT().Delete(mock.Anything, 42, 7).Return(nil).Once()

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodDelete, "/api/transaction-templates/7", nil), 42)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("7")

	err := h.Delete(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestTransactionTemplateHandler_Delete_InvalidID(t *testing.T) {
	e, mockSvc, h := setupTemplateHandlerTest(t)
	_ = mockSvc

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodDelete, "/api/transaction-templates/abc", nil), 42)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("abc")

	err := h.Delete(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.ErrorAs(t, err, &httpErr)
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
}
