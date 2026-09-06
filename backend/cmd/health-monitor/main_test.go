package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMonitorReportsSuccessfulCheckToDiscord(t *testing.T) {
	health := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer health.Close()

	type capturedRequest struct {
		payload discordPayload
		method  string
		wait    string
		err     error
	}
	captured := make(chan capturedRequest, 1)
	discord := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload discordPayload
		err := json.NewDecoder(r.Body).Decode(&payload)
		captured <- capturedRequest{payload: payload, method: r.Method, wait: r.URL.Query().Get("wait"), err: err}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer discord.Close()

	m := newTestMonitor(health.URL, discord.URL)
	recorder := httptest.NewRecorder()
	m.run(recorder, httptest.NewRequest(http.MethodPost, "/run", nil))

	request := <-captured
	require.NoError(t, request.err)
	assert.Equal(t, http.MethodPost, request.method)
	assert.Equal(t, "true", request.wait)
	assert.Equal(t, http.StatusOK, recorder.Code)
	require.Len(t, request.payload.Embeds, 1)
	assert.Equal(t, "✅ Finance API saudável", request.payload.Embeds[0].Title)
	assert.Equal(t, 0x2ECC71, request.payload.Embeds[0].Color)
	assert.Equal(t, "Sucesso", request.payload.Embeds[0].Fields[0].Value)
}

func TestMonitorReportsFailedCheckToDiscord(t *testing.T) {
	health := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	defer health.Close()

	captured := make(chan discordPayload, 1)
	discord := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload discordPayload
		_ = json.NewDecoder(r.Body).Decode(&payload)
		captured <- payload
		w.WriteHeader(http.StatusNoContent)
	}))
	defer discord.Close()

	m := newTestMonitor(health.URL, discord.URL)
	recorder := httptest.NewRecorder()
	m.run(recorder, httptest.NewRequest(http.MethodPost, "/run", nil))

	got := <-captured
	assert.Equal(t, http.StatusOK, recorder.Code, "the probe ran and the failure was delivered")
	require.Len(t, got.Embeds, 1)
	assert.Equal(t, "🚨 Finance API indisponível", got.Embeds[0].Title)
	assert.Equal(t, 0xE74C3C, got.Embeds[0].Color)
	assert.Equal(t, "HTTP 503", got.Embeds[0].Description)
}

func TestMonitorReturnsErrorSoSchedulerRetriesWhenDiscordFails(t *testing.T) {
	health := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer health.Close()
	discord := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
	}))
	defer discord.Close()

	m := newTestMonitor(health.URL, discord.URL)
	recorder := httptest.NewRecorder()
	m.run(recorder, httptest.NewRequest(http.MethodPost, "/run", nil))

	assert.Equal(t, http.StatusBadGateway, recorder.Code)
}

func newTestMonitor(healthURL, discordURL string) *monitor {
	times := []time.Time{
		time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC),
		time.Date(2026, 9, 6, 12, 0, 0, int(125*time.Millisecond), time.UTC),
	}
	call := 0
	return &monitor{
		healthURL:      healthURL,
		discordWebhook: discordURL,
		client:         &http.Client{Timeout: time.Second},
		now: func() time.Time {
			value := times[call]
			call++
			return value
		},
	}
}
