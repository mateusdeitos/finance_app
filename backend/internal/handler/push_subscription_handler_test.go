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

func setupPushSubHandlerTest(t *testing.T) (*echo.Echo, *mocks.MockPushSubscriptionService, *PushSubscriptionHandler) {
	t.Helper()
	mockSvc := mocks.NewMockPushSubscriptionService(t)
	services := &service.Services{PushSubscription: mockSvc}
	h := NewPushSubscriptionHandler(services, "test-vapid-public-key")
	e := echo.New()
	return e, mockSvc, h
}

func TestPushSubHandler_Subscribe_Success(t *testing.T) {
	e, mockSvc, h := setupPushSubHandlerTest(t)
	mockSvc.EXPECT().Subscribe(mock.Anything, 42, mock.AnythingOfType("*domain.SubscribePushRequest")).Return(nil).Once()

	body := `{"endpoint":"https://fcm.example.com/send/abc","keys":{"p256dh":"abc","auth":"def"}}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/push-subscriptions", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Subscribe(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestPushSubHandler_Subscribe_BadBody(t *testing.T) {
	e, _, h := setupPushSubHandlerTest(t)

	body := `{not-valid-json}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/push-subscriptions", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Subscribe(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.ErrorAs(t, err, &httpErr)
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
}

func TestPushSubHandler_Subscribe_ServiceError(t *testing.T) {
	e, mockSvc, h := setupPushSubHandlerTest(t)
	mockSvc.EXPECT().Subscribe(mock.Anything, 42, mock.AnythingOfType("*domain.SubscribePushRequest")).Return(pkgErrors.BadRequest("endpoint is required")).Once()

	body := `{"endpoint":"","keys":{"p256dh":"abc","auth":"def"}}`
	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/push-subscriptions", bytes.NewBufferString(body)), 42)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Subscribe(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.ErrorAs(t, err, &httpErr)
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
}

func TestPushSubHandler_Unsubscribe_MissingEndpoint(t *testing.T) {
	e, _, h := setupPushSubHandlerTest(t)

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodDelete, "/api/push-subscriptions", nil), 42)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Unsubscribe(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.ErrorAs(t, err, &httpErr)
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
}

func TestPushSubHandler_Unsubscribe_Success(t *testing.T) {
	e, mockSvc, h := setupPushSubHandlerTest(t)
	mockSvc.EXPECT().Unsubscribe(mock.Anything, 42, "https://fcm.example.com/send/abc").Return(nil).Once()

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodDelete, "/api/push-subscriptions?endpoint=https://fcm.example.com/send/abc", nil), 42)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Unsubscribe(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestPushSubHandler_Status_MissingEndpoint(t *testing.T) {
	e, _, h := setupPushSubHandlerTest(t)

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/push-subscriptions", nil), 42)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Status(c)
	assert.Error(t, err)
	var httpErr *echo.HTTPError
	assert.ErrorAs(t, err, &httpErr)
	assert.Equal(t, http.StatusBadRequest, httpErr.Code)
}

func TestPushSubHandler_Status_Subscribed(t *testing.T) {
	e, mockSvc, h := setupPushSubHandlerTest(t)
	mockSvc.EXPECT().Status(mock.Anything, 42, "https://fcm.example.com/send/abc").Return(&domain.PushSubscriptionStatusResponse{Subscribed: true}, nil).Once()

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/push-subscriptions?endpoint=https://fcm.example.com/send/abc", nil), 42)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Status(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp domain.PushSubscriptionStatusResponse
	assert.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.True(t, resp.Subscribed)
}

func TestPushSubHandler_Status_NotSubscribed(t *testing.T) {
	e, mockSvc, h := setupPushSubHandlerTest(t)
	mockSvc.EXPECT().Status(mock.Anything, 42, "https://fcm.example.com/send/xyz").Return(&domain.PushSubscriptionStatusResponse{Subscribed: false}, nil).Once()

	req := injectUserCtx(httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/push-subscriptions?endpoint=https://fcm.example.com/send/xyz", nil), 42)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.Status(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp domain.PushSubscriptionStatusResponse
	assert.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.False(t, resp.Subscribed)
}
