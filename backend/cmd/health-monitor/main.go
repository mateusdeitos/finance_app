package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const requestTimeout = 12 * time.Second

type monitor struct {
	healthURL      string
	discordWebhook string
	client         *http.Client
	now            func() time.Time
}

type discordPayload struct {
	Username string         `json:"username"`
	Embeds   []discordEmbed `json:"embeds"`
}

type discordEmbed struct {
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Color       int            `json:"color"`
	Timestamp   string         `json:"timestamp"`
	Fields      []discordField `json:"fields"`
}

type discordField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

func main() {
	healthURL := strings.TrimSpace(os.Getenv("TARGET_HEALTH_URL"))
	webhook := strings.TrimSpace(os.Getenv("DISCORD_WEBHOOK_URL"))
	if healthURL == "" || webhook == "" {
		log.Fatal("TARGET_HEALTH_URL and DISCORD_WEBHOOK_URL are required")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	m := &monitor{
		healthURL:      healthURL,
		discordWebhook: webhook,
		client:         &http.Client{Timeout: requestTimeout},
		now:            time.Now,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /run", m.run)

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("health monitor listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func (m *monitor) run(w http.ResponseWriter, r *http.Request) {
	started := m.now()
	healthy, detail := m.probe(r.Context())
	latency := m.now().Sub(started)

	if err := m.notifyDiscord(r.Context(), healthy, detail, latency, started); err != nil {
		log.Printf("discord notification failed: %v", err)
		http.Error(w, "discord notification failed", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"notified":true}`))
}

func (m *monitor) probe(ctx context.Context) (bool, string) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, m.healthURL, nil)
	if err != nil {
		return false, err.Error()
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return false, err.Error()
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Sprintf("HTTP %d", resp.StatusCode)
	}

	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false, "resposta inválida do health check"
	}
	if body.Status != "ok" {
		return false, fmt.Sprintf("status inesperado: %q", body.Status)
	}

	return true, "API e banco responderam normalmente"
}

func (m *monitor) notifyDiscord(ctx context.Context, healthy bool, detail string, latency time.Duration, checkedAt time.Time) error {
	title := "🚨 Finance API indisponível"
	color := 0xE74C3C
	status := "Falha"
	if healthy {
		title = "✅ Finance API saudável"
		color = 0x2ECC71
		status = "Sucesso"
	}

	payload := discordPayload{
		Username: "Finance Health Monitor",
		Embeds: []discordEmbed{{
			Title:       title,
			Description: detail,
			Color:       color,
			Timestamp:   checkedAt.UTC().Format(time.RFC3339),
			Fields: []discordField{
				{Name: "Status", Value: status, Inline: true},
				{Name: "Latência", Value: latency.Round(time.Millisecond).String(), Inline: true},
			},
		}},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	webhookURL, err := url.Parse(m.discordWebhook)
	if err != nil {
		return err
	}
	query := webhookURL.Query()
	// Without wait=true Discord can acknowledge before confirming that the
	// message was saved. Waiting lets Scheduler retry an actual delivery error.
	query.Set("wait", "true")
	webhookURL.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL.String(), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("discord returned HTTP %d", resp.StatusCode)
	}
	return nil
}
