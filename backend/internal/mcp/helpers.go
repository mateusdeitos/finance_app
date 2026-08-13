package mcp

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
)

func contains[T comparable](items []T, want T) bool {
	for _, x := range items {
		if x == want {
			return true
		}
	}
	return false
}

func boolPtr(v bool) *bool { return &v }

func randomURLToken(n int) (string, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func decodeJSON(r *http.Request, out any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 64<<10))
	return decoder.Decode(out)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		return
	}
}

func oauthError(w http.ResponseWriter, code, description string, status int) {
	writeJSON(w, status, map[string]string{"error": code, "error_description": description})
}
