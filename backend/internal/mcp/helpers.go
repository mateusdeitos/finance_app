package mcp

import (
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

func decodeJSON(r *http.Request, out any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 64<<10))
	return decoder.Decode(out)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	err := json.NewEncoder(w).Encode(v)
	if err != nil {
		return
	}
}

func oauthError(w http.ResponseWriter, code, description string, status int) {
	writeJSON(w, status, map[string]string{"error": code, "error_description": description})
}
