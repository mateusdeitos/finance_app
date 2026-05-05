package pkg

import "testing"

func TestIsAllowedOrigin(t *testing.T) {
	origins := []string{
		"https://example.com",
		"https://finance-app-492023--*.web.app",
		"http://localhost:3000",
	}

	tests := []struct {
		name   string
		origin string
		want   bool
	}{
		{"exact match", "https://example.com", true},
		{"exact match localhost", "http://localhost:3000", true},
		{"wildcard match", "https://finance-app-492023--pr-112-9mmoyybw.web.app", true},
		{"wildcard match different channel", "https://finance-app-492023--pr-999-xyz.web.app", true},
		{"no match", "https://evil.com", false},
		{"partial prefix no match", "https://example.com.evil.com", false},
		{"partial suffix no match", "https://evil.web.app", false},
		{"empty origin", "", false},
		{"empty list", "https://example.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			list := origins
			if tt.name == "empty list" {
				list = nil
			}
			got := IsAllowedOrigin(list, tt.origin)
			if got != tt.want {
				t.Errorf("IsAllowedOrigin(%q) = %v, want %v", tt.origin, got, tt.want)
			}
		})
	}
}

func TestIsAllowedOrigin_MultipleWildcards(t *testing.T) {
	// Pattern with multiple * should not match (only single * supported)
	origins := []string{"https://*.example.*"}
	if IsAllowedOrigin(origins, "https://sub.example.com") {
		t.Error("multiple wildcards should not match")
	}
}
