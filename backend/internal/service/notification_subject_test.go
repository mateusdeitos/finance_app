package service

import "testing"

// TestWebpushSubscriber guards against the Apple BadJwtToken regression: a
// "mailto:"-prefixed VAPID subject must be handed to webpush-go without the
// prefix, because webpush-go re-adds it. A double "mailto:mailto:" `sub` claim
// is rejected by Apple Push with HTTP 403 BadJwtToken.
func TestWebpushSubscriber(t *testing.T) {
	cases := []struct {
		name    string
		subject string
		want    string
	}{
		{"mailto prefix stripped", "mailto:user@example.com", "user@example.com"},
		{"bare email untouched", "user@example.com", "user@example.com"},
		{"https url untouched", "https://example.com/contact", "https://example.com/contact"},
		{"only leading mailto stripped", "mailto:mailto:weird", "mailto:weird"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := webpushSubscriber(tc.subject); got != tc.want {
				t.Fatalf("webpushSubscriber(%q) = %q, want %q", tc.subject, got, tc.want)
			}
		})
	}
}
