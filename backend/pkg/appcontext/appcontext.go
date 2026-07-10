package appcontext

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
)

type key string

const (
	UserKey         key = "user"
	UserIDKey       key = "user_id"
	ImpersonatorKey key = "impersonator"
)

func WithUser(ctx context.Context, user *domain.User) context.Context {
	return context.WithValue(ctx, UserKey, user)
}

func WithUserID(ctx context.Context, userID int) context.Context {
	return context.WithValue(ctx, UserIDKey, userID)
}

func GetUserFromContext(ctx context.Context) *domain.User {
	user, ok := ctx.Value(UserKey).(*domain.User)
	if !ok {
		return nil
	}
	return user
}

func GetUserIDFromContext(ctx context.Context) int {
	userID, ok := ctx.Value(UserIDKey).(int)
	if !ok {
		return 0
	}
	return userID
}

// WithImpersonator stores the acting admin behind an impersonation token.
// Absent for ordinary (non-impersonated) requests.
func WithImpersonator(ctx context.Context, imp *domain.Impersonator) context.Context {
	return context.WithValue(ctx, ImpersonatorKey, imp)
}

// GetImpersonatorFromContext returns the acting admin when the request is an
// impersonation session, or nil for a normal request.
func GetImpersonatorFromContext(ctx context.Context) *domain.Impersonator {
	imp, ok := ctx.Value(ImpersonatorKey).(*domain.Impersonator)
	if !ok {
		return nil
	}
	return imp
}
