package domain

import "time"

// ImpersonationSession is the durable audit record for a single admin
// impersonation. Its ID is a UUID that also serves as the JWT `jti`, enabling
// server-side revocation and per-token traceability.
type ImpersonationSession struct {
	ID           string     `json:"id"`
	AdminUserID  int        `json:"admin_user_id"`
	TargetUserID int        `json:"target_user_id"`
	Reason       string     `json:"reason"`
	IPAddress    string     `json:"ip_address,omitempty"`
	UserAgent    string     `json:"user_agent,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	ExpiresAt    time.Time  `json:"expires_at"`
	RevokedAt    *time.Time `json:"revoked_at,omitempty"`
}

// IsActive reports whether the session can still be used to authenticate at the
// given moment (not revoked and not expired).
func (s *ImpersonationSession) IsActive(now time.Time) bool {
	if s.RevokedAt != nil {
		return false
	}
	return now.Before(s.ExpiresAt)
}

// Impersonator identifies the real admin acting behind an impersonation token.
// It is derived from the JWT `act` claim and carried through the request context
// so downstream logging/auditing always attributes actions to the human admin,
// not just the impersonated user.
type Impersonator struct {
	SessionID   string `json:"session_id"`
	AdminUserID int    `json:"admin_user_id"`
	AdminEmail  string `json:"admin_email"`
}

// StartImpersonationRequest is the admin-supplied payload to begin impersonating
// a user. Reason is mandatory and recorded in the audit trail.
type StartImpersonationRequest struct {
	TargetUserID int    `json:"target_user_id"`
	Reason       string `json:"reason"`
}

// StartImpersonationResult is returned to the admin after a successful start.
// The token is a short-lived JWT the client sends as `Authorization: Bearer` to
// act as the target user while leaving the admin's own session cookie intact.
type StartImpersonationResult struct {
	Token      string    `json:"token"`
	SessionID  string    `json:"session_id"`
	ExpiresAt  time.Time `json:"expires_at"`
	TargetUser *User     `json:"target_user"`
}
